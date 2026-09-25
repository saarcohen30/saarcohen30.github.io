#!/usr/bin/env node
// `npm run add-pub` — add a paper to src/data/publications.yaml interactively.
//
//   npm run add-pub                         ask everything
//   npm run add-pub -- 10.24963/ijcai.2025/422   prefill from a DOI (Crossref)
//   npm run add-pub -- 2505.18289           prefill from an arXiv id
//
// The new record is validated with the same schema as the build before it is written.
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, argv, exit } from 'node:process';
import { parse, stringify } from 'yaml';
import { loadPublications, PublicationDataError } from '../src/lib/pubs/index.mjs';
import { PRESENTATION_META, LINK_META } from '../src/lib/pubs/schema.mjs';

const ROOT = new URL('../', import.meta.url);
const FILE = new URL('src/data/publications.yaml', ROOT);
const profile = parse(readFileSync(new URL('src/data/profile.yaml', ROOT), 'utf8'));
const themes = profile.themes;

const c = { dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m` };
const rl = createInterface({ input: stdin, output: stdout });
async function ask(question, fallback = '') {
  const hint = fallback ? c.dim(` [${String(fallback).length > 60 ? String(fallback).slice(0, 57) + '…' : fallback}]`) : '';
  const answer = (await rl.question(`${question}${hint}: `)).trim();
  return answer || String(fallback ?? '');
}
const yes = async (q, def = false) => {
  const a = (await rl.question(`${q} ${c.dim(def ? '[Y/n]' : '[y/N]')}: `)).trim().toLowerCase();
  return a ? a.startsWith('y') : def;
};

// ------------------------------------------------------------------ prefill sources
const clean = (s) =>
  (s ?? '')
    .replace(/<jats:title>.*?<\/jats:title>/gs, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    // Simple inline maths from arXiv ($n$, $\log k$) becomes plain text.
    .replace(/\$([^$]{1,60})\$/g, (_, m) =>
      m.replace(/\\log/g, 'log').replace(/\\in/g, ' ∈ ').replace(/\\ge(q)?/g, '≥').replace(/\\le(q)?/g, '≤').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim(),
    )
    .replace(/\s+/g, ' ')
    .trim();

const VENUES = [
  [/Autonomous Agents and Multi-?[Aa]gent Systems/, 'AAMAS'],
  [/International Joint Conference on Artificial Intelligence/, 'IJCAI'],
  [/AAAI Conference on Artificial Intelligence/, 'AAAI'],
  [/European Conference on Artificial Intelligence/, 'ECAI'],
  [/Artificial Intelligence and Statistics/, 'AISTATS'],
  [/Neural Information Processing Systems/, 'NeurIPS'],
  [/International Conference on Machine Learning/, 'ICML'],
  [/International Conference on Learning Representations/, 'ICLR'],
  [/Economics and Computation/, 'EC'],
  [/Web and Internet Economics/, 'WINE'],
];
const guessAcronym = (name) => VENUES.find(([re]) => re.test(name ?? ''))?.[1] ?? '';

async function fromDoi(doi) {
  const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  if (!res.ok) throw new Error(`Crossref returned ${res.status}`);
  const m = (await res.json()).message;
  const year = m.issued?.['date-parts']?.[0]?.[0];
  const parts = m.issued?.['date-parts']?.[0] ?? [];
  const venue = m['container-title']?.[0] ?? m['event']?.name ?? '';
  return {
    title: clean(m.title?.[0]),
    authors: (m.author ?? []).map((a) => [a.given, a.family].filter(Boolean).join(' ')),
    year,
    date: parts.length >= 2 ? `${parts[0]}-${String(parts[1]).padStart(2, '0')}${parts[2] ? '-' + String(parts[2]).padStart(2, '0') : ''}` : undefined,
    type: m.type === 'journal-article' ? 'journal' : 'conference',
    venueName: venue,
    venueAcronym: guessAcronym(venue),
    pages: m.page?.replace('-', '–'),
    volume: m.volume,
    number: m.issue,
    publisher: m.type === 'journal-article' ? m.publisher : undefined,
    abstract: clean(m.abstract),
    links: { doi, paper: m.resource?.primary?.URL },
  };
}

async function fromArxiv(id) {
  const xml = await (await fetch(`https://export.arxiv.org/api/query?id_list=${id}`)).text();
  const entry = xml.split('<entry>')[1];
  if (!entry) throw new Error('arXiv id not found');
  const pick = (tag) => clean(entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]);
  return {
    title: pick('title'),
    authors: [...entry.matchAll(/<name>(.*?)<\/name>/g)].map((m) => m[1]),
    year: Number(pick('published').slice(0, 4)),
    date: pick('published').slice(0, 10),
    abstract: pick('summary'),
    links: { arxiv: id.replace(/v\d+$/, '') },
  };
}

// ------------------------------------------------------------------ helpers
const slugify = (title) =>
  title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter((w) => w && !['a', 'an', 'the', 'of', 'in', 'on', 'for', 'and', 'with', 'to', 'by', 'via'].includes(w))
    .slice(0, 7)
    .join('-');

const scalar = (v) => stringify(v, { lineWidth: 0 }).trim();

function toYaml(rec) {
  const lines = [`- id: ${rec.id}`, `  title: ${scalar(rec.title)}`];
  if (rec.note) lines.push(`  note: ${scalar(rec.note)}`);
  lines.push(`  authors: [${rec.authors.map((a) => (/[,:[\]{}#&*!|>'"%@`]/.test(a) ? scalar(a) : a)).join(', ')}]`);
  if (rec.type) lines.push(`  type: ${Array.isArray(rec.type) ? `[${rec.type.join(', ')}]` : rec.type}`);
  if (rec.status && rec.status !== 'published') lines.push(`  status: ${rec.status}`);
  if (rec.presentation) lines.push(`  presentation: ${rec.presentation}`);
  if (rec.year) lines.push(`  year: ${rec.year}`);
  if (rec.date) lines.push(`  date: ${rec.date}`);
  if (rec.venue) {
    lines.push('  venue:');
    for (const [k, v] of Object.entries(rec.venue)) if (v) lines.push(`    ${k}: ${scalar(v)}`);
  }
  if (rec.featured) lines.push('  featured: true');
  if (rec.topics?.length) lines.push(`  topics: [${rec.topics.join(', ')}]`);
  const links = Object.entries(rec.links).filter(([, v]) => v);
  if (links.length) {
    lines.push('  links:');
    for (const [k, v] of links) lines.push(`    ${k}: ${k === 'arxiv' ? `"${v}"` : scalar(v)}`);
  }
  if (rec.abstract) {
    lines.push('  abstract: >-');
    const words = rec.abstract.split(' ');
    let line = '   ';
    for (const w of words) {
      if (line.length + w.length > 96) {
        lines.push(line);
        line = '   ';
      }
      line += ' ' + w;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

// ------------------------------------------------------------------ main
console.log(c.bold('\nAdd a publication') + c.dim('  (press Enter to accept [defaults]; Ctrl+C to abort)\n'));

let pre = {};
let source = argv[2] ?? (await ask('DOI or arXiv id to prefill from (optional)'));
source = source.replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^https?:\/\/arxiv\.org\/(abs|pdf)\//, '').replace(/^arxiv:/i, '');
if (source) {
  try {
    pre = /^10\.\d{4,9}\//.test(source) ? await fromDoi(source) : await fromArxiv(source);
    console.log(c.green(`✔ Found “${pre.title}”\n`));
  } catch (e) {
    console.log(c.red(`Could not prefill (${e.message}). Continuing manually.\n`));
  }
}

const title = await ask('Title', pre.title);
const authors = (await ask('Authors, comma-separated (append * for equal contribution)', pre.authors?.join(', ')))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Where is the paper in its life? This decides type and status; an arXiv link never does.
console.log(c.dim('\nStage: 1) accepted or published  2) under review  3) under revision  4) public working paper (preprint, not under review)'));
let stage = '';
while (!['1', '2', '3', '4'].includes(stage)) stage = await ask('Stage', pre.links?.doi ? '1' : '');

const rec = { id: '', title, authors, links: {} };
if (stage === '4') {
  rec.type = 'working-paper';
  if (pre.date) rec.date = pre.date;
} else if (stage === '2' || stage === '3') {
  rec.status = stage === '2' ? 'under-review' : 'under-revision';
  if (await yes('Is it a survey?', false)) rec.type = 'survey';
} else {
  const kind = await ask('Venue type: 1) conference  2) journal', pre.type === 'journal' ? '2' : '1');
  const types = [kind === '2' ? 'journal' : 'conference'];
  if (await yes('Is it a survey?', false)) types.unshift('survey');
  rec.type = types.length === 1 ? types[0] : types;
  rec.status = (await yes('Already published (proceedings/journal out)? No = accepted, to appear', true)) ? 'published' : 'to-appear';
  rec.year = Number(await ask('Year', pre.year));
  const date = await ask('Date (YYYY-MM or YYYY-MM-DD, only used for ordering; optional)', pre.date);
  if (date) rec.date = date;
  const name = await ask('Venue — full proceedings or journal name', pre.venueName);
  const acronym = await ask('Venue — acronym shown in bold, e.g. "NeurIPS" (optional for journals)', pre.venueAcronym || guessAcronym(name));
  rec.venue = { name, ...(acronym && { acronym }) };
  const pages = await ask('Pages (optional)', pre.pages);
  if (pages) rec.venue.pages = pages;
  if (pre.volume) rec.venue.volume = pre.volume;
  if (pre.number) rec.venue.number = pre.number;
  if (pre.publisher) rec.venue.publisher = pre.publisher;
  const note = await ask('Note, e.g. "Extended Abstract" (optional)');
  if (note) rec.note = note;
  if (types.includes('conference')) {
    const keys = Object.keys(PRESENTATION_META);
    console.log(c.dim(`Presentation — only if the official programme says so: ${keys.map((k, i) => `${i + 1}) ${PRESENTATION_META[k].label}`).join('  ')}`));
    const pres = keys[Number(await ask('Presentation (number, optional)')) - 1];
    if (pres) rec.presentation = pres;
  }
}

console.log(c.dim('\nLinks — paste a URL or press Enter to skip. DOI and arXiv take bare ids.'));
for (const kind of ['paper', 'pdf', 'arxiv', 'doi', 'openreview', 'code']) {
  const v = await ask(`  ${LINK_META[kind].label}`, pre.links?.[kind]);
  if (v) rec.links[kind] = v.replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^https?:\/\/arxiv\.org\/abs\//, '');
}
const more = await ask(`  Other links as kind=url, space-separated (${['project', 'data', 'slides', 'poster', 'video', 'supplement'].join('/')})`);
for (const pair of more.split(/\s+/).filter(Boolean)) {
  const [k, ...rest] = pair.split('=');
  if (LINK_META[k]) rec.links[k] = rest.join('=');
}

console.log(c.dim(`\nTopics: ${themes.map((t, i) => `${i + 1}) ${t.title}`).join('  ')}`));
rec.topics = (await ask('Topics (numbers, optional)'))
  .split(/[,\s]+/)
  .map((n) => themes[Number(n) - 1]?.id)
  .filter(Boolean);

if (pre.abstract && (await yes('Include the abstract from the prefill source?', true))) rec.abstract = pre.abstract;
rec.featured = await yes('Feature it on the home page?', false);

const text = readFileSync(FILE, 'utf8');
const existing = new Set((parse(text) ?? []).map((p) => p.id));
let id = slugify(title);
while (existing.has(id)) id += '-2';
rec.id = await ask('\nURL id', id);

const block = toYaml(rec);
const next = `${text.trimEnd()}\n\n${block}\n`;
console.log('\n' + c.dim('─'.repeat(60)) + '\n' + block + '\n' + c.dim('─'.repeat(60)));

try {
  loadPublications(next, { topics: themes.map((t) => t.id) });
} catch (e) {
  if (e instanceof PublicationDataError) {
    console.log(c.red(e.message));
    console.log('Nothing was written. Fix the answers above (or edit the YAML by hand) and try again.');
    rl.close();
    exit(1);
  }
  throw e;
}

if (await yes('Write this record?', true)) {
  writeFileSync(FILE, next);
  console.log(c.green(`\n✔ Added. Preview with \`npm run dev\` → http://localhost:4321/publications/${rec.id}/`));
  console.log(c.dim('  Then commit and push; the site redeploys automatically.\n'));
} else console.log('Nothing was written.');
rl.close();
