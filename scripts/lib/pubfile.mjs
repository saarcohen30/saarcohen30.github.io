// Shared plumbing for the publication CLIs (add-pub, update-pub):
// prompts, DOI/arXiv lookups, a canonical record serializer, record-level editing of
// src/data/publications.yaml (other records, comments and layout stay untouched), and a safe
// write: validate → write atomically → re-validate → restore the previous file on failure.
import { readFileSync, writeFileSync, renameSync, copyFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { parse, stringify } from 'yaml';
import { loadPublications, PublicationDataError } from '../../src/lib/pubs/index.mjs';

export const ROOT = new URL('../../', import.meta.url);
export const FILE = new URL('src/data/publications.yaml', ROOT);
export const profile = parse(readFileSync(new URL('src/data/profile.yaml', ROOT), 'utf8'));
export const topicIds = Object.keys(profile.topics);
export const themes = profile.themes;

// ------------------------------------------------------------------ terminal
export const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};
export const rl = createInterface({ input: stdin, output: stdout });
export async function ask(question, fallback = '') {
  const shown = fallback === undefined || fallback === null ? '' : String(fallback);
  const hint = shown ? c.dim(` [${shown.length > 60 ? shown.slice(0, 57) + '…' : shown}]`) : '';
  const answer = (await rl.question(`${question}${hint}: `)).trim();
  return answer || shown;
}
export async function yes(q, def = false) {
  const a = (await rl.question(`${q} ${c.dim(def ? '[Y/n]' : '[y/N]')}: `)).trim().toLowerCase();
  return a ? a.startsWith('y') : def;
}
/** Numbered choice; returns the chosen option's value (or `def`). */
export async function choose(q, options, def) {
  console.log(options.map((o, i) => `  ${c.bold(String(i + 1))}) ${o.label}`).join('\n'));
  const defIndex = options.findIndex((o) => o.value === def);
  for (;;) {
    const a = await ask(q, defIndex >= 0 ? String(defIndex + 1) : '');
    const n = Number(a);
    if (n >= 1 && n <= options.length) return options[n - 1].value;
    if (!a && def === undefined) return undefined;
    console.log(c.yellow(`  Please type a number from 1 to ${options.length}.`));
  }
}

// ------------------------------------------------------------------ lookups
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
export const guessAcronym = (name) => VENUES.find(([re]) => re.test(name ?? ''))?.[1] ?? '';

export const normaliseId = (s) =>
  s.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^https?:\/\/arxiv\.org\/(abs|pdf)\//, '').replace(/^arxiv:/i, '').replace(/\.pdf$/, '');
export const isDoi = (s) => /^10\.\d{4,9}\//.test(s);

export async function fromDoi(doi) {
  const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  if (!res.ok) throw new Error(`Crossref returned ${res.status}`);
  const m = (await res.json()).message;
  const parts = m.issued?.['date-parts']?.[0] ?? [];
  const venue = m['container-title']?.[0] ?? m['event']?.name ?? '';
  return {
    title: clean(m.title?.[0]),
    authors: (m.author ?? []).map((a) => [a.given, a.family].filter(Boolean).join(' ')),
    year: parts[0],
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

export async function fromArxiv(id) {
  const xml = await (await fetch(`https://export.arxiv.org/api/query?id_list=${id}`)).text();
  const entry = xml.split('<entry>')[1];
  if (!entry || /<title>Error<\/title>/.test(entry)) throw new Error('arXiv id not found');
  const pick = (tag) => clean(entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]);
  return {
    title: pick('title'),
    authors: [...entry.matchAll(/<name>(.*?)<\/name>/g)].map((m) => m[1]),
    year: Number(pick('published').slice(0, 4)),
    date: pick('published').slice(0, 10),
    abstract: pick('summary'),
    comment: pick('arxiv:comment'),
    links: { arxiv: id.replace(/v\d+$/, '') },
  };
}

// ------------------------------------------------------------------ canonical serializer
const scalar = (v) => stringify(v, { lineWidth: 0 }).trim();
const plainOk = (s) => /^[\w .()\-–/’'&]+$/.test(s) && !/^[-?:,[\]{}#&*!|>'"%@`]/.test(s) && !/: /.test(s);
const item = (s) => (plainOk(String(s)) ? String(s) : scalar(String(s)));
const LINK_ORDER = ['paper', 'pdf', 'arxiv', 'doi', 'openreview', 'code', 'project', 'data', 'slides', 'poster', 'video', 'supplement'];
const VENUE_ORDER = ['name', 'acronym', 'volume', 'number', 'pages', 'publisher', 'series'];

/** Serialize one record in the file's layout. `comments` maps top-level keys to trailing comments. */
export function serialize(rec, comments = {}) {
  const L = [];
  const put = (key, text) => L.push(`  ${key}: ${text}${comments[key] ? `   # ${comments[key]}` : ''}`);
  L.push(`- id: ${rec.id}`);
  for (const line of comments.__lines ?? []) L.push(`  ${line}`);
  put('title', scalar(rec.title));
  if (rec.note) put('note', scalar(rec.note));
  put('authors', `[${rec.authors.map(item).join(', ')}]`);
  if (rec.type) put('type', Array.isArray(rec.type) ? `[${rec.type.join(', ')}]` : rec.type);
  if (rec.status && rec.status !== 'published') put('status', rec.status);
  if (rec.presentation) {
    const p = typeof rec.presentation === 'string' ? { type: rec.presentation } : rec.presentation;
    put('presentation', p.mode ? `{ type: ${p.type}, mode: ${p.mode} }` : p.type);
  }
  if (rec.year) put('year', String(rec.year));
  if (rec.date) put('date', rec.date instanceof Date ? rec.date.toISOString().slice(0, 10) : String(rec.date));
  if (rec.venue) {
    L.push('  venue:');
    for (const k of VENUE_ORDER) if (rec.venue[k] !== undefined && rec.venue[k] !== '') L.push(`    ${k}: ${scalar(rec.venue[k])}`);
  }
  if (rec.featured) put('featured', 'true');
  if (rec.topics?.length) put('topics', `[${rec.topics.join(', ')}]`);
  const links = LINK_ORDER.filter((k) => rec.links?.[k]);
  if (links.length) {
    L.push('  links:');
    for (const k of links) {
      const v = rec.links[k];
      if (Array.isArray(v)) {
        L.push(`    ${k}:`);
        for (const x of v) L.push(typeof x === 'string' ? `      - ${scalar(x)}` : `      - { label: ${scalar(x.label)}, url: ${JSON.stringify(x.url)} }`);
      } else L.push(`    ${k}: ${k === 'arxiv' ? `"${v}"` : scalar(v)}`);
    }
  }
  if (rec.versions?.length) {
    L.push('  versions:');
    for (const v of rec.versions) {
      const keys = ['label', 'title', 'venue', 'year', 'url', 'doi', 'arxiv'].filter((k) => v[k] !== undefined);
      keys.forEach((k, i) => L.push(`${i ? '      ' : '    - '}${k}: ${k === 'arxiv' ? `"${v[k]}"` : scalar(v[k])}`));
    }
  }
  if (rec.aliases?.length) put('aliases', `[${rec.aliases.map((a) => (/[ ,]/.test(a) ? JSON.stringify(a) : a)).join(', ')}]`);
  if (rec.bibkey) put('bibkey', rec.bibkey);
  if (rec.bibtex) {
    L.push('  bibtex: |');
    for (const line of rec.bibtex.trimEnd().split('\n')) L.push(`    ${line}`);
  }
  if (rec.abstract) {
    // Greedy wrap at 96 characters of text (the file's convention), indented by four spaces.
    L.push('  abstract: >-');
    let line = '';
    for (const w of rec.abstract.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + w.length > 96) {
        L.push('    ' + line);
        line = w;
      } else line = line ? `${line} ${w}` : w;
    }
    if (line) L.push('    ' + line);
  }
  return L.join('\n');
}

// ------------------------------------------------------------------ record-level editing
export const readFile = () => readFileSync(FILE, 'utf8');
export const records = (text) => parse(text) ?? [];

/** Line range [start, end) of the record with this id (its "- id:" line to the line before the next record or section header). */
export function findBlock(text, id) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l === `- id: ${id}`);
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !/^- id: /.test(lines[end]) && !/^# /.test(lines[end])) end++;
  while (end > start + 1 && lines[end - 1].trim() === '') end--;
  return { start, end, lines };
}

/** Trailing comments per top-level key, plus standalone comment lines, from a record's block. */
export function blockComments(blockLines) {
  const out = { __lines: [] };
  for (const l of blockLines.slice(1)) {
    const m = l.match(/^  ([a-z_]+):.*?\s#\s(.*)$/);
    if (m && !/["']/.test(l.split('#')[0].slice(-1))) out[m[1]] = m[2];
    else if (/^\s+#/.test(l)) out.__lines.push(l.trim()); // standalone comments are kept (moved to the top of the record)
  }
  return out;
}

export function replaceRecord(text, id, rec) {
  const b = findBlock(text, id);
  if (!b) throw new Error(`No publication with id "${id}"`);
  const comments = blockComments(b.lines.slice(b.start, b.end));
  return [...b.lines.slice(0, b.start), serialize(rec, comments), ...b.lines.slice(b.end)].join('\n');
}

export const appendRecord = (text, rec) => `${text.trimEnd()}\n\n${serialize(rec)}\n`;

/** Validate, write atomically, re-validate; on any failure the previous file is restored. */
export function safeWrite(next) {
  const validate = (t) => loadPublications(t, { topics: topicIds });
  try {
    validate(next);
  } catch (e) {
    if (e instanceof PublicationDataError) return { ok: false, message: e.message };
    throw e;
  }
  const path = FILE.pathname;
  const backup = join(tmpdir(), `publications.${Date.now()}.bak.yaml`);
  const temp = `${path}.tmp-${process.pid}`;
  copyFileSync(path, backup);
  try {
    writeFileSync(temp, next);
    renameSync(temp, path); // atomic on the same filesystem
    validate(readFileSync(path, 'utf8'));
    unlinkSync(backup);
    return { ok: true };
  } catch (e) {
    copyFileSync(backup, path);
    try {
      unlinkSync(temp);
    } catch {}
    return { ok: false, message: `Write failed (${e.message}); the previous file was restored from ${backup}.` };
  }
}

// ------------------------------------------------------------------ plain-language summary
export function describe(rec) {
  const types = rec.type ? [rec.type].flat() : [];
  let stage;
  if (types.includes('working-paper')) stage = 'Working paper (public preprint, not under review)';
  else if (rec.status === 'under-review') stage = 'Under review';
  else if (rec.status === 'under-revision') stage = 'Under revision';
  else if (rec.status === 'to-appear') stage = `Accepted, to appear (${types.join(' + ')})`;
  else stage = `Published (${types.join(' + ')})`;
  const p = rec.presentation ? (typeof rec.presentation === 'string' ? { type: rec.presentation } : rec.presentation) : null;
  const rows = [
    ['Title', rec.title + (rec.note ? ` (${rec.note})` : '')],
    ['Authors', rec.authors.join(', ')],
    ['Stage', stage],
    rec.venue && ['Venue', `${rec.venue.name}${rec.venue.acronym ? ` · ${rec.venue.acronym}` : ''}${rec.year ? ` ${rec.year}` : ''}`],
    p && ['Presentation', `${p.type}${p.mode ? ` · ${p.mode}` : ''}`],
    ['Links', Object.entries(rec.links ?? {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.map((x) => x.url ?? x).join(', ') : v}`).join('\n' + ' '.repeat(16)) || '(none)'],
    rec.topics?.length && ['Topics', rec.topics.join(', ')],
    ['Abstract', rec.abstract ? `${rec.abstract.slice(0, 90)}…` : '(none)'],
    ['URL', `/publications/${rec.id}/`],
  ].filter(Boolean);
  return rows.map(([k, v]) => `  ${c.dim(k.padEnd(13))} ${v}`).join('\n');
}

/** Topic question: offer the research themes, store their first topic (valid vocabulary). */
export async function askTopics(current = []) {
  console.log(c.dim(`Research themes: ${themes.map((t, i) => `${i + 1}) ${t.title}`).join('  ')}`));
  const a = await ask('Themes (numbers, optional)', current.length ? current.join(', ') : '');
  if (a && !/^[\d,\s]+$/.test(a)) return a.split(/[,\s]+/).filter((t) => topicIds.includes(t));
  return [...new Set(a.split(/[,\s]+/).map((n) => themes[Number(n) - 1]?.topics[0]).filter(Boolean))];
}
