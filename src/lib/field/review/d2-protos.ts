// D2 studies (design review only): research-specific mechanisms in the site's shared art direction.
// See docs/design/research-scene-briefs.md. Each scene keeps its own primitives (agents and groups;
// items and bundles; agents, signals and links; roles, messages and a boundary); consistency comes
// from the shared kit below: stage, pale marks, one warm accent, soft halos, hairlines, eased motion.
import { mulberry32 } from '../core';
import { makeNoise2, smooth, clamp, mix } from '../elements/kit';
import type { Proto, ProtoFactory } from './common';

// ------------------------------------------------------------------ shared kit
type RGB = [number, number, number];
const PALE: RGB = [210, 220, 236];
const WARM: RGB = [255, 176, 112];
const TINTS: RGB[] = [
  [150, 182, 222], // mist blue
  [222, 196, 156], // sand
  [168, 204, 188], // sage
  [196, 178, 216], // dusk
];
const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a)})`;
const mixc = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const ease = (t: number) => smooth(0, 1, t);

function stage(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const g = ctx.createRadialGradient(W * 0.6, H * 0.4, 0, W * 0.6, H * 0.4, Math.max(W, H) * 0.7);
  g.addColorStop(0, 'rgba(80,100,170,0.10)');
  g.addColorStop(1, 'rgba(80,100,170,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
function halo(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: RGB, a: number) {
  if (a <= 0.005 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(c, a));
  g.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function agent(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: RGB, a: number) {
  halo(ctx, x, y, r * 4, c, a * 0.28);
  ctx.fillStyle = rgba(c, a);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function hair(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, c: RGB, a: number, w = 0.8) {
  if (a <= 0.005) return;
  ctx.strokeStyle = rgba(c, a);
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
/** Wrap a scene: fade up over ~1 s; settle() jumps ahead. */
function scene(init: (W: number, H: number, S: number, rand: () => number) => { step(dt: number, t: number): void; draw(ctx: CanvasRenderingContext2D, t: number): void }): ProtoFactory {
  return (W, H, seed = 7) => {
    const S = Math.min(W, H) / 330;
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
// Items arrive one at a time along the top (the next ones wait, faint, at the edge). Each pauses above
// the recipients; hairlines drop to each recipient, brighter where it is valued more; it then goes to
// one recipient: one that values it, favouring whoever is furthest behind. It falls onto that
// recipient's heap. Heaps grow unevenly but none falls far behind.
export const d2ShareA = scene((W, H, S, rand) => {
  const N = 4;
  const R = Array.from({ length: N }, (_, i) => ({ x: W * (0.2 + 0.2 * i), y: H * 0.86, V: 3 + rand() * 3, grains: [] as { dx: number; dy: number; a: number }[] }));
  interface Item { x: number; y: number; phase: 'queue' | 'arrive' | 'decide' | 'fall'; t0: number; vals: number[]; to: number; fx: number; fy: number }
  const items: Item[] = [];
  const DEC = { x: W * 0.5, y: H * 0.28 };
  let next = 400;
  const heapPos = (k: number): [number, number] => {
    // Grains pile into a low mound: rows of decreasing width.
    let row = 0;
    let n = k;
    let width = 5;
    while (n >= width) {
      n -= width;
      row++;
      width = Math.max(2, width - (row % 2));
    }
    return [(n - (width - 1) / 2) * 4.2 * S, -row * 3.8 * S];
  };
  for (const r of R) for (let k = 0; k < Math.round(r.V * 1.6); k++) r.grains.push({ ...(([dx, dy]) => ({ dx, dy }))(heapPos(k)), a: 1 });
  return {
    step(dt, t) {
      if (t > next) {
        next = t + 2600;
        items.push({ x: -10, y: DEC.y, phase: 'arrive', t0: t, vals: Array.from({ length: N }, () => 0.2 + rand() * 0.8), to: -1, fx: -10, fy: DEC.y });
      }
      for (const it of items) {
        const u = (t - it.t0) / (it.phase === 'arrive' ? 1100 : it.phase === 'decide' ? 1200 : 800);
        if (it.phase === 'arrive') {
          it.x = mix(-10, DEC.x, ease(clamp(u)));
          if (u >= 1) {
            it.phase = 'decide';
            it.t0 = t;
          }
        } else if (it.phase === 'decide') {
          if (u >= 0.55 && it.to < 0) {
            // Among recipients that value it reasonably, the one furthest behind.
            const vmax = Math.max(...it.vals);
            let best = -1;
            for (let i = 0; i < N; i++) if (it.vals[i] >= vmax * 0.5 && (best < 0 || R[i].V < R[best].V)) best = i;
            it.to = best;
          }
          if (u >= 1) {
            it.phase = 'fall';
            it.t0 = t;
            it.fx = it.x;
            it.fy = it.y;
          }
        } else if (it.phase === 'fall') {
          const r = R[it.to];
          const [dx, dy] = heapPos(r.grains.length);
          it.x = mix(it.fx, r.x + dx, ease(clamp(u)));
          it.y = mix(it.fy, r.y + dy - 4 * S, ease(clamp(u)));
          if (u >= 1) {
            const add = Math.max(1, Math.round(it.vals[it.to] * 3));
            r.V += it.vals[it.to];
            for (let k = 0; k < add; k++) r.grains.push({ ...(([gx, gy]) => ({ dx: gx, dy: gy }))(heapPos(r.grains.length)), a: 0 });
            it.phase = 'queue';
            it.t0 = -1;
          }
        }
      }
      for (let i = items.length - 1; i >= 0; i--) if (items[i].t0 < 0) items.splice(i, 1);
      for (const r of R) for (const g of r.grains) g.a = Math.min(1, g.a + dt / 400);
      // Keep heaps in frame: when all are tall, each loses the same few grains from its base.
      if (Math.min(...R.map((r) => r.grains.length)) > 40) for (const r of R) r.grains.splice(0, 10);
    },
    draw(ctx, t) {
      // The waiting items: time is visible.
      for (let k = 1; k <= 3; k++) agent(ctx, 10 * S + (3 - k) * 0 - k * 0, DEC.y, 2 * S, WARM, 0.12 / k + 0.05 * Math.sin(t * 0.003 + k) ** 2);
      for (const r of R) {
        halo(ctx, r.x, r.y - 6 * S, 30 * S, PALE, 0.05);
        for (const g of r.grains) {
          ctx.fillStyle = rgba(mixc([200, 170, 130], WARM, 0.3), 0.85 * g.a);
          ctx.fillRect(r.x + g.dx - 1.6 * S, r.y + g.dy - 1.6 * S, 3.2 * S, 3.2 * S);
        }
        agent(ctx, r.x, r.y + 8 * S, 2.4 * S, PALE, 0.75);
      }
      for (const it of items) {
        if (it.phase === 'decide') {
          const u = clamp((t - it.t0) / 1200);
          for (let i = 0; i < N; i++) {
            const chosen = it.to === i;
            const a = (0.06 + 0.4 * it.vals[i]) * Math.sin(Math.PI * Math.min(1, u * 1.05)) * (it.to >= 0 && !chosen ? 0.35 : 1);
            hair(ctx, it.x, it.y, R[i].x, R[i].y - 14 * S, chosen ? WARM : PALE, a);
            halo(ctx, R[i].x, R[i].y - 8 * S, (10 + 16 * it.vals[i]) * S, chosen ? WARM : PALE, 0.12 * it.vals[i] * Math.sin(Math.PI * u));
          }
        }
        agent(ctx, it.x, it.y, 2.8 * S, WARM, 0.95);
      }
    },
  };
});

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
    reading: 'Items arrive one after another; each pauses, the recipients are considered, and it goes to one of them; their heaps grow and stay roughly level.',
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
    title: 'Adapt A · decentralised feedback',
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
    title: 'Exchange · attacker and defender',
    make: d2Exchange,
    reading: 'Two roles from one shared origin interact: ordinary messages pass and are answered; probes are mostly stopped at a boundary; when one gets through, the boundary strengthens there, and the next probes aim at the new weak spot.',
    research: 'Self-play red teaming (The Attacker in the Mirror): attacker and defender roles on a frozen shared base with separate role policies, which keeps adversarial pressure without collapsing into an “always refuse” defender.',
    literal: 'Two roles, rounds of interaction, blocking, answering, adaptation.',
    metaphor: 'The fixed base glow = the frozen shared model; the two branches = role-specific policies; boundary brightness = robustness at that point.',
  },
];
