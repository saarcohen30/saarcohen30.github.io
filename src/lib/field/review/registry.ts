// Everything the element review page can show, by id. The family (Water, Air, Earth, Fire,
// Convergence) are the live scenes, wrapped unchanged (including their timed churn, as the hero
// runs them); everything else is an earlier study.
import type { SceneFactory } from '../core';
import { createWater } from '../elements/water';
import { createAir } from '../elements/air';
import { createEarth } from '../elements/earth';
import { createFire } from '../elements/fire';
import { createConvergence } from '../elements/convergence';
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

export type Group = 'family' | 'wind' | 'fire-old' | 'conv-old' | 'earth-old';

export interface Entry {
  id: string;
  group: Group;
  label: string;
  title: string;
  note: string;
  make: ProtoFactory;
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
  { id: 'conv-current', group: 'wind', label: 'Current wind', title: 'Dramatic Lake as reviewed', note: 'The study you selected, unchanged: independent, faint sky lines; smoke and mist not tied to them.', make: LAKE_STUDIES[1].make },
  { id: 'conv-refined', group: 'wind', label: 'Refined wind', title: 'Dramatic Lake, production', note: 'One wind field for everything (see Convergence above). A few long currents, not a sky full of lines.', make: fromScene(createConvergence) },
  ...FIRE_PROTOS.map((p) => ({ id: `fire-${p.key}`, group: 'fire-old' as const, label: `Fire ${p.key}`, title: p.title, note: p.note, make: p.make })),
  ...FIRE_STUDIES.map((p) => ({ id: `fire-${p.key}`, group: 'fire-old' as const, label: `Fire ${p.key}`, title: p.title, note: p.note, make: p.make })),
  ...CONVERGENCE_PROTOS.map((p) => ({ id: `conv-${p.key}`, group: 'conv-old' as const, label: `Convergence ${p.key}`, title: p.title, note: p.note, make: p.make })),
  { id: 'conv-D', group: 'conv-old', label: 'Convergence D', title: LAKE_STUDIES[0].title, note: LAKE_STUDIES[0].note, make: LAKE_STUDIES[0].make },
  ...EARTH_PROTOS.filter((p) => p.key !== 'D').map((p) => ({ id: `earth-${p.key}`, group: 'earth-old' as const, label: `Earth ${p.key}`, title: p.title, note: p.note, make: p.make })),
];
