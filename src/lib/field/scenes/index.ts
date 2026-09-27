// Client-side hero registry: each elemental scene is loaded on demand, so a visit downloads only the
// scene it shows. Indices follow HERO_IDS in ./meta.ts.
import type { SceneFactory } from '../core';
import { HERO_IDS, type SceneId } from './meta';

const LOADERS: Record<SceneId, () => Promise<SceneFactory>> = {
  water: () => import('../elements/water').then((m) => m.createWater),
  air: () => import('../elements/air').then((m) => m.createAir),
  earth: () => import('../elements/earth').then((m) => m.createEarth),
  fire: () => import('../elements/fire').then((m) => m.createFire),
  convergence: () => import('../elements/convergence').then((m) => m.createConvergence),
};

export const SCENES = HERO_IDS.map((id) => ({ id, load: LOADERS[id] }));
