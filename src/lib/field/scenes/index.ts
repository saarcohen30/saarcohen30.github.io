// Client-side scene registry: each scene is loaded on demand, so a visit downloads only the
// scene it shows. Indices follow PREVIEW_IDS in ./meta.ts (rotation scenes first).
import type { SceneFactory } from '../core';
import { PREVIEW_IDS, type SceneId } from './meta';

const LOADERS: Record<SceneId, () => Promise<SceneFactory>> = {
  adapt: () => import('./adapt').then((m) => m.createAdapt),
  exchange: () => import('./exchange').then((m) => m.createExchange),
  share: () => import('./share').then((m) => m.createShare),
  gather: () => import('./gather').then((m) => m.createGather),
  water: () => import('../elements/water').then((m) => m.createWater),
  earth: () => import('../elements/earth').then((m) => m.createEarth),
  fire: () => import('../elements/fire').then((m) => m.createFire),
  air: () => import('../elements/air').then((m) => m.createAir),
  convergence: () => import('../elements/convergence').then((m) => m.createConvergence),
};

export const SCENES = PREVIEW_IDS.map((id) => ({ id, load: LOADERS[id] }));
