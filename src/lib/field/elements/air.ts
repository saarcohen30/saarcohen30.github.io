import type { SceneFactory } from '../core';
import { ctxFrom, sceneFromLayers } from './kit';
import { createAirLayer } from './air-layer';

export const createAir: SceneFactory = (o) => {
  const air = createAirLayer({ ...ctxFrom(o) });
  return sceneFromLayers([air], 2400, 5000);
};
