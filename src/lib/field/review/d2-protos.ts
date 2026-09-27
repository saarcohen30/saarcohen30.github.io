// D2 studies (design review only): research-specific mechanisms in the site's shared art direction.
// See docs/design/research-scene-briefs.md. Each scene keeps its own primitives (agents and groups;
// items and bundles; agents, signals and links; roles, messages and a boundary); consistency comes
// from the shared kit below: stage, pale marks, one warm accent, soft halos, hairlines, eased motion.
import { mulberry32 } from '../core';
import { makeNoise2, smooth, clamp, mix } from '../elements/kit';
import type { Proto, ProtoFactory } from './common';

// ------------------------------------------------------------------ shared kit
export type RGB = [number, number, number];
export const PALE: RGB = [210, 220, 236];
export const WARM: RGB = [255, 176, 112];
const TINTS: RGB[] = [
  [150, 182, 222], // mist blue
  [222, 196, 156], // sand
  [168, 204, 188], // sage
  [196, 178, 216], // dusk
];
export const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a)})`;
export const mixc = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
export const ease = (t: number) => smooth(0, 1, t);

function stage(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const g = ctx.createRadialGradient(W * 0.6, H * 0.4, 0, W * 0.6, H * 0.4, Math.max(W, H) * 0.7);
  g.addColorStop(0, 'rgba(80,100,170,0.10)');
  g.addColorStop(1, 'rgba(80,100,170,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
export function halo(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: RGB, a: number) {
  if (a <= 0.005 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(c, a));
  g.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
export function agent(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: RGB, a: number) {
  halo(ctx, x, y, r * 4, c, a * 0.28);
  ctx.fillStyle = rgba(c, a);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
export function hair(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, c: RGB, a: number, w = 0.8) {
  if (a <= 0.005) return;
  ctx.strokeStyle = rgba(c, a);
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
/**
 * Scene scale. Each scene declares its own, so changing one never resizes another.
 * LEGACY: the scale the first D2 studies (Gather, Share B, Adapt A0/B, Exchange 0) were approved or
 * reviewed at. CARD: floors the size on small cards (Adapt A1 and later studies were built with it).
 */
export const LEGACY_SCALE = (W: number, H: number) => Math.min(W, H) / 330;
export const CARD_SCALE = (W: number, H: number) => Math.max(0.72, Math.min(W, H) / 300);

/** Wrap a scene: fade up over ~1 s; settle() jumps ahead. */
export function scene(
  init: (W: number, H: number, S: number, rand: () => number) => { step(dt: number, t: number): void; draw(ctx: CanvasRenderingContext2D, t: number): void },
  scale: (W: number, H: number) => number = LEGACY_SCALE,
): ProtoFactory {
  return (W, H, seed = 7) => {
    const S = scale(W, H);
    const s = init(W, H, S, mulberry32(seed));
    let settled = false;
    const p: Proto = {
      step: (dt, t) => s.step(dt, t),
      render(ctx, t) {
        stage(ctx, W, H);
        ctx.save();
        ctx.globalAlpha = settled ? 1 : smooth(0, 1000, t);
        s.draw(ctx, t);
        ctx.restore();
      },
      settle() {
        settled = true;
        for (let k = 0; k < 500; k++) s.step(16, 6000 - (500 - k) * 16);
      },
    };
    return p;
  };
}

// ------------------------------------------------------------------ Coalitions
// Agents arrive one at a time. Each pauses, weighs the existing groups (a hairline to each, brighter
// for the group it values more), then joins the one it values most, or starts a new group if none is
// worth joining. Now and then a member reconsiders and moves to a group it prefers; the structure
// settles. Groups are soft shared halos; members orbit loosely inside them.
export const d2Gather = scene((W, H, S, rand) => {
  interface G { x: number; y: number; tint: RGB; members: number }
  interface A { x: number; y: number; fx: number; fy: number; tx: number; ty: number; g: number; phase: 'arrive' | 'weigh' | 'move' | 'in' | 'leave'; t0: number; dur: number; ang: number; rad: number; util: number[]; a: number; flash: number }
  const groups: G[] = [];
  const agents: A[] = [];
  const spots = [
    [0.3, 0.36],
    [0.7, 0.34],
    [0.52, 0.72],
    [0.18, 0.72],
  ];
  const addGroup = (x: number, y: number) => {
    groups.push({ x, y, tint: TINTS[groups.length % TINTS.length], members: 0 });
    return groups.length - 1;
  };
  // Seed: two small groups already present.
  addGroup(W * spots[0][0], H * spots[0][1]);
  addGroup(W * spots[1][0], H * spots[1][1]);
  const slot = (a: A) => {
    const g = groups[a.g];
    const r = (10 + 6 * Math.sqrt(g.members)) * S;
    return [g.x + Math.cos(a.ang) * r * a.rad, g.y + Math.sin(a.ang) * r * a.rad * 0.8];
  };
  addGroup(W * spots[2][0], H * spots[2][1]);
  for (let i = 0; i < 10; i++) {
    const g = i % 3;
    groups[g].members++;
    const a: A = { x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0, g, phase: 'in', t0: 0, dur: 0, ang: rand() * 6.28, rad: 0.3 + rand() * 0.7, util: [], a: 1, flash: 0 };
    [a.x, a.y] = slot(a);
    agents.push(a);
  }
  let nextArrival = 600;
  let nextDeviation = 5200;
  const go = (a: A, phase: A['phase'], tx: number, ty: number, dur: number, t: number) => {
    a.phase = phase;
    a.fx = a.x;
    a.fy = a.y;
    a.tx = tx;
    a.ty = ty;
    a.t0 = t;
    a.dur = dur;
  };
  return {
    step(dt, t) {
      if (t > nextArrival) {
        nextArrival = t + 1700 + rand() * 700;
        const side = rand() < 0.5 ? -0.05 : 1.05;
        const a: A = { x: W * side, y: H * (0.2 + rand() * 0.6), fx: 0, fy: 0, tx: 0, ty: 0, g: -1, phase: 'arrive', t0: 0, dur: 0, ang: rand() * 6.28, rad: 0.3 + rand() * 0.7, util: [], a: 1, flash: 0 };
        go(a, 'arrive', W * (0.38 + rand() * 0.24), H * (0.44 + rand() * 0.14), 900, t);
        agents.push(a);
        // Keep the scene sparse: the oldest member drifts away.
        const inside = agents.filter((x) => x.phase === 'in');
        if (inside.length > 16) {
          const old = inside[0];
          groups[old.g].members--;
          go(old, 'leave', old.x + (old.x < W / 2 ? -1 : 1) * W * 0.5, old.y + (rand() - 0.5) * H * 0.3, 1600, t);
        }
      }
      if (t > nextDeviation) {
        nextDeviation = t + 4200 + rand() * 2500;
        const inside = agents.filter((x) => x.phase === 'in');
        if (inside.length > 3 && groups.length > 1) {
          const a = inside[Math.floor(rand() * inside.length)];
          a.util = groups.map((_, i) => (i === a.g ? 0.4 : rand()));
          groups[a.g].members--;
          a.g = -1;
          go(a, 'weigh', a.x, a.y, 900, t);
        }
      }
      for (const a of agents) {
        const u = clamp((t - a.t0) / a.dur);
        if (a.phase !== 'in') {
          a.x = mix(a.fx, a.tx, ease(u));
          a.y = mix(a.fy, a.ty, ease(u));
        }
        if (u >= 1) {
          if (a.phase === 'arrive') {
            // Utilities are revealed on arrival: how much it values each group.
            a.util = groups.map(() => rand());
            go(a, 'weigh', a.x, a.y, 1000, t);
          } else if (a.phase === 'weigh') {
            let best = a.util.indexOf(Math.max(...a.util));
            if (a.util[best] < 0.35 && groups.length < 4) best = addGroup(W * spots[groups.length][0], H * spots[groups.length][1]);
            a.g = best;
            groups[best].members++;
            const [sx, sy] = slot(a);
            go(a, 'move', sx, sy, 900, t);
          } else if (a.phase === 'move') {
            a.phase = 'in';
            a.flash = 1;
          }
        }
        if (a.phase === 'in') {
          a.ang += dt * 0.00018 * (a.g % 2 ? 1 : -1);
          const [sx, sy] = slot(a);
          a.x += (sx - a.x) * Math.min(1, dt / 500);
          a.y += (sy - a.y) * Math.min(1, dt / 500);
        }
        if (a.phase === 'leave') a.a = 1 - u;
        a.flash *= Math.pow(0.97, dt / 16);
      }
      for (let i = agents.length - 1; i >= 0; i--) if (agents[i].phase === 'leave' && agents[i].a <= 0) agents.splice(i, 1);
      // Groups drift gently and keep apart.
      for (const g of groups) {
        g.x += Math.sin(t * 0.0002 + g.y) * 0.02 * dt * 0.01 * S;
      }
    },
    draw(ctx, t) {
      ctx.globalCompositeOperation = 'lighter';
      for (const g of groups) {
        const r = (30 + 11 * Math.sqrt(g.members)) * S;
        halo(ctx, g.x, g.y, r, g.tint, 0.1 + 0.025 * g.members);
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const a of agents) {
        if (a.phase === 'weigh') {
          const u = clamp((t - a.t0) / a.dur);
          const best = a.util.indexOf(Math.max(...a.util));
          groups.forEach((g, i) => hair(ctx, a.x, a.y, g.x, g.y, i === best && u > 0.6 ? WARM : PALE, (0.08 + 0.45 * a.util[i]) * Math.sin(Math.PI * Math.min(1, u * 1.1))));
        }
      }
      for (const a of agents) {
        const c = a.g >= 0 && a.phase !== 'leave' ? mixc(PALE, groups[a.g].tint, a.phase === 'in' ? 0.75 : 0.3) : PALE;
        agent(ctx, a.x, a.y, 3 * S, a.flash > 0.05 ? mixc(c, WARM, a.flash) : c, 0.92 * a.a);
      }
    },
  };
});

// ------------------------------------------------------------------ Allocation A: sequential
// One item at a time: it arrives along the top (the next two wait, faint, at the edge), pauses above
// the four recipients while each is considered (a faint hairline to each, brighter where it is valued
// more), goes to one of them (one that values it, favouring whoever is furthest behind), and joins that
// recipient's bundle. Only then does the next item arrive.
// Bundles are compact mounds: a soft silhouette whose size encodes value continuously, filled with
// small, muted grains at roughly constant density (value is aggregated; one grain is not one unit).
// Hierarchy: the active item is the only bright warm object; bundles are quiet sand; recipients pale.
// Sizes are local to this scene (proportional to the card, with floors for small cards).
export const d2ShareA = scene((W, H, S, rand) => {
  const N = 4;
  const grain = Math.max(0.85, H * 0.0052);
  const heapW = W * 0.11;
  const MAXV = 10;
  const heapH = (V: number) => H * (0.03 + 0.016 * Math.min(V, MAXV));
  interface Rec { x: number; y: number; V: number; shown: number; glow: number; cand: { u: number; v: number; tone: number }[] }
  const R: Rec[] = Array.from({ length: N }, (_, i) => {
    // Candidate grain positions spread evenly through a unit dome (rejection sampling); the first
    // n are used, so density stays roughly constant as the mound (and n) grows.
    const cand: { u: number; v: number; tone: number }[] = [];
    while (cand.length < 90) {
      const u = rand() * 2 - 1;
      const v = rand();
      if (v <= 1 - u * u) cand.push({ u, v, tone: rand() });
    }
    const V = 3 + rand() * 3;
    return { x: W * (0.2 + 0.2 * i), y: H * 0.8, V, shown: V, glow: 0, cand };
  });
  interface Item { x: number; y: number; phase: 'arrive' | 'consider' | 'join'; t0: number; vals: number[]; to: number; fx: number; fy: number }
  let it: Item | null = null;
  let next = 500;
  const DEC = { x: W * 0.5, y: H * 0.24 };
  const lineW = Math.max(0.6, 0.8 * S);
  return {
    step(dt, t) {
      for (const r of R) {
        r.shown += (r.V - r.shown) * Math.min(1, dt / 450);
        r.glow *= Math.pow(0.95, dt / 16);
      }
      if (!it) {
        if (t < next) return;
        it = { x: -12, y: DEC.y, phase: 'arrive', t0: t, vals: Array.from({ length: N }, () => 0.2 + rand() * 0.8), to: -1, fx: 0, fy: 0 };
      }
      const u = (t - it.t0) / (it.phase === 'arrive' ? 1000 : it.phase === 'consider' ? 1300 : 850);
      if (it.phase === 'arrive') {
        it.x = mix(-12, DEC.x, ease(clamp(u)));
        if (u >= 1) {
          it.phase = 'consider';
          it.t0 = t;
        }
      } else if (it.phase === 'consider') {
        if (u >= 0.6 && it.to < 0) {
          const vmax = Math.max(...it.vals);
          let best = -1;
          for (let i = 0; i < N; i++) if (it.vals[i] >= vmax * 0.5 && (best < 0 || R[i].V < R[best].V)) best = i;
          it.to = best;
        }
        if (u >= 1) {
          it.phase = 'join';
          it.t0 = t;
          it.fx = it.x;
          it.fy = it.y;
        }
      } else {
        const r = R[it.to];
        it.x = mix(it.fx, r.x, ease(clamp(u)));
        it.y = mix(it.fy, r.y - heapH(r.V) * 0.85, ease(clamp(u)));
        if (u >= 1) {
          r.V += it.vals[it.to];
          r.glow = 1;
          // Keep bundles in frame: when all are large, every bundle settles by the same amount.
          if (Math.min(...R.map((x) => x.V)) > MAXV - 2) for (const x of R) x.V -= 3;
          it = null;
          next = t + 450;
        }
      }
    },
    draw(ctx, t) {
      // The next items wait at the edge: time is visible.
      for (let k = 1; k <= 2; k++) agent(ctx, W * 0.035 - (k - 1) * grain * 6, DEC.y, grain * 1.2, WARM, 0.16 / k);
      for (const r of R) {
        const h = heapH(r.shown);
        // A soft, faint glow around the bundle (no hard edge): the grains carry the shape.
        ctx.save();
        ctx.translate(r.x, r.y - h * 0.38);
        ctx.scale(1, Math.max(0.35, (h * 0.9) / heapW));
        halo(ctx, 0, 0, heapW * 0.62, [206, 172, 122], 0.1 + 0.1 * r.glow);
        ctx.restore();
        // Small grains at roughly constant density: more of them as the mound grows.
        const count = Math.min(r.cand.length, Math.round(12 + 6.5 * Math.min(r.shown, MAXV)));
        for (let k = 0; k < count; k++) {
          const c = r.cand[k];
          const x = r.x + c.u * heapW * 0.46;
          const y = r.y - c.v * h * 0.92;
          ctx.fillStyle = `rgba(${206 + 20 * c.tone | 0},${176 + 12 * c.tone | 0},${132 + 8 * c.tone | 0},${0.55 + 0.25 * c.tone})`;
          ctx.beginPath();
          ctx.arc(x, y, grain * (0.8 + 0.4 * c.tone), 0, Math.PI * 2);
          ctx.fill();
        }
        // The recipient: pale and cool, below its bundle.
        agent(ctx, r.x, r.y + grain * 5.5, Math.max(1.6, grain * 1.9), PALE, 0.8);
      }
      if (it) {
        if (it.phase === 'consider') {
          const u = clamp((t - it.t0) / 1300);
          for (let i = 0; i < N; i++) {
            const chosen = it.to === i;
            const a = (0.03 + 0.22 * it.vals[i]) * Math.sin(Math.PI * Math.min(1, u * 1.05)) * (it.to >= 0 && !chosen ? 0.3 : chosen ? 1.8 : 1);
            hair(ctx, it.x, it.y, R[i].x, R[i].y - heapH(R[i].shown) - grain * 3, chosen ? WARM : PALE, a, lineW);
          }
        }
        // The active item: the brightest, warmest thing in the scene.
        halo(ctx, it.x, it.y, grain * 16, WARM, 0.35);
        agent(ctx, it.x, it.y, grain * 2.4, WARM, 1);
      }
    },
  };
}, CARD_SCALE);

// ------------------------------------------------------------------ Allocation B: valuation field
// Recipients sit around the item's arrival point, each with a ring whose size is the value it holds.
// An item arrives at the centre and each recipient answers with a pulse whose strength is how much it
// values this item (different for each); the item leans towards the strongest, then is given to one
// that values it while favouring the smallest ring; that ring grows.
export const d2ShareB = scene((W, H, S, rand) => {
  const N = 5;
  const C = { x: W * 0.5, y: H * 0.52 };
  const RR = Math.min(W, H) * 0.34;
  const R = Array.from({ length: N }, (_, i) => {
    const a = -Math.PI / 2 + (i / N) * Math.PI * 2;
    return { x: C.x + Math.cos(a) * RR * 1.25, y: C.y + Math.sin(a) * RR, V: 1 + rand() * 1.5, shown: 0 };
  });
  interface Item { x: number; y: number; phase: 'arrive' | 'value' | 'go'; t0: number; vals: number[]; to: number; fx: number; fy: number }
  let it: Item | null = null;
  let next = 300;
  return {
    step(dt, t) {
      for (const r of R) r.shown += (r.V - r.shown) * Math.min(1, dt / 500);
      if (!it && t > next) it = { x: C.x, y: -10, phase: 'arrive', t0: t, vals: R.map(() => 0.15 + rand() * 0.85), to: -1, fx: 0, fy: 0 };
      if (!it) return;
      const u = (t - it.t0) / (it.phase === 'arrive' ? 900 : it.phase === 'value' ? 1400 : 800);
      if (it.phase === 'arrive') {
        it.y = mix(-10, C.y, ease(clamp(u)));
        if (u >= 1) {
          it.phase = 'value';
          it.t0 = t;
        }
      } else if (it.phase === 'value') {
        // Leans towards the recipients that value it most.
        let lx = 0;
        let ly = 0;
        R.forEach((r, i) => {
          lx += (r.x - C.x) * it!.vals[i] ** 3;
          ly += (r.y - C.y) * it!.vals[i] ** 3;
        });
        it.x = C.x + lx * 0.08 * Math.sin(Math.PI * clamp(u));
        it.y = C.y + ly * 0.08 * Math.sin(Math.PI * clamp(u));
        if (u >= 0.6 && it.to < 0) {
          const vmax = Math.max(...it.vals);
          let best = -1;
          for (let i = 0; i < N; i++) if (it.vals[i] >= vmax * 0.45 && (best < 0 || R[i].V < R[best].V)) best = i;
          it.to = best;
        }
        if (u >= 1) {
          it.phase = 'go';
          it.t0 = t;
          it.fx = it.x;
          it.fy = it.y;
        }
      } else {
        const r = R[it.to];
        it.x = mix(it.fx, r.x, ease(clamp(u)));
        it.y = mix(it.fy, r.y, ease(clamp(u)));
        if (u >= 1) {
          r.V += it.vals[it.to];
          if (Math.min(...R.map((x) => x.V)) > 5) for (const x of R) x.V -= 2.5; // keep rings in frame
          it = null;
          next = t + 700;
        }
      }
    },
    draw(ctx, t) {
      for (let i = 0; i < N; i++) {
        const r = R[i];
        const rad = (6 + 7 * Math.sqrt(r.shown)) * S;
        const pulse = it && it.phase === 'value' ? it.vals[i] * Math.sin(Math.PI * clamp((t - it.t0) / 1400)) : 0;
        const chosen = it && it.to === i;
        ctx.strokeStyle = rgba(chosen ? WARM : PALE, 0.35 + 0.3 * pulse);
        ctx.lineWidth = 1.1 * S;
        ctx.beginPath();
        ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
        ctx.stroke();
        halo(ctx, r.x, r.y, rad * 1.8, chosen ? WARM : PALE, 0.05 + 0.18 * pulse);
        agent(ctx, r.x, r.y, 2.4 * S, PALE, 0.85);
        if (pulse > 0.01 && it) {
          // The response: a pulse travelling from the recipient towards the item.
          const k = ((t - it.t0) / 700) % 1;
          const px = mix(r.x, it.x, k);
          const py = mix(r.y, it.y, k);
          halo(ctx, px, py, (3 + 8 * it.vals[i]) * S, PALE, 0.25 * pulse);
          hair(ctx, r.x, r.y, it.x, it.y, chosen ? WARM : PALE, 0.25 * pulse);
        }
      }
      if (it) agent(ctx, it.x, it.y, 3 * S, WARM, 0.95);
    },
  };
});

// ------------------------------------------------------------------ Learning A / B
// A population of agents, initially uncertain (dim, grey). Neighbours interact locally: a signal
// travels along a link, the receiver gets feedback (agree or not), and updates its belief (colour)
// and the link's weight (brighter or fainter; very weak links are cut, new ones form nearby).
// No agent sees the whole: structure emerges from local feedback. Variant B: the environment itself
// changes (a slow field in the background decides which behaviour pays); links learned earlier start
// to give bad feedback, weaken, and the structure re-forms.
function learning(changing: boolean) {
  return scene((W, H, S, rand) => {
    const n = makeNoise2(9);
    const N = 17;
    interface Ag { x: number; y: number; vx: number; vy: number; s: number; flash: number; neg: number }
    const ag: Ag[] = Array.from({ length: N }, () => ({ x: W * (0.1 + rand() * 0.8), y: H * (0.14 + rand() * 0.72), vx: 0, vy: 0, s: (rand() - 0.5) * 0.2, flash: 0, neg: 0 }));
    // A few informed agents know what pays where they are.
    for (let k = 0; k < 3; k++) ag[k].s = 0;
    const W2 = new Map<string, number>();
    const key = (i: number, j: number) => (i < j ? `${i}-${j}` : `${j}-${i}`);
    const dist = (i: number, j: number) => Math.hypot(ag[i].x - ag[j].x, ag[i].y - ag[j].y);
    const near = Math.min(W, H) * 0.38;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (dist(i, j) < near && rand() < 0.55) W2.set(key(i, j), 0.3);
    // What actually pays: a type per position; in variant B the dividing line moves over time.
    let shift = 0;
    const truth = (a: Ag, t: number) => {
      const edge = changing ? 0.5 + 0.28 * Math.sin(t * 0.00022 + 1) : 0.5;
      shift = edge;
      return a.x / W + 0.12 * n(a.y * 0.01, 3) < edge ? -1 : 1;
    };
    interface Sig { i: number; j: number; t0: number }
    const sigs: Sig[] = [];
    let next = 300;
    return {
      step(dt, t) {
        if (t > next) {
          next = t + 110;
          const keys = [...W2.keys()];
          if (keys.length) {
            const [i, j] = keys[Math.floor(rand() * keys.length)].split('-').map(Number);
            sigs.push(rand() < 0.5 ? { i, j, t0: t } : { i: j, j: i, t0: t });
          }
          // Occasionally a new tentative link forms with a nearby agent.
          if (rand() < 0.25) {
            const i = Math.floor(rand() * N);
            const j = Math.floor(rand() * N);
            if (i !== j && dist(i, j) < near && !W2.has(key(i, j))) W2.set(key(i, j), 0.15);
          }
        }
        for (let k = sigs.length - 1; k >= 0; k--) {
          const s = sigs[k];
          if (t - s.t0 < 600) continue;
          sigs.splice(k, 1);
          const a = ag[s.i];
          const b = ag[s.j];
          // Local feedback: did acting together pay off? (Same type → yes, with some noise.)
          const same = truth(a, t) === truth(b, t);
          const fb = (same ? 1 : -1) * (rand() < 0.9 ? 1 : -1);
          const kk = key(s.i, s.j);
          const w = (W2.get(kk) ?? 0) + 0.12 * fb;
          if (w < 0.04) W2.delete(kk);
          else W2.set(kk, Math.min(1, w));
          // The receiver updates its belief: towards the sender's if it paid, away if not; plus its own
          // (noisy) observation of what pays where it is.
          b.s = clamp(b.s + 0.22 * fb * a.s + 0.1 * truth(b, t), -1, 1);
          if (fb > 0) b.flash = 1;
          else b.neg = 1;
        }
        // Agents drift; strong links pull gently together, everyone keeps some distance.
        for (let i = 0; i < N; i++) {
          const a = ag[i];
          a.vx *= 0.96;
          a.vy *= 0.96;
          a.vx += n(i * 3.1, t * 0.0002) * 0.0015;
          a.vy += n(i * 5.7, t * 0.0002 + 9) * 0.0015;
          for (let j = 0; j < N; j++) {
            if (i === j) continue;
            const b = ag[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.hypot(dx, dy) + 1;
            const w = W2.get(key(i, j)) ?? 0;
            const f = w * 0.00005 * (d - 55 * S) - (d < 42 * S ? 0.0025 : 0);
            a.vx += (dx / d) * f;
            a.vy += (dy / d) * f;
          }
          a.x = clamp(a.x + a.vx * dt, W * 0.06, W * 0.94);
          a.y = clamp(a.y + a.vy * dt, H * 0.1, H * 0.9);
          a.flash *= Math.pow(0.95, dt / 16);
          a.neg *= Math.pow(0.95, dt / 16);
        }
      },
      draw(ctx, t) {
        if (changing) {
          // The environment: a faint field; which side pays shifts over time.
          const x = W * shift;
          const g = ctx.createLinearGradient(x - W * 0.25, 0, x + W * 0.25, 0);
          g.addColorStop(0, 'rgba(150,182,222,0.10)');
          g.addColorStop(0.5, 'rgba(0,0,0,0)');
          g.addColorStop(1, 'rgba(255,176,112,0.09)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
        }
        for (const [k, w] of W2) {
          const [i, j] = k.split('-').map(Number);
          hair(ctx, ag[i].x, ag[i].y, ag[j].x, ag[j].y, PALE, 0.08 + 0.5 * w, 0.6 + 1.2 * w);
        }
        for (const s of sigs) {
          const u = clamp((t - s.t0) / 600);
          const a = ag[s.i];
          const b = ag[s.j];
          agent(ctx, mix(a.x, b.x, ease(u)), mix(a.y, b.y, ease(u)), 1.3 * S, PALE, 0.8);
        }
        for (const a of ag) {
          const conf = Math.abs(a.s);
          const base = a.s < 0 ? TINTS[0] : WARM;
          let c = mixc([120, 124, 132], base, conf);
          if (a.neg > 0.05) c = mixc(c, [90, 80, 80], a.neg * 0.6);
          agent(ctx, a.x, a.y, (2.4 + 1 * conf) * S, a.flash > 0.05 ? mixc(c, [255, 255, 255], a.flash * 0.5) : c, 0.55 + 0.45 * conf);
        }
      },
    };
  });
}
export const d2AdaptA = learning(false);
export const d2AdaptB = learning(true);

// ------------------------------------------------------------------ Principled & safe AI
// One fixed, shared origin at the base (the frozen shared model) gives rise to two distinct roles:
// an attacker (left, warm-tinted) and a defender (right, cool). Round after round the attacker sends
// messages across: ordinary ones (pale) pass the defender's boundary and are answered; probes (warm)
// meet the boundary. Most are stopped there; where the boundary is weak, one gets through and the
// defender flickers; the boundary then strengthens at that point. The attacker aims its next probes
// at whatever is weakest now, and the boundary slowly relaxes, so the pressure never collapses.
export const d2Exchange = scene((W, H, S, rand) => {
  const base = { x: W * 0.5, y: H * 0.92 };
  const att = { x: W * 0.2, y: H * 0.45 };
  const def = { x: W * 0.8, y: H * 0.45 };
  const BX = W * 0.62;
  const BINS = 9;
  const strength = Array.from({ length: BINS }, () => 0.4 + rand() * 0.4);
  const yOf = (b: number) => H * (0.14 + (0.62 * (b + 0.5)) / BINS);
  interface Msg { y0: number; y1: number; bin: number; probe: boolean; t0: number; fate: 'pass' | 'block' | 'through' | ''; back: boolean }
  const msgs: Msg[] = [];
  let next = 400;
  let hit = 0;
  const marks = (x: number, y: number, c: RGB, a: number, len: number) => {
    // A message: a short sequence of bars (a string of tokens), no text.
    for (let k = 0; k < 4; k++) {
      ctx2!.fillStyle = rgba(c, a * (1 - k * 0.16));
      ctx2!.fillRect(x - k * 8 * S, y - 1.4 * S, len * S * (0.6 + 0.4 * ((k * 7) % 3) / 2), 2.8 * S);
    }
  };
  let ctx2: CanvasRenderingContext2D | null = null;
  return {
    step(dt, t) {
      for (let b = 0; b < BINS; b++) strength[b] = Math.max(0.15, strength[b] - dt * 0.00004); // slowly relaxes
      hit *= Math.pow(0.95, dt / 16);
      if (t > next) {
        next = t + 650 + rand() * 350;
        const probe = rand() < 0.6;
        // Probes aim at the weakest part of the boundary (with some exploration); messages anywhere.
        let bin = Math.floor(rand() * BINS);
        if (probe && rand() < 0.75) bin = strength.indexOf(Math.min(...strength));
        msgs.push({ y0: att.y + (rand() - 0.5) * 30 * S, y1: yOf(bin), bin, probe, t0: t, fate: '', back: false });
      }
      for (let k = msgs.length - 1; k >= 0; k--) {
        const m = msgs[k];
        const u = (t - m.t0) / 1400;
        if (!m.fate && u >= 0.62) {
          if (!m.probe) m.fate = 'pass';
          else if (rand() < strength[m.bin]) {
            m.fate = 'block';
            strength[m.bin] = Math.min(1, strength[m.bin] + 0.05);
          } else {
            m.fate = 'through';
            hit = 1;
            strength[m.bin] = Math.min(1, strength[m.bin] + 0.45); // the defender learns where it failed
          }
        }
        if (m.fate === 'pass' && u >= 1 && !m.back) {
          m.back = true;
          m.t0 = t;
        } else if ((m.fate === 'block' && u >= 0.85) || (m.fate === 'through' && u >= 1) || (m.back && u >= 1)) msgs.splice(k, 1);
      }
    },
    draw(ctx, t) {
      ctx2 = ctx;
      // The shared, fixed origin and the two roles it gives rise to.
      halo(ctx, base.x, base.y, 46 * S, PALE, 0.16);
      agent(ctx, base.x, base.y, 3.2 * S, PALE, 0.9);
      for (const [r, c] of [
        [att, mixc(PALE, WARM, 0.55)],
        [def, TINTS[0]],
      ] as [typeof att, RGB][]) {
        ctx.strokeStyle = rgba(PALE, 0.16);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.quadraticCurveTo(r.x, base.y - 10 * S, r.x, r.y + 30 * S);
        ctx.stroke();
        // Each role: a small formation of agents in its own tint. The attacker is a forward-pointing
        // wedge; the defender an arc facing it.
        for (let k = 0; k < 7; k++) {
          const f = k / 6 - 0.5;
          const wob = Math.sin(t * 0.002 + k) * 1.5 * S;
          const x = r === att ? r.x + (0.5 - Math.abs(f)) * 30 * S + wob : r.x - Math.cos(f * 2.2) * 16 * S + 8 * S;
          const y = r.y + f * (r === att ? 44 : 60) * S;
          agent(ctx, x, y, 2.4 * S, c, 0.85);
        }
        halo(ctx, r.x, r.y, 38 * S, c, r === def ? 0.1 + 0.25 * hit : 0.1);
      }
      if (hit > 0.05) halo(ctx, def.x, def.y, 30 * S, WARM, 0.3 * hit);
      // The defender's boundary: a column of short segments, brighter where it is stronger.
      for (let b = 0; b < BINS; b++) {
        const y = yOf(b);
        const s = strength[b];
        hair(ctx, BX + (1 - s) * 3 * S, y - 12 * S, BX + (1 - s) * 3 * S, y + 12 * S, TINTS[0], 0.12 + 0.55 * s, 0.8 + 1.8 * s);
      }
      for (const m of msgs) {
        const u = clamp((t - m.t0) / 1400);
        if (m.back) {
          // The answer to an ordinary message, travelling back.
          const x = mix(def.x - 20 * S, att.x + 24 * S, ease(u));
          const y = mix(m.y1, m.y0, ease(u));
          marks(x, y, TINTS[0], 0.75 * Math.sin(Math.PI * u), 5);
          continue;
        }
        const endX = m.fate === 'block' ? BX - 4 * S : def.x - 20 * S;
        const uu = m.fate === 'block' ? Math.min(u, 0.62) / 0.62 : u;
        const x = mix(att.x + 24 * S, endX, ease(m.fate === 'block' ? uu : u));
        const y = mix(m.y0, m.y1, ease(Math.min(1, u * 1.6)));
        const fade = m.fate === 'block' ? 1 - smooth(0.62, 0.85, u) : 1;
        marks(x, y, m.probe ? WARM : PALE, 0.85 * fade, 6);
        if (m.fate === 'block' && u > 0.62) halo(ctx, BX - 4 * S, y, 14 * S, WARM, 0.25 * (1 - smooth(0.62, 0.85, u)));
      }
    },
  };
});

// ------------------------------------------------------------------ Learning A1: coalitions learned
// Agents drift slowly. Proximity only creates the OPPORTUNITY to interact: now and then an agent
// sends a signal to a nearby agent. What happens next depends on feedback, not on distance: the
// interaction pays off or it does not (it depends on hidden compatibility the agents do not know).
// Positive feedback strengthens the link; negative feedback weakens it. Strong links draw agents
// gently together; links to agents who drift away fade and disappear; nearby strangers may try a
// tentative link. So coalitions are LEARNED: they emerge, separate, bridge and reconnect over time.
// Occasionally an agent's circumstances change (its hidden type shifts), and it gradually detaches
// and finds a new group.
/** Review-only: coalition sizes, for tuning the study headlessly. */
export const A1_DEBUG = { sizes: [] as number[] };
export const d2AdaptA1 = scene((W, H, S, rand) => {
  const n = makeNoise2(21);
  const N = 20;
  const T = 4;
  // How likely an interaction between two types pays off; types 0 and 1 are partly compatible, so
  // bridges between their groups form and break.
  const P = [
    [0.9, 0.28, 0.08, 0.08],
    [0.28, 0.9, 0.08, 0.08],
    [0.08, 0.08, 0.9, 0.08],
    [0.08, 0.08, 0.08, 0.9],
  ];
  // Memory of bad experiences outlives the link, so agents that did not get on keep some distance.
  const bad = new Map<string, number>();
  interface Ag { x: number; y: number; vx: number; vy: number; type: number; conf: number; pos: number; neg: number; comp: number }
  const ag: Ag[] = Array.from({ length: N }, (_, i) => ({ x: W * (0.1 + rand() * 0.8), y: H * (0.14 + rand() * 0.72), vx: 0, vy: 0, type: i % T, conf: 0, pos: 0, neg: 0, comp: -1 }));
  interface L { w: number; bad: number }
  const links = new Map<string, L>();
  const key = (i: number, j: number) => (i < j ? i * 100 + j : j * 100 + i).toString();
  const d = (i: number, j: number) => Math.hypot(ag[i].x - ag[j].x, ag[i].y - ag[j].y);
  const Rint = Math.min(W, H) * 0.42;
  const rest = Rint * 0.3;
  interface Sig { i: number; j: number; t0: number }
  const sigs: Sig[] = [];
  let next = 400;
  let nextShift = 9000;
  const compTint: RGB[] = [TINTS[0], TINTS[1], TINTS[2], TINTS[3]];
  let comps: { members: number[]; type: number }[] = [];
  const components = () => {
    const parent = ag.map((_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    // A coalition is held together by well-established links; a single newer bridge does not merge two.
    for (const [k, l] of links) if (l.w > 0.6) {
      const a = Math.floor(Number(k) / 100);
      const b = Number(k) % 100;
      parent[find(a)] = find(b);
    }
    const groups = new Map<number, number[]>();
    ag.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
    comps = [...groups.values()].filter((m) => m.length >= 2).map((m) => {
      const counts = [0, 0, 0, 0];
      for (const i of m) counts[ag[i].type]++;
      return { members: m, type: counts.indexOf(Math.max(...counts)) };
    });
    ag.forEach((a) => (a.comp = -1));
    comps.forEach((c, ci) => c.members.forEach((i) => (ag[i].comp = ci)));
    A1_DEBUG.sizes = comps.map((c) => c.members.length).sort((x, y) => y - x);
  };
  const inner = {
    step(dt: number, t: number) {
      // Interaction opportunities: an agent and a neighbour within reach (a few at a time, calmly).
      if (t > next && sigs.length < 6) {
        next = t + 55 + rand() * 40;
        const i = Math.floor(rand() * N);
        const near = ag.map((_, j) => j).filter((j) => j !== i && d(i, j) < Rint);
        if (near.length) {
          // Mostly existing links; sometimes a tentative try with a stranger.
          const linked = near.filter((j) => links.has(key(i, j)));
          const j = linked.length && rand() < 0.7 ? linked[Math.floor(rand() * linked.length)] : near[Math.floor(rand() * near.length)];
          sigs.push({ i, j, t0: t });
        }
      }
      for (let k = sigs.length - 1; k >= 0; k--) {
        const s = sigs[k];
        if (t - s.t0 < 500) continue;
        sigs.splice(k, 1);
        const good = rand() < P[ag[s.i].type][ag[s.j].type];
        const kk = key(s.i, s.j);
        const l = links.get(kk) ?? { w: 0.08, bad: 0 };
        l.w = clamp(l.w + (good ? 0.28 : -0.2));
        if (!good) {
          l.bad = 1;
          bad.set(kk, Math.min(1, (bad.get(kk) ?? 0) + 0.5));
        }
        if (l.w < 0.04) links.delete(kk);
        else links.set(kk, l);
        const b = ag[s.j];
        b.conf = Math.min(1, b.conf + 0.05);
        if (good) b.pos = 1;
        else b.neg = 1;
      }
      if (t > nextShift) {
        nextShift = t + 8000 + rand() * 4000;
        const a = ag[Math.floor(rand() * N)];
        a.type = (a.type + 1 + Math.floor(rand() * (T - 1))) % T;
      }
      for (const [k, v] of bad) {
        const nv = v - dt * 0.00005;
        if (nv <= 0) bad.delete(k);
        else bad.set(k, nv);
      }
      // Links: slow forgetting; links to agents who drift out of reach fade quickly.
      for (const [k, l] of links) {
        const i = Math.floor(Number(k) / 100);
        const j = Number(k) % 100;
        l.w -= dt * 0.000006;
        if (d(i, j) > Rint * 1.5) l.w -= dt * 0.0004;
        l.bad *= Math.pow(0.97, dt / 16);
        if (l.w < 0.03) links.delete(k);
      }
      // Movement: slow wander; strong links attract gently; bad experiences push slightly apart;
      // everyone keeps a little personal space; soft edges.
      // Agents without strong relationships explore more widely; well-connected ones settle.
      const deg = ag.map(() => 0);
      for (const [k, l] of links) if (l.w > 0.36) {
        deg[Math.floor(Number(k) / 100)]++;
        deg[Number(k) % 100]++;
      }
      for (let i = 0; i < N; i++) {
        const a = ag[i];
        const roam = 1 + 3 * (1 - Math.min(1, deg[i] / 2));
        a.vx = a.vx * 0.94 + n(i * 3.1, t * 0.00012) * 0.0012 * S * roam;
        a.vy = a.vy * 0.94 + n(i * 5.3 + 9, t * 0.00012) * 0.0012 * S * roam;
        for (let j = 0; j < N; j++) {
          if (j === i) continue;
          const b = ag[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dd = Math.hypot(dx, dy) + 1;
          const l = links.get(key(i, j));
          let f = 0;
          if (l) f += l.w * 0.0002 * (dd - rest) - l.bad * 0.0005;
          if (dd < rest * 0.8) f -= 0.0015 * (1 - dd / (rest * 0.8));
          const bm = bad.get(key(i, j));
          if (bm && dd < Rint) f -= 0.0003 * bm;
          a.vx += (dx / dd) * f;
          a.vy += (dy / dd) * f;
        }
        const m = Math.min(W, H) * 0.08;
        if (a.x < m) a.vx += 0.002;
        if (a.x > W - m) a.vx -= 0.002;
        if (a.y < m) a.vy += 0.002;
        if (a.y > H - m) a.vy -= 0.002;
        a.x += a.vx * dt;
        a.y += a.vy * dt;
        a.pos *= Math.pow(0.95, dt / 16);
        a.neg *= Math.pow(0.95, dt / 16);
      }
      components();
    },
    draw(ctx: CanvasRenderingContext2D, t: number) {
      // Learned coalitions: a very soft shared halo and a common muted tint (no outlines).
      ctx.globalCompositeOperation = 'lighter';
      for (const c of comps) {
        if (c.members.length < 3) continue;
        const cx = c.members.reduce((s, i) => s + ag[i].x, 0) / c.members.length;
        const cy = c.members.reduce((s, i) => s + ag[i].y, 0) / c.members.length;
        const r = Math.max(...c.members.map((i) => Math.hypot(ag[i].x - cx, ag[i].y - cy))) + 16 * S;
        halo(ctx, cx, cy, r * 1.3, compTint[c.type], 0.09);
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const [k, l] of links) {
        const i = Math.floor(Number(k) / 100);
        const j = Number(k) % 100;
        const strong = l.w > 0.36;
        hair(ctx, ag[i].x, ag[i].y, ag[j].x, ag[j].y, PALE, strong ? 0.12 + 0.5 * l.w : 0.04 + 0.12 * l.w, strong ? (0.6 + 1.1 * l.w) * S : 0.6 * S);
      }
      for (const s of sigs) {
        const u = clamp((t - s.t0) / 500);
        const a = ag[s.i];
        const b = ag[s.j];
        agent(ctx, mix(a.x, b.x, ease(u)), mix(a.y, b.y, ease(u)), 1.3 * S, PALE, 0.85);
      }
      for (const a of ag) {
        const tint = a.comp >= 0 ? compTint[comps[a.comp].type] : PALE;
        const c = mixc([150, 156, 168], tint, a.comp >= 0 ? 0.35 + 0.6 * a.conf : 0.2 * a.conf);
        agent(ctx, a.x, a.y, 2.6 * S, c, 0.6 + 0.35 * a.conf);
        // Feedback: a brief ring (warm = it paid off, cool and dim = it did not).
        if (a.pos > 0.05) {
          ctx.strokeStyle = rgba(WARM, 0.6 * a.pos);
          ctx.lineWidth = 0.9 * S;
          ctx.beginPath();
          ctx.arc(a.x, a.y, (4 + 6 * (1 - a.pos)) * S, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (a.neg > 0.05) {
          ctx.strokeStyle = rgba([120, 140, 170], 0.5 * a.neg);
          ctx.lineWidth = 0.9 * S;
          ctx.beginPath();
          ctx.arc(a.x, a.y, (4 + 3 * (1 - a.neg)) * S, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    },
  };
  // Open in a representative state: some structure already learned, learning still under way.
  const PRE = 12000;
  for (let t = 16; t <= PRE; t += 16) inner.step(16, t);
  return { step: (dt: number, t: number) => inner.step(dt, t + PRE), draw: (ctx: CanvasRenderingContext2D, t: number) => inner.draw(ctx, t + PRE) };
}, CARD_SCALE);

// ------------------------------------------------------------------ Exchange: shared pieces
// A policy: a compact formation of nodes with a faint internal structure; its nodes light up as it
// composes, receives or processes. A message: a short, structured pattern of tokens (like a tiny
// waveform) that glides along a gentle curve; adversarial content carries a warm signature.
interface Policy { x: number; y: number; nodes: { dx: number; dy: number; act: number }[]; tint: RGB }
function policy(x: number, y: number, S: number, tint: RGB, rand: () => number, flip: number): Policy {
  const nodes = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2 + rand() * 0.4;
    const r = (i % 3 === 0 ? 9 : 19 + rand() * 6) * S;
    return { dx: Math.cos(a) * r * 0.8 * flip, dy: Math.sin(a) * r * 1.15, act: 0 };
  });
  return { x, y, nodes, tint };
}
function drawPolicy(ctx: CanvasRenderingContext2D, p: Policy, S: number, warmth = 0) {
  halo(ctx, p.x, p.y, 44 * S, p.tint, 0.08 + 0.1 * Math.max(...p.nodes.map((n) => n.act)));
  for (let i = 0; i < p.nodes.length; i++)
    for (let j = i + 1; j < p.nodes.length; j++) {
      const a = p.nodes[i];
      const b = p.nodes[j];
      if (Math.hypot(a.dx - b.dx, a.dy - b.dy) < 21 * S) hair(ctx, p.x + a.dx, p.y + a.dy, p.x + b.dx, p.y + b.dy, p.tint, 0.14 + 0.3 * Math.max(a.act, b.act), 0.7 * S);
    }
  for (const nd of p.nodes) agent(ctx, p.x + nd.dx, p.y + nd.dy, 2.1 * S, mixc(p.tint, nd.act > 0.3 && warmth > 0 ? WARM : [255, 255, 255], nd.act * 0.6), 0.55 + 0.45 * nd.act);
}
function decay(p: Policy, dt: number) {
  for (const nd of p.nodes) nd.act *= Math.pow(0.96, dt / 16);
}
/** Tokens: values 0..1 (heights); warm flags mark adversarial content. Drawn along a curve. */
function drawPacket(ctx: CanvasRenderingContext2D, S: number, pts: [number, number][], vals: number[], warm: boolean[], a: number) {
  pts.forEach(([x, y], k) => {
    const h = (5 + 11 * vals[k]) * S;
    ctx.fillStyle = rgba(warm[k] ? WARM : PALE, a * (1 - k * 0.08));
    ctx.fillRect(x - 1.5 * S, y - h / 2, 3 * S, h);
  });
}
const qpt = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, u: number): [number, number] => {
  const v = 1 - u;
  return [v * v * x0 + 2 * v * u * cx + u * u * x1, v * v * y0 + 2 * v * u * cy + u * u * y1];
};

// ------------------------------------------------------------------ Exchange A: bipolicy dialogue
// Rounds of self-play between two distinct policies. The attacker composes a message (its nodes
// light in sequence) and sends it; the defender receives it (activation spreads through it) and
// composes a response that returns. Ordinary messages get a coherent answer (the pattern echoed).
// Probes carry a warm signature; the defender usually answers safely (a flat, even, cool pattern:
// declining or redirecting) and sometimes fails (warm content comes back). After a safe answer the
// attacker changes its next probe; after a failure it refines that pattern, and the defender
// becomes more robust to it. Both keep adapting.
export const d2ExchangeA = scene((W, H, S, rand) => {
  const A = policy(W * 0.28, H * 0.5, S, mixc(PALE, WARM, 0.45), rand, 1);
  const D = policy(W * 0.72, H * 0.5, S, TINTS[0], rand, -1);
  let probe = Array.from({ length: 5 }, () => rand());
  let robust = 0.55;
  interface Round { t0: number; adv: boolean; vals: number[]; warm: boolean[]; fail: boolean; resp: number[]; respWarm: boolean[] }
  let r: Round | null = null;
  let next = 300;
  const T1 = 500;
  const T2 = T1 + 1300;
  const T3 = T2 + 700;
  const T4 = T3 + 1300;
  return {
    step(dt, t) {
      decay(A, dt);
      decay(D, dt);
      if (!r && t > next) {
        const adv = rand() < 0.55;
        const vals = adv ? probe.slice() : Array.from({ length: 5 }, () => 0.3 + rand() * 0.5);
        const warm = vals.map((_, k) => adv && (k === 1 || k === 3 || vals[k] > 0.7));
        const fail = adv && rand() > robust;
        const resp = !adv ? vals.map((v) => v * 0.9) : fail ? vals.slice() : vals.map(() => 0.25);
        r = { t0: t, adv, vals, warm, fail, resp, respWarm: resp.map((_, k) => fail && warm[k]) };
      }
      if (!r) return;
      const u = t - r.t0;
      if (u < T1) A.nodes[Math.floor((u / T1) * 9)].act = 1; // composing
      if (u > T2 && u < T3) D.nodes[Math.floor(((u - T2) / (T3 - T2)) * 9) % 9].act = 1; // processing
      if (u > T4) {
        // Both adapt.
        if (r.adv) {
          if (r.fail) {
            probe = probe.map((v) => clamp(v + (rand() - 0.5) * 0.1)); // refine what worked
            robust = Math.min(0.9, robust + 0.15);
          } else {
            const k = Math.floor(rand() * 5);
            probe[k] = rand(); // try something else
            robust = Math.max(0.35, robust - 0.02); // pressure: the defender is never finished
          }
        }
        r = null;
        next = t + 350;
      }
    },
    draw(ctx, t) {
      drawPolicy(ctx, A, S, 1);
      drawPolicy(ctx, D, S, r?.fail ? 1 : 0);
      if (!r) return;
      const u = t - r.t0;
      const path = (from: Policy, to: Policy, up: number, k: number) => {
        const s = clamp(k);
        const pts: [number, number][] = [];
        for (let i = 0; i < 5; i++) pts.push(qpt(from.x + 26 * S * Math.sign(to.x - from.x), from.y, (from.x + to.x) / 2, from.y + up * H * 0.3, to.x - 26 * S * Math.sign(to.x - from.x), to.y, clamp(ease(s) - i * 0.05)));
        return pts;
      };
      if (u > T1 && u < T2) drawPacket(ctx, S, path(A, D, -1, (u - T1) / (T2 - T1)), r.vals, r.warm, 0.85);
      if (u > T3 && u < T4) drawPacket(ctx, S, path(D, A, 1, (u - T3) / (T4 - T3)), r.resp, r.respWarm, 0.85);
      if (r.fail && u > T3) halo(ctx, D.x, D.y, 30 * S, WARM, 0.2 * (1 - clamp((u - T3) / 1500)));
    },
  };
}, CARD_SCALE);

// ------------------------------------------------------------------ Exchange B: adversarial transformation
// Defence as processing. Messages from the attacker enter the defender (a soft field) and are
// transformed as they pass through it: ordinary content comes out coherent; adversarial content
// makes the field activate strongly where it passes and is neutralised (flattened, cooled) on the
// way through. Occasionally a warm token survives to the output; the field then becomes more
// sensitive along that band, so similar probes are neutralised earlier next time. The attacker
// shifts where and how it probes.
export const d2ExchangeB = scene((W, H, S, rand) => {
  const A = policy(W * 0.14, H * 0.5, S, mixc(PALE, WARM, 0.45), rand, 1);
  const F = { x0: W * 0.4, x1: W * 0.72, y0: H * 0.2, y1: H * 0.8 };
  const BANDS = 6;
  const sens = Array.from({ length: BANDS }, () => 0.45 + rand() * 0.3);
  const heat = Array.from({ length: BANDS }, () => 0);
  interface Pk { t0: number; band: number; adv: boolean; vals: number[]; warm: boolean[]; survive: boolean }
  const pk: Pk[] = [];
  let next = 300;
  const bandY = (b: number) => mix(F.y0, F.y1, (b + 0.5) / BANDS);
  return {
    step(dt, t) {
      decay(A, dt);
      for (let b = 0; b < BANDS; b++) {
        heat[b] *= Math.pow(0.95, dt / 16);
        sens[b] = Math.max(0.3, sens[b] - dt * 0.00002);
      }
      if (t > next && pk.length < 2) {
        next = t + 1500 + rand() * 500;
        const adv = rand() < 0.6;
        // Probes go where the field is least sensitive (with some exploration).
        let band = Math.floor(rand() * BANDS);
        if (adv && rand() < 0.7) band = sens.indexOf(Math.min(...sens));
        const vals = Array.from({ length: 5 }, () => 0.3 + rand() * 0.7);
        pk.push({ t0: t, band, adv, vals, warm: vals.map((v) => adv && v > 0.5), survive: adv && rand() > sens[band] + 0.25 });
        A.nodes.forEach((n) => (n.act = Math.max(n.act, 0.6)));
      }
      for (let k = pk.length - 1; k >= 0; k--) {
        const p = pk[k];
        const u = (t - p.t0) / 3200;
        const inField = u > 0.33 && u < 0.72;
        if (inField && p.adv) heat[p.band] = Math.max(heat[p.band], 0.8);
        if (u > 0.72 && p.survive && sens[p.band] < 0.9) sens[p.band] = Math.min(1, sens[p.band] + 0.4);
        if (u >= 1) pk.splice(k, 1);
      }
    },
    draw(ctx, t) {
      drawPolicy(ctx, A, S, 1);
      // The defender: a soft field, lit along each band by its current activation and sensitivity.
      const fx = (F.x0 + F.x1) / 2;
      const fy = (F.y0 + F.y1) / 2;
      halo(ctx, fx, fy, (F.x1 - F.x0) * 0.8, TINTS[0], 0.1);
      // Soft, overlapping glows (no stripes or edges): brighter where sensitive or activated.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let b = 0; b < BANDS; b++) {
        const y = bandY(b);
        const c = mixc(TINTS[0], WARM, heat[b]);
        ctx.save();
        ctx.translate(fx, y);
        ctx.scale(1, 0.32);
        halo(ctx, 0, 0, (F.x1 - F.x0) * 0.55, c, 0.03 + 0.06 * sens[b] + 0.3 * heat[b]);
        ctx.restore();
      }
      ctx.restore();
      for (const p of pk) {
        const u = clamp((t - p.t0) / 3200);
        const y = mix(A.y, bandY(p.band), ease(clamp(u / 0.33)));
        // Transformation through the field: 0 before, 1 after.
        const tr = smooth(0.33, 0.72, u);
        const pts: [number, number][] = [];
        for (let i = 0; i < 5; i++) pts.push([mix(A.x + 30 * S, W * 0.94, u) - i * 7 * S, y]);
        const vals = p.vals.map((v) => (p.adv && !p.survive ? mix(v, 0.22, tr) : v));
        const warm = p.warm.map((w, k) => w && (p.survive ? k < 2 || tr < 0.5 : tr < 0.55));
        drawPacket(ctx, S, pts, vals, warm, 0.85 * (1 - smooth(0.9, 1, u)));
      }
    },
  };
}, CARD_SCALE);

// ------------------------------------------------------------------ Exchange C: strategy space
// Each policy has its own small strategy space: a soft field with its current strategy marked and
// the last few rounds' strategies trailing behind it. Each round draws one interaction between the
// two current strategies. If the defender's strategy covers the attacker's, the round is defended
// (cool); if not, it is a success for the attacker (warm). Then both update: the defender moves
// towards what it just faced; the attacker moves away to try something new. Rounds are discrete
// steps, not rotation: the trails show strategies evolving through self-play.
export const d2ExchangeC = scene((W, H, S, rand) => {
  const R = Math.min(W * 0.18, H * 0.3);
  const P = { a: { x: W * 0.27, y: H * 0.5 }, d: { x: W * 0.73, y: H * 0.5 } };
  let a = { x: rand() * 1.2 - 0.6, y: rand() * 1.2 - 0.6 };
  let dd = { x: rand() * 1.2 - 0.6, y: rand() * 1.2 - 0.6 };
  let aFrom = { ...a };
  let dFrom = { ...dd };
  const ta: { x: number; y: number }[] = [];
  const td: { x: number; y: number }[] = [];
  let r: { t0: number; hit: boolean } | null = null;
  let next = 300;
  const toA = (p: { x: number; y: number }) => [P.a.x + p.x * R, P.a.y + p.y * R] as [number, number];
  const toD = (p: { x: number; y: number }) => [P.d.x + p.x * R, P.d.y + p.y * R] as [number, number];
  return {
    step(_dt, t) {
      if (!r && t > next) r = { t0: t, hit: Math.hypot(a.x - dd.x, a.y - dd.y) > 0.55 };
      if (!r) return;
      const u = t - r.t0;
      if (u > 1400 && u - _dt <= 1400) {
        ta.push({ ...a });
        td.push({ ...dd });
        if (ta.length > 7) ta.shift();
        if (td.length > 7) td.shift();
        aFrom = { ...a };
        dFrom = { ...dd };
        // Defender: towards what it just faced (more if it was beaten). Attacker: away, somewhere new.
        const k = r.hit ? 0.7 : 0.35;
        dd = { x: mix(dd.x, a.x, k), y: mix(dd.y, a.y, k) };
        const ang = Math.atan2(a.y - dd.y, a.x - dd.x) + (rand() - 0.5) * 2.4;
        const step = 0.35 + rand() * 0.45;
        a = { x: clamp(a.x + Math.cos(ang) * step, -0.85, 0.85), y: clamp(a.y + Math.sin(ang) * step, -0.85, 0.85) };
      }
      if (u > 2300) {
        r = null;
        next = t + 250;
      }
    },
    draw(ctx, t) {
      const u = r ? t - r.t0 : 1e9;
      const m = clamp((u - 1400) / 800);
      const ca = r && u > 1400 ? { x: mix(aFrom.x, a.x, ease(m)), y: mix(aFrom.y, a.y, ease(m)) } : a;
      const cd = r && u > 1400 ? { x: mix(dFrom.x, dd.x, ease(m)), y: mix(dFrom.y, dd.y, ease(m)) } : dd;
      for (const [c, tint] of [
        [P.a, mixc(PALE, WARM, 0.45)],
        [P.d, TINTS[0]],
      ] as [{ x: number; y: number }, RGB][]) halo(ctx, c.x, c.y, R * 1.45, tint, 0.09);
      // Trails of past strategies (discrete rounds).
      const trail = (pts: { x: number; y: number }[], to: (p: { x: number; y: number }) => [number, number], tint: RGB, cur: { x: number; y: number }) => {
        const all = [...pts, cur];
        for (let i = 1; i < all.length; i++) {
          const [x0, y0] = to(all[i - 1]);
          const [x1, y1] = to(all[i]);
          hair(ctx, x0, y0, x1, y1, tint, 0.08 + 0.3 * (i / all.length), 0.7 * S);
        }
        pts.forEach((p, i) => agent(ctx, ...to(p), 2 * S, tint, 0.2 + 0.45 * (i / pts.length)));
        agent(ctx, ...to(cur), 4 * S, tint, 0.95);
      };
      trail(ta, toA, mixc(PALE, WARM, 0.55), ca);
      trail(td, toD, TINTS[0], cd);
      if (r) {
        // The round: one interaction between the two current strategies.
        const [x0, y0] = toA(ca);
        const [x1, y1] = toD(cd);
        const g = clamp(u / 900);
        const [px, py] = qpt(x0, y0, (x0 + x1) / 2, Math.min(y0, y1) - H * 0.12, x1, y1, ease(g));
        const fade = 1 - clamp((u - 1400) / 700);
        ctx.strokeStyle = rgba(PALE, 0.3 * fade);
        ctx.lineWidth = 0.8 * S;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - H * 0.12, px, py);
        ctx.stroke();
        if (u > 900 && u < 1900) halo(ctx, x1, y1, 16 * S, r.hit ? WARM : TINTS[0], 0.45 * (1 - clamp((u - 900) / 1000)));
      }
    },
  };
}, CARD_SCALE);

export const D2 = [
  {
    key: 'gather',
    title: 'Gather',
    make: d2Gather,
    reading: 'Individual agents arrive, weigh the existing groups and join one (or start a new one); now and then a member moves to a group it prefers.',
    research: 'Online coalition formation (agents arrive one by one, utilities revealed on arrival); decentralised learning of stable coalition structures by selfish agents.',
    literal: 'Agents, groups, arrival over time, joining, switching groups.',
    metaphor: 'Closeness = membership; hairline brightness = how much the agent values that group; a shared halo = a coalition.',
  },
  {
    key: 'share-a',
    title: 'Share A · sequential allocation',
    make: d2ShareA,
    reading: 'One item at a time arrives, pauses while the four recipients are considered, and goes to one of them; that recipient’s heap grows; only then does the next item come. Heaps stay roughly level.',
    research: 'Online fair division: indivisible goods arrive one at a time and are allocated immediately and irrevocably; fairness is judged on the evolving bundles.',
    literal: 'Items, recipients, one-at-a-time assignment, bundles.',
    metaphor: 'Heap size = bundle value; hairline brightness = the recipient’s value for this item; the rule shown (valued, and furthest behind) is illustrative, not an algorithm from the papers.',
  },
  {
    key: 'share-b',
    title: 'Share B · valuation field',
    make: d2ShareB,
    reading: 'An item arrives among several recipients; each responds with a different strength; it goes to one of them and that recipient’s ring grows.',
    research: 'Heterogeneous valuations in online fair division: the same good is worth different amounts to different agents.',
    literal: 'An item, recipients, their differing responses, the assignment.',
    metaphor: 'Pulse strength = the recipient’s value for the item; ring size = bundle value; the item’s lean = where it is valued most.',
  },
  {
    key: 'adapt-a',
    title: 'Adapt A0 · decentralised feedback (previous)',
    make: d2AdaptA,
    reading: 'Uncertain agents interact with neighbours; after each interaction they get feedback and change: their colour firms up, links brighten or fade and are cut; groups emerge.',
    research: 'Decentralised online learning by selfish agents who learn from their own repeated feedback, without global coordination; learning coalition structures.',
    literal: 'Agents, local interactions, feedback, changing relationships; no central controller.',
    metaphor: 'Colour = belief about which behaviour pays; link weight = learned value of that interaction.',
  },
  {
    key: 'adapt-b',
    title: 'Adapt B · learning under changing conditions',
    make: d2AdaptB,
    reading: 'The same local learning, but the environment shifts: links that used to pay start to fail, weaken, and the structure re-forms.',
    research: 'As A, plus dynamic settings (e.g. consensus and consensus-prevention in static and dynamic swarms).',
    literal: 'As A, plus a changing environment.',
    metaphor: 'The faint moving field = which behaviour pays where.',
  },
  {
    key: 'exchange',
    title: 'Exchange 0 · wall version',
    make: d2Exchange,
    reading: 'Two roles from one shared origin interact: ordinary messages pass and are answered; probes are mostly stopped at a boundary; when one gets through, the boundary strengthens there, and the next probes aim at the new weak spot.',
    research: 'Self-play red teaming (The Attacker in the Mirror): attacker and defender roles on a frozen shared base with separate role policies, which keeps adversarial pressure without collapsing into an “always refuse” defender.',
    literal: 'Two roles, rounds of interaction, blocking, answering, adaptation.',
    metaphor: 'The fixed base glow = the frozen shared model; the two branches = role-specific policies; boundary brightness = robustness at that point.',
  },
  {
    key: 'adapt-a1',
    title: 'Adapt A1 · coalitions learned through feedback',
    make: d2AdaptA1,
    reading: 'Agents drift; nearby agents exchange signals; each interaction brings feedback (a warm ring if it paid off, a dim cool ring if not); links strengthen or weaken accordingly; groups of well-linked agents form, drift apart, bridge and reconnect.',
    research: 'Decentralised online learning of coalition structures by selfish agents: preferences are unknown at first and learned from repeated interaction feedback, without global coordination.',
    literal: 'Agents, local interactions, feedback after each one, relationships that strengthen or fade, groups that emerge and change.',
    metaphor: 'Proximity = the opportunity to interact (not a preference); link strength = what the agents have learned from feedback; tint and soft halo = a learned coalition; hidden compatibility decides the feedback.',
    why: 'A0 was one dense network (a “hairball”). A1 adds movement and proximity, prunes distant and weak links, lets strong links draw agents together, and makes 3–4 learned groups visible. Its story is interaction → feedback → learning → structural change, unlike Gather’s arrival → preference → choice.',
  },
  {
    key: 'exchange-a',
    title: 'Exchange A · bipolicy dialogue',
    make: d2ExchangeA,
    reading: 'Two distinct systems take turns: one composes a message, the other takes it in and answers. Ordinary messages get a coherent answer; probes with a warm signature usually get a flat, safe answer and sometimes a warm one. Both change after each round.',
    research: 'Self-play red teaming (The Attacker in the Mirror): attacker and defender roles in repeated rounds; distinct role policies keep adversarial pressure; the defender should not simply refuse everything.',
    literal: 'Two policies, rounds, messages and answers, safe versus unsafe answers, adaptation.',
    metaphor: 'Token pattern = the content of a prompt or answer; warm tokens = adversarial content; the defender’s activation = its processing; the frozen shared base is not drawn.',
    why: 'Removed the wall, the projectile motion and the base dot with its lines. The defender now answers every message; defence is what it answers, not a barrier in front of it.',
  },
  {
    key: 'exchange-b',
    title: 'Exchange B · adversarial transformation',
    make: d2ExchangeB,
    reading: 'Messages pass through the defender and come out transformed: ordinary ones stay coherent, adversarial ones light the defender up and come out flattened and cool. When one survives, that part of the defender becomes more sensitive, and the attacker moves on.',
    research: 'The defender as an active policy that processes and responds to adversarial inputs; adversarial pressure that keeps the defender improving.',
    literal: 'A sender, a processing defender, inputs, transformed outputs, occasional failures, adaptation.',
    metaphor: 'The soft field = the defender’s policy; band brightness = its current sensitivity; flattening and cooling = a safe transformation of the response.',
    why: 'Removed the wall and the base dot. Messages are processed, not stopped: defence is transformation.',
  },
  {
    key: 'exchange-c',
    title: 'Exchange C · strategy-space self-play',
    make: d2ExchangeC,
    reading: 'Each side has a small space of strategies with its recent moves trailing behind. Each round links the two current strategies; the defender then moves towards what it faced and the attacker moves on. The trails show both strategies evolving round by round.',
    research: 'Self-play as iterated best responses between attacker and defender roles, which should keep adversarial pressure rather than collapse.',
    literal: 'Two roles, discrete rounds, outcomes, updates.',
    metaphor: 'A position in each soft field = a strategy; the round’s arc = one interaction; warm or cool = attack succeeded or was defended.',
    why: 'No messages at all: this shows the self-play dynamics directly. No wall, base dot or projectiles; moves are discrete steps, not rotation (so no vortices).',
  },
];
