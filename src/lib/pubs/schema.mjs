// Schema for src/data/publications.yaml.
// Shared by the Astro build (src/lib/pubs/index.mjs) and the CLI scripts in /scripts,
// so a malformed record fails identically in `npm run check`, `npm run dev` and CI.
//
// Four independent dimensions — never collapse them into one field:
//   type          what the work IS:            conference | journal | survey | working-paper
//   status        where it is in review:       under-review | under-revision | to-appear | published
//   presentation  how it was presented:        { type: oral | spotlight | poster | contributed-talk,
//                                               mode: in-person | online | hybrid }  (or just "oral")
//   links/versions where it can be read:       arXiv, DOI, proceedings, code, …
//
// A working paper is a PUBLIC preprint that is neither under review nor accepted.
// It therefore has no `status`. An arXiv link never determines the type.
import { z } from 'astro/zod';

/** Publication types, in display order. `glyph` gives each type a non-colour cue. */
export const TYPE_META = {
  'working-paper': { label: 'Working Paper', plural: 'Working papers', glyph: 'ring' },
  conference: { label: 'Conference', plural: 'Conference papers', glyph: 'diamond' },
  journal: { label: 'Journal', plural: 'Journal articles', glyph: 'square' },
  survey: { label: 'Survey', plural: 'Surveys', glyph: 'triangle' },
};

/** Review / publication states. `stage` groups them on the publications page. */
export const STATUS_META = {
  'under-review': { label: 'Under review', stage: 'review' },
  'under-revision': { label: 'Under revision', stage: 'review' },
  'to-appear': { label: 'To appear', stage: 'accepted' },
  published: { label: 'Published', stage: 'accepted' },
};
export const REVIEW_STATUSES = Object.keys(STATUS_META).filter((s) => STATUS_META[s].stage === 'review');

/** Presentation mode, recorded only when it is known (e.g. online editions of a conference). */
export const MODE_META = {
  'in-person': { label: 'In person' },
  online: { label: 'Online' },
  hybrid: { label: 'Hybrid' },
};

/** Official presentation categories. Only record what the venue's own programme states. */
export const PRESENTATION_META = {
  oral: { label: 'Oral' },
  spotlight: { label: 'Spotlight' },
  'contributed-talk': { label: 'Contributed talk' },
  poster: { label: 'Poster' },
};

/** Link kinds, in display order. `doi` and `arxiv` take bare identifiers; the rest take URLs. */
export const LINK_META = {
  paper: { label: 'Paper', title: 'Official version (publisher / proceedings)' },
  pdf: { label: 'PDF', title: 'PDF' },
  arxiv: { label: 'arXiv', title: 'arXiv preprint' },
  doi: { label: 'DOI', title: 'Digital Object Identifier' },
  openreview: { label: 'OpenReview', title: 'OpenReview forum' },
  code: { label: 'Code', title: 'Source code' },
  project: { label: 'Project', title: 'Project page' },
  data: { label: 'Data', title: 'Dataset' },
  slides: { label: 'Slides', title: 'Slides' },
  poster: { label: 'Poster', title: 'Poster' },
  video: { label: 'Video', title: 'Talk / video' },
  supplement: { label: 'Supplement', title: 'Supplementary material' },
};

const url = z.url({ protocol: /^https?$/, message: 'must be a full http(s) URL' });
const doi = z
  .string()
  .regex(/^10\.\d{4,9}\/\S+$/, 'must be a bare DOI such as 10.1609/aaai.v39i13.33498 (no https://doi.org/ prefix)');
const arxiv = z
  .string()
  .regex(/^(\d{4}\.\d{4,5}|[a-z-]+(\.[A-Z]{2})?\/\d{7})(v\d+)?$/, 'must be a bare arXiv id such as 2505.18289');

/** A link is a URL, or a list of URLs / {label, url} pairs (e.g. two code repositories). */
const linkList = z.union([
  url,
  z.array(z.union([url, z.object({ label: z.string().min(1), url }).strict()])).min(1),
]);

const linksSchema = z
  .object(Object.fromEntries(Object.keys(LINK_META).map((k) => [k, k === 'doi' ? doi : k === 'arxiv' ? arxiv : linkList])))
  .partial()
  .strict();

const typeEnum = z.enum(Object.keys(TYPE_META));

/** Another version of the same work (preprint under a different title, journal extension, ...). */
const versionSchema = z
  .object({
    label: z.string().min(1).describe('Short chip text, e.g. "Journal version" or "arXiv preprint"'),
    title: z.string().optional().describe('Only if the version has a different title'),
    venue: z.string().optional(),
    year: z.number().int().optional(),
    url: url.optional(),
    doi: doi.optional(),
    arxiv: arxiv.optional(),
  })
  .strict()
  .refine((v) => v.url || v.doi || v.arxiv, 'a version needs at least one of url, doi or arxiv');

export const publicationSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be lower-case-kebab-case (it becomes the URL /publications/<id>/)'),
    title: z.string().min(3).refine((t) => !/\n/.test(t), 'title must be on one line'),
    authors: z.array(z.string().min(2)).min(1),
    type: z.union([typeEnum, z.array(typeEnum).min(1)]).optional(),
    status: z.enum(Object.keys(STATUS_META)).optional(),
    presentation: z
      .union([
        z.enum(Object.keys(PRESENTATION_META)),
        z.object({ type: z.enum(Object.keys(PRESENTATION_META)), mode: z.enum(Object.keys(MODE_META)).optional() }).strict(),
      ], { error: `must be one of ${Object.keys(PRESENTATION_META).join(' | ')}, or { type: …, mode: ${Object.keys(MODE_META).join(' | ')} }` })
      .optional(),
    year: z.number().int().min(1990).max(2100).optional(),
    date: z
      .union([z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, 'must be YYYY-MM or YYYY-MM-DD'), z.date()])
      .optional()
      .describe('Orders papers within a year; for working papers, the date first posted'),
    venue: z
      .object({
        name: z.string().min(2).describe('Full proceedings or journal name'),
        acronym: z.string().min(2).optional().describe('e.g. "NeurIPS" — shown in bold after the name, and on cards'),
        volume: z.union([z.string(), z.number()]).optional(),
        number: z.union([z.string(), z.number()]).optional(),
        pages: z.string().optional(),
        publisher: z.string().optional(),
        series: z.string().optional(),
      })
      .strict()
      .optional(),
    note: z.string().optional().describe('Qualifier such as "Extended Abstract" or "Doctoral Consortium"'),
    featured: z.boolean().default(false),
    topics: z.array(z.string()).default([]),
    abstract: z.string().optional(),
    links: linksSchema.default({}),
    versions: z.array(versionSchema).default([]),
    aliases: z.array(z.string().startsWith('/')).default([]).describe('Old URLs that should redirect here'),
    bibkey: z.string().regex(/^[A-Za-z0-9:_-]+$/).optional(),
    bibtex: z.string().optional().describe('Verbatim BibTeX that overrides the generated entry'),
  })
  .strict()
  .superRefine((p, ctx) => {
    const issue = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
    const types = p.type ? [p.type].flat() : [];
    const has = (t) => types.includes(t);
    const accepted = has('conference') || has('journal');
    const inReview = REVIEW_STATUSES.includes(p.status);
    const publicCopy = p.links.arxiv || p.links.paper || p.links.pdf || p.links.openreview;

    if (new Set(types).size !== types.length) issue('type', 'duplicate type');

    if (has('working-paper')) {
      if (accepted) issue('type', 'a working paper cannot also be conference/journal — once accepted, replace working-paper with the venue type');
      if (p.status)
        issue(
          'status',
          inReview
            ? `a paper that is ${p.status} is not a working paper: remove "type: working-paper" and keep "status: ${p.status}"`
            : `a working paper is neither accepted nor published: remove "status: ${p.status}" or change the type to conference/journal`,
        );
      if (p.venue) issue('venue', 'working papers have no venue — add one when the paper is accepted');
      if (!publicCopy) issue('links', 'a working paper must be publicly readable: add links.arxiv (or paper/pdf)');
    } else if (inReview) {
      if (accepted) issue('type', `status "${p.status}" contradicts type "${types.join(', ')}": a conference/journal type means the paper was accepted`);
      if (p.venue) issue('venue', 'do not list a venue for a paper under review (it is not public) — add it on acceptance');
    } else if (!p.type) {
      issue('type', 'type is required (conference, journal, survey or working-paper) unless status is under-review or under-revision');
    } else if (!accepted) {
      // e.g. a survey that is only on arXiv
      if (!has('working-paper')) issue('type', 'a survey must also be "journal"/"conference" (where it appeared) or "working-paper" (preprint only), e.g. type: [survey, journal]');
    } else {
      if (!p.year) issue('year', 'accepted and published papers need a year');
      if (!p.venue) issue('venue', 'accepted and published papers need venue.name (and usually venue.acronym)');
    }

    if (p.presentation) {
      if (!has('conference')) issue('presentation', 'presentation (oral, poster, …) only applies to conference papers');
      else if (inReview) issue('presentation', 'presentation is only known once a paper is accepted');
    }
  });

export const publicationsFileSchema = z.array(publicationSchema);
