// Hero scene names. Deliberately import-free: the page <head> script and the build read this,
// while only the client registry (./index.ts) holds the lazy loaders.
//
// HERO_IDS: the elemental family. Every fresh load of the home page picks one of them uniformly at
// random (see ./pick.mjs); ?scene=<name> forces one (for review), ?scene=<name>&intro=1 with its
// entrance. The research illustrations live in "What I work on" (../research/), not in the hero.
export const HERO_IDS = ['water', 'air', 'earth', 'fire', 'convergence'] as const;
export type SceneId = (typeof HERO_IDS)[number];
