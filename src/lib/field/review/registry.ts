// Everything the element review page can show, by id. The family (Water, Air, Earth, Fire,
// Convergence) are the live scenes, wrapped unchanged (including their timed churn, as the hero
// runs them); everything else is an earlier study.
import type { SceneFactory } from '../core';
import { createWater } from '../elements/water';
import { createAir } from '../elements/air';
import { createEarth } from '../elements/earth';
import { createFire } from '../elements/fire';
import { createConvergence } from '../elements/convergence';
import { canvasPainter } from '../canvas';
import { createAdapt } from '../scenes/adapt';
import { createExchange } from '../scenes/exchange';
import { createShare } from '../scenes/share';
import { createGather } from '../scenes/gather';
import { UNIFIED } from './unified-protos';
import { D2 } from './d2-protos';
import { d2ShareA } from './d2-protos';
import { d2ShareAv2, d2ShareAMound } from './d2-share-history';
import { STORYBOARDS } from './exchange-storyboards';
import type { Proto, ProtoFactory } from './common';
import { FIRE_PROTOS } from './fire-protos';
import { FIRE_STUDIES } from './fire-studies';
import { EARTH_PROTOS } from './earth-protos';
import { CONVERGENCE_PROTOS } from './convergence-protos';
import { LAKE_STUDIES } from './lake-studies';

const fromScene =
  (factory: SceneFactory): ProtoFactory =>
  (w, h, _seed, opts) => {
    const field = { x0: w * 0.04, x1: w * 0.96, y0: h * 0.06, y1: h * 0.94 };
    const layout = opts?.mobile ? 'top' : 'side';
    const s = factory({ width: w, height: h, field, density: (((field.x1 - field.x0) * (field.y1 - field.y0)) / 1e5) * 22, layout, seed: 30 });
    const every = s.churnEvery ?? 3200;
    let next = s.introMs + every;
    const p: Proto = {
      step(dt) {
        s.step(dt);
        if (s.clock > next) {
          s.churn();
          next = s.clock + every * (0.7 + Math.random() * 0.6);
        }
      },
      render: (ctx) => s.render!(ctx),
      pointer: (x, y) => s.pointer?.(x, y),
      settle: () => s.finish(),
    };
    return p;
  };

/** The research scenes (they draw through the shared Painter, as in the hero). */
const fromResearch =
  (factory: SceneFactory): ProtoFactory =>
  (w, h, _seed, opts) => {
    const field = { x0: w * 0.04, x1: w * 0.96, y0: h * 0.06, y1: h * 0.94 };
    const s = factory({ width: w, height: h, field, density: (((field.x1 - field.x0) * (field.y1 - field.y0)) / 1e5) * 22, layout: opts?.mobile ? 'top' : 'side', seed: 30 });
    let next = s.introMs + 3900;
    return {
      step(dt) {
        s.step(dt);
        if (s.clock > next) {
          s.churn();
          next = s.clock + 3900 * (0.7 + Math.random() * 0.6);
        }
      },
      render: (ctx) => s.draw(canvasPainter(ctx), -1),
      settle: () => s.finish(),
    };
  };

export type Group = 'family' | 'wind' | 'research' | 'unified' | 'd2' | 'story' | 'fire-old' | 'conv-old' | 'earth-old';

export interface Entry {
  id: string;
  group: Group;
  label: string;
  title: string;
  note: string;
  make: ProtoFactory;
  /** Review-only semantic labels (D2 studies). */
  sem?: { reading: string; research: string; literal: string; metaphor: string; why?: string };
}

export const ENTRIES: Entry[] = [
  { id: 'water', group: 'family', label: 'Water', title: 'Approved', note: 'The live Water scene, unchanged. Pointer: a small ripple.', make: fromScene(createWater) },
  { id: 'air', group: 'family', label: 'Air', title: 'Approved', note: 'The live Air scene, unchanged. Pointer: a local eddy.', make: fromScene(createAir) },
  { id: 'earth', group: 'family', label: 'Earth', title: 'Dune Field', note: 'The live Earth scene (?scene=earth). No pointer response.', make: fromScene(createEarth) },
  {
    id: 'fire',
    group: 'family',
    label: 'Fire',
    title: 'Converging Bursts',
    note: 'The live Fire scene (?scene=fire). Two glows gather, drawing embers in; a burst strikes from one side, accelerating along a rising arc; a second strikes from the other and swings wide around it; they meet in a brief, coherent, near-white bloom with a faint ring of heat shimmer; the flare breaks into rising tongues and embers; the merged energy climbs in one column and dissipates; the field settles. Each cycle is mirrored and varied. Pointer: a gentle current that nudges the fire.',
    make: fromScene(createFire),
  },
  {
    id: 'convergence',
    group: 'family',
    label: 'Convergence',
    title: 'Dramatic Lake',
    note: 'The live Convergence scene (?scene=convergence). One wind field moves everything: long currents in the sky at different depths (rising over the fire), smoke taken and stretched by the current, embers carried downwind, mist drifting at the wind speed of its height, gust patches running across the water, and the flames leaning. Pointer: ripples on the water, a gust in the air.',
    make: fromScene(createConvergence),
  },
  { id: 'r-gather', group: 'research', label: 'Gather', title: 'Coalitions & collective decisions', note: 'Agents arrive and join the group they value most.', make: fromResearch(createGather) },
  { id: 'r-share', group: 'research', label: 'Share', title: 'Fair allocation over time', note: 'Resources routed so bundles grow evenly.', make: fromResearch(createShare) },
  { id: 'r-adapt', group: 'research', label: 'Adapt', title: 'Learning in multi-agent systems', note: 'A network learns from consistent feedback and regroups.', make: fromResearch(createAdapt) },
  { id: 'r-exchange', group: 'research', label: 'Exchange', title: 'Principled & safe AI', note: 'Two mirrored groups exchange messages; some are stopped at the boundary.', make: fromResearch(createExchange) },
  ...UNIFIED.map((u) => ({ id: `u-${u.key}`, group: 'unified' as const, label: u.title, title: 'in the flow language', note: u.note, make: u.make })),
  ...D2.map((d) => ({ id: `d2-${d.key}`, group: 'd2' as const, label: 'D2', title: d.title, note: d.reading, make: d.make, sem: { reading: d.reading, research: d.research, literal: d.literal, metaphor: d.metaphor, why: (d as { why?: string }).why } })),
  { id: 'share-v1', group: 'd2', label: 'Share A', title: 'Original approved (170ffa7)', note: 'The selected scene: the canonical d2ShareA, which is the exact 170ffa7 code.', make: d2ShareA },
  { id: 'share-v2', group: 'd2', label: 'Share A', title: 'e4a29aa (rejected regression)', note: 'The card-scale rewrite that broke the bundles.', make: d2ShareAv2 },
  { id: 'share-mound', group: 'd2', label: 'Share A', title: 'Mound repair (rejected alternative)', note: 'The 76d45ab repair; not the approved scene.', make: d2ShareAMound },
  ...STORYBOARDS.map((b) => ({ id: `sb-${b.key}`, group: 'story' as const, label: 'Storyboard', title: b.title, note: b.frames.join(' → '), make: b.make })),
  { id: 'conv-current', group: 'wind', label: 'Current wind', title: 'Dramatic Lake as reviewed', note: 'The study you selected, unchanged: independent, faint sky lines; smoke and mist not tied to them.', make: LAKE_STUDIES[1].make },
  { id: 'conv-refined', group: 'wind', label: 'Refined wind', title: 'Dramatic Lake, production', note: 'One wind field for everything (see Convergence above). A few long currents, not a sky full of lines.', make: fromScene(createConvergence) },
  ...FIRE_PROTOS.map((p) => ({ id: `fire-${p.key}`, group: 'fire-old' as const, label: `Fire ${p.key}`, title: p.title, note: p.note, make: p.make })),
  ...FIRE_STUDIES.map((p) => ({ id: `fire-${p.key}`, group: 'fire-old' as const, label: `Fire ${p.key}`, title: p.title, note: p.note, make: p.make })),
  ...CONVERGENCE_PROTOS.map((p) => ({ id: `conv-${p.key}`, group: 'conv-old' as const, label: `Convergence ${p.key}`, title: p.title, note: p.note, make: p.make })),
  { id: 'conv-D', group: 'conv-old', label: 'Convergence D', title: LAKE_STUDIES[0].title, note: LAKE_STUDIES[0].note, make: LAKE_STUDIES[0].make },
  ...EARTH_PROTOS.filter((p) => p.key !== 'D').map((p) => ({ id: `earth-${p.key}`, group: 'earth-old' as const, label: `Earth ${p.key}`, title: p.title, note: p.note, make: p.make })),
];
