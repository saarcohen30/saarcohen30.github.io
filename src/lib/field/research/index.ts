// The four research illustrations used in "What I work on" (production). Loaded lazily by
// src/scripts/research.ts when the section approaches the viewport.
import { d2Gather } from './gather';
import { d2ShareA } from './share';
import { d2AdaptA1 } from './adapt';
import { d2Rounds } from './rounds';

/** By research-theme id (src/data/profile.yaml). `still` is the representative time for a still. */
export const RESEARCH_SCENES = {
  'collective-decisions': { make: d2Gather, still: 4500 },
  'fair-allocation': { make: d2ShareA, still: 4500 },
  'multiagent-learning': { make: d2AdaptA1, still: 4500 },
  'safe-principled-ai': { make: d2Rounds, still: 6600 },
} as const;
