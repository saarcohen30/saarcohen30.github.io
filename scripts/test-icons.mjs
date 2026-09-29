#!/usr/bin/env node
// Part of `npm test`: the external-link icon mapping. Every profile link and publication link kind
// has an icon, and each external service uses its own brand mark, not a stand-in drawing
// (ResearchGate was once shown as a generic network glyph).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { LINK_META } from '../src/lib/pubs/schema.mjs';

const src = readFileSync(new URL('../src/components/Icon.astro', import.meta.url), 'utf8');
const block = (name) => src.slice(src.indexOf(`const ${name}:`), src.indexOf('};', src.indexOf(`const ${name}:`)));
const keys = (b) => new Set([...b.matchAll(/^ {2}'?([a-z-]+)'?:/gm)].map((m) => m[1]));
const stroke = keys(block('stroke'));
const fill = keys(block('fill'));
const has = (k) => stroke.has(k) || fill.has(k);
const profile = parse(readFileSync(new URL('../src/data/profile.yaml', import.meta.url), 'utf8'));
const step = (name) => console.log(`  ✔ ${name}`);

console.log('External-link icons');
// Brand marks: the real marks, drawn in the foreground colour, never a line-icon stand-in.
for (const [kind, start] of [
  ['github', 'M8 0C3.58 0 0 3.58 0 8'],
  ['researchgate', 'M19.586 0c'],
  ['orcid', 'M72,36C72,55.884'],
]) {
  assert.ok(fill.has(kind) && !stroke.has(kind), `${kind} must be a brand mark`);
  assert.ok(block('fill').includes(start), `${kind} must use its official mark`);
}
step('github, researchgate and orcid use their own marks');
for (const l of profile.links) {
  assert.ok(has(l.kind), `profile link "${l.kind}" has no icon`);
  assert.ok(l.label?.trim(), `profile link "${l.kind}" needs a label (its accessible name)`);
}
assert.equal(profile.links.find((l) => l.kind === 'researchgate')?.label, 'ResearchGate');
step(`every profile link has an icon and a label (${profile.links.map((l) => l.kind).join(', ')})`);
for (const kind of Object.keys(LINK_META)) assert.ok(has(kind), `publication link "${kind}" has no icon`);
step(`every publication link kind has an icon (${Object.keys(LINK_META).join(', ')})`);
