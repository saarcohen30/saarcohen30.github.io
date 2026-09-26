#!/usr/bin/env node
// `npm run add-pub` — add a paper to src/data/publications.yaml by answering a few questions.
//
//   npm run add-pub -- 2609.29691                    prefill from an arXiv id (or arXiv URL)
//   npm run add-pub -- 10.24963/ijcai.2025/422       prefill from a DOI (or doi.org URL)
//   npm run add-pub                                  ask everything
//
// Nothing is written until you confirm the summary; the file is validated before and after
// writing and restored automatically if anything goes wrong.
import { argv, exit } from 'node:process';
import { pathToFileURL } from 'node:url';
import { PRESENTATION_META, MODE_META, LINK_META } from '../src/lib/pubs/schema.mjs';
import { c, rl, ask, yes, choose, fromDoi, fromArxiv, guessAcronym, normaliseId, isDoi, readFile, records, appendRecord, safeWrite, describe, askTopics } from './lib/pubfile.mjs';

const slugify = (title) =>
  title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter((w) => w && !['a', 'an', 'the', 'of', 'in', 'on', 'for', 'and', 'with', 'to', 'by', 'via'].includes(w))
    .slice(0, 7)
    .join('-');

/** Venue, year, pages and presentation for accepted work. Exported for update-pub. */
export async function askAccepted(rec, pre = {}) {
  const kind = await choose('Where was it accepted?', [
    { label: 'A conference', value: 'conference' },
    { label: 'A journal', value: 'journal' },
  ], pre.type === 'journal' ? 'journal' : 'conference');
  const types = [kind];
  if (await yes('Is it a survey paper?', [rec.type].flat().includes('survey'))) types.unshift('survey');
  rec.type = types.length === 1 ? types[0] : types;
  rec.status = (await yes('Is it already published (proceedings or issue out)? Answer no if it is accepted but still "to appear".', rec.status !== 'to-appear' && !!pre.links?.doi))
    ? 'published'
    : 'to-appear';
  rec.year = Number(await ask('Year', rec.year ?? pre.year ?? new Date().getFullYear()));
  const date = await ask('Date, only used to order papers within a year (YYYY-MM or YYYY-MM-DD, optional)', rec.date ?? pre.date ?? '');
  if (date) rec.date = date;
  else delete rec.date;
  const name = await ask('Full proceedings or journal name', rec.venue?.name ?? pre.venueName ?? '');
  const acronym = await ask('Short venue name shown in bold, e.g. NeurIPS (optional for journals)', rec.venue?.acronym ?? pre.venueAcronym ?? guessAcronym(name));
  rec.venue = { ...(rec.venue ?? {}), name, ...(acronym ? { acronym } : {}) };
  if (!acronym) delete rec.venue.acronym;
  const pages = await ask('Pages (optional)', rec.venue.pages ?? pre.pages ?? '');
  if (pages) rec.venue.pages = pages;
  for (const k of ['volume', 'number', 'publisher']) if (pre[k] && !rec.venue[k]) rec.venue[k] = pre[k];
  const note = await ask('Qualifier such as "Extended Abstract" (optional)', rec.note ?? '');
  if (note) rec.note = note;
  else delete rec.note;
  if (types.includes('conference')) await askPresentation(rec);
  else delete rec.presentation;
}

/** Oral / poster / … and online / in person. Only what the official programme states. */
export async function askPresentation(rec) {
  const cur = rec.presentation ? (typeof rec.presentation === 'string' ? { type: rec.presentation } : rec.presentation) : null;
  console.log(c.dim('Presentation: only record what the official programme says. Leave it empty if unsure.'));
  const type = await choose('How was it presented?', [
    { label: 'Not known / leave empty', value: '' },
    ...Object.entries(PRESENTATION_META).map(([k, v]) => ({ label: v.label, value: k })),
  ], cur?.type ?? '');
  if (!type) {
    delete rec.presentation;
    return;
  }
  const mode = await choose('Was it given online or in person?', [
    { label: 'Not recorded', value: '' },
    ...Object.entries(MODE_META).map(([k, v]) => ({ label: v.label, value: k })),
  ], cur?.mode ?? '');
  rec.presentation = mode ? { type, mode } : type;
}

export async function askLinks(rec, pre = {}) {
  console.log(c.dim('\nLinks: paste a URL (or a bare DOI / arXiv id). Enter keeps the value shown; type "-" to remove it.'));
  rec.links = rec.links ?? {};
  for (const kind of ['paper', 'pdf', 'arxiv', 'doi', 'openreview', 'code', 'project', 'slides', 'video', 'poster', 'data', 'supplement']) {
    const cur = rec.links[kind] ?? pre.links?.[kind];
    if (Array.isArray(cur)) {
      console.log(c.dim(`  ${LINK_META[kind].label}: several links (edit the file to change them)`));
      continue;
    }
    const v = await ask(`  ${LINK_META[kind].label}`, cur ?? '');
    if (v === '-' || !v) delete rec.links[kind];
    else rec.links[kind] = kind === 'doi' || kind === 'arxiv' ? normaliseId(v) : v;
  }
}

async function main() {
  console.log(c.bold('\nAdd a publication') + c.dim('   Enter accepts the value in [brackets]. Ctrl+C cancels; nothing is saved until you confirm.\n'));
  let pre = {};
  const source = normaliseId(argv[2] ?? (await ask('arXiv id or DOI to look up (optional; press Enter to type everything yourself)')));
  if (source) {
    try {
      pre = isDoi(source) ? await fromDoi(source) : await fromArxiv(source);
      console.log(c.green(`✔ Found “${pre.title}”`) + c.dim(` (${pre.authors.join(', ')})`));
      if (pre.comment) console.log(c.dim(`  arXiv comment: ${pre.comment}`));
      console.log();
    } catch (e) {
      console.log(c.yellow(`Could not look it up (${e.message}). Continuing by hand.\n`));
    }
  }

  const rec = { id: '', title: '', authors: [], links: {} };
  rec.title = await ask('Title', pre.title ?? '');
  rec.authors = (await ask('Authors, comma-separated (add * after a name for equal contribution)', pre.authors?.join(', ') ?? ''))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // The one question that decides type and status. An arXiv link never decides it.
  console.log();
  const stage = await choose('Where is this paper now?', [
    { label: 'Accepted or published at a conference or journal', value: 'accepted' },
    { label: 'Submitted and under review', value: 'under-review' },
    { label: 'Under revision (after reviews)', value: 'under-revision' },
    { label: 'Public preprint only; not submitted anywhere at the moment (working paper)', value: 'working' },
  ], pre.links?.doi ? 'accepted' : undefined);

  if (stage === 'working') {
    rec.type = 'working-paper';
    if (pre.date) rec.date = pre.date;
  } else if (stage === 'under-review' || stage === 'under-revision') {
    rec.status = stage;
    if (await yes('Is it a survey paper?', false)) rec.type = 'survey';
  } else await askAccepted(rec, pre);

  await askLinks(rec, pre);
  rec.topics = await askTopics();
  if (pre.abstract && (await yes('Use the abstract from the lookup?', true))) rec.abstract = pre.abstract;
  rec.featured = await yes('Feature it on the home page?', false);
  if (!rec.featured) delete rec.featured;

  const text = readFile();
  const existing = new Set(records(text).map((p) => p.id));
  let id = slugify(rec.title);
  while (existing.has(id)) id += '-2';
  rec.id = await ask('\nWeb address id (the paper will live at /publications/<id>/)', id);

  console.log('\n' + c.bold('Summary') + '\n' + describe(rec) + '\n');
  if (!(await yes('Save this paper?', true))) {
    console.log('Nothing was saved.');
    return 0;
  }
  const res = safeWrite(appendRecord(text, rec));
  if (!res.ok) {
    console.log(c.red(res.message));
    console.log('Nothing was saved. Run the command again, or edit src/data/publications.yaml by hand.');
    return 1;
  }
  console.log(c.green(`\n✔ Saved and validated.`) + ` Preview: npm run dev, then open http://localhost:4321/publications/${rec.id}/`);
  console.log(c.dim('  Publish: git add -A && git commit -m "Add paper" && git push\n'));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await main();
  rl.close();
  exit(code);
}
