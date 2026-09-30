#!/usr/bin/env node
// `npm test` — the validator must reject contradictory records and accept valid lifecycles.
import assert from 'node:assert/strict';
import { stringify } from 'yaml';
import { loadPublications, PublicationDataError } from '../src/lib/pubs/index.mjs';

const base = { id: 'x', title: 'A Paper', authors: ['Saar Cohen'] };
const venue = { name: 'Proceedings of Something', acronym: 'SOME' };
const load = (rec) => loadPublications(stringify([{ ...base, ...rec }]));
const rejects = (name, rec, pattern) => {
  assert.throws(() => load(rec), (e) => e instanceof PublicationDataError && pattern.test(e.message), `should reject: ${name}`);
  console.log(`  ✔ rejects ${name}`);
};
const accepts = (name, rec, check = () => {}) => {
  check(load(rec)[0]);
  console.log(`  ✔ accepts ${name}`);
};

console.log('Lifecycle');
accepts('A. working paper (public preprint)', { type: 'working-paper', links: { arxiv: '2609.28333' } }, (p) => assert.equal(p.stage, 'working'));
accepts('B. under review (no type, no venue)', { status: 'under-review', links: { arxiv: '2609.28333' } }, (p) => assert.equal(p.stage, 'review'));
accepts('B. under revision survey', { type: 'survey', status: 'under-revision' });
accepts('C. accepted conference with arXiv', { type: 'conference', status: 'to-appear', presentation: 'oral', year: 2026, venue, links: { arxiv: '2605.08427' } }, (p) => {
  assert.equal(p.stage, 'accepted');
  assert.equal(p.primaryType, 'conference');
});
accepts('structured presentation with mode', { type: 'conference', presentation: { type: 'oral', mode: 'online' }, year: 2021, venue }, (p) => {
  assert.equal(p.presentationType, 'oral');
  assert.equal(p.presentationModeLabel, 'Online');
});
accepts('hybrid presentation mode', { type: 'conference', presentation: { type: 'poster', mode: 'hybrid' }, year: 2027, venue }, (p) => assert.equal(p.presentationModeLabel, 'Hybrid'));
rejects('unknown presentation mode', { type: 'conference', presentation: { type: 'oral', mode: 'telepathic' }, year: 2021, venue }, /mode: in-person \| online \| hybrid/);
accepts('D. published (status defaults)', { type: 'conference', year: 2026, venue }, (p) => assert.equal(p.status, 'published'));
accepts('journal survey', { type: ['survey', 'journal'], year: 2021, venue: { name: 'Current Robotics Reports' } });

console.log('Contradictions');
rejects('working paper + under review', { type: 'working-paper', status: 'under-review', links: { arxiv: '2609.28333' } }, /is not a working paper/);
rejects('working paper + published', { type: 'working-paper', status: 'published', links: { arxiv: '2609.28333' } }, /neither accepted nor published/);
rejects('working paper + to-appear', { type: 'working-paper', status: 'to-appear', links: { arxiv: '2609.28333' } }, /neither accepted nor published/);
rejects('working paper + conference', { type: ['working-paper', 'conference'], links: { arxiv: '2609.28333' } }, /cannot also be conference/);
rejects('working paper without public copy', { type: 'working-paper' }, /publicly readable/);
rejects('working paper with venue', { type: 'working-paper', venue, links: { arxiv: '2609.28333' } }, /no venue/);
rejects('conference + under review', { type: 'conference', status: 'under-review', year: 2026, venue }, /contradicts type/);
rejects('under review with venue', { status: 'under-review', venue }, /not public/);
rejects('to-appear without venue/year', { type: 'conference', status: 'to-appear' }, /need a year[\s\S]*venue\.name/);
rejects('no type and no review status', {}, /type is required/);
rejects('survey that appeared nowhere', { type: 'survey' }, /survey must also be/);
rejects('oral on a journal', { type: 'journal', presentation: 'oral', year: 2026, venue }, /only applies to conference/);
rejects('oral while under review', { type: 'survey', status: 'under-review', presentation: 'oral' }, /only applies to conference|only known once/);
rejects('preprint status (removed)', { type: 'working-paper', status: 'preprint', links: { arxiv: '2609.28333' } }, /status/);
rejects('malformed arXiv id', { type: 'working-paper', links: { arxiv: 'arXiv:2609.28333' } }, /bare arXiv id/);
rejects('malformed DOI', { type: 'conference', year: 2026, venue, links: { doi: 'https://doi.org/10.1/x' } }, /bare DOI/);
assert.throws(() => loadPublications(stringify([{ ...base, type: 'working-paper', links: { arxiv: '2609.28333' } }, { ...base, type: 'working-paper', links: { arxiv: '2609.28333' } }])), /duplicate id/);
console.log('  ✔ rejects duplicate ids');
assert.throws(
  () => loadPublications(stringify([{ ...base, id: 'a', type: 'working-paper', aliases: ['/old'], links: { arxiv: '2609.28333' } }, { ...base, id: 'b', type: 'working-paper', aliases: ['/old'], links: { arxiv: '2609.28333' } }])),
  /used by another publication/,
);
console.log('  ✔ rejects duplicate aliases');
const THEMES = ['collective-decisions', 'fair-allocation'];
const wp = { ...base, type: 'working-paper', links: { arxiv: '2609.28333' } };
assert.deepEqual(loadPublications(stringify([{ ...wp, themes: ['fair-allocation'] }]), { themes: THEMES })[0].themes, ['fair-allocation']);
assert.deepEqual(loadPublications(stringify([wp]), { themes: THEMES })[0].themes, []);
console.log('  ✔ accepts explicit research themes, or none');
assert.throws(() => loadPublications(stringify([{ ...wp, themes: ['clustering'] }]), { themes: THEMES }), /unknown research theme "clustering"/);
console.log('  ✔ rejects an unknown research theme (a topic is not a theme)');
console.log('\nAll schema tests passed.');
