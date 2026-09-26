import type { SceneFactory } from '../core';
import { ctxFrom, sceneFromLayers } from './kit';
import { createEarthLayer } from './earth-layer';

export const createEarth: SceneFactory = (o) => {
  const side = o.layout === 'side';
  const f = o.field;
  const H = f.y1 - f.y0;
  // A broad, low block sitting in the lower part of the field.
  const field = { ...f, y0: f.y0 + H * (side ? 0.3 : 0.2) };
  const earth = createEarthLayer({ ...ctxFrom(o), field, peak: side ? 0.62 : 0.7 });
  // Earth is still once it has settled: no ambient churn.
  return sceneFromLayers([earth], 3000, 1e9);
};
