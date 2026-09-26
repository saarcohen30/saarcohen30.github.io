// Converging bursts: choreographed fire. Two glows gather at opposite sides of the field, drawing
// embers in; a burst strikes from one, accelerating along a rising arc; a second strikes from the
// other and curves wide around it; they meet. The meeting is the climax: a brief, coherent,
// near-white bloom driven by their combined momentum and buoyancy, a faint ring of heat shimmer
// spreading out; the flare breaks into rising tongues and embers, the merged energy climbs in one
// column that weakens and dissipates, and the field settles before the next cycle (mirrored, and
// varied a little each time).
import { mulberry32 } from '../core';
import { smooth, clamp, mix } from './kit';
import { flameEngine, pathAt, mirror, glow, type Key } from './flame-engine';

// Paths (field fractions); times in ms from each burst's ignition. Spacing grows along A: it
// accelerates. B swings wide and comes down onto the meeting point from above.
const A: Key[] = [
  [0, 0.07, 0.85],
  [420, 0.19, 0.75],
  [760, 0.34, 0.66],
  [1000, 0.5, 0.57],
];
const B: Key[] = [
  [0, 0.95, 0.27],
  [330, 0.82, 0.19],
  [620, 0.65, 0.2],
  [830, 0.55, 0.32],
  [960, 0.51, 0.47],
  [1040, 0.5, 0.57],
];
const A_AT = 800;
const B_AT = 760;
export const MEET = A_AT + 1000; // both arrive together
const CYCLE = 7400; // about 2 s of quiet between cycles

export interface Bursts {
  step(dt: number, t: number): void;
  render(ctx: CanvasRenderingContext2D, t: number, x0?: number, y0?: number): void;
  pointer(x: number, y: number, t: number): void;
  /** Jump to the live state (the column rising after a meeting), resuming at scene time `at`. */
  settle(at: number): void;
}

export function createBursts(W: number, H: number, seed = 61): Bursts {
  const E = flameEngine(W, H, seed);
  const S = E.S;
  let offset = 0;
  let prev: ([number, number] | null)[] = [null, null];
  let flared = -1;
  let lastCycle = -1;
  // Per-cycle variation: mirrored on odd cycles, the whole figure shifted and scaled a little.
  let paths: { keys: Key[]; at: number }[] = [];
  let meet: [number, number] = [0.5 * W, 0.57 * H];
  const setCycle = (c: number) => {
    const r = mulberry32(seed * 131 + c * 7919);
    const dx = (r() - 0.5) * 0.08;
    const dy = (r() - 0.5) * 0.06;
    const sc = 0.92 + r() * 0.12;
    const vary = (k: Key[]): Key[] => k.map(([t, x, y]) => [t, 0.5 + (x - 0.5) * sc + dx, 0.57 + (y - 0.57) * sc + dy]);
    const flip = c % 2 === 1;
    paths = [
      { keys: vary(flip ? mirror(A) : A), at: A_AT },
      { keys: vary(flip ? mirror(B) : B), at: B_AT },
    ];
    const end = paths[0].keys[paths[0].keys.length - 1];
    meet = [end[1] * W, end[2] * H];
    prev = [null, null];
  };
  const localOf = (t: number) => {
    const te = t + offset;
    const c = Math.floor(te / CYCLE);
    if (c !== lastCycle) {
      lastCycle = c;
      setCycle(c);
    }
    return te - c * CYCLE;
  };

  function step(dt: number, t: number) {
    const local = localOf(t);
    const cyc = lastCycle;
    // Anticipation: embers drawn in towards each anchor, faster as ignition nears.
    for (const p of paths) {
      if (local < p.at && E.rand() < 0.12 + 0.3 * (local / p.at)) {
        const [ax, ay] = [p.keys[0][1] * W, p.keys[0][2] * H];
        const a = E.rand() * Math.PI * 2;
        const r = (50 + E.rand() * 50) * S;
        E.embers.push({ x: ax + Math.cos(a) * r, y: ay + Math.sin(a) * r, vx: -Math.cos(a) * 0.09 * S, vy: -Math.sin(a) * 0.09 * S, life: 650, age: 0, b: 0.45 });
      }
    }
    // The bursts: gas laid down along each path, inheriting its velocity.
    paths.forEach((p, i) => {
      const pos = pathAt(p.keys, local - p.at, W, H);
      const pv = prev[i];
      if (pos && pv && dt > 0) {
        const vx = (pos[0] - pv[0]) / dt;
        const vy = (pos[1] - pv[1]) / dt;
        const n = Math.max(1, Math.ceil(Math.hypot(pos[0] - pv[0], pos[1] - pv[1]) / (1.6 * S)));
        const early = local - p.at < 180 ? 1.15 : 1; // ignition overshoot
        for (let k = 0; k < n; k++) {
          const f = (k + 1) / n;
          E.emit(mix(pv[0], pos[0], f), mix(pv[1], pos[1], f), vx * 0.3, vy * 0.3, early, i ? 5.5 : 7, 0.5, 420);
        }
        if (E.rand() < 0.2) E.ember(pos[0], pos[1], vx * 0.3, vy * 0.3);
      }
      prev[i] = pos;
    });
    // The meeting: a coherent bloom rather than a radial explosion. The hot core holds together
    // briefly; the body is thrown along the combined momentum and upward by buoyancy.
    if (local >= MEET && flared !== cyc) {
      flared = cyc;
      const [mx, my] = meet;
      const dirA = paths[0].keys[paths[0].keys.length - 1][1] - paths[0].keys[paths[0].keys.length - 2][1];
      const push = Math.sign(dirA) * 0.05 * S;
      for (let k = 0; k < 26; k++) E.emit(mx + (E.rand() - 0.5) * 8 * S, my + (E.rand() - 0.5) * 8 * S, (E.rand() - 0.5) * 0.04 * S, -0.03 * S, 1.15, 11, 0.2, 300);
      for (let k = 0; k < 70; k++) {
        const a = -Math.PI / 2 + (E.rand() - 0.5) * 2.4;
        const sp = (0.06 + E.rand() * 0.18) * S;
        E.emit(mx, my, Math.cos(a) * sp + push, Math.sin(a) * sp, 0.95, 8, 0.4, 560);
      }
      for (let k = 0; k < 28; k++) {
        const a = -Math.PI / 2 + (E.rand() - 0.5) * 2.8;
        const sp = (0.1 + E.rand() * 0.3) * S;
        E.ember(mx, my, Math.cos(a) * sp + push, Math.sin(a) * sp, 1400 + E.rand() * 2400);
      }
    }
    // The merged energy climbs in one column that sways and weakens.
    if (local > MEET && local < MEET + 2600) {
      const w = 1 - (local - MEET) / 2600;
      const [mx, my] = meet;
      const sway = Math.sin(local * 0.004) * 10 * S;
      for (let k = 0; k < 3; k++) E.emit(mx + sway + (E.rand() - 0.5) * 20 * S, my, 0, -0.12 * S * w, 0.85 * w + 0.1, 8, 0.4, 700);
      if (E.rand() < 0.15 * w) E.ember(mx + sway, my - 20 * S, 0, -0.1 * S);
    }
    E.step(dt, t);
  }

  return {
    step,
    render(ctx, t, x0 = 0, y0 = 0) {
      const local = localOf(t);
      // Anticipation glows: contracting and brightening (a breath in), then the ignition flash.
      for (const p of paths) {
        if (local < p.at + 200) {
          const u = clamp(local / p.at);
          const flash = local > p.at ? 1 - (local - p.at) / 200 : 0;
          glow(ctx, x0 + p.keys[0][1] * W, y0 + p.keys[0][2] * H, (50 - 30 * u) * S + flash * 60 * S, 0.08 + 0.3 * u * u + flash * 0.5, 1 - flash);
        }
      }
      const since = local - MEET;
      const [mx, my] = [x0 + meet[0], y0 + meet[1]];
      if (since > 0 && since < 3200) {
        // The bloom: fast attack, near-white for an instant, then a long warm decay.
        const attack = smooth(0, 90, since);
        const decay = Math.pow(1 - clamp(since / 1600), 2.2);
        glow(ctx, mx, my - 10 * S * clamp(since / 1600), (46 + 120 * clamp(since / 1600)) * S, 0.62 * attack * decay, 1 - Math.max(0, 1 - since / 220));
        // Heat shimmer: a faint, soft ring of warm air spreading out (no drawn line).
        const u = clamp(since / 1300);
        if (u < 1) {
          const R = (24 + 200 * Math.sqrt(u)) * S;
          const g = ctx.createRadialGradient(mx, my, R * 0.45, mx, my, R);
          g.addColorStop(0, 'rgba(255,170,100,0)');
          g.addColorStop(0.75, `rgba(255,170,100,${0.04 * (1 - u) * (1 - u)})`);
          g.addColorStop(1, 'rgba(255,170,100,0)');
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = g;
          ctx.fillRect(mx - R, my - R, R * 2, R * 2);
          ctx.restore();
        }
        // Residual warmth where they met, fading as the field settles.
        glow(ctx, mx, my, 70 * S, 0.1 * (1 - clamp(since / 3200)), 1);
      }
      E.render(ctx, t, x0, y0);
    },
    pointer(x, y, t) {
      E.pointer(x, y, t);
    },
    settle(at) {
      // Live state: the column rising, a second or so after a meeting (cycle 1, mirrored).
      const target = CYCLE + MEET + 1000;
      offset = target - at;
      lastCycle = -1;
      E.gas.length = 0;
      E.embers.length = 0;
      flared = -1;
      for (let k = 110; k > 0; k--) step(16, at - k * 16);
    },
  };
}
