// Share A history (design review only): the approved-concept version (170ffa7) and the regressed
// card-scale rewrite (e4a29aa), kept verbatim so the repair can be compared side by side. Each keeps
// the scale it was shown at. The repaired version lives in ./d2-protos.ts.
import { clamp, mix } from '../elements/kit';
import { scene, LEGACY_SCALE, CARD_SCALE, agent, halo, hair, rgba, mixc, ease, PALE, WARM } from './d2-protos';

// ------------------------------------------------------------------ Allocation A: sequential
// Items arrive one at a time along the top (the next ones wait, faint, at the edge). Each pauses above
// the recipients; hairlines drop to each recipient, brighter where it is valued more; it then goes to
// one recipient: one that values it, favouring whoever is furthest behind. It falls onto that
// recipient's heap. Heaps grow unevenly but none falls far behind.
export const d2ShareAv1 = scene((W, H, S, rand) => {
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
}, LEGACY_SCALE);

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

