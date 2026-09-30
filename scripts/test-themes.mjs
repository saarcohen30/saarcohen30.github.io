#!/usr/bin/env node
// Part of `npm test`: home-page research themes ("What I work on") come only from each paper's
// explicit `themes:` in publications.yaml, never from topics or title words. Pins the audited
// classification of September 2026.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { loadPublications } from '../src/lib/pubs/index.mjs';

const read = (f) => readFileSync(new URL(`../src/data/${f}`, import.meta.url), 'utf8');
const profile = parse(read('profile.yaml'));
const themeIds = profile.themes.map((t) => t.id);
const pubs = loadPublications(read('publications.yaml'), { topics: Object.keys(profile.topics), themes: themeIds });
const inTheme = (id) => pubs.filter((p) => p.themes.includes(id)).map((p) => p.id);
const byId = (id) => pubs.find((p) => p.id === id);
const step = (name) => console.log(`  ✔ ${name}`);

console.log('Research themes');
for (const t of profile.themes) assert.equal(t.topics, undefined, `theme "${t.id}" must not infer membership from topics`);
step('themes are explicit per paper (no topic-based inference in profile.yaml)');

// Online clustering is not fair allocation (nor any other theme).
assert.deepEqual(byId('delayed-assignments-online-non-centroid-clustering').themes, []);
step('the online clustering paper supports no home-page theme');

// Every paper with Nicholas Teh is an online fair-division paper and supports Fair allocation.
const teh = pubs.filter((p) => p.authors.some((a) => /Nicholas Teh/.test(a.name ?? a)));
assert.ok(teh.length >= 3);
for (const p of teh) assert.ok(p.themes.includes('fair-allocation'), `${p.id} should support Fair allocation over time`);
step(`all ${teh.length} papers with Nicholas Teh support Fair allocation over time`);

// Fair allocation is exactly the allocation / fair-division work.
assert.deepEqual(inTheme('fair-allocation').sort(), [
  'near-optimal-online-resource-allocation-random-order',
  'near-optimal-online-resource-allocation-random-order-extended-abstract',
  'online-fair-division-budget-constraints',
  'online-fair-division-oblivious-adversary',
  'online-house-allocation-subsidy',
]);
step('Fair allocation over time lists exactly the fair-division and resource-allocation papers');

// Keyword false positives fixed in the audit.
assert.ok(!byId('hierarchical-graph-probabilistic-recursive-reasoning').themes.includes('safe-principled-ai'), 'graph-based MARL is not principled & safe AI');
for (const id of ['leading-swarm-desired-consensus', 'spatial-consensus-prevention-robotic-swarms']) assert.ok(!byId(id).themes.includes('multiagent-learning'), `${id} involves no learning`);
step('no "graph" or "robot" keyword false positives');
