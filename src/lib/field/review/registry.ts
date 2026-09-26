// Everything the element review page can show, by id. Water, Air and Earth are the live scenes,
// wrapped unchanged (including their timed churn, as the hero runs it).
import type { SceneFactory } from '../core';
import { createWater } from '../elements/water';
import { createAir } from '../elements/air';
import { createEarth } from '../elements/earth';
import type { Proto, ProtoFactory } from './common';
import { FIRE_PROTOS } from './fire-protos';
import { FIRE_STUDIES } from './fire-studies';
import { EARTH_PROTOS } from './earth-protos';
import { CONVERGENCE_PROTOS } from './convergence-protos';
import { LAKE_STUDIES } from './lake-studies';

const fromScene =
  (factory: SceneFactory): ProtoFactory =>
  (w, h) => {
    const field = { x0: w * 0.04, x1: w * 0.96, y0: h * 0.06, y1: h * 0.94 };
    const s = factory({ width: w, height: h, field, density: (((field.x1 - field.x0) * (field.y1 - field.y0)) / 1e5) * 22, layout: 'side', seed: 30 });
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

export type Group = 'approved' | 'earth' | 'fire-new' | 'conv-new' | 'fire-old' | 'conv-old' | 'earth-old';

export interface Entry {
  id: string;
  group: Group;
  label: string;
  title: string;
  note: string;
  make: ProtoFactory;
}

export const ENTRIES: Entry[] = [
  { id: 'water', group: 'approved', label: 'Water', title: 'Approved', note: 'The live Water scene, unchanged. Pointer: a small ripple.', make: fromScene(createWater) },
  { id: 'air', group: 'approved', label: 'Air', title: 'Approved', note: 'The live Air scene, unchanged. Pointer: a local eddy.', make: fromScene(createAir) },
  {
    id: 'earth',
    group: 'earth',
    label: 'Earth D',
    title: 'Dune Field (production)',
    note: 'The live Earth scene (?scene=earth), refined from study D: dunes rendered analytically with smooth, anti-aliased crests, depth haze into darkness, grazing low light, fine grain and wind ripples; imperceptible migration, a slowly shifting light, and sand spraying off the crests. No pointer response.',
    make: fromScene(createEarth),
  },
  ...FIRE_STUDIES.map((p) => ({ id: `fire-${p.key}`, group: 'fire-new' as const, label: `Fire ${p.key}`, title: p.title, note: p.note, make: p.make })),
  ...LAKE_STUDIES.map((p) => ({ id: `conv-${p.key}`, group: 'conv-new' as const, label: `Convergence ${p.key}`, title: p.title, note: p.note, make: p.make })),
  ...FIRE_PROTOS.map((p) => ({ id: `fire-${p.key}`, group: 'fire-old' as const, label: `Fire ${p.key}`, title: p.title, note: p.note, make: p.make })),
  ...CONVERGENCE_PROTOS.map((p) => ({ id: `conv-${p.key}`, group: 'conv-old' as const, label: `Convergence ${p.key}`, title: p.title, note: p.note, make: p.make })),
  ...EARTH_PROTOS.filter((p) => p.key !== 'D').map((p) => ({ id: `earth-${p.key}`, group: 'earth-old' as const, label: `Earth ${p.key}`, title: p.title, note: p.note, make: p.make })),
];
