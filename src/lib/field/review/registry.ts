// Everything the element review page can show, by id. Water and Air are the live scenes, wrapped
// unchanged (including their timed churn, as the hero runs it).
import type { SceneFactory } from '../core';
import { createWater } from '../elements/water';
import { createAir } from '../elements/air';
import type { Proto, ProtoFactory } from './common';
import { FIRE_PROTOS } from './fire-protos';
import { EARTH_PROTOS } from './earth-protos';
import { CONVERGENCE_PROTOS } from './convergence-protos';

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

export interface Entry {
  id: string;
  group: 'ref' | 'fire' | 'earth' | 'conv';
  label: string;
  title: string;
  note: string;
  make: ProtoFactory;
}

export const ENTRIES: Entry[] = [
  { id: 'water', group: 'ref', label: 'Water', title: 'Approved', note: 'The live Water scene, unchanged. Pointer: a small ripple.', make: fromScene(createWater) },
  { id: 'air', group: 'ref', label: 'Air', title: 'Approved', note: 'The live Air scene, unchanged. Pointer: a local eddy.', make: fromScene(createAir) },
  ...FIRE_PROTOS.map((p) => ({ id: `fire-${p.key}`, group: 'fire' as const, label: `Fire ${p.key}`, title: p.title, note: p.note, make: p.make })),
  ...EARTH_PROTOS.map((p) => ({ id: `earth-${p.key}`, group: 'earth' as const, label: `Earth ${p.key}`, title: p.title, note: p.note, make: p.make })),
  ...CONVERGENCE_PROTOS.map((p) => ({ id: `conv-${p.key}`, group: 'conv' as const, label: `Convergence ${p.key}`, title: p.title, note: p.note, make: p.make })),
];
