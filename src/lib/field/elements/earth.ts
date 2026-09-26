// Earth: a broad mineral surface under stress. Fractures open from a few stress points, branch,
// meet and stop; dust lifts from the active tips; the ground trembles, then settles into a still,
// fractured surface. The environment itself is the element, as with Water and Air.
import type { SceneFactory } from '../core';
import { ctxFrom, sceneFromLayers } from './kit';
import { createSurfaceLayer } from './surface-layer';

export const createEarth: SceneFactory = (o) => {
  const side = o.layout === 'side';
  const f = o.field;
  const H = f.y1 - f.y0;
  const field = side ? { ...f, y0: f.y0 + H * 0.12 } : f;
  const surface = createSurfaceLayer({ ...ctxFrom(o), field, seeds: side ? 5 : 4, budget: side ? 11 : 9, ember: 0.18, light: side ? 0.5 : 0.62, lip: 0.34 });
  // Still once settled: no ambient churn.
  return sceneFromLayers([surface], 3200, 1e9);
};
