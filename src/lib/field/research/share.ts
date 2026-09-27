// Fair allocation over time (FROZEN): the exact Share A of commit 170ffa7 (npm run verify-share).

import { clamp, mix } from '../elements/kit';
import { scene, PALE, WARM, rgba, mixc, ease, halo, agent, hair } from './kit';

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

