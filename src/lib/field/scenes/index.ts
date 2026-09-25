// The scene family, in rotation order. Each entry is loaded on demand, so a visit only
// downloads the scene it shows.
import type { SceneFactory } from '../core';

// First visits see Adapt (the broadest image: many agents, uncertainty resolving into
// structure), matching the static still; later visits rotate through the others.
export const SCENES = [
  { id: 'adapt', load: () => import('./adapt').then((m) => m.createAdapt) },
  { id: 'exchange', load: () => import('./exchange').then((m) => m.createExchange) },
  { id: 'share', load: () => import('./share').then((m) => m.createShare) },
  { id: 'gather', load: () => import('./gather').then((m) => m.createGather) },
] satisfies { id: string; load: () => Promise<SceneFactory> }[];
