// Client-side scene registry: each scene is loaded on demand, so a visit downloads only the
// scene it shows. Order and names come from ./meta.ts.
import type { SceneFactory } from '../core';
import { SCENE_IDS, type SceneId } from './meta';

const LOADERS: Record<SceneId, () => Promise<SceneFactory>> = {
  adapt: () => import('./adapt').then((m) => m.createAdapt),
  exchange: () => import('./exchange').then((m) => m.createExchange),
  share: () => import('./share').then((m) => m.createShare),
  gather: () => import('./gather').then((m) => m.createGather),
};

export const SCENES = SCENE_IDS.map((id) => ({ id, load: LOADERS[id] }));
