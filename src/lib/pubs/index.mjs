// Parses + validates publications.yaml and derives everything the UI needs
// (sorting, filters, link objects, BibTeX, citations). No presentation code here.
import { parseDocument, visit, isScalar } from 'yaml';
import { publicationsFileSchema, TYPE_META, STATUS_META, LINK_META } from './schema.mjs';

export { TYPE_META, STATUS_META, LINK_META };

export class PublicationDataError extends Error {
  constructor(problems) {
    super(
      `\n\n✖ src/data/publications.yaml has ${problems.length} problem${problems.length > 1 ? 's' : ''}:\n\n` +
        problems.map((p) => `  • ${p}`).join('\n') +
        '\n\n  See PUBLICATIONS.md for the record format.\n',
    );
    this.name = 'PublicationDataError';
    this.problems = problems;
  }
}

/**
 * @param {string} text   raw YAML
 * @param {{ topics?: string[] }} [opts]  known topic ids (from profile.yaml)
 */
export function loadPublications(text, { topics = null } = {}) {
  let raw;
  try {
    const doc = parseDocument(text);
    if (doc.errors.length) throw doc.errors[0];
    // YAML reads `arxiv: 2601.10000` as the number 2601.1 — keep the text exactly as written.
    visit(doc, {
      Pair(_, pair) {
        if (pair.key?.value === 'arxiv' && isScalar(pair.value) && typeof pair.value.value === 'number')
          pair.value.value = pair.value.source;
      },
    });
    raw = doc.toJS() ?? [];
  } catch (e) {
    throw new PublicationDataError([`YAML syntax error: ${e.message}`]);
  }

  const result = publicationsFileSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const [index, ...path] = issue.path;
      const entry = Array.isArray(raw) ? raw[index] : undefined;
      const who = entry?.id ? `"${entry.id}"` : `entry #${Number(index) + 1}`;
      return `${who} → ${path.join('.') || '(record)'}: ${issue.message}`;
    });
    throw new PublicationDataError(problems);
  }

  const problems = [];
  const seenIds = new Set();
  const seenAliases = new Set();
  for (const p of result.data) {
    if (seenIds.has(p.id)) problems.push(`"${p.id}" → id: duplicate id`);
    seenIds.add(p.id);
    for (const a of p.aliases) {
      if (seenAliases.has(a)) problems.push(`"${p.id}" → aliases: "${a}" is used by another publication`);
      seenAliases.add(a);
    }
    if (topics) {
      for (const t of p.topics)
        if (!topics.includes(t)) problems.push(`"${p.id}" → topics: unknown topic "${t}" (known: ${topics.join(', ')})`);
    }
  }
  if (problems.length) throw new PublicationDataError(problems);

  const pubs = result.data.map(normalize);
  assignBibKeys(pubs);
  pubs.sort(compare);
  return pubs;
}

const toDateString = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

function normalize(p) {
  const types = [p.type].flat();
  const order = Object.keys(TYPE_META);
  types.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const date = toDateString(p.date);
  return {
    ...p,
    date,
    types,
    primaryType: types[0],
    isWorkingPaper: types.includes('working-paper'),
    authors: p.authors.map((name) => ({ name: name.replace(/\*$/, ''), equal: name.endsWith('*') })),
    hasEqualContribution: p.authors.some((a) => a.endsWith('*')),
    links: resolveLinks(p.links),
    versions: p.versions.map((v) => ({
      ...v,
      href: v.url ?? (v.doi ? `https://doi.org/${v.doi}` : `https://arxiv.org/abs/${v.arxiv}`),
    })),
    sortKey: `${p.year ?? 9999}-${date ? date.slice(5) : '00'}`,
  };
}

function resolveLinks(links) {
  const out = [];
  for (const kind of Object.keys(LINK_META)) {
    const value = links[kind];
    if (!value) continue;
    const meta = LINK_META[kind];
    if (kind === 'doi') out.push({ kind, label: meta.label, title: `DOI: ${value}`, href: `https://doi.org/${value}` });
    else if (kind === 'arxiv') out.push({ kind, label: meta.label, title: `arXiv:${value}`, href: `https://arxiv.org/abs/${value}` });
    else {
      const items = [value].flat();
      items.forEach((item, i) => {
        const href = typeof item === 'string' ? item : item.url;
        const label = typeof item === 'string' ? (items.length > 1 ? `${meta.label} ${i + 1}` : meta.label) : item.label;
        out.push({ kind, label, title: typeof item === 'string' ? meta.title : `${meta.title}: ${item.label}`, href });
      });
    }
  }
  return out;
}

/** Working papers first, then newest first; ties broken by title for stable output. */
function compare(a, b) {
  if (a.isWorkingPaper !== b.isWorkingPaper) return a.isWorkingPaper ? -1 : 1;
  if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? 1 : -1;
  return a.title.localeCompare(b.title);
}

// ---------------------------------------------------------------- citations

const STOP = new Set(['a', 'an', 'the', 'on', 'of', 'in', 'for', 'to', 'and', 'with', 'via', 'under', 'by']);
const lastName = (name) => name.trim().split(/\s+/).at(-1);
const ascii = (s) => s.normalize('NFKD').replace(/[^A-Za-z0-9]/g, '');

function assignBibKeys(pubs) {
  const used = new Map();
  for (const p of [...pubs].sort((a, b) => a.id.localeCompare(b.id))) {
    if (p.bibkey) continue;
    const word = p.title.split(/[\s:\-–—(),]+/).find((w) => w && !STOP.has(w.toLowerCase())) ?? 'paper';
    const base = `${ascii(lastName(p.authors[0].name)).toLowerCase()}${p.year ?? ''}${ascii(word).toLowerCase()}`;
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    p.bibkey = n ? `${base}${String.fromCharCode(97 + n)}` : base;
  }
}

const joinAuthors = (authors) => {
  const names = authors.map((a) => a.name);
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
};

/** Plain-text citation (no HTML), e.g. for copy-to-clipboard. */
export function citationText(p) {
  const parts = [`${joinAuthors(p.authors)}.`, `${p.title}${p.note ? ` (${p.note})` : ''}.`];
  if (p.isWorkingPaper) parts.push(`${STATUS_META[p.status].label}.`);
  else {
    const isJournal = p.types.includes('journal');
    let venue = isJournal ? p.venue.name : `In ${p.venue.name}`;
    if (isJournal && p.venue.volume) venue += ` ${p.venue.volume}${p.venue.number ? `(${p.venue.number})` : ''}`;
    if (p.venue.pages) venue += `${isJournal ? ':' : ', pp.'} ${p.venue.pages}`;
    parts.push(`${venue}, ${p.year}.`);
    if (p.status === 'to-appear') parts.push('To appear.');
  }
  return parts.join(' ');
}

const bibEscape = (s) => s.replace(/([&%$#_])/g, '\\$1');

export function bibtex(p) {
  if (p.bibtex) return p.bibtex.trim();
  const t = p.types;
  const entry = t.includes('working-paper') ? 'unpublished' : t.includes('journal') ? 'article' : t.includes('conference') ? 'inproceedings' : 'misc';
  const doi = p.links.find((l) => l.kind === 'doi');
  const arxiv = p.links.find((l) => l.kind === 'arxiv');
  const url = p.links.find((l) => l.kind === 'paper' || l.kind === 'pdf');
  const fields = [
    ['title', `{${bibEscape(p.title)}${p.note ? ` ({${bibEscape(p.note)}})` : ''}}`],
    ['author', p.authors.map((a) => a.name).join(' and ')],
    entry === 'article' && ['journal', p.venue.name],
    entry === 'inproceedings' && ['booktitle', p.venue.name],
    entry === 'misc' && p.venue && ['howpublished', p.venue.name],
    ['volume', p.venue?.volume],
    ['number', p.venue?.number],
    ['pages', p.venue?.pages?.replace(/[–—-]+/, '--')],
    ['series', p.venue?.series],
    ['publisher', p.venue?.publisher],
    ['year', p.year],
    ['doi', doi && doi.title.replace('DOI: ', '')],
    ['eprint', !doi && arxiv ? arxiv.title.replace('arXiv:', '') : undefined],
    ['archivePrefix', !doi && arxiv ? 'arXiv' : undefined],
    ['url', !doi && url ? url.href : undefined],
    entry === 'unpublished' && ['note', STATUS_META[p.status].label],
  ].filter((f) => f && f[1] !== undefined && f[1] !== null && f[1] !== '');
  const width = Math.max(...fields.map(([k]) => k.length));
  return `@${entry}{${p.bibkey},\n${fields.map(([k, v]) => `  ${k.padEnd(width)} = {${v}}`).join(',\n')}\n}`;
}

// ---------------------------------------------------------------- derived collections

/** Years present among published papers, newest first — never hard-coded. */
export const yearsOf = (pubs) => [...new Set(pubs.filter((p) => !p.isWorkingPaper).map((p) => p.year))].sort((a, b) => b - a);

/** Types that actually occur, in canonical order, with counts. */
export const typeCounts = (pubs) =>
  Object.keys(TYPE_META)
    .map((type) => ({ type, ...TYPE_META[type], count: pubs.filter((p) => p.types.includes(type)).length }))
    .filter((t) => t.count > 0);

export function groupByYear(pubs) {
  const groups = new Map();
  for (const p of pubs) {
    if (p.isWorkingPaper) continue;
    if (!groups.has(p.year)) groups.set(p.year, []);
    groups.get(p.year).push(p);
  }
  return [...groups].map(([year, items]) => ({ year, items }));
}
