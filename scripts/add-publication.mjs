#!/usr/bin/env node
// `npm run add-pub` — add a paper to the website by answering a few questions.
//
//   npm run add-pub -- 2609.29691                    look it up on arXiv (an arXiv URL works too)
//   npm run add-pub -- 10.24963/ijcai.2025/422       look it up by DOI (a doi.org URL works too)
//   npm run add-pub                                  type everything yourself
//
// Nothing is written until you confirm the summary; the file is validated before and after
// writing and restored automatically if anything goes wrong.
import { argv, exit } from 'node:process';
import { pathToFileURL } from 'node:url';
import { c, rl, ask, yes, choose, fromDoi, fromArxiv, guessAcronym, normaliseId, isDoi, readFile, records, appendRecord, safeWrite, describe, askTopics, LINK_LABELS } from './lib/pubfile.mjs';

const slugify = (title) =>
  title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter((w) => w && !['a', 'an', 'the', 'of', 'in', 'on', 'for', 'and', 'with', 'to', 'by', 'via'].includes(w))
    .slice(0, 7)
    .join('-');

/** The status question. The four stages are separate: an arXiv version never makes a paper a working paper. */
export const STATUS_OPTIONS = [
  { label: `Working Paper ${c.dim('(public preprint; not submitted anywhere and not under review)')}`, value: 'working' },
  { label: `Under Review ${c.dim('(submitted; waiting for a decision)')}`, value: 'under-review' },
  { label: `Accepted / To Appear ${c.dim('(accepted; proceedings or issue not out yet)')}`, value: 'to-appear' },
  { label: `Published ${c.dim('(proceedings or journal issue is out)')}`, value: 'published' },
];

/** Venue details for accepted or published work. `status` is the stage already chosen. Exported for update-pub. */
export async function askAccepted(rec, pre = {}, status = 'to-appear') {
  const types = [rec.type ?? []].flat();
  const kind = await choose('Conference or journal?', [
    { label: 'Conference', value: 'conference' },
    { label: 'Journal', value: 'journal' },
  ], types.includes('journal') || pre.type === 'journal' ? 'journal' : 'conference');
  const survey = types.includes('survey') ? await yes('Is it a survey paper?', true) : false;
  rec.type = survey ? ['survey', kind] : kind;
  rec.status = status;
  rec.year = Number(await ask('Year', rec.year ?? pre.year ?? new Date().getFullYear()));
  const name = await ask(`Full ${kind === 'journal' ? 'journal' : 'proceedings'} name, e.g. "Proceedings of the 40th Annual Conference on Neural Information Processing Systems"`, rec.venue?.name ?? pre.venueName ?? '');
  const acronym = await ask('Short venue name, shown in bold (e.g. NeurIPS; optional for journals)', rec.venue?.acronym ?? pre.venueAcronym ?? guessAcronym(name));
  rec.venue = { ...(rec.venue ?? {}), name };
  if (acronym) rec.venue.acronym = acronym;
  else delete rec.venue.acronym;
  for (const k of ['volume', 'number', 'publisher']) if (pre[k] && !rec.venue[k]) rec.venue[k] = pre[k];
  if (status === 'published') {
    const pages = await ask('Pages (optional)', rec.venue.pages ?? pre.pages ?? '');
    if (pages) rec.venue.pages = pages;
  }
  const note = await ask('Qualifier such as "Extended Abstract" (optional)', rec.note ?? '');
  if (note) rec.note = note;
  else delete rec.note;
  if (kind === 'conference') await askPresentation(rec);
  else delete rec.presentation;
}

/** Oral / spotlight / poster …, and how it was given. Only what the programme states; unknown is fine. */
export async function askPresentation(rec) {
  const cur = rec.presentation ? (typeof rec.presentation === 'string' ? { type: rec.presentation } : rec.presentation) : null;
  console.log(c.dim('\nPresentation: record only what the official programme says. "Unknown" is fine.'));
  const type = await choose('Presentation type?', [
    { label: 'Oral', value: 'oral' },
    { label: 'Spotlight', value: 'spotlight' },
    { label: 'Poster', value: 'poster' },
    { label: 'Other (contributed talk)', value: 'contributed-talk' },
    { label: 'Unknown / not specified', value: '' },
  ], cur?.type ?? '');
  if (!type) {
    delete rec.presentation;
    return;
  }
  const mode = await choose('Presentation mode?', [
    { label: 'In person', value: 'in-person' },
    { label: 'Online', value: 'online' },
    { label: 'Hybrid', value: 'hybrid' },
    { label: 'Not specified', value: '' },
  ], cur?.mode ?? '');
  rec.presentation = mode ? { type, mode } : type;
}

const COMMON_LINKS = ['arxiv', 'paper', 'doi', 'code', 'project'];
const MORE_LINKS = ['pdf', 'openreview', 'slides', 'video', 'poster', 'supplement', 'data'];

/** Ask for one link. Enter keeps what is shown, "-" removes it. */
export async function askLink(rec, kind, pre = {}) {
  rec.links = rec.links ?? {};
  const cur = rec.links[kind] ?? pre.links?.[kind];
  if (Array.isArray(cur)) {
    console.log(c.dim(`  ${LINK_LABELS[kind]}: several links (edit the data file to change them)`));
    return;
  }
  const hint = kind === 'arxiv' ? ' (id like 2609.29691, or the URL)' : kind === 'doi' ? ' (like 10.24963/ijcai.2025/422, or the doi.org URL)' : ' (URL)';
  const v = await ask(`  ${LINK_LABELS[kind]}${c.dim(hint)}`, cur ?? '');
  if (v === '-' || !v) delete rec.links[kind];
  else rec.links[kind] = kind === 'doi' || kind === 'arxiv' ? normaliseId(v) : v;
  if (!Object.keys(rec.links).length) delete rec.links;
}

export async function askLinks(rec, pre = {}) {
  console.log(c.bold('\nLinks') + c.dim('   Press Enter to skip (or keep what is shown). Type "-" to remove a link.'));
  for (const k of COMMON_LINKS) await askLink(rec, k, pre);
  if (await yes(`Add more links (${MORE_LINKS.map((k) => LINK_LABELS[k]).join(', ')})?`, false)) for (const k of MORE_LINKS) await askLink(rec, k, pre);
}

async function main() {
  console.log(c.bold('\nAdd a publication') + c.dim('   Enter accepts the value in [brackets]. Ctrl+C cancels; nothing is saved until you confirm.\n'));
  let pre = {};
  const source = normaliseId(argv[2] ?? (await ask('arXiv id or DOI to look up (or press Enter to type everything yourself)')));
  let confirmed = false;
  if (source) {
    try {
      pre = isDoi(source) ? await fromDoi(source) : await fromArxiv(source);
      console.log(c.bold('\nFound:\n'));
      console.log(`  ${c.dim('Title'.padEnd(9))} ${pre.title}`);
      console.log(`  ${c.dim('Authors'.padEnd(9))} ${pre.authors.join(', ')}`);
      if (pre.links.arxiv) console.log(`  ${c.dim('arXiv'.padEnd(9))} ${pre.links.arxiv}`);
      if (pre.links.doi) console.log(`  ${c.dim('DOI'.padEnd(9))} ${pre.links.doi}`);
      if (pre.venueName) console.log(`  ${c.dim('Venue'.padEnd(9))} ${pre.venueName}${pre.year ? ` (${pre.year})` : ''}`);
      if (pre.comment) console.log(`  ${c.dim('Comment'.padEnd(9))} ${pre.comment}`);
      console.log();
      confirmed = await yes('Is this correct?', true);
      if (!confirmed) console.log(c.dim('No problem: correct the title and authors below.'));
    } catch (e) {
      console.log(c.yellow(`Could not look it up (${e.message}). Continuing by hand.\n`));
    }
  }

  const rec = { id: '', title: pre.title ?? '', authors: pre.authors ?? [], links: {} };
  if (!confirmed) {
    rec.title = await ask('Title', pre.title ?? '');
    rec.authors = (await ask('Authors, comma-separated (add * after a name for equal contribution)', pre.authors?.join(', ') ?? ''))
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  console.log();
  const stage = await choose("What is the paper's current status?", STATUS_OPTIONS, pre.links?.doi ? 'published' : undefined);
  if (stage === 'working') {
    rec.type = 'working-paper';
    if (pre.date) rec.date = pre.date;
  } else if (stage === 'under-review') {
    rec.status = 'under-review';
    if (await yes('Is it a survey paper?', false)) rec.type = 'survey';
  } else await askAccepted(rec, pre, stage);

  await askLinks(rec, pre);
  if (stage === 'working' && !rec.links?.arxiv && !rec.links?.paper && !rec.links?.pdf) {
    console.log(c.yellow('A working paper must be public: add its arXiv id (or a PDF link).'));
    await askLink(rec, 'arxiv', pre);
  }
  rec.topics = await askTopics();
  if (!rec.topics.length) delete rec.topics;
  if (pre.abstract && (await yes('Use the abstract from the lookup?', true))) rec.abstract = pre.abstract;
  if (await yes('Feature it on the home page?', false)) rec.featured = true;
  if (rec.status === 'published') delete rec.status; // the default

  const text = readFile();
  const existing = new Set(records(text).map((p) => p.id));
  let id = slugify(rec.title);
  while (existing.has(id)) id += '-2';
  rec.id = await ask('\nWeb address (the paper will live at /publications/<this>/)', id);

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
  console.log(c.green(`\n✔ Saved and checked.`) + ` Preview: npm run dev, then open http://localhost:4321/publications/${rec.id}/`);
  console.log(c.dim('  Publish: git add -A && git commit -m "Add paper" && git push\n'));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await main();
  rl.close();
  exit(code);
}
