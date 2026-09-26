#!/usr/bin/env node
// `npm run check` — validates src/data/publications.yaml without building the site.
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { loadPublications, PublicationDataError, yearsOf, typeCounts, bibtex } from '../src/lib/pubs/index.mjs';

const root = new URL('../', import.meta.url);
const profile = parse(readFileSync(new URL('src/data/profile.yaml', root), 'utf8'));

try {
  const file = process.env.PUBS_FILE ? process.env.PUBS_FILE : new URL('src/data/publications.yaml', root);
  const pubs = loadPublications(readFileSync(file, 'utf8'), {
    topics: Object.keys(profile.topics),
  });
  pubs.forEach(bibtex); // make sure every entry can produce BibTeX
  const types = typeCounts(pubs).map((t) => `${t.count} ${t.label.toLowerCase()}`).join(', ');
  const review = pubs.filter((p) => p.isUnderReview).length;
  console.log(`✔ ${pubs.length} publications OK (${types}; ${review} under review; years ${yearsOf(pubs).join(', ')})`);
  if (process.argv.includes('--bibtex')) console.log('\n' + pubs.map(bibtex).join('\n\n'));
} catch (e) {
  if (e instanceof PublicationDataError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
