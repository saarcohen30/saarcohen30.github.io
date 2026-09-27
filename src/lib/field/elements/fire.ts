// Fire: converging bursts. Two directed bursts gather, strike along controlled arcs, meet in a
// brief coherent flare, and the merged energy rises and dissipates into embers; the cycle repeats,
// mirrored and varied. The pointer adds a gentle current that nudges the fire (never puts it out).
import type { SceneFactory } from '../core';
import { ctxFrom, sceneFromLayers, type Layer } from './kit';
import { createBursts, MEET } from './bursts';

const INTRO = MEET + 1600;

export const createFire: SceneFactory = (o) => {
  const c = ctxFrom(o);
  const f = c.field;
  const side = o.layout === 'side';
  // A little more room than the default field: the bursts travel across it.
  const field = side ? { ...f, y0: f.y0 - (f.y1 - f.y0) * 0.04, y1: f.y1 + (f.y1 - f.y0) * 0.1 } : f;
  const W = field.x1 - field.x0;
  const H = field.y1 - field.y0;
  const bursts = createBursts(W, H, c.seed + 31);
  let clock = 0;
  const layer: Layer = {
    step(dt, t) {
      clock = t;
      bursts.step(dt, t);
    },
    render(ctx, t) {
      bursts.render(ctx, t, field.x0, field.y0);
    },
    finish() {
      bursts.settle(Math.max(clock, INTRO));
    },
    pointer(x, y, t) {
      bursts.pointer(x - field.x0, y - field.y0, t);
    },
  };
  // No timed churn: the choreography is its own ambient life.
  return sceneFromLayers([layer], INTRO, 1e9);
};
