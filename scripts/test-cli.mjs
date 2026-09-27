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
  run('add-publication.mjs', ['', 'A Test Paper on Flows', 'Saar Cohen, Jane Doe', '1', '2609.12345', '', '', 'https://github.com/x/y', '', 'n', '', 'n', 'cli-test-paper', 'y']);
  let r = rec();
  assert.equal(r.type, 'working-paper');
  assert.equal(r.links.arxiv, '2609.12345');
  assert.equal(r.links.code, 'https://github.com/x/y');
  step('add a working paper with an arXiv id and a GitHub link');

  // Working paper → Under review (found by searching the title; no id needed).
  run('update-publication.mjs', ['test paper flows', 'y', '1', '2', '14', 'y']);
  r = rec();
  assert.equal(r.status, 'under-review');
  assert.equal(r.type, undefined, 'no longer a working paper');
  step('working paper → under review (and no longer a working paper)');

  // Under review → Accepted / to appear, with venue and presentation.
  run('update-publication.mjs', ['test paper flows', 'y', '1', '4', '1', '2027', 'Proceedings of the 41st Annual Conference on Neural Information Processing Systems', '', '', '1', '3', 'https://example.org/paper', '14', 'y']);
  r = rec();
  assert.equal(r.type, 'conference');
  assert.equal(r.status, 'to-appear');
  assert.equal(r.venue.acronym, 'NeurIPS');
  assert.equal(r.year, 2027);
  assert.deepEqual(r.presentation, { type: 'oral', mode: 'hybrid' });
  assert.equal(r.links.paper, 'https://example.org/paper');
  step('under review → accepted / to appear (venue, year, oral · hybrid, official URL)');

  // Accepted → Published.
  run('update-publication.mjs', ['test paper flows', 'y', '1', '5', '', '', '14', 'y']);
  r = rec();
  assert.equal(r.status, undefined, 'published is the default');
  assert.equal(r.type, 'conference');
  step('accepted → published');

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
