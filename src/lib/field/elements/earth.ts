import type { SceneFactory } from '../core';
import { ctxFrom, sceneFromLayers } from './kit';
import { createEarthLayer } from './earth-layer';

export const createEarth: SceneFactory = (o) => {
  const f = o.field;
  const H = f.y1 - f.y0;
  // A low, wide outcrop of thin strata rather than a tall wall.
  const field = { ...f, y1: f.y1 - H * 0.08 };
  const earth = createEarthLayer({ ...ctxFrom(o), field, fill: o.layout === 'side' ? 0.52 : 0.62, taper: 0.1 });
  return sceneFromLayers([earth], 2900, 4200);
};
