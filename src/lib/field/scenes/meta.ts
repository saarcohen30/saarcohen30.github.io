// Scene names in rotation order. Deliberately import-free: the page <head> script and the
// build read this, while only the client registry (./index.ts) holds the lazy loaders.
// First visits see Adapt (the broadest image, and the same scene as the static still).
export const SCENE_IDS = ['adapt', 'exchange', 'share', 'gather'] as const;
export type SceneId = (typeof SCENE_IDS)[number];
