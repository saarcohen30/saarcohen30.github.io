// Convergence: one environment. A water surface lies across the lower part of the field and wind
// streams above it (both exactly as in their own scenes). At the waterline lies a low, broad,
// fractured mineral shelf; fire rises in small fronts along its fissures, bent by the wind, and
// the water reflects their warm light.
//
// (Baseline: the composition before 0fa4935; the stone stack and the torch on top of it were
// replaced by the shelf and the fissure fires.)
import type { SceneFactory } from '../core';
import { ctxFrom, sceneFromLayers, smooth, clamp, mix, makeNoise2 } from './kit';
import { createWaterLayer } from './water-layer';
import { createSurfaceLayer } from './surface-layer';
import { createFireLayer, type FireFront } from './fire-layer';
import { createAirLayer } from './air-layer';

export const createConvergence: SceneFactory = (o) => {
  const f = o.field;
  const W = f.x1 - f.x0;
  const H = f.y1 - f.y0;
  const side = o.layout === 'side';
  const horizon = f.y0 + H * (side ? 0.64 : 0.66);
  const cx = f.x0 + W * (side ? 0.52 : 0.5);
  const base = ctxFrom(o);
  const shoreNoise = makeNoise2(base.seed + 101);

  const air = createAirLayer({ ...base, field: { x0: f.x0, x1: f.x1, y0: f.y0, y1: horizon }, delay: 1900, density: 0.55, wind: 0.85, vortices: side ? 2 : 1 });

  // The shelf: a thin band of fractured stone at the waterline, longer than it is deep, ending in
  // irregular points (a ledge seen at a low angle, not a mound).
  const shelfRect = { x0: f.x0 + W * 0.06, x1: f.x1 - W * 0.04, y0: horizon - H * 0.07, y1: horizon + H * 0.06 };
  const shelf = createSurfaceLayer({
    ...base,
    field: shelfRect,
    delay: 450,
    seeds: side ? 3 : 2,
    budget: side ? 3.2 : 2.2,
    ember: 0.35,
    msPerUnit: 1800,
    farScale: 0.8,
    light: 0.72,
    soft: 0.18,
    mask: (u, v) => {
      // Irregular outline: its half-length varies with depth and noise; the near edge is a
      // ragged shoreline.
      // Irregular outline: a crisp but uneven far edge (stone against the dark), tapering ends,
      // and a ragged shoreline where it meets the water.
      const half = 0.38 + 0.07 * shoreNoise(v * 4, 1.3) + 0.08 * (v - 0.5);
      const along = 1 - smooth(half - 0.04, half, Math.abs(u - 0.52 + 0.05 * shoreNoise(v * 3, 7)));
      const top = smooth(0.0, 0.05, v - 0.14 * Math.max(0, shoreNoise(u * 7, 2.2)) - 0.75 * ((u - 0.52) / half) ** 2);
      const shore = 1 - smooth(0.74, 0.84, v + 0.12 * shoreNoise(u * 11, 3.3));
      return along * top * shore;
    },
  });

  // Fire along fissures: pick points on the shelf's fractures and let fronts rise from them.
  const cand = shelf.fissures
    .flatMap((fis) => fis.pts.filter((_, i) => i % 3 === 0))
    .filter((p) => p.u > 0.25 && p.u < 0.8 && p.v > 0.3 && p.v < 0.75)
    .map((p) => ({ ...p, xy: shelf.project(p.u, p.v) }))
    .sort((a, b) => a.xy[0] - b.xy[0]);
  const nFronts = side ? 4 : 3;
  const picked: typeof cand = [];
  for (const p of cand) {
    if (picked.length >= nFronts) break;
    if (!picked.length || p.xy[0] - picked[picked.length - 1].xy[0] > W * (side ? 0.1 : 0.14)) picked.push(p);
  }
  if (!picked.length) picked.push({ u: 0.5, v: 0.5, t: 0, w: 1, xy: [cx, horizon] });
  const fireAt = 1900;
  // One continuous, uneven fire front along the fissure line: overlapping fronts that merge,
  // tallest in one stretch, dying down towards the ends. It travels along the ledge.
  const xa = picked[0].xy[0] - W * 0.04;
  const xb = picked[picked.length - 1].xy[0] + W * 0.04;
  const fronts: FireFront[] = [];
  const peak = 0.35 + 0.3 * (((base.seed * 7) % 10) / 10);
  for (let x = xa, i = 0; x <= xb; i++) {
    const k = (x - xa) / Math.max(1, xb - xa);
    const env = Math.exp(-(((k - peak) / 0.28) ** 2));
    const half = W * (side ? 0.03 : 0.045) * (0.8 + 0.7 * env);
    fronts.push({
      x,
      half,
      height: H * (side ? 0.07 : 0.09) + H * (side ? 0.16 : 0.15) * env * (0.8 + 0.4 * (((i * 53) % 10) / 10)),
      heat: 0.8 + 0.3 * env,
      at: fireAt + i * 180,
    });
    x += half * 1.3;
  }
  // Baseline through the chosen fissure points (linear between them, flat beyond).
  const pts = picked.map((p) => p.xy);
  const baseline = (x: number) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) return mix(pts[i - 1][1], pts[i][1], (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
    return pts[pts.length - 1][1];
  };
  let fireLight = 0;
  const fire = createFireLayer({
    ...base,
    fronts,
    baseline,
    lean: (x, y, t) => clamp(air.velocity(x, y, t)[0] * 3.2, -0.8, 0.8),
    onLight: (lights) => {
      fireLight = lights.reduce((s, l) => s + l.level, 0) / Math.max(1, lights.length);
    },
  });
  const warmX = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const water = createWaterLayer({
    ...base,
    field: { x0: f.x0, x1: f.x1, y0: horizon, y1: f.y1 },
    lightX: (warmX - f.x0) / W,
    warmX,
    warmStrength: (t) => 0.9 * smooth(fireAt + 300, fireAt + 1800, t) * (0.4 + 0.6 * fireLight),
  });
  // Back to front: wind, water, shelf, fire.
  return sceneFromLayers([air, water, shelf, fire], 3300, 3400);
};
