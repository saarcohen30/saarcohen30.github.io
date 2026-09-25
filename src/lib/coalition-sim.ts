// A tiny, genuine instance of online coalition formation — the hero's motif.
//
// Agents arrive one at a time in random order. Agent i values agent j by
//   v(i, j) = cos(θi − θj) − τ          (an additively separable hedonic game)
// and, on arrival, is irrevocably assigned to the existing coalition it values most,
// or founds a new coalition if every existing one has non-positive value.
//
// Pure and deterministic given a seed: used by the canvas renderer in the browser and
// at build time to draw the static (no-JS / reduced-motion) SVG.

export interface Agent {
  id: number;
  theta: number;
  /** Arrival time in ms from the start of the intro. */
  arriveAt: number;
  /** Spawn position (where the agent first appears). */
  sx: number;
  sy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  coalition: number;
  /** Index within its coalition (drives the phyllotaxis layout). */
  slot: number;
  /** Neighbour in the coalition this agent attached to (online spanning tree). */
  parent: number;
  state: 'waiting' | 'probing' | 'committed' | 'leaving' | 'gone';
  /** Coalitions considered while probing, best first. */
  candidates: number[];
  t: number; // ms spent in current state
  alpha: number;
}

export interface Coalition {
  id: number;
  hx: number; // home position
  hy: number;
  x: number;
  y: number;
  phase: number;
  members: number[];
}

export interface SimOptions {
  width: number;
  height: number;
  count: number;
  seed?: number;
  /** 'side': coalitions on the right (wide screens). 'top': in the upper part (phones). */
  layout: 'side' | 'top';
  introMs?: number;
  /** Optional explicit region for the coalitions (measured from the page layout). */
  field?: { x0: number; x1: number; y0: number; y1: number };
}

export const K_MAX = 5;
const TAU = 0.12;
const PROBE_MS = 240;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSim(opts: SimOptions) {
  const { width: W, height: H, count, layout } = opts;
  const rand = mulberry32(opts.seed ?? 7);
  const introMs = opts.introMs ?? 2600;

  // Field where coalitions live.
  const field =
    opts.field ??
    (layout === 'side'
      ? { x0: W * 0.52, x1: W * 0.94, y0: H * 0.15, y1: H * 0.72 }
      : { x0: W * 0.1, x1: W * 0.9, y0: H * 0.1, y1: H * 0.44 });

  const unit = Math.max(8, Math.min(Math.min(W, H) * 0.026, (field.y1 - field.y0) * 0.075));

  // Latent "types": K clusters on the circle, so coalitions emerge without being scripted.
  const centres = Array.from({ length: K_MAX }, (_, k) => (k / K_MAX) * Math.PI * 2 + rand() * 0.4);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());

  // Home positions: jittered slots spread across the field.
  const homes: [number, number][] = [];
  const cols = layout === 'side' ? 2 : 3;
  const rows = Math.ceil(K_MAX / cols);
  for (let k = 0; k < K_MAX; k++) {
    const c = k % cols;
    const r = Math.floor(k / cols);
    const stagger = layout === 'side' ? (r % 2) * 0.5 : 0;
    const fx = (c + 0.5 + stagger * 0.6) / (cols + (layout === 'side' ? 0.3 : 0));
    const fy = (r + 0.5) / rows;
    homes.push([
      field.x0 + (field.x1 - field.x0) * Math.min(0.95, fx) + (rand() - 0.5) * unit * 3,
      field.y0 + (field.y1 - field.y0) * fy + (rand() - 0.5) * unit * 3,
    ]);
  }
  // Shuffle so the first coalition is not always top-left.
  for (let i = homes.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [homes[i], homes[j]] = [homes[j], homes[i]];
  }

  const agents: Agent[] = [];
  const coalitions: Coalition[] = [];
  let nextId = 0;

  function spawnPoint(): [number, number] {
    // Arrivals appear loosely around the field, a little outside it.
    const pad = unit * 4;
    return [
      field.x0 - pad + rand() * (field.x1 - field.x0 + 2 * pad),
      field.y0 - pad + rand() * (field.y1 - field.y0 + 2 * pad),
    ];
  }

  function makeAgent(arriveAt: number): Agent {
    const k = Math.floor(rand() * K_MAX);
    const [sx, sy] = spawnPoint();
    return {
      id: nextId++,
      theta: centres[k] + gauss() * 0.42,
      arriveAt,
      sx,
      sy,
      x: sx,
      y: sy,
      vx: 0,
      vy: 0,
      coalition: -1,
      slot: 0,
      parent: -1,
      state: 'waiting',
      candidates: [],
      t: 0,
      alpha: 0,
    };
  }

  // Accelerating arrivals: sparse at first, then a rush.
  for (let i = 0; i < count; i++) {
    const u = i / Math.max(1, count - 1);
    agents.push(makeAgent(180 + (introMs - 700) * Math.pow(u, 0.62)));
  }

  const value = (a: Agent, b: Agent) => Math.cos(a.theta - b.theta) - TAU;
  const utility = (a: Agent, c: Coalition) => c.members.reduce((s, m) => s + value(a, agents[m]), 0);

  function rank(a: Agent) {
    return coalitions
      .map((c) => ({ c: c.id, u: utility(a, c) }))
      .sort((p, q) => q.u - p.u);
  }

  /** The online decision: best existing coalition, or a new one. Irrevocable. */
  function decide(a: Agent) {
    const ranked = rank(a);
    let target: number;
    if ((!ranked.length || ranked[0].u <= 0) && coalitions.length < K_MAX) {
      const [hx, hy] = homes[coalitions.length];
      target = coalitions.length;
      coalitions.push({ id: target, hx, hy, x: hx, y: hy, phase: rand() * Math.PI * 2, members: [] });
    } else {
      target = ranked.length ? ranked[0].c : 0;
    }
    const c = coalitions[target];
    // Attach to the nearest existing member: an online spanning tree per coalition.
    let best = -1;
    let bestD = Infinity;
    const used = new Set(c.members.map((m) => agents[m].slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const [tx, ty] = slotPosition(c, slot);
    for (const m of c.members) {
      const [mx, my] = slotPosition(c, agents[m].slot);
      const d = (mx - tx) ** 2 + (my - ty) ** 2;
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    a.coalition = target;
    a.slot = slot;
    a.parent = best;
    c.members.push(a.id);
  }

  function slotPosition(c: Coalition, slot: number): [number, number] {
    const r = unit * 0.95 * Math.sqrt(slot + 0.35);
    const ang = slot * GOLDEN + c.phase;
    return [c.x + Math.cos(ang) * r, c.y + Math.sin(ang) * r * 0.92];
  }

  let clock = 0;
  let arrivals = 0;

  function probe(a: Agent) {
    a.state = 'probing';
    a.t = 0;
    a.candidates = rank(a)
      .slice(0, 3)
      .map((r) => r.c);
    arrivals++;
  }

  function commit(a: Agent) {
    decide(a);
    a.state = 'committed';
    a.t = 0;
  }

  /** Advance the simulation by dt ms. `drift` animates coalition homes (ambient mode). */
  function step(dt: number, drift = true) {
    clock += dt;
    const time = clock / 1000;
    for (const c of coalitions) {
      const amp = drift ? unit * 0.9 : 0;
      c.x = c.hx + Math.sin(time * 0.21 + c.phase) * amp;
      c.y = c.hy + Math.cos(time * 0.17 + c.phase * 1.3) * amp * 0.8;
    }
    const k = 0.0017 * dt; // spring stiffness
    for (const a of agents) {
      if (a.state === 'gone') continue;
      a.t += dt;
      if (a.state === 'waiting') {
        if (clock >= a.arriveAt) probe(a);
        else continue;
      }
      if (a.state === 'probing') {
        a.alpha = Math.min(1, a.t / 160);
        if (a.t >= PROBE_MS) commit(a);
        continue;
      }
      if (a.state === 'leaving') {
        a.alpha = Math.max(0, a.alpha - dt / 900);
        if (a.alpha === 0) a.state = 'gone';
      } else {
        a.alpha = Math.min(1, a.alpha + dt / 300);
      }
      const [tx, ty] = slotPosition(coalitions[a.coalition], a.slot);
      // Critically damped-ish spring towards the slot.
      a.vx = (a.vx + (tx - a.x) * k) * Math.pow(0.86, dt / 16);
      a.vy = (a.vy + (ty - a.y) * k) * Math.pow(0.86, dt / 16);
      a.x += a.vx * (dt / 16);
      a.y += a.vy * (dt / 16);
    }
  }

  /** Jump straight to the settled state (skip / reduced motion / static SVG). */
  function finish() {
    for (const a of agents) {
      if (a.state === 'waiting') probe(a);
      if (a.state === 'probing') commit(a);
      a.alpha = a.state === 'leaving' || a.state === 'gone' ? 0 : 1;
    }
    clock = Math.max(clock, introMs);
    for (const a of agents) {
      if (a.coalition < 0 || a.state === 'gone') continue;
      const [tx, ty] = slotPosition(coalitions[a.coalition], a.slot);
      a.x = tx;
      a.y = ty;
      a.vx = a.vy = 0;
    }
  }

  /** Ambient dynamics after the intro: one agent departs, a new one arrives. */
  function churn() {
    const live = agents.filter((a) => a.state === 'committed');
    if (live.length < 8) return;
    const leaver = live[Math.floor(rand() * live.length)];
    leaver.state = 'leaving';
    const c = coalitions[leaver.coalition];
    c.members = c.members.filter((m) => m !== leaver.id);
    // Children of the leaver re-attach to its parent (the tree stays connected).
    for (const m of c.members) if (agents[m].parent === leaver.id) agents[m].parent = leaver.parent;
    const a = makeAgent(clock + 600);
    agents.push(a);
  }

  const slot = (a: Agent) => slotPosition(coalitions[a.coalition], a.slot);

  return {
    agents,
    slot,
    coalitions,
    unit,
    step,
    finish,
    churn,
    get clock() {
      return clock;
    },
    get arrivals() {
      return arrivals;
    },
    introMs,
  };
}

export type Sim = ReturnType<typeof createSim>;

/** Palette shared by canvas and SVG (luminous on the dark stage; echoes the publication-type hues). */
export const COALITION_COLOURS = ['#8fa9ff', '#5fd3aa', '#f0b45c', '#e592d8', '#c8d0e0'];
