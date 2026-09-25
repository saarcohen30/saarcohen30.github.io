// Parses + validates publications.yaml and derives everything the UI needs
// (sorting, filters, link objects, BibTeX, citations). No presentation code here.
import { parseDocument, visit, isScalar } from 'yaml';
import { publicationsFileSchema, TYPE_META, STATUS_META, LINK_META, PRESENTATION_META } from './schema.mjs';

export { TYPE_META, STATUS_META, LINK_META, PRESENTATION_META };

/** Order of the groups on the publications page. */
export const STAGES = ['working', 'review', 'accepted'];

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
  const types = p.type ? [p.type].flat() : [];
  const order = Object.keys(TYPE_META);
  types.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const date = toDateString(p.date);
  const isWorkingPaper = types.includes('working-paper');
  // Accepted venue types default to "published"; working papers have no status.
  const status = p.status ?? (isWorkingPaper ? null : 'published');
  const stage = isWorkingPaper ? 'working' : STATUS_META[status].stage;
  return {
    ...p,
    date,
    types,
    status,
    stage,
    primaryType: types[0] ?? null,
    isWorkingPaper,
    isUnderReview: stage === 'review',
    isAccepted: stage === 'accepted',
    statusLabel: status ? STATUS_META[status].label : null,
    presentationLabel: p.presentation ? PRESENTATION_META[p.presentation].label : null,
    venueLabel: p.venue ? (p.venue.acronym ? `${p.venue.acronym} ${p.year}` : p.venue.name) : null,
    authors: p.authors.map((name) => ({ name: name.replace(/\*$/, ''), equal: name.endsWith('*') })),
    hasEqualContribution: p.authors.some((a) => a.endsWith('*')),
    links: resolveLinks(p.links),
    versions: p.versions.map((v) => ({
      ...v,
      href: v.url ?? (v.doi ? `https://doi.org/${v.doi}` : `https://arxiv.org/abs/${v.arxiv}`),
    })),
    sortKey: p.year ? `${p.year}-${date?.slice(5) ?? '00'}` : date ?? '0000',
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

/** Working papers, then papers under review, then accepted work; newest first within each. */
function compare(a, b) {
  if (a.stage !== b.stage) return STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage);
  if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? 1 : -1;
  return a.title.localeCompare(b.title);
}

// ---------------------------------------------------------------- citations

const STOP = new Set(['a', 'an', 'the', 'on', 'of', 'in', 'for', 'to', 'and', 'with', 'via', 'under', 'by']);
const PARTICLES = new Set(['la', 'le', 'de', 'di', 'da', 'del', 'della', 'van', 'von', 'der', 'den', 'du', 'dos', 'ten', 'ter']);
/** Surname including particles: "Emanuele La Malfa" → "La Malfa", "Ludwig van Beethoven" → "van Beethoven". */
const lastName = (name) => {
  const parts = name.trim().split(/\s+/);
  let i = parts.length - 1;
  while (i > 1 && PARTICLES.has(parts[i - 1].toLowerCase())) i--;
  return parts.slice(i).join(' ');
};
const ascii = (s) => s.normalize('NFKD').replace(/[^A-Za-z0-9]/g, '');

function assignBibKeys(pubs) {
  const used = new Map();
  for (const p of [...pubs].sort((a, b) => a.id.localeCompare(b.id))) {
    if (p.bibkey) continue;
    const word = p.title.split(/[\s:\-–—(),]+/).find((w) => w && !STOP.has(w.toLowerCase())) ?? 'paper';
    const base = `${ascii(lastName(p.authors[0].name)).toLowerCase()}${p.year ?? p.date?.slice(0, 4) ?? ''}${ascii(word).toLowerCase()}`;
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
  const arxiv = p.links.find((l) => l.kind === 'arxiv');
  if (!p.isAccepted) {
    if (arxiv) parts.push(`${arxiv.title}${p.date ? `, ${p.date.slice(0, 4)}` : ''}.`);
    if (p.isUnderReview) parts.push(`${p.statusLabel}.`);
  } else {
    const isJournal = p.types.includes('journal');
    let venue = isJournal ? p.venue.name : `In ${p.venue.name}${p.venue.acronym ? ` (${p.venue.acronym})` : ''}`;
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
  const entry = t.includes('journal') ? 'article' : t.includes('conference') ? 'inproceedings' : p.isUnderReview && !p.links.some((l) => l.kind === 'arxiv') ? 'unpublished' : 'misc';
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
    ['year', p.year ?? p.date?.slice(0, 4)],
    ['doi', doi && doi.title.replace('DOI: ', '')],
    ['eprint', arxiv && (!doi || entry === 'misc') ? arxiv.title.replace('arXiv:', '') : undefined],
    ['archivePrefix', arxiv && (!doi || entry === 'misc') ? 'arXiv' : undefined],
    ['url', !doi && url ? url.href : undefined],
    p.status === 'to-appear' && ['note', 'To appear'],
    p.isUnderReview && ['note', p.statusLabel],
  ].filter((f) => f && f[1] !== undefined && f[1] !== null && f[1] !== '');
  const width = Math.max(...fields.map(([k]) => k.length));
  return `@${entry}{${p.bibkey},\n${fields.map(([k, v]) => `  ${k.padEnd(width)} = {${v}}`).join(',\n')}\n}`;
}

// ---------------------------------------------------------------- derived collections

/** Years present among accepted papers, newest first — never hard-coded. */
export const yearsOf = (pubs) => [...new Set(pubs.filter((p) => p.isAccepted).map((p) => p.year))].sort((a, b) => b - a);

/** Types that actually occur, in canonical order, with counts. */
export const typeCounts = (pubs) =>
  Object.keys(TYPE_META)
    .map((type) => ({ type, ...TYPE_META[type], count: pubs.filter((p) => p.types.includes(type)).length }))
    .filter((t) => t.count > 0);

export function groupByYear(pubs) {
  const groups = new Map();
  for (const p of pubs) {
    if (!p.isAccepted) continue;
    if (!groups.has(p.year)) groups.set(p.year, []);
    groups.get(p.year).push(p);
  }
  return [...groups].map(([year, items]) => ({ year, items }));
}

/**
 * Related work from shared topics, weighted by rarity (a shared "ai-safety" says more than a
 * shared "game-theory"). Returns at most `limit` papers whose score clears a floor.
 */
export function relatedTo(pub, pubs, limit = 3) {
  const freq = new Map();
  for (const p of pubs) for (const t of p.topics) freq.set(t, (freq.get(t) ?? 0) + 1);
  const weight = (t) => Math.log((pubs.length + 1) / (freq.get(t) ?? 1));
  const mine = new Set(pub.topics);
  const best = Math.max(0, ...pub.topics.map(weight));
  return pubs
    .filter((p) => p.id !== pub.id)
    .map((p) => ({ p, score: p.topics.filter((t) => mine.has(t)).reduce((s, t) => s + weight(t), 0) }))
    .filter((x) => x.score >= Math.max(0.9, best * 0.8))
    .sort((a, b) => b.score - a.score || (a.p.sortKey < b.p.sortKey ? 1 : -1))
    .slice(0, limit)
    .map((x) => x.p);
}
