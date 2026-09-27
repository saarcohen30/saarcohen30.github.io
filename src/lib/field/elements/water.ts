import type { SceneFactory } from '../core';
import { ctxFrom, sceneFromLayers } from './kit';
import { createWaterLayer } from './water-layer';

export const createWater: SceneFactory = (o) => {
  const f = o.field;
  // A little breathing room above the horizon on wide screens.
  const field = o.layout === 'side' ? { ...f, y0: f.y0 + (f.y1 - f.y0) * 0.12 } : f;
  const water = createWaterLayer({ ...ctxFrom(o), field, reveal: true, lightX: 0.55 });
  return sceneFromLayers([water], 2700, 2600);
};
