#!/usr/bin/env node
// `npm run check` — validates src/data/publications.yaml without building the site.
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { loadPublications, PublicationDataError, yearsOf, typeCounts, bibtex } from '../src/lib/pubs/index.mjs';

const root = new URL('../', import.meta.url);
const profile = parse(readFileSync(new URL('src/data/profile.yaml', root), 'utf8'));

try {
  const pubs = loadPublications(readFileSync(new URL('src/data/publications.yaml', root), 'utf8'), {
    topics: profile.themes.map((t) => t.id),
  });
  pubs.forEach(bibtex); // make sure every entry can produce BibTeX
  const types = typeCounts(pubs).map((t) => `${t.count} ${t.label.toLowerCase()}`).join(', ');
  console.log(`✔ ${pubs.length} publications OK (${types}; years ${yearsOf(pubs).join(', ')})`);
  if (process.argv.includes('--bibtex')) console.log('\n' + pubs.map(bibtex).join('\n\n'));
} catch (e) {
  if (e instanceof PublicationDataError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
