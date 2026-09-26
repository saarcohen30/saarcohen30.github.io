// Convergence: the four elements in one night-time world. A lake (water), a low island of sand and
// stone (earth), a bonfire on it (fire), and one wind that moves the smoke, embers, mist, water
// and long currents in the sky (air). See ./lake.ts.
import type { SceneFactory } from '../core';
import { ctxFrom, sceneFromLayers, type Layer } from './kit';
import { createLake } from './lake';

const INTRO = 5000;

export const createConvergence: SceneFactory = (o) => {
  const c = ctxFrom(o);
  const f = c.field;
  const side = o.layout === 'side';
  const H0 = f.y1 - f.y0;
  const field = side ? { ...f, y0: f.y0 - H0 * 0.04, y1: f.y1 + H0 * 0.12 } : f;
  const W = field.x1 - field.x0;
  const H = field.y1 - field.y0;
  const lake = createLake(W, H, c.seed + 60);
  // Soft edges on all sides (no frame): alpha masks applied after drawing.
  const fade = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, number][]) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [at, a] of stops) g.addColorStop(at, `rgba(0,0,0,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(field.x0 - 1, field.y0 - 1, W + 2, H + 2);
  };
  const layer: Layer = {
    step(dt, t) {
      lake.step(dt, t);
    },
    render(ctx, t) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(field.x0, field.y0, W, H);
      ctx.clip();
      ctx.translate(field.x0, field.y0);
      lake.render(ctx, t);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      fade(ctx, field.x0, 0, field.x1, 0, [[0, 0], [0.12, 1], [0.9, 1], [1, 0]]);
      fade(ctx, 0, field.y0, 0, field.y1, [[0, 0], [0.1, 1], [0.86, 1], [1, 0]]);
      ctx.restore();
    },
    finish() {
      lake.settle();
    },
    pointer(x, y, t) {
      if (x < field.x0 || x > field.x1 || y < field.y0 || y > field.y1) return;
      lake.pointer(x - field.x0, y - field.y0, t);
    },
  };
  return sceneFromLayers([layer], INTRO, 1e9);
};
