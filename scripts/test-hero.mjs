#!/usr/bin/env node
// Part of `npm test`: the home page's hero scene choice (src/lib/field/scenes/pick.mjs, inlined
// verbatim into the page's <head>).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickHeroScene } from '../src/lib/field/scenes/pick.mjs';

const meta = readFileSync(new URL('../src/lib/field/scenes/meta.ts', import.meta.url), 'utf8');
const HERO_IDS = JSON.parse(meta.match(/HERO_IDS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
const ok = (name) => console.log(`  ✔ ${name}`);

console.log('Hero scene choice');
assert.deepEqual(HERO_IDS, ['water', 'air', 'earth', 'fire', 'convergence']);
ok('the hero family is exactly Water, Air, Earth, Fire, Convergence');

// Deterministic: the random value maps onto the five scenes in equal fifths.
const at = (r) => HERO_IDS[pickHeroScene(HERO_IDS, null, () => r).index];
assert.deepEqual([0, 0.19999, 0.2, 0.39999, 0.4, 0.6, 0.8, 0.99999].map(at), ['water', 'water', 'air', 'air', 'earth', 'fire', 'convergence', 'convergence']);
assert.equal(at(1), 'convergence'); // never out of range, even at the edge
ok('each fifth of the random range selects one scene; never out of range');

// Overrides for review; anything else is ignored.
for (const id of HERO_IDS) assert.deepEqual(pickHeroScene(HERO_IDS, id.toUpperCase(), () => 0.5), { index: HERO_IDS.indexOf(id), forced: true });
for (const old of ['adapt', 'exchange', 'share', 'gather', 'nonsense', '', null]) {
  const r = pickHeroScene(HERO_IDS, old, () => 0.5);
  assert.equal(r.forced, false);
  assert.ok(HERO_IDS[r.index]);
}
ok('?scene=<element> forces that scene; research scene names and junk fall back to a random element');

// Sanity check of the real distribution (loose bounds; not a flaky statistical test).
const N = 200000;
const counts = Object.fromEntries(HERO_IDS.map((id) => [id, 0]));
for (let i = 0; i < N; i++) counts[HERO_IDS[pickHeroScene(HERO_IDS, null, Math.random).index]]++;
for (const id of HERO_IDS) assert.ok(Math.abs(counts[id] / N - 0.2) < 0.02, `${id}: ${counts[id]}`);
ok(`about 20% each over ${N.toLocaleString('en')} draws (${HERO_IDS.map((id) => `${id} ${((counts[id] / N) * 100).toFixed(1)}%`).join(', ')})`);

// Independent draws: repeats happen (no memory, no rotation).
let repeats = 0;
let prev = -1;
for (let i = 0; i < 1000; i++) {
  const k = pickHeroScene(HERO_IDS, null, Math.random).index;
  if (k === prev) repeats++;
  prev = k;
}
assert.ok(repeats > 100, `repeats: ${repeats}`);
ok(`consecutive repeats occur (${repeats} in 1000), as they should with independent draws`);
