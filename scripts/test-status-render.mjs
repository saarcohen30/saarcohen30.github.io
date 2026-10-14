#!/usr/bin/env node
// Part of `npm test`: how a conditionally accepted paper (status accepted-minor-revisions) renders.
// Builds the site twice into temporary folders: from the real data, and from a temporary copy with
// one synthetic conditionally accepted journal paper added (the real data file is never changed).
// Checks placement, filters, the paper page, exports, the CV, and that nothing else changed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'status-render-'));
const ID = 'fixture-conditional-journal-paper';
const FIXTURE = `
- id: ${ID}
  title: A Conditionally Accepted Journal Paper (Test Fixture)
  authors: [Saar Cohen, Noa Agmon]
  type: journal
  status: accepted-minor-revisions
  year: 2026
  venue:
    name: Journal of Artificial Intelligence Research
    acronym: JAIR
  themes: [collective-decisions]
`;
const step = (name) => console.log(`  ✔ ${name}`);
const build = (outDir, pubsFile) =>
  execFileSync(join(root, 'node_modules/.bin/astro'), ['build', '--outDir', outDir], { cwd: root, stdio: 'pipe', env: { ...process.env, ...(pubsFile && { PUBS_FILE: pubsFile }) } });

try {
  const data = join(tmp, 'publications.yaml');
  writeFileSync(data, readFileSync(join(root, 'src/data/publications.yaml'), 'utf8').trimEnd() + '\n' + FIXTURE);
  const base = join(tmp, 'base');
  const fx = join(tmp, 'fixture');
  build(base);
  build(fx, data);
  const page = (dir, p) => readFileSync(join(dir, p), 'utf8');

  console.log('Accepted with Minor Revisions');
  // Listing: in the Publications section (2026), never under Working papers or Under review.
  const list = page(fx, 'publications/index.html');
  const at = list.indexOf(`href="/publications/${ID}/"`);
  const sectionStart = list.lastIndexOf('<section', at);
  assert.match(list.slice(sectionStart, sectionStart + 200), /aria-labelledby="pub-h"/, 'listed with published and accepted work');
  assert.match(list.slice(list.lastIndexOf('data-year-group', at), at), /data-year-group="2026"/);
  const article = list.slice(list.lastIndexOf('<article', at), list.indexOf('</article>', at));
  assert.match(article, /data-types="journal"/);
  assert.match(article, /data-year="2026"/);
  assert.match(article, /data-stage="conditional"/);
  assert.match(article, /Journal of Artificial Intelligence Research/);
  assert.match(article, /\[Accepted with Minor Revisions\]/);
  assert.match(list, /accepted with minor revisions,/, 'the page summary counts it separately');
  step('listed with 2026 publications, tagged [Accepted with Minor Revisions]; not a working paper or under review');

  // Filters (the page script's rule: type AND year): Journal + 2026 includes it.
  const items = [...list.matchAll(/<article[^>]*data-types="([^"]*)"[^>]*data-year="([^"]*)"[^>]*>[\s\S]*?href="\/publications\/([^/]+)\//g)].map((m) => ({ types: m[1].split(' '), year: m[2], id: m[3] }));
  const pick = (type, year) => items.filter((x) => (!type || x.types.includes(type)) && (!year || x.year === year)).map((x) => x.id);
  assert.ok(pick('journal', '2026').includes(ID) && pick(null, '2026').includes(ID) && pick('journal').includes(ID));
  assert.ok(!pick('conference', '2026').includes(ID) && !pick('journal', '2025').includes(ID));
  assert.match(list, /data-facet="type"[\s\S]*?data-value="journal"/);
  step('filters: Journal, 2026 and Journal + 2026 include it; Conference + 2026 and 2025 do not');

  // Paper page: venue and status, nothing invented, nothing implying final publication.
  const detail = page(fx, `publications/${ID}/index.html`);
  assert.match(detail, /Journal of Artificial Intelligence Research/);
  assert.match(detail, /\[Accepted with Minor Revisions\]/);
  assert.ok(!/citation_(title|journal_title|publication_date)/.test(detail), 'no Google Scholar tags for a paper that is not final');
  const ld = JSON.parse(detail.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld.creativeWorkStatus, 'Accepted with minor revisions');
  assert.equal(ld.datePublished, undefined);
  assert.ok(!/vol\.|pp\.|doi\.org/.test(detail.slice(detail.indexOf('<main'))), 'no volume, pages or DOI');
  step('paper page: JAIR and the status; no publication date, volume, pages, DOI or Scholar tags');

  // Exports.
  const bib = page(fx, 'publications.bib');
  const entry = bib.slice(bib.indexOf('cohen2026conditionally'));
  assert.match(bib, /@article\{cohen2026conditionally/);
  assert.match(entry.slice(0, entry.indexOf('\n}')), /note\s+= \{Accepted with minor revisions\}/);
  assert.match(article, /Journal of Artificial Intelligence Research, 2026\. Accepted with minor revisions\./, 'citation text');
  step('BibTeX and citation text carry “Accepted with minor revisions”');

  // CV page: with journal articles, marked.
  const cv = page(fx, 'cv/index.html');
  const cvAt = cv.indexOf(`/publications/${ID}/`);
  assert.ok(cv.lastIndexOf('Journal articles', cvAt) > cv.lastIndexOf('Conference papers', cvAt));
  assert.match(cv.slice(cvAt, cvAt + 800), /\(accepted with minor revisions\)/);
  step('CV: listed with journal articles, marked (accepted with minor revisions)');

  // Homepage curation and every existing paper page are unchanged.
  const current = (html) => html.slice(html.indexOf('id="pubs-h"'), html.indexOf('</section>', html.indexOf('id="pubs-h"')));
  const examples = (html) => [...html.slice(html.indexOf('class="themes"')).matchAll(/<li[^>]*>\s*<a href="(\/publications\/[^"]+)"/g)].map((m) => m[1]);
  const home = page(fx, 'index.html');
  const homeBase = page(base, 'index.html');
  assert.equal(current(home), current(homeBase), 'Current work unchanged');
  assert.deepEqual(examples(home), examples(homeBase), 'card example papers unchanged');
  assert.ok(!home.includes(`/publications/${ID}/`), 'not shown on the home page');
  const ids = readdirSync(join(base, 'publications'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  // A new paper becomes a neighbour in the Previous / Next links of the papers beside it; apart from
  // those two links, every existing paper page must be byte-identical.
  const withoutNav = (html) => html.replace(/<a href="[^"]*" class="(prev|next)"[\s\S]*?<\/a>/g, '');
  const changed = ids.filter((id) => withoutNav(page(base, `publications/${id}/index.html`)) !== withoutNav(page(fx, `publications/${id}/index.html`)));
  assert.deepEqual(changed, [], 'existing paper pages are unchanged apart from Previous / Next');
  step(`home page selections unchanged; all ${ids.length} existing paper pages unchanged apart from Previous / Next`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
