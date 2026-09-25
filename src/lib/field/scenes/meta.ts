// Scene names. Deliberately import-free: the page <head> script and the build read this,
// while only the client registry (./index.ts) holds the lazy loaders.
//
// ROTATION_IDS: what normal visitors rotate through (first visit sees the first one, which is
// also the static still). EXPERIMENTAL_IDS: previewable with ?scene=<name> only, never rotated.
export const ROTATION_IDS = ['adapt', 'exchange', 'share', 'gather'] as const;
export const EXPERIMENTAL_IDS = ['water', 'earth', 'fire', 'air', 'convergence'] as const;
export const PREVIEW_IDS = [...ROTATION_IDS, ...EXPERIMENTAL_IDS] as const;
export type SceneId = (typeof PREVIEW_IDS)[number];
