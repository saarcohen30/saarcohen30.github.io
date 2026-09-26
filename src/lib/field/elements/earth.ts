// Earth: a dune field at dusk. Ridges of sand recede to a dark horizon under a low light; the
// dunes migrate imperceptibly and sand streams off the crests. The environment itself is the
// element, as with Water and Air.
import type { SceneFactory } from '../core';
import { ctxFrom, sceneFromLayers } from './kit';
import { createDuneLayer } from './dune-layer';

export const createEarth: SceneFactory = (o) => {
  const side = o.layout === 'side';
  const f = o.field;
  const H = f.y1 - f.y0;
  // Wide screens: more room above the horizon; phones: the field is already a short band.
  const W = f.x1 - f.x0;
  const field = side ? { x0: f.x0 - W * 0.08, x1: f.x1 + W * 0.04, y0: f.y0 + H * 0.02, y1: f.y1 + H * 0.14 } : { ...f, x0: f.x0 - W * 0.1, x1: f.x1 + W * 0.1 };
  const dunes = createDuneLayer({ ...ctxFrom(o), field, horizon: side ? 0.36 : 0.3 });
  // No ambient churn: the dunes' own motion is continuous and slow.
  return sceneFromLayers([dunes], 3000, 1e9);
};
