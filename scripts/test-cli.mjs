#!/usr/bin/env node
// Part of `npm test`: drives add-pub and update-pub through a paper's whole life, on a temporary
// copy of the data (the real file is never touched), with answers typed as a person would.
// Offline: the paper is entered by hand, so no lookup is needed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'pubs-test-'));
const file = join(dir, 'publications.yaml');
copyFileSync(join(root, 'src/data/publications.yaml'), file);
const env = { ...process.env, PUBS_FILE: file, NO_COLOR: '1' };
const run = (script, answers, args = []) => execFileSync('node', [join(root, 'scripts', script), ...args], { env, input: answers.join('\n') + '\n', encoding: 'utf8' });
const rec = () => parse(readFileSync(file, 'utf8')).find((p) => p.id === 'cli-test-paper');
const step = (name) => console.log(`  ✔ ${name}`);

try {
  console.log('Publication tools (on a temporary copy)');
  // Add by hand as a working paper (no lookup).
  // Equal contribution: chosen by number; an out-of-range number and a single author are asked
  // again, then 1, 2. Themes: an invalid answer is asked again; then 2 = Fair allocation over time.
  run('add-publication.mjs', ['', 'A Test Paper on Flows', 'Saar Cohen, Jane Doe, John Roe', 'y', '4', '2', '1, 2', '1', '2609.12345', '', '', 'https://github.com/x/y', '', 'n', '7', '2', '', 'n', 'cli-test-paper', 'y']);
  let r = rec();
  assert.deepEqual(r.authors, ['Saar Cohen', 'Jane Doe', 'John Roe']);
  assert.deepEqual(r.authorNotes, [{ type: 'equal-contribution', authors: ['Saar Cohen', 'Jane Doe'] }]);
  step('add-pub records equal contribution by author number (bad numbers are asked again)');
  assert.equal(r.type, 'working-paper');
  assert.equal(r.links.arxiv, '2609.12345');
  assert.equal(r.links.code, 'https://github.com/x/y');
  assert.deepEqual(r.themes, ['fair-allocation']);
  assert.equal(r.topics, undefined);
  step('add a working paper with an arXiv id, a GitHub link and an explicit research theme');

  // Research themes of an existing paper: Other → Research themes (13, 2); several, then none.
  run('update-publication.mjs', ['test paper flows', 'y', '13', '2', '1, 3', '14', 'y']);
  assert.deepEqual(rec().themes, ['collective-decisions', 'multiagent-learning']);
  run('update-publication.mjs', ['test paper flows', 'y', '13', '2', 'none', '14', 'y']);
  assert.equal(rec().themes, undefined);
  run('update-publication.mjs', ['test paper flows', 'y', '13', '2', '2', '14', 'y']);
  assert.deepEqual(rec().themes, ['fair-allocation']);
  step('update-pub edits research themes (several, none, one)');

  // Equal contribution of an existing paper: Other → Equal contribution (13, 7): edit, remove, add.
  run('update-publication.mjs', ['test paper flows', 'y', '13', '7', 'y', '2, 3', '14', 'y']);
  assert.deepEqual(rec().authorNotes, [{ type: 'equal-contribution', authors: ['Jane Doe', 'John Roe'] }]);
  run('update-publication.mjs', ['test paper flows', 'y', '13', '7', 'n', '14', 'y']);
  assert.equal(rec().authorNotes, undefined);
  run('update-publication.mjs', ['test paper flows', 'y', '13', '7', 'y', '1, 2, 3', '14', 'y']);
  assert.deepEqual(rec().authorNotes, [{ type: 'equal-contribution', authors: ['Saar Cohen', 'Jane Doe', 'John Roe'] }]);
  // Renaming an author keeps the note valid: the changed name drops out of it.
  run('update-publication.mjs', ['test paper flows', 'y', '12', '', 'Saar Cohen, Jane Doe, John Q. Roe', '14', 'y']);
  assert.deepEqual(rec().authorNotes, [{ type: 'equal-contribution', authors: ['Saar Cohen', 'Jane Doe'] }]);
  assert.deepEqual(rec().authors, ['Saar Cohen', 'Jane Doe', 'John Q. Roe']);
  step('update-pub adds, edits and removes equal contribution; author renames keep it valid');

  // Working paper → Under review (found by searching the title; no id needed).
  run('update-publication.mjs', ['test paper flows', 'y', '1', '2', '14', 'y']);
  r = rec();
  assert.equal(r.status, 'under-review');
  assert.equal(r.type, undefined, 'no longer a working paper');
  step('working paper → under review (and no longer a working paper)');

  // Status menu in update-pub: 1 Working Paper, 2 Under Review, 3 Under Revision,
  // 4 Accepted with Minor Revisions, 5 Accepted / To Appear, 6 Published.
  // Under review → Accepted with Minor Revisions (a journal; no DOI, volume or pages asked).
  const jair = ['2', '2026', 'Journal of Artificial Intelligence Research', 'JAIR', '', ''];
  run('update-publication.mjs', ['test paper flows', 'y', '1', '4', ...jair, '14', 'y']);
  r = rec();
  assert.equal(r.status, 'accepted-minor-revisions');
  assert.equal(r.type, 'journal');
  assert.deepEqual(r.venue, { name: 'Journal of Artificial Intelligence Research', acronym: 'JAIR' });
  assert.equal(r.year, 2026);
  assert.deepEqual(r.links, { arxiv: '2609.12345', code: 'https://github.com/x/y' }, 'existing links kept; no DOI or official URL invented');
  step('under review → accepted with minor revisions (journal, venue and year; nothing invented)');

  // A correction: back to Under review removes the venue and type again.
  run('update-publication.mjs', ['test paper flows', 'y', '1', '2', '14', 'y']);
  r = rec();
  assert.equal(r.status, 'under-review');
  assert.equal(r.type, undefined);
  assert.equal(r.venue, undefined);
  step('accepted with minor revisions → under review (reversal leaves no stale venue)');

  // Under review → Accepted / to appear, with venue and presentation.
  run('update-publication.mjs', ['test paper flows', 'y', '1', '5', '1', '2027', 'Proceedings of the 41st Annual Conference on Neural Information Processing Systems', '', '', '1', '3', 'https://example.org/paper', '14', 'y']);
  r = rec();
  assert.equal(r.type, 'conference');
  assert.equal(r.status, 'to-appear');
  assert.equal(r.venue.acronym, 'NeurIPS');
  assert.equal(r.year, 2027);
  assert.deepEqual(r.presentation, { type: 'oral', mode: 'hybrid' });
  assert.equal(r.links.paper, 'https://example.org/paper');
  step('under review → accepted / to appear (venue, year, oral · hybrid, official URL)');

  // Conditional and final acceptance switch without re-entering the venue (only the status changes).
  run('update-publication.mjs', ['test paper flows', 'y', '1', '4', '', '14', 'y']);
  r = rec();
  assert.equal(r.status, 'accepted-minor-revisions');
  assert.equal(r.venue.acronym, 'NeurIPS');
  assert.deepEqual(r.presentation, { type: 'oral', mode: 'hybrid' });
  run('update-publication.mjs', ['test paper flows', 'y', '1', '5', '', '14', 'y']);
  assert.equal(rec().status, 'to-appear');
  step('to appear ⇄ accepted with minor revisions keeps venue, year, presentation and links');

  // Accepted → Published.
  run('update-publication.mjs', ['test paper flows', 'y', '1', '6', '', '', '14', 'y']);
  r = rec();
  assert.equal(r.status, undefined, 'published is the default');
  assert.equal(r.type, 'conference');
  step('accepted → published');

  // add-pub: a new paper conditionally accepted at a journal (status 3 in add-pub's menu).
  run('add-publication.mjs', ['', 'A Conditionally Accepted Journal Paper', 'Saar Cohen, Jane Doe', 'n', '3', '2', '2026', 'Journal of Artificial Intelligence Research', 'JAIR', '', '', '', '', '', '', 'n', '', '', 'n', 'cli-conditional-paper', 'y']);
  const cond = parse(readFileSync(file, 'utf8')).find((p) => p.id === 'cli-conditional-paper');
  assert.equal(cond.status, 'accepted-minor-revisions');
  assert.equal(cond.type, 'journal');
  assert.equal(cond.year, 2026);
  assert.equal(cond.venue.acronym, 'JAIR');
  assert.equal(cond.featured, undefined);
  step('add-pub records a conditionally accepted journal paper');

  // Declining the preview writes nothing.
  const before = readFileSync(file, 'utf8');
  run('update-publication.mjs', ['test paper flows', 'y', '10', 'https://example.org/slides', '14', 'n']);
  assert.equal(readFileSync(file, 'utf8'), before);
  step('declining the change preview leaves the file untouched');

  // An invalid result is refused and the file is left as it was.
  process.env.PUBS_FILE = file;
  const { safeWrite, rl } = await import('./lib/pubfile.mjs');
  rl.close();
  const res = safeWrite(before.replace('- id: cli-test-paper', '- id: cli-test-paper\n  status: under-review'));
  assert.equal(res.ok, false);
  assert.equal(readFileSync(file, 'utf8'), before);
  step('an invalid change is refused; the file is unchanged');

  execFileSync('node', [join(root, 'scripts/validate-publications.mjs')], { env, encoding: 'utf8' });
  step('the resulting data validates');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
