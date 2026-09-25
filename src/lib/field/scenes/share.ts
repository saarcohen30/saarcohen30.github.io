// Scene B — Share: allocation and fairness over time.
// Resources arrive one at a time at a central source and are routed to the agent that values
// them most relative to what it already holds, so bundles grow evenly. Each agent's ring shows
// its share; now and then an item moves from the best-off agent to the worst-off.
import { PALETTE, INK, GOLDEN, mulberry32, unitFor, spring, ping, bezier, easeInOut, type SceneFactory, type Hoverable } from '../core';

interface Agent {
  id: number;
  x: number;
  y: number;
  hx: number;
  hy: number;
  vx: number;
  vy: number;
  pref: number;
  bundle: number[];
  appearAt: number;
  alpha: number;
  t: number;
}
interface Item {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  sx: number;
  sy: number;
  angle: number;
  arriveAt: number;
  owner: number;
  slot: number;
  state: 'waiting' | 'flying' | 'held' | 'fading' | 'gone';
  t: number;
  alpha: number;
  worth: number;
}

const FLIGHT = 820;

export const createShare: SceneFactory = (o) => {
  const rand = mulberry32((o.seed ?? 30) + 11);
  const unit = unitFor(o);
  const f = o.field;
  const introMs = 2700;
  const nAgents = o.layout === 'side' ? 6 : 5;
  const nItems = Math.round(Math.max(24, Math.min(o.layout === 'side' ? 60 : 34, o.density * 0.85)));
  const cx = (f.x0 + f.x1) / 2;
  const cy = (f.y0 + f.y1) / 2;
  const rx = (f.x1 - f.x0) * 0.38;
  const ry = (f.y1 - f.y0) * 0.36;
  let clock = 0;

  // Agents sit on a wide ellipse around the source.
  const agents: Agent[] = Array.from({ length: nAgents }, (_, i) => {
    const ang = -Math.PI / 2 + (i / nAgents) * Math.PI * 2 + (rand() - 0.5) * 0.25;
    const hx = cx + Math.cos(ang) * rx;
    const hy = cy + Math.sin(ang) * ry;
    return { id: i, x: hx, y: hy, hx, hy, vx: 0, vy: 0, pref: (i / nAgents) * Math.PI * 2, bundle: [], appearAt: 60 + i * 90, alpha: 0, t: 0 };
  });

  const items: Item[] = [];
  const makeItem = (arriveAt: number): Item => {
    const jitter = unit * 0.6;
    const sx = cx + (rand() - 0.5) * jitter;
    const sy = cy + (rand() - 0.5) * jitter;
    return { id: items.length, x: sx, y: sy, vx: 0, vy: 0, sx, sy, angle: rand() * Math.PI * 2, arriveAt, owner: -1, slot: 0, state: 'waiting', t: 0, alpha: 0, worth: 0 };
  };
  for (let i = 0; i < nItems; i++) items.push(makeItem(620 + (introMs - 1500) * Math.pow(i / Math.max(1, nItems - 1), 0.7)));

  const valueOf = (a: Agent, it: Item) => 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(a.pref - it.angle));
  const held = (a: Agent) => a.bundle.reduce((s, id) => s + items[id].worth, 0);

  // Bundles fan outward, away from the source.
  const slotPos = (a: Agent, slot: number): [number, number] => {
    const r = unit * 0.85 * Math.sqrt(slot + 1.4);
    const out = Math.atan2(a.hy - cy, a.hx - cx);
    const ang = out + Math.sin(slot * GOLDEN * 3) * 1.4;
    return [a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r * 0.9];
  };
  const freeSlot = (a: Agent) => {
    const used = new Set(a.bundle.map((id) => items[id].slot));
    let s = 0;
    while (used.has(s)) s++;
    return s;
  };

  /** The allocation rule: value relative to what the agent already holds. */
  function allocate(it: Item) {
    let best = 0;
    let score = -1;
    for (const a of agents) {
      const s = valueOf(a, it) / (1 + held(a));
      if (s > score) [score, best] = [s, a.id];
    }
    const a = agents[best];
    Object.assign(it, { owner: best, slot: freeSlot(a), worth: valueOf(a, it), state: 'flying', t: 0, sx: it.x, sy: it.y });
    a.bundle.push(it.id);
  }

  function transfer(it: Item, to: Agent) {
    const from = agents[it.owner];
    from.bundle = from.bundle.filter((id) => id !== it.id);
    Object.assign(it, { owner: to.id, slot: freeSlot(to), worth: valueOf(to, it), state: 'flying', t: 0, sx: it.x, sy: it.y });
    to.bundle.push(it.id);
  }

  const step = (dt: number) => {
    clock += dt;
    const time = clock / 1000;
    for (const a of agents) {
      a.t += dt;
      if (clock >= a.appearAt) a.alpha = Math.min(1, a.alpha + dt / 350);
      spring(a, a.hx + Math.sin(time * 0.19 + a.id) * unit * 0.6, a.hy + Math.cos(time * 0.23 + a.id * 2) * unit * 0.5, dt, 0.0009);
    }
    for (const it of items) {
      if (it.state === 'gone') continue;
      it.t += dt;
      if (it.state === 'waiting') {
        if (clock < it.arriveAt) continue;
        it.state = 'held';
        allocate(it);
      }
      if (it.state === 'fading') {
        it.alpha = Math.max(0, it.alpha - dt / 700);
        if (!it.alpha) it.state = 'gone';
        continue;
      }
      it.alpha = Math.min(1, it.alpha + dt / 200);
      const [tx, ty] = slotPos(agents[it.owner], it.slot);
      if (it.state === 'flying') {
        const k = easeInOut(it.t / FLIGHT);
        // A gentle curve, all bending the same way: resources spiral out from the source.
        const mx = (it.sx + tx) / 2 - (ty - it.sy) * 0.22;
        const my = (it.sy + ty) / 2 + (tx - it.sx) * 0.22;
        it.x = bezier(k, it.sx, mx, tx);
        it.y = bezier(k, it.sy, my, ty);
        if (it.t >= FLIGHT) {
          it.state = 'held';
          it.t = 0;
          it.vx = it.vy = 0;
        }
      } else spring(it, tx, ty, dt);
    }
  };

  const finish = () => {
    for (const it of items) {
      if (it.state === 'waiting') {
        it.state = 'held';
        allocate(it);
      }
      if (it.state === 'flying' || it.state === 'held') {
        it.state = 'held';
        [it.x, it.y] = slotPos(agents[it.owner], it.slot);
        it.alpha = 1;
        it.t = 5000;
      }
    }
    for (const a of agents) {
      a.alpha = 1;
      a.t = 5000;
    }
    clock = Math.max(clock, introMs);
  };

  const churn = () => {
    // Rebalance: the best-off agent passes an item to the worst-off one…
    const sorted = [...agents].sort((a, b) => held(b) - held(a));
    const rich = sorted[0];
    const poor = sorted.at(-1)!;
    if (rich.bundle.length > 2 && held(rich) - held(poor) > 0.6) transfer(items[rich.bundle[rich.bundle.length - 1]], poor);
    // …a new resource arrives, and the oldest one is used up.
    items.push(makeItem(clock + 500));
    const live = items.filter((it) => it.state === 'held');
    if (live.length > nItems) {
      const old = live[0];
      agents[old.owner].bundle = agents[old.owner].bundle.filter((id) => id !== old.id);
      old.state = 'fading';
    }
  };

  const draw: ReturnType<SceneFactory>['draw'] = (p, hot) => {
    // The source: where resources arrive, one at a time.
    const pulse = (clock % 1400) / 1400;
    p.ring(cx, cy, unit * (0.7 + pulse * 0.9), INK, 0.22 * (1 - pulse), 1);
    p.ring(cx, cy, unit * 0.55, INK, 0.3, 1);
    for (const a of agents) {
      if (!a.alpha) continue;
      const c = PALETTE[a.id % PALETTE.length];
      p.halo(a.x, a.y, unit * (2.2 + Math.sqrt(a.bundle.length) * 1.2), c, (a.id === hot ? 0.15 : 0.075) * a.alpha);
    }
    for (const it of items) {
      if (it.state === 'waiting' || it.state === 'gone' || it.owner < 0) continue;
      const a = agents[it.owner];
      const c = PALETTE[a.id % PALETTE.length];
      if (it.state === 'held' || it.state === 'fading') {
        const fresh = Math.max(0, 1 - it.t / 900);
        p.line(a.x, a.y, it.x, it.y, c, it.alpha * ((a.id === hot ? 0.42 : 0.2) + fresh * 0.4), 1);
      } else {
        // In flight: a faint trace of the path so far.
        const [tx, ty] = slotPos(a, it.slot);
        const mx = (it.sx + tx) / 2 - (ty - it.sy) * 0.22;
        const my = (it.sy + ty) / 2 + (tx - it.sx) * 0.22;
        p.curve(it.sx, it.sy, mx, my, tx, ty, c, 0.16 * it.alpha * (1 - easeInOut(it.t / FLIGHT)), 1, [2, 4]);
      }
    }
    for (const it of items) {
      if (it.state === 'waiting' || it.state === 'gone' || it.owner < 0) continue;
      const c = PALETTE[agents[it.owner].id % PALETTE.length];
      if (it.state === 'flying') ping(p, it.sx, it.sy, it.t * 1.6, unit * 0.6, INK);
      p.square(it.x, it.y, it.state === 'flying' ? 4.8 : 4.2, it.state === 'flying' ? INK : c, it.alpha * 0.95);
    }
    for (const a of agents) {
      if (!a.alpha) continue;
      const c = PALETTE[a.id % PALETTE.length];
      ping(p, a.x, a.y, a.t - a.appearAt, unit, c);
      // The ring shows the agent's share; similar rings mean a balanced allocation.
      p.ring(a.x, a.y, unit * 0.45 + Math.sqrt(held(a)) * unit * 0.55, c, 0.35 * a.alpha, 1);
      p.dot(a.x, a.y, a.id === hot ? 4.4 : 3.8, c, a.alpha);
    }
  };

  return {
    step,
    finish,
    churn,
    draw,
    hoverables: (): Hoverable[] => agents.map((a) => ({ x: a.x, y: a.y, group: a.id, alpha: a.alpha })),
    introMs,
    churnEvery: 2600,
    get clock() {
      return clock;
    },
  };
};
