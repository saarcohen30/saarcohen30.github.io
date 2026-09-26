// Fire: a field of flame fronts along an invisible, gently curved line across the scene. They
// ignite in sequence, merge where they meet, and later collapse and reignite.
import { mulberry32, type SceneFactory } from '../core';
import { ctxFrom, sceneFromLayers, mix } from './kit';
import { createFireLayer, type FireFront } from './fire-layer';

export const createFire: SceneFactory = (o) => {
  const f = o.field;
  const W = f.x1 - f.x0;
  const H = f.y1 - f.y0;
  const side = o.layout === 'side';
  const rand = mulberry32((o.seed ?? 30) + 5);
  // A low, gently uneven line across the field, never drawn.
  const baseline = (x: number) => {
    const u = (x - f.x0) / W;
    return f.y1 - H * (0.09 + 0.03 * Math.sin(Math.PI * u) + 0.018 * Math.sin(u * 11.3 + 1.7) - 0.03 * u);
  };
  // An irregular fire line: overlapping fronts of very different sizes that merge into clusters,
  // with a couple of gaps; one or two regions burn tall, the rest low.
  const n = side ? 14 : 9;
  const fronts: FireFront[] = [];
  const peak1 = 0.3 + rand() * 0.15;
  const peak2 = 0.62 + rand() * 0.18;
  let u = 0.07;
  for (let i = 0; i < n && u < 0.93; i++) {
    const envelope = Math.max(Math.exp(-(((u - peak1) / 0.12) ** 2)), 0.8 * Math.exp(-(((u - peak2) / 0.1) ** 2)));
    const half = W * (side ? 0.045 : 0.07) * (0.8 + 0.8 * envelope + rand() * 0.4);
    fronts.push({
      x: f.x0 + W * u,
      half,
      height: H * (side ? 0.13 : 0.16) + H * (side ? 0.34 : 0.3) * envelope * (0.8 + rand() * 0.4),
      heat: 0.74 + 0.36 * envelope + rand() * 0.1, // tall regions hotter, low ones deep orange/red
      at: 250 + i * 240 + rand() * 120, // the fire travels along the line
    });
    // Mostly overlapping (merging), occasionally a gap.
    u += (half / W) * (rand() < 0.2 ? 2.6 : 1.35);
  }
  const fire = createFireLayer({ ...ctxFrom(o), fronts, baseline });
  return sceneFromLayers([fire], 2800, 2600);
};
