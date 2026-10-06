#!/usr/bin/env node
// Part of `npm test`: builds the site into a temporary folder and checks how publication metadata
// renders: equal-contribution markers and their note, clean author names in every export, and the
// year every paper exposes to the year filter.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'render-test-'));
const SLUG = 'reflections-fragments-securing-llms-against-sequential-mosaic';
const EQUAL = ['Emanuele La Malfa', 'Saar Cohen', 'Gabriele La Malfa'];
const OTHERS = ['Mickel Liu', 'Christian Schroeder de Witt', 'Natasha Jaques', 'Michael J. Wooldridge'];
const NOTE = 'These authors contributed equally to this work.';
const step = (name) => console.log(`  ✔ ${name}`);

try {
  execFileSync(join(root, 'node_modules/.bin/astro'), ['build', '--outDir', out], { cwd: root, stdio: 'pipe' });
  const page = (p) => readFileSync(join(out, p), 'utf8');
  const articles = (html) => html.split('<article').slice(1).map((a) => a.slice(0, a.indexOf('</article>')));
  /** Names followed by a superscript mark, in order (markup: <span class="an"><span>Name</span><sup class="mark">*</sup></span>). */
  const marked = (html) => [...html.matchAll(/<span[^>]*>([^<]+)<\/span>\s*<sup class="mark[^"]*"[^>]*>\s*\*\s*<\/sup>/g)].map((m) => m[1].trim());

  console.log('Rendering');
  // Listing.
  const list = page('publications/index.html');
  const entries = articles(list);
  const entry = entries.find((a) => a.includes(`href="/publications/${SLUG}/"`));
  assert.deepEqual(marked(entry), EQUAL, 'listing: exactly the three equal authors are marked, in order');
  assert.ok(entry.includes(NOTE), 'listing: the explanatory note is real text in the entry');
  for (const name of OTHERS) assert.ok(!marked(entry).includes(name));
  const elsewhere = entries.filter((a) => a !== entry && /class="mark|class="author-note/.test(a));
  assert.equal(elsewhere.length, 0, 'no other publication shows a marker or note');
  step('listing: * on the three equal authors only, with the note; other papers unchanged');

  // Detail page.
  const detail = page(`publications/${SLUG}/index.html`);
  const head = detail.slice(detail.indexOf('<main'), detail.indexOf('ABSTRACT') > 0 ? detail.indexOf('ABSTRACT') : undefined);
  assert.deepEqual(marked(head), EQUAL, 'detail: exactly the three equal authors are marked');
  assert.ok(head.includes(NOTE), 'detail: the note is shown');
  assert.ok(head.includes('Emanuele La Malfa, Saar Cohen and Gabriele La Malfa contributed equally to this work.'), 'detail: one spoken note names the authors');
  assert.ok(/<sup class="mark[^"]*" aria-hidden="true"/.test(head), 'the symbol itself is hidden from assistive technology');
  step('detail page: markers, the note, and one spoken sentence naming the equal authors');

  // Exports and structured data keep names clean.
  const ld = [...detail.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const ldAuthors = JSON.stringify(ld).match(/"name":"[^"]*"/g) ?? [];
  assert.ok(ldAuthors.length > 0 && ldAuthors.every((n) => !n.includes('*')), 'JSON-LD names are clean');
  assert.ok(!/citation_author"[^>]*\*/.test(detail), 'citation meta names are clean');
  const bib = page('publications.bib');
  const authorLine = bib.split('\n').find((l) => l.includes('Emanuele La Malfa and Saar Cohen'));
  assert.equal(authorLine.trim(), `author        = {${[...EQUAL, ...OTHERS].join(' and ')}},`);
  assert.ok(!bib.includes('*'), 'BibTeX has no asterisks');
  // The Cite drawer's plain citation lists the names contiguously, with no symbols.
  const cite = entry.match(/Emanuele La Malfa, Saar Cohen, Gabriele La Malfa, Mickel Liu, Christian Schroeder de Witt, Natasha Jaques and Michael J\. Wooldridge\. Reflections and Fragments/);
  assert.ok(cite, 'the citation text lists all seven names, clean and in order');
  step('BibTeX, citation text and JSON-LD keep the author names clean and in order');

  // Year filter: every paper with a year exposes it, including working papers (from their date).
  const wp = entries.find((a) => a.includes(`href="/publications/${SLUG}/"`));
  assert.match(wp, /data-year="2026"/);
  const working = entries.filter((a) => /data-types="[^"]*working-paper/.test(a));
  assert.ok(working.length >= 4 && working.every((a) => /data-year="\d{4}"/.test(a)), 'all working papers carry their year');
  assert.match(list, /data-facet="year"[\s\S]*?data-value="2026"/);
  step('working papers expose their year to the year filter');
} finally {
  rmSync(out, { recursive: true, force: true });
}
