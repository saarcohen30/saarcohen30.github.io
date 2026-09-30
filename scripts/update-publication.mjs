#!/usr/bin/env node
// `npm run update-pub` — change an existing paper without editing any files.
//
//   npm run update-pub                      search your papers by title, then pick one
//   npm run update-pub -- "fair division"   start with a search
//   npm run update-pub -- <paper-id>        (advanced) go straight to one paper
//
// Pick what to change from a menu. Before anything is written you see every change
// ("Status: Under Review → Accepted / To Appear") and confirm. Only that paper's lines change;
// the file is checked before and after writing and restored automatically on failure.
import { argv, exit } from 'node:process';
import { c, rl, ask, yes, choose, readFile, records, replaceRecord, safeWrite, describe, askThemes, askTopics, fromDoi, normaliseId, stageOf, changes, printChanges } from './lib/pubfile.mjs';
import { askAccepted, askPresentation, askLinks, askLink, STATUS_OPTIONS } from './add-publication.mjs';

const line = (p) => `${p.title}${c.dim(` · ${p.venue?.acronym ? `${p.venue.acronym} ${p.year}` : stageOf(p)}`)}`;

async function pick(query) {
  const all = records(readFile());
  if (query && all.some((p) => p.id === query)) return all.find((p) => p.id === query);
  let q = query;
  for (;;) {
    if (q === undefined) q = await ask('Search publication (words from the title; press Enter to list all)');
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = all.filter((p) => words.every((w) => `${p.id} ${p.title} ${p.venue?.acronym ?? ''}`.toLowerCase().includes(w)));
    if (!hits.length) {
      console.log(c.yellow(`No paper matches “${q}”. Try other words.`));
      q = undefined;
      continue;
    }
    if (hits.length === 1) {
      console.log(`\n${line(hits[0])}`);
      if (await yes('Is this the paper?', true)) return hits[0];
      q = undefined;
      continue;
    }
    const id = await choose('Which paper? (type its number)', [...hits.map((p) => ({ label: line(p), value: p.id })), { label: c.dim('None of these: search again'), value: '' }]);
    if (id) return all.find((p) => p.id === id);
    q = undefined;
  }
}

/** Change the status; asks only what that status needs. */
async function setStatus(rec) {
  const now = stageOf(rec);
  console.log(c.dim(`Currently: ${now}`));
  const stage = await choose('New status?', [...STATUS_OPTIONS.slice(0, 2), { label: `Under Revision ${c.dim('(reviews back; revising)')}`, value: 'under-revision' }, ...STATUS_OPTIONS.slice(2)]);
  const types = [rec.type ?? []].flat();
  const survey = types.includes('survey');
  if (stage === 'working') {
    rec.type = 'working-paper';
    for (const k of ['status', 'venue', 'presentation', 'year', 'note']) delete rec[k];
    if (!rec.links?.arxiv && !rec.links?.paper && !rec.links?.pdf) {
      console.log(c.yellow('A working paper must be public: add its arXiv id.'));
      await askLink(rec, 'arxiv');
    }
  } else if (stage === 'under-review' || stage === 'under-revision') {
    // No longer a working paper, and not yet at a venue.
    rec.status = stage;
    if (survey) rec.type = 'survey';
    else delete rec.type;
    for (const k of ['venue', 'presentation', 'year', 'note']) delete rec[k];
  } else {
    const hasVenue = (types.includes('conference') || types.includes('journal')) && rec.venue;
    if (!hasVenue) {
      console.log(c.dim('\nWhere was it accepted?'));
      await askAccepted(rec, {}, stage);
    } else rec.status = stage;
    if (stage === 'published') {
      const doi = await ask('DOI of the published version (optional; bare id or doi.org link)', rec.links?.doi ?? '');
      if (doi) {
        rec.links = { ...(rec.links ?? {}), doi: normaliseId(doi) };
        try {
          const m = await fromDoi(normaliseId(doi));
          if (m.pages && !rec.venue.pages && (await yes(`Crossref lists pages ${m.pages}. Add them?`, true))) rec.venue.pages = m.pages;
          if (m.links.paper && !rec.links.paper && (await yes(`Use the publisher page ${m.links.paper}?`, true))) rec.links.paper = m.links.paper;
        } catch {}
      }
    }
    await askLink(rec, 'paper');
  }
  if (rec.status === 'published') delete rec.status; // the default
}

async function setType(rec) {
  const stage = stageOf(rec);
  if (stage === 'Working Paper' || stage === 'Under Review' || stage === 'Under Revision') {
    console.log(c.yellow(`A paper that is ${stage.toLowerCase()} has no conference/journal type yet. Change its status to Accepted or Published first.`));
    const survey = await yes('Is it a survey paper?', [rec.type ?? []].flat().includes('survey'));
    if (stage !== 'Working Paper') {
      if (survey) rec.type = 'survey';
      else delete rec.type;
    }
    return;
  }
  const types = [rec.type].flat();
  const kind = await choose('Conference or journal?', [
    { label: 'Conference', value: 'conference' },
    { label: 'Journal', value: 'journal' },
  ], types.includes('journal') ? 'journal' : 'conference');
  const survey = await yes('Is it a survey paper?', types.includes('survey'));
  rec.type = survey ? ['survey', kind] : kind;
  if (kind !== 'conference') delete rec.presentation;
}

const ONE_LINK = { arxiv: 'arxiv', doi: 'doi', official: 'paper', code: 'code', project: 'project', slides: 'slides', video: 'video' };

async function main() {
  console.log(c.bold('\nUpdate a publication') + c.dim('   Enter keeps the value in [brackets]. Nothing is saved until you confirm.\n'));
  const found = await pick(argv[2]);
  if (!found) return 1;
  const rec = structuredClone(found);
  for (;;) {
    console.log('\n' + describe(rec) + '\n');
    const what = await choose('What would you like to update?', [
      { label: 'Status (working paper → under review → accepted → published)', value: 'status' },
      { label: 'Venue (name, year, pages)', value: 'venue' },
      { label: 'Publication type (conference / journal / survey)', value: 'type' },
      { label: 'Presentation (oral, spotlight, poster …; in person / online / hybrid)', value: 'presentation' },
      { label: 'arXiv', value: 'arxiv' },
      { label: 'DOI', value: 'doi' },
      { label: 'Official publication URL', value: 'official' },
      { label: 'GitHub / code', value: 'code' },
      { label: 'Project page', value: 'project' },
      { label: 'Slides', value: 'slides' },
      { label: 'Video', value: 'video' },
      { label: 'Authors, title or year', value: 'title' },
      { label: 'Other (abstract, research themes, featured, note, more links, topics)', value: 'other' },
      { label: c.green('Review changes and save'), value: 'save' },
      { label: 'Quit without saving', value: 'quit' },
    ]);
    if (what === 'quit') {
      console.log('Nothing was saved.');
      return 0;
    }
    if (what === 'save') break;
    if (what === 'status') await setStatus(rec);
    if (what === 'type') await setType(rec);
    if (what === 'venue') {
      if (!rec.venue) console.log(c.yellow('This paper has no venue yet: change its status to Accepted / To Appear first (option 1).'));
      else await askAccepted(rec, {}, rec.status ?? 'published');
      if (rec.status === 'published') delete rec.status;
    }
    if (what === 'presentation') {
      if (![rec.type ?? []].flat().includes('conference')) console.log(c.yellow('Presentation applies only to accepted conference papers.'));
      else await askPresentation(rec);
    }
    if (ONE_LINK[what]) {
      console.log(c.dim('Paste the new value, press Enter to keep it, or type "-" to remove it.'));
      await askLink(rec, ONE_LINK[what]);
    }
    if (what === 'title') {
      rec.title = await ask('Title', rec.title);
      rec.authors = (await ask('Authors, comma-separated', rec.authors.join(', '))).split(',').map((s) => s.trim()).filter(Boolean);
      if (rec.venue) rec.year = Number(await ask('Year', rec.year));
    }
    if (what === 'other') {
      const o = await choose('Which?', [
        { label: 'Abstract', value: 'abstract' },
        { label: 'Research themes (which "What I work on" themes it supports)', value: 'themes' },
        { label: 'Featured on the home page', value: 'featured' },
        { label: 'Note (e.g. "Extended Abstract")', value: 'note' },
        { label: 'All links (PDF, OpenReview, poster, supplement, dataset …)', value: 'links' },
        { label: 'Topics (used for related papers)', value: 'topics' },
      ]);
      if (o === 'abstract') {
        const a = await ask('Paste the abstract on one line ("-" removes it)', '');
        if (a === '-') delete rec.abstract;
        else if (a) rec.abstract = a;
      }
      if (o === 'themes') {
        rec.themes = await askThemes(rec.themes ?? []);
        if (!rec.themes.length) delete rec.themes;
      }
      if (o === 'topics') {
        rec.topics = await askTopics(rec.topics ?? []);
        if (!rec.topics.length) delete rec.topics;
      }
      if (o === 'featured') {
        rec.featured = await yes('Feature it on the home page?', !!rec.featured);
        if (!rec.featured) delete rec.featured;
      }
      if (o === 'note') {
        const n = await ask('Note ("-" removes it)', rec.note ?? '');
        if (n === '-' || !n) delete rec.note;
        else rec.note = n;
      }
      if (o === 'links') await askLinks(rec);
    }
  }
  const diff = changes(found, rec);
  if (!diff.length) {
    console.log('\nNo changes. Nothing was saved.');
    return 0;
  }
  printChanges(diff);
  if (!(await yes('Apply these changes?', false))) {
    console.log('Nothing was saved.');
    return 0;
  }
  const res = safeWrite(replaceRecord(readFile(), found.id, rec));
  if (!res.ok) {
    console.log(c.red(res.message));
    console.log('Nothing was saved.');
    return 1;
  }
  console.log(c.green('\n✔ Saved and checked.') + ` Preview: npm run dev, then open http://localhost:4321/publications/${rec.id}/`);
  console.log(c.dim('  Publish: git add -A && git commit -m "Update paper" && git push\n'));
  return 0;
}

const code = await main();
rl.close();
exit(code);
