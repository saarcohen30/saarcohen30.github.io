#!/usr/bin/env node
// `npm run update-pub` — change an existing paper without editing YAML.
//
//   npm run update-pub -- attacker-in-the-mirror-anchored-bipolicy-self-play   by id
//   npm run update-pub -- "fair division"                                       search titles
//   npm run update-pub                                                          list and pick
//
// Shows the paper, offers a short menu (stage, venue, presentation, links, …), shows a summary of
// the result and asks before saving. Only this paper's lines change; the file is validated before
// and after writing and restored automatically on failure.
import { argv, exit } from 'node:process';
import { c, rl, ask, yes, choose, readFile, records, replaceRecord, safeWrite, describe, askTopics, fromDoi, normaliseId } from './lib/pubfile.mjs';
import { askAccepted, askPresentation, askLinks } from './add-publication.mjs';

async function pick(query) {
  const all = records(readFile());
  if (query && all.some((p) => p.id === query)) return all.find((p) => p.id === query);
  const q = (query ?? '').toLowerCase();
  const hits = q ? all.filter((p) => `${p.id} ${p.title}`.toLowerCase().includes(q)) : all;
  if (hits.length === 1) return hits[0];
  if (!hits.length) {
    console.log(c.yellow(`No paper matches “${query}”.`));
    return pick(await ask('Search titles'));
  }
  const id = await choose('Which paper?', hits.map((p) => ({ label: `${p.title}${p.venue?.acronym ? c.dim(` · ${p.venue.acronym} ${p.year}`) : p.status ? c.dim(` · ${p.status}`) : c.dim(' · working paper')}`, value: p.id })));
  return all.find((p) => p.id === id);
}

async function setStage(rec) {
  const types = rec.type ? [rec.type].flat() : [];
  const survey = types.includes('survey');
  const stage = await choose('Where is this paper now?', [
    { label: 'Public preprint only; not submitted anywhere (working paper)', value: 'working' },
    { label: 'Submitted and under review', value: 'under-review' },
    { label: 'Under revision', value: 'under-revision' },
    { label: 'Accepted, to appear', value: 'to-appear' },
    { label: 'Published (proceedings or issue out)', value: 'published' },
  ]);
  if (stage === 'working') {
    rec.type = 'working-paper';
    for (const k of ['status', 'venue', 'presentation', 'year', 'note']) delete rec[k];
    if (!rec.links?.arxiv && !rec.links?.paper && !rec.links?.pdf) {
      const a = await ask('A working paper must be public. arXiv id or URL');
      if (a) rec.links = { ...(rec.links ?? {}), [/^\d{4}\.\d{4,5}/.test(normaliseId(a)) ? 'arxiv' : 'paper']: normaliseId(a) };
    }
  } else if (stage === 'under-review' || stage === 'under-revision') {
    rec.status = stage;
    if (survey) rec.type = 'survey';
    else delete rec.type;
    for (const k of ['venue', 'presentation', 'year', 'note']) delete rec[k];
  } else if (stage === 'to-appear' || stage === 'published') {
    const accepted = types.includes('conference') || types.includes('journal');
    if (!accepted || !rec.venue) {
      rec.status = stage;
      await askAccepted(rec);
    } else rec.status = stage;
    if (stage === 'published') {
      const doi = await ask('DOI of the published version (optional; bare id or doi.org link)', rec.links?.doi ?? '');
      if (doi) {
        rec.links = { ...(rec.links ?? {}), doi: normaliseId(doi) };
        try {
          const m = await fromDoi(normaliseId(doi));
          if (m.pages && !rec.venue.pages && (await yes(`Crossref lists pages ${m.pages}. Add them?`, true))) rec.venue.pages = m.pages;
          if (m.links.paper && !rec.links.paper && (await yes(`Add the publisher page ${m.links.paper}?`, true))) rec.links.paper = m.links.paper;
        } catch {}
      }
      const paper = await ask('Official proceedings / publisher page (optional)', rec.links?.paper ?? '');
      if (paper) rec.links.paper = paper;
    }
  }
  if (rec.status === 'published') delete rec.status; // the default; keeps the file tidy
}

async function main() {
  console.log(c.bold('\nUpdate a publication') + c.dim('   Enter keeps the value in [brackets]. Nothing is saved until you confirm.\n'));
  const found = await pick(argv[2]);
  if (!found) return 1;
  const rec = structuredClone(found);
  for (;;) {
    console.log('\n' + describe(rec) + '\n');
    const what = await choose('What would you like to change?', [
      { label: 'Stage (working paper → under review → accepted → published)', value: 'stage' },
      { label: 'Venue, year, pages', value: 'venue' },
      { label: 'Presentation (oral, poster, spotlight …; online or in person)', value: 'presentation' },
      { label: 'Links (DOI, arXiv, PDF, code, project, slides, video …)', value: 'links' },
      { label: 'Title or authors', value: 'title' },
      { label: 'Abstract', value: 'abstract' },
      { label: 'Research themes', value: 'topics' },
      { label: 'Featured on the home page', value: 'featured' },
      { label: c.green('Save and finish'), value: 'save' },
      { label: 'Quit without saving', value: 'quit' },
    ]);
    if (what === 'quit') {
      console.log('Nothing was saved.');
      return 0;
    }
    if (what === 'save') break;
    if (what === 'stage') await setStage(rec);
    if (what === 'venue') {
      if (!rec.venue) console.log(c.yellow('This paper has no venue yet; change its stage to "accepted" first.'));
      else await askAccepted(rec);
      if (rec.status === 'published') delete rec.status;
    }
    if (what === 'presentation') {
      if (![rec.type].flat().includes('conference')) console.log(c.yellow('Presentation only applies to accepted conference papers.'));
      else await askPresentation(rec);
    }
    if (what === 'links') await askLinks(rec);
    if (what === 'title') {
      rec.title = await ask('Title', rec.title);
      rec.authors = (await ask('Authors, comma-separated', rec.authors.join(', '))).split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (what === 'abstract') {
      const a = await ask('Paste the abstract on one line ("-" removes it)', '');
      if (a === '-') delete rec.abstract;
      else if (a) rec.abstract = a;
    }
    if (what === 'topics') rec.topics = await askTopics(rec.topics ?? []);
    if (what === 'featured') {
      rec.featured = await yes('Feature it on the home page?', !!rec.featured);
      if (!rec.featured) delete rec.featured;
    }
  }
  const text = readFile();
  const res = safeWrite(replaceRecord(text, found.id, rec));
  if (!res.ok) {
    console.log(c.red(res.message));
    console.log('Nothing was saved.');
    return 1;
  }
  console.log(c.green('\n✔ Saved and validated.') + ` Preview: npm run dev, then open http://localhost:4321/publications/${rec.id}/`);
  console.log(c.dim('  Publish: git add -A && git commit -m "Update paper" && git push\n'));
  return 0;
}

const code = await main();
rl.close();
exit(code);
