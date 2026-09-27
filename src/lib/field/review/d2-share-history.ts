// Share A history (design review only), kept verbatim for side-by-side comparison. Neither is used by
// the selected scene: the canonical Share A (d2ShareA in ./d2-protos.ts) is the exact 170ffa7 code.
//   d2ShareAv2     — the regressed card-scale rewrite (e4a29aa), rejected
//   d2ShareAMound  — the "mound repair" (76d45ab), a rejected alternative
import { clamp, mix } from '../elements/kit';
import { scene, CARD_SCALE, agent, halo, hair, rgba, mixc, ease, PALE, WARM } from './d2-protos';

// ------------------------------------------------------------------ Allocation A: sequential
// One item at a time: it arrives along the top (the next two wait, faint, at the edge), pauses above
// the four recipients while each is considered (a hairline to each, brighter where it is valued
// more), goes to one of them (one that values it, favouring whoever is furthest behind), and settles
// onto that recipient's heap. Only then does the next item arrive. Heaps are organic mounds of grains
// sized to the card, so bundles read at a glance; none falls far behind.
export const d2ShareAv2 = scene((W, H, S, rand) => {
  const N = 4;
  const grainR = Math.max(1.3, H * 0.011);
  const heapW = W * 0.14;
  interface Grain { u: number; v: number; a: number; tone: number }
  const R = Array.from({ length: N }, (_, i) => ({ x: W * (0.2 + 0.2 * i), y: H * 0.8, V: 3 + rand() * 3, grains: [] as Grain[] }));
  // A grain's place in its heap: u across (−1..1), v up (0..1) under a dome, denser near the base.
  const newGrain = (): Grain => {
    const u = (rand() + rand() - 1) * 0.95;
    return { u, v: Math.pow(rand(), 1.6) * (1 - u * u), a: 0, tone: rand() };
  };
  for (const r of R) for (let k = 0; k < Math.round(r.V * 5); k++) r.grains.push({ ...newGrain(), a: 1 });
  const heightOf = (V: number) => H * (0.05 + 0.024 * V);
  interface Item { x: number; y: number; phase: 'arrive' | 'consider' | 'settle'; t0: number; vals: number[]; to: number; fx: number; fy: number }
  let it: Item | null = null;
  let next = 500;
  const DEC = { x: W * 0.5, y: H * 0.2 };
  return {
    step(dt, t) {
      for (const r of R) for (const g of r.grains) g.a = Math.min(1, g.a + dt / 500);
      if (!it) {
        if (t < next) return;
        it = { x: -12, y: DEC.y, phase: 'arrive', t0: t, vals: Array.from({ length: N }, () => 0.2 + rand() * 0.8), to: -1, fx: 0, fy: 0 };
      }
      const u = (t - it.t0) / (it.phase === 'arrive' ? 1000 : it.phase === 'consider' ? 1300 : 900);
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
          it.phase = 'settle';
          it.t0 = t;
          it.fx = it.x;
          it.fy = it.y;
        }
      } else {
        const r = R[it.to];
        it.x = mix(it.fx, r.x, ease(clamp(u)));
        it.y = mix(it.fy, r.y - heightOf(r.V) * 0.9, ease(clamp(u)));
        if (u >= 1) {
          r.V += it.vals[it.to];
          for (let k = 0; k < Math.round(it.vals[it.to] * 5); k++) r.grains.push(newGrain());
          // Keep heaps in frame: when all are tall, every heap settles by the same amount.
          if (Math.min(...R.map((x) => x.V)) > 9) for (const x of R) {
            x.V -= 3;
            x.grains.splice(0, 15);
          }
          it = null;
          next = t + 450;
        }
      }
    },
    draw(ctx, t) {
      // The next items wait at the edge: time is visible.
      for (let k = 1; k <= 2; k++) agent(ctx, W * 0.035 - (k - 1) * grainR * 5, DEC.y, grainR * 1.1, WARM, 0.18 / k);
      for (const r of R) {
        const h = heightOf(r.V);
        // A soft, warm ground glow under each heap, then the grains of its mound.
        halo(ctx, r.x, r.y, heapW * 0.75, WARM, 0.07);
        for (const g of r.grains) {
          const x = r.x + g.u * heapW * 0.5;
          const y = r.y - g.v * h;
          ctx.fillStyle = rgba(mixc([214, 180, 132], WARM, g.tone * 0.5), 0.9 * g.a);
          ctx.beginPath();
          ctx.arc(x, y, grainR * (0.8 + 0.4 * g.tone), 0, Math.PI * 2);
          ctx.fill();
        }
        // The recipient itself: a pale agent below its heap.
        agent(ctx, r.x, r.y + grainR * 5, grainR * 1.6, PALE, 0.85);
      }
      if (it) {
        if (it.phase === 'consider') {
          const u = clamp((t - it.t0) / 1300);
          for (let i = 0; i < N; i++) {
            const chosen = it.to === i;
            const a = (0.05 + 0.3 * it.vals[i]) * Math.sin(Math.PI * Math.min(1, u * 1.05)) * (it.to >= 0 && !chosen ? 0.3 : 1);
            hair(ctx, it.x, it.y, R[i].x, R[i].y - heightOf(R[i].V) - grainR * 2, chosen ? WARM : PALE, a, Math.max(0.7, 0.9 * S));
          }
        }
        halo(ctx, it.x, it.y, grainR * 7, WARM, 0.25);
        agent(ctx, it.x, it.y, grainR * 1.5, WARM, 0.95);
      }
    },
  };
}, CARD_SCALE);

// ------------------------------------------------------------------ Allocation A: mound repair (rejected, 76d45ab)
// One item at a time: it arrives along the top (the next two wait, faint, at the edge), pauses above
// the four recipients while each is considered (a faint hairline to each, brighter where it is valued
// more), goes to one of them (one that values it, favouring whoever is furthest behind), and joins that
// recipient's bundle. Only then does the next item arrive.
// Bundles are compact mounds: a soft silhouette whose size encodes value continuously, filled with
// small, muted grains at roughly constant density (value is aggregated; one grain is not one unit).
// Hierarchy: the active item is the only bright warm object; bundles are quiet sand; recipients pale.
// Sizes are local to this scene (proportional to the card, with floors for small cards).
export const d2ShareAMound = scene((W, H, S, rand) => {
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

