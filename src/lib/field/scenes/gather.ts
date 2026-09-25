// Scene A — Gather: interaction and coordination.
// Agents arrive one at a time, weigh the groups already present and join the one they value
// most (or start a new one). Groups drift, members come and go. Evokes strategic interaction,
// coalitions and collective choice without claiming to be any specific model.
import { PALETTE, INK, GOLDEN, mulberry32, gaussian, unitFor, spring, ping, type SceneFactory, type Hoverable } from '../core';

interface Agent {
  id: number;
  theta: number;
  arriveAt: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  group: number;
  slot: number;
  parent: number;
  state: 'waiting' | 'probing' | 'joined' | 'leaving' | 'gone';
  candidates: number[];
  t: number;
  alpha: number;
}
interface Group {
  id: number;
  hx: number;
  hy: number;
  x: number;
  y: number;
  phase: number;
  members: number[];
}

const K = 5;
const PROBE = 240;

export const createGather: SceneFactory = (o) => {
  const rand = mulberry32(o.seed ?? 30);
  const gauss = gaussian(rand);
  const unit = unitFor(o);
  const f = o.field;
  const introMs = 2600;
  const count = Math.round(Math.max(26, Math.min(o.layout === 'side' ? 72 : 40, o.density)));

  const centres = Array.from({ length: K }, (_, k) => (k / K) * Math.PI * 2 + rand() * 0.4);
  const homes: [number, number][] = [];
  const cols = o.layout === 'side' ? 2 : 3;
  const rows = Math.ceil(K / cols);
  for (let k = 0; k < K; k++) {
    const c = k % cols;
    const r = Math.floor(k / cols);
    const stagger = o.layout === 'side' ? (r % 2) * 0.5 : 0;
    const fx = (c + 0.5 + stagger * 0.6) / (cols + (o.layout === 'side' ? 0.3 : 0));
    homes.push([
      f.x0 + (f.x1 - f.x0) * Math.min(0.95, fx) + (rand() - 0.5) * unit * 3,
      f.y0 + (f.y1 - f.y0) * ((r + 0.5) / rows) + (rand() - 0.5) * unit * 3,
    ]);
  }
  for (let i = homes.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [homes[i], homes[j]] = [homes[j], homes[i]];
  }

  const agents: Agent[] = [];
  const groups: Group[] = [];
  let clock = 0;

  const make = (arriveAt: number): Agent => {
    const pad = unit * 4;
    const x = f.x0 - pad + rand() * (f.x1 - f.x0 + 2 * pad);
    const y = f.y0 - pad + rand() * (f.y1 - f.y0 + 2 * pad);
    return { id: agents.length, theta: centres[Math.floor(rand() * K)] + gauss() * 0.42, arriveAt, x, y, vx: 0, vy: 0, group: -1, slot: 0, parent: -1, state: 'waiting', candidates: [], t: 0, alpha: 0 };
  };
  for (let i = 0; i < count; i++) agents.push(make(180 + (introMs - 700) * Math.pow(i / Math.max(1, count - 1), 0.62)));

  // Agents value others with similar latent "types"; a group's value is the sum.
  const value = (a: Agent, b: Agent) => Math.cos(a.theta - b.theta) - 0.12;
  const rank = (a: Agent) =>
    groups.map((g) => ({ g: g.id, u: g.members.reduce((s, m) => s + value(a, agents[m]), 0) })).sort((p, q) => q.u - p.u);

  const slotPos = (g: Group, slot: number): [number, number] => {
    const r = unit * 0.95 * Math.sqrt(slot + 0.35);
    const ang = slot * GOLDEN + g.phase;
    return [g.x + Math.cos(ang) * r, g.y + Math.sin(ang) * r * 0.92];
  };

  function join(a: Agent) {
    const ranked = rank(a);
    let target: number;
    if ((!ranked.length || ranked[0].u <= 0) && groups.length < K) {
      const [hx, hy] = homes[groups.length];
      target = groups.length;
      groups.push({ id: target, hx, hy, x: hx, y: hy, phase: rand() * Math.PI * 2, members: [] });
    } else target = ranked.length ? ranked[0].g : 0;
    const g = groups[target];
    const used = new Set(g.members.map((m) => agents[m].slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const [tx, ty] = slotPos(g, slot);
    let best = -1;
    let bestD = Infinity;
    for (const m of g.members) {
      const [mx, my] = slotPos(g, agents[m].slot);
      const d = (mx - tx) ** 2 + (my - ty) ** 2;
      if (d < bestD) [bestD, best] = [d, m];
    }
    Object.assign(a, { group: target, slot, parent: best, state: 'joined', t: 0 });
    g.members.push(a.id);
  }

  const step = (dt: number) => {
    clock += dt;
    const time = clock / 1000;
    for (const g of groups) {
      g.x = g.hx + Math.sin(time * 0.21 + g.phase) * unit * 0.9;
      g.y = g.hy + Math.cos(time * 0.17 + g.phase * 1.3) * unit * 0.72;
    }
    for (const a of agents) {
      if (a.state === 'gone') continue;
      a.t += dt;
      if (a.state === 'waiting') {
        if (clock < a.arriveAt) continue;
        a.state = 'probing';
        a.t = 0;
        a.candidates = rank(a).slice(0, 3).map((r) => r.g);
      }
      if (a.state === 'probing') {
        a.alpha = Math.min(1, a.t / 160);
        if (a.t >= PROBE) join(a);
        continue;
      }
      a.alpha = a.state === 'leaving' ? Math.max(0, a.alpha - dt / 900) : Math.min(1, a.alpha + dt / 300);
      if (a.state === 'leaving' && a.alpha === 0) a.state = 'gone';
      const [tx, ty] = slotPos(groups[a.group], a.slot);
      spring(a, tx, ty, dt);
    }
  };

  const finish = () => {
    for (const a of agents) {
      if (a.state === 'waiting') {
        a.state = 'probing';
        a.candidates = [];
      }
      if (a.state === 'probing') join(a);
      a.alpha = a.state === 'joined' ? 1 : 0;
    }
    clock = Math.max(clock, introMs);
    for (const a of agents) {
      if (a.state !== 'joined') continue;
      [a.x, a.y] = slotPos(groups[a.group], a.slot);
      a.vx = a.vy = 0;
      a.t = 5000;
    }
  };

  const churn = () => {
    const live = agents.filter((a) => a.state === 'joined');
    if (live.length < 8) return;
    const leaver = live[Math.floor(rand() * live.length)];
    leaver.state = 'leaving';
    const g = groups[leaver.group];
    g.members = g.members.filter((m) => m !== leaver.id);
    for (const m of g.members) if (agents[m].parent === leaver.id) agents[m].parent = leaver.parent;
    agents.push(make(clock + 600));
  };

  const draw: ReturnType<SceneFactory>['draw'] = (p, hot) => {
    for (const g of groups) {
      if (!g.members.length) continue;
      p.halo(g.x, g.y, unit * (2.4 + Math.sqrt(g.members.length) * 1.5), PALETTE[g.id], g.id === hot ? 0.16 : 0.085);
    }
    for (const a of agents) {
      if ((a.state !== 'joined' && a.state !== 'leaving') || a.parent < 0) continue;
      const q = agents[a.parent];
      if (!q || q.state === 'gone') continue;
      const [tx, ty] = slotPos(groups[a.group], a.slot);
      const settle = Math.max(0, 1 - Math.hypot(tx - a.x, ty - a.y) / (unit * 3));
      if (!settle) continue;
      const fresh = a.state === 'joined' ? Math.max(0, 1 - a.t / 900) * settle : 0;
      p.line(a.x, a.y, q.x, q.y, PALETTE[a.group], Math.min(a.alpha, q.alpha) * settle * ((a.group === hot ? 0.55 : 0.3) + fresh * 0.5), 1 + fresh * 0.8);
    }
    for (const a of agents) {
      if (a.state !== 'probing') continue;
      const k = 1 - a.t / PROBE;
      a.candidates.forEach((gid, r) => {
        const g = groups[gid];
        const dx = g.x - a.x;
        const dy = g.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const reach = Math.min(len, unit * (5 - r * 1.3)) * Math.min(1, a.t / 120);
        p.line(a.x, a.y, a.x + (dx / len) * reach, a.y + (dy / len) * reach, PALETTE[gid], 0.7 * k * (1 - r * 0.3), 1, [2, 4]);
      });
    }
    for (const a of agents) {
      if (a.state === 'waiting' || a.state === 'gone') continue;
      const colour = a.group >= 0 ? PALETTE[a.group] : INK;
      if (a.state !== 'leaving') ping(p, a.x, a.y, a.state === 'probing' ? a.t : a.t + PROBE, unit, colour);
      p.dot(a.x, a.y, a.state === 'probing' ? 2.6 : a.group === hot ? 2.9 : 2.3, colour, a.alpha * 0.95);
    }
  };

  return {
    step,
    finish,
    churn,
    draw,
    hoverables: (): Hoverable[] => agents.filter((a) => a.state === 'joined'),
    introMs,
    get clock() {
      return clock;
    },
  };
};
