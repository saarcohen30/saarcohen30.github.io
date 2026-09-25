// Schema for src/data/publications.yaml.
// Shared by the Astro build (src/lib/pubs/index.mjs) and the CLI scripts in /scripts,
// so a malformed record fails identically in `npm run check`, `npm run dev` and CI.
import { z } from 'astro/zod';

/** Publication types, in display order. `glyph` gives each type a non-colour cue. */
export const TYPE_META = {
  'working-paper': { label: 'Working Paper', plural: 'Working papers', glyph: 'ring' },
  conference: { label: 'Conference', plural: 'Conference papers', glyph: 'diamond' },
  journal: { label: 'Journal', plural: 'Journal articles', glyph: 'square' },
  survey: { label: 'Survey', plural: 'Surveys', glyph: 'triangle' },
};

export const STATUS_META = {
  published: { label: 'Published' },
  'to-appear': { label: 'To appear' },
  'under-review': { label: 'Under review' },
  'under-revision': { label: 'Under revision' },
  'in-preparation': { label: 'In preparation' },
  preprint: { label: 'Preprint' },
};

/** Statuses that make sense for an unpublished working paper. */
export const WORKING_STATUSES = ['under-review', 'under-revision', 'in-preparation', 'preprint'];

/** Link kinds, in display order. `doi` and `arxiv` take bare identifiers; the rest take URLs. */
export const LINK_META = {
  paper: { label: 'Paper', title: 'Official version (publisher / proceedings)' },
  pdf: { label: 'PDF', title: 'PDF' },
  arxiv: { label: 'arXiv', title: 'arXiv preprint' },
  doi: { label: 'DOI', title: 'Digital Object Identifier' },
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
  .object({
    paper: linkList,
    pdf: linkList,
    arxiv,
    doi,
    code: linkList,
    project: linkList,
    data: linkList,
    slides: linkList,
    poster: linkList,
    video: linkList,
    supplement: linkList,
  })
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
    type: z.union([typeEnum, z.array(typeEnum).min(1)]),
    status: z.enum(Object.keys(STATUS_META)).default('published'),
    year: z.number().int().min(1990).max(2100).optional(),
    date: z
      .union([z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, 'must be YYYY-MM or YYYY-MM-DD'), z.date()])
      .optional()
      .describe('Only used to order papers within a year'),
    venue: z
      .object({
        short: z.string().min(2).describe('Abbreviation shown on cards, e.g. "AAMAS 2026"'),
        name: z.string().min(2).describe('Full proceedings / journal name'),
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
    const types = [p.type].flat();
    if (new Set(types).size !== types.length) ctx.addIssue({ code: 'custom', path: ['type'], message: 'duplicate type' });
    if (types.includes('working-paper')) {
      if (types.length > 1)
        ctx.addIssue({ code: 'custom', path: ['type'], message: 'a working paper cannot also be conference/journal/survey — change the type once it is published' });
      if (!WORKING_STATUSES.includes(p.status))
        ctx.addIssue({ code: 'custom', path: ['status'], message: `working papers need status: ${WORKING_STATUSES.join(' | ')}` });
    } else {
      if (!p.year) ctx.addIssue({ code: 'custom', path: ['year'], message: 'published papers need a year' });
      if (!p.venue) ctx.addIssue({ code: 'custom', path: ['venue'], message: 'published papers need venue.short and venue.name' });
      if (WORKING_STATUSES.includes(p.status) && p.status !== 'preprint')
        ctx.addIssue({ code: 'custom', path: ['status'], message: `status "${p.status}" only makes sense with type: working-paper` });
    }
  });

export const publicationsFileSchema = z.array(publicationSchema);
