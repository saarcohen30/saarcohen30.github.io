import type { SceneFactory } from '../core';
import { ctxFrom, sceneFromLayers } from './kit';
import { createFireLayer } from './fire-layer';

export const createFire: SceneFactory = (o) => {
  const f = o.field;
  const W = f.x1 - f.x0;
  const fire = createFireLayer({
    ...ctxFrom(o),
    baseY: f.y1 - (f.y1 - f.y0) * 0.04,
    // Phones have a short field: a narrower base keeps the flame tall rather than wide.
    baseX0: f.x0 + W * (o.layout === 'side' ? 0.16 : 0.28),
    baseX1: f.x1 - W * (o.layout === 'side' ? 0.16 : 0.28),
    scale: o.layout === 'side' ? 1 : 1.25,
  });
  return sceneFromLayers([fire], 2600, 4000);
};
