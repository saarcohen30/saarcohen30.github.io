// Scene D — Exchange: language and interacting AI systems.
// Two mirrored groups of agents pass "utterances" (sequences of short bars, like words in a line)
// back and forth along arcs. Some messages from one side are stopped at the boundary between
// them and dissolve. Evokes dialogue, self-play and safety without any literal AI imagery.
import { PALETTE, INK, GOLDEN, mulberry32, unitFor, spring, ping, bezier, easeInOut, type SceneFactory, type Hoverable } from '../core';

interface Agent {
  id: number;
  side: 0 | 1;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hx: number;
  hy: number;
  parent: number;
  appearAt: number;
  alpha: number;
  heardAt: number;
}
interface Utterance {
  from: number;
  to: number;
  words: number[];
  startAt: number;
  dur: number;
  bend: number;
  blocked: boolean;
}

const SIDE_COLOUR = [PALETTE[3], PALETTE[1]];

export const createExchange: SceneFactory = (o) => {
  const rand = mulberry32((o.seed ?? 30) + 37);
  const unit = unitFor(o);
  const f = o.field;
  const introMs = 2700;
  const per = o.layout === 'side' ? 13 : 9;
  const midX = (f.x0 + f.x1) / 2;
  const midY = (f.y0 + f.y1) / 2;
  const spread = (f.x1 - f.x0) * 0.29;
  let clock = 0;

  // Two mirrored clusters; the right one is the reflection of the left.
  const agents: Agent[] = [];
  const base: [number, number][] = [];
  for (let i = 0; i < per; i++) {
    const r = unit * 1.45 * Math.sqrt(i + 0.4);
    const ang = i * GOLDEN;
    base.push([Math.cos(ang) * r * 0.9, Math.sin(ang) * r * 1.15]);
  }
  for (const side of [0, 1] as const) {
    base.forEach(([dx, dy], i) => {
      const hx = midX + (side ? spread : -spread) + (side ? -dx : dx);
      const hy = midY + dy;
      // Attach to the nearest earlier member: same tree on both sides.
      let parent = -1;
      let bd = Infinity;
      for (let j = 0; j < i; j++) {
        const d = (base[j][0] - dx) ** 2 + (base[j][1] - dy) ** 2;
        if (d < bd) [bd, parent] = [d, side * per + j];
      }
      agents.push({ id: agents.length, side, x: hx, y: hy, vx: 0, vy: 0, hx, hy, parent, appearAt: 60 + i * 70 + side * 35, alpha: 0, heardAt: -1e9 });
    });
  }

  const utterances: Utterance[] = [];
  let turn = 0;
  function say(at: number, from?: number) {
    const side = turn++ % 2 === 0 ? 0 : 1;
    const speakers = agents.filter((a) => a.side === side);
    const listeners = agents.filter((a) => a.side !== side);
    const s = from ?? speakers[Math.floor(rand() * speakers.length)].id;
    const l = listeners[Math.floor(rand() * listeners.length)].id;
    const words = Array.from({ length: 4 + Math.floor(rand() * 5) }, () => 0.45 + rand() * 1.1);
    utterances.push({ from: s, to: l, words, startAt: at, dur: 1500, bend: (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.5), blocked: side === 0 && rand() < 0.4 });
  }
  [760, 1080, 1380, 1650, 1900, 2150].forEach((t) => say(t));

  const pathPoint = (u: Utterance, k: number): [number, number] => {
    const a = agents[u.from];
    const b = agents[u.to];
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2 + u.bend * unit * 5;
    return [bezier(k, a.x, cx, b.x), bezier(k, a.y, cy, b.y)];
  };

  const step = (dt: number) => {
    clock += dt;
    const time = clock / 1000;
    for (const a of agents) {
      if (clock >= a.appearAt) a.alpha = Math.min(1, a.alpha + dt / 350);
      const sway = Math.sin(time * 0.25 + a.id * 0.7) * unit * 0.35;
      spring(a, a.hx + (a.side ? -sway : sway) * 0.4, a.hy + Math.cos(time * 0.21 + (a.id % per)) * unit * 0.4, dt, 0.001);
    }
    for (let i = utterances.length - 1; i >= 0; i--) {
      const u = utterances[i];
      const age = clock - u.startAt;
      if (!u.blocked && age >= u.dur && agents[u.to].heardAt < u.startAt) agents[u.to].heardAt = clock;
      if (age > u.dur + 900) utterances.splice(i, 1);
    }
  };

  const finish = () => {
    for (const a of agents) a.alpha = 1;
    utterances.length = 0;
    clock = Math.max(clock, introMs);
  };

  const churn = () => {
    // A reply follows whatever was last heard, and the conversation keeps going.
    const lastHeard = agents.filter((a) => a.heardAt > 0).sort((a, b) => b.heardAt - a.heardAt)[0];
    say(clock + 200, lastHeard && lastHeard.side === turn % 2 ? lastHeard.id : undefined);
    say(clock + 900 + rand() * 500);
  };

  const draw: ReturnType<SceneFactory>['draw'] = (p, hot) => {
    // The boundary between the two sides.
    p.line(midX, f.y0, midX, f.y1, INK, 0.1, 1, [2, 6]);
    for (const side of [0, 1]) {
      const ms = agents.filter((a) => a.side === side);
      const cx = ms.reduce((s, a) => s + a.x, 0) / ms.length;
      const cy = ms.reduce((s, a) => s + a.y, 0) / ms.length;
      p.halo(cx, cy, unit * 6, SIDE_COLOUR[side], (side === hot ? 0.14 : 0.07) * ms[0].alpha);
    }
    for (const a of agents) {
      if (a.parent < 0) continue;
      const q = agents[a.parent];
      p.line(a.x, a.y, q.x, q.y, SIDE_COLOUR[a.side], Math.min(a.alpha, q.alpha) * (a.side === hot ? 0.5 : 0.3), 1);
    }
    for (const u of utterances) {
      const age = clock - u.startAt;
      if (age < 0) continue;
      const colour = SIDE_COLOUR[agents[u.from].side];
      const head = easeInOut(age / u.dur);
      // Where a blocked message stops: the crossing of its path with the boundary (~k = 0.5).
      const stopAt = 0.5;
      const reach = u.blocked ? Math.min(head, stopAt) : head;
      const fade = u.blocked ? (age > u.dur * 0.55 ? Math.max(0, 1 - (age - u.dur * 0.55) / 700) : 1) : age > u.dur ? Math.max(0, 1 - (age - u.dur) / 500) : 1;
      if (!fade) continue;
      // Words trail behind the head, spaced along the arc.
      let offset = 0;
      u.words.forEach((len, w) => {
        const k = reach - offset;
        offset += (len * unit * 1.1 + unit * 0.9) / Math.max(unit * 20, spread * 2.1);
        if (k <= 0) return;
        const [x, y] = pathPoint(u, k);
        const [x2, y2] = pathPoint(u, Math.max(0, k - 0.01));
        const angle = Math.atan2(y - y2, x - x2);
        const scatter = u.blocked && age > u.dur * 0.55 ? (1 - fade) * unit * (w % 2 ? 1 : -1) : 0;
        p.bar(x, y + scatter, len * unit * 1.1, angle, colour, 0.9 * fade, 2.6);
      });
      if (u.blocked && head >= stopAt) {
        const [bx, by] = pathPoint(u, stopAt);
        p.line(bx, by - unit * 1.4, bx, by + unit * 1.4, INK, 0.55 * fade, 1.6);
      }
    }
    for (const a of agents) {
      if (!a.alpha) continue;
      const colour = SIDE_COLOUR[a.side];
      ping(p, a.x, a.y, clock - a.appearAt, unit, colour);
      ping(p, a.x, a.y, clock - a.heardAt, unit, colour);
      p.dot(a.x, a.y, a.side === hot ? 2.9 : 2.4, colour, a.alpha);
    }
  };

  return {
    step,
    finish,
    churn,
    draw,
    hoverables: (): Hoverable[] => agents.map((a) => ({ x: a.x, y: a.y, group: a.side, alpha: a.alpha })),
    introMs,
    churnEvery: 1500,
    get clock() {
      return clock;
    },
  };
};
