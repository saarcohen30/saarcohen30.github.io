// Convergence: the four layers in one composition. A water surface lies across the lower part of
// the field; a stone formation rises from it; a flame is lit on its summit; wind streams past
// behind. They interact: the wind bends the flame, the water reflects its warm light, and embers
// that fall to the surface leave small ripples.
import type { SceneFactory } from '../core';
import { ctxFrom, sceneFromLayers, smooth } from './kit';
import { createWaterLayer } from './water-layer';
import { createEarthLayer } from './earth-layer';
import { createFireLayer } from './fire-layer';
import { createAirLayer } from './air-layer';

export const createConvergence: SceneFactory = (o) => {
  const f = o.field;
  const W = f.x1 - f.x0;
  const H = f.y1 - f.y0;
  const side = o.layout === 'side';
  const horizon = f.y0 + H * (side ? 0.64 : 0.66);
  const cx = f.x0 + W * (side ? 0.52 : 0.5);
  const halfStone = W * (side ? 0.15 : 0.19);
  const base = ctxFrom(o);

  const air = createAirLayer({ ...base, field: { x0: f.x0, x1: f.x1, y0: f.y0, y1: horizon }, delay: 1900, density: 0.55, wind: 0.85, vortices: side ? 2 : 1 });
  const earth = createEarthLayer({
    ...base,
    field: { x0: cx - halfStone, x1: cx + halfStone, y0: f.y0 + H * 0.22, y1: horizon + H * 0.03 },
    delay: 450,
    layers: side ? 13 : 10,
    fill: 0.94,
    taper: 0.62,
  });
  const fireTop = earth.topAt(cx);
  const fireAt = 1900;
  const fire = createFireLayer({
    ...base,
    field: { x0: cx - halfStone, x1: cx + halfStone, y0: f.y0, y1: fireTop },
    baseY: fireTop + 2,
    baseX0: cx - W * 0.05,
    baseX1: cx + W * 0.05,
    scale: side ? 0.95 : 0.8,
    delay: fireAt,
    wind: (x, y, t) => air.velocity(x, y, t)[0] * 0.6,
    onEmberFall: (x, y, t) => {
      if (y > horizon && x > f.x0 && x < f.x1) water.ripple(x, y, t, 0.35);
    },
  });
  const water = createWaterLayer({
    ...base,
    field: { x0: f.x0, x1: f.x1, y0: horizon, y1: f.y1 },
    lightX: (cx - f.x0) / W,
    warmX: cx,
    warmStrength: (t) => 0.9 * smooth(fireAt + 300, fireAt + 1800, t),
  });
  // Back to front: wind, water, stone, flame.
  return sceneFromLayers([air, water, earth, fire], 3300, 3400);
};
