import type { SceneFactory } from '../core';
import { ctxFrom, sceneFromLayers } from './kit';
import { createFireLayer } from './fire-layer';

export const createFire: SceneFactory = (o) => {
  const f = o.field;
  const W = f.x1 - f.x0;
  const H = f.y1 - f.y0;
  const side = o.layout === 'side';
  // Phones have a short, wide field: a narrower base keeps the flame tall.
  const halfBase = Math.min(W * (side ? 0.2 : 0.2), H * 0.3);
  const cx = f.x0 + W * 0.5;
  const fire = createFireLayer({
    ...ctxFrom(o),
    baseY: f.y1 - H * 0.03,
    baseX0: cx - halfBase,
    baseX1: cx + halfBase,
    height: side ? 1.55 : 1.6,
  });
  return sceneFromLayers([fire], 2400, 4000);
};
