# Adding and editing publications

Every paper on the site comes from one file: **`src/data/publications.yaml`**.
The publications page, each paper's own page, the home page, the CV page, the filters and counts, BibTeX,
`/publications.bib`, Google Scholar metadata and redirects are all generated from it.

## The fast way (about 1 minute)

```sh
npm run add-pub -- 2605.08427                  # prefill from an arXiv id
npm run add-pub -- 10.1609/aaai.v39i13.33498   # …or from a DOI (Crossref)
npm run add-pub                                # …or answer everything yourself
```

The helper fills in the title, authors, venue, pages, dates and abstract where it can. It then asks **one
question that matters most — the paper's stage** (accepted/published, under review, under revision, or public
working paper) — and only the fields that stage needs. It validates the record and shows it before writing.
Then `npm run dev` to look, and commit + push to publish.

Run `npm test` at any time: it checks the schema rules and validates the whole file. The same checks run in CI,
so a malformed record can never be deployed.

## Four separate things about a paper

Never encode one of these in another.

| Field | Answers | Values |
|---|---|---|
| `type` | What is it? | `conference`, `journal`, `survey`, `working-paper` (or a list, e.g. `[survey, journal]`) |
| `status` | Where is it in review? | `under-review`, `under-revision`, `to-appear`, `published` (default for conference/journal) |
| `presentation` | How was it presented? | `oral`, `spotlight`, `contributed-talk`, `poster` — only when the venue's official programme says so |
| `links` / `versions` | Where can it be read? | arXiv, DOI, proceedings, OpenReview, PDF, code, … |

The publication **type** drives the coloured badges and the type filter. Status and presentation are shown
separately and are never type filters.

### Working Paper

A **public preprint** (arXiv or similar) that is **not under review and not accepted**. It has a `type` but
**no `status`**, **no venue**, and **must** have a public link.

> "Working paper" is not a synonym for "unpublished", and an arXiv link never makes something a working paper.

### Under Review / Under Revision

A submitted paper. It has `status: under-review` or `status: under-revision`, **no venue** (where it is under
review is not public), and normally **no `type`**. Use `type: survey` if it is a survey. It may carry an
`arxiv` link if a preprint is public. It appears in its own "Under review" section and is not counted as a
working paper.

### Conference / Journal

Accepted or published at a venue, **whether or not an arXiv version also exists** (keep the arXiv id under
`links`). Requires `year` and `venue.name`; `venue.acronym` is strongly recommended.

The venue line is composed automatically from structured fields, with no markup in the data:

```yaml
venue:
  name: Proceedings of the 40th Annual Conference on Neural Information Processing Systems
  acronym: NeurIPS
year: 2026
status: to-appear
```

renders as: *Proceedings of the 40th Annual Conference on Neural Information Processing Systems* **NeurIPS** 2026 [To Appear]

### Presentation

Optional, conference papers only, and only what the **official programme** states. Leave it out when the
venue makes no meaningful distinction (for example, when every paper gets a talk), or when the evidence is
unclear. Add a YAML comment with the source:

```yaml
presentation: oral   # AAAI-25 Main Track Oral Talks Schedule
```

### What the validator rejects

- working paper + any status (under review, to appear, published, …)
- working paper + conference/journal, or with a venue, or without a public link
- conference/journal + under review/revision (a venue type means it was accepted)
- a venue on a paper under review
- to-appear/published without `year` and `venue.name`
- `presentation` without a conference type, or before acceptance
- a survey that is neither published (`[survey, journal]`) nor a working paper
- malformed arXiv ids or DOIs, duplicate ids, duplicate aliases, unknown topics

## The lifecycle of a paper

Keep the same `id` throughout, so the paper's URL never changes.

**Stage A — on arXiv, not submitted** → Working Paper

```yaml
- id: online-fair-division-budget-constraints
  title: Online Fair Division with Budget Constraints
  authors: [Saar Cohen, Nicholas Teh, Paul W. Goldberg, Michael J. Wooldridge]
  type: working-paper
  date: 2026-07-25
  links: { arxiv: "2607.23310" }
```

**Stage B — submitted** → no longer a Working Paper

```diff
- type: working-paper
+ status: under-review
```

**Stage C — accepted** → Conference (or Journal), to appear; arXiv stays as a link

```diff
- status: under-review
+ type: conference
+ status: to-appear
+ presentation: oral            # only if the official programme says so
+ year: 2027
+ venue: { name: Proceedings of the 36th International Joint Conference on Artificial Intelligence, acronym: IJCAI }
```

**Stage D — published** → remove `status` (published is the default) and add the official links

```diff
- status: to-appear
+ links:
+   arxiv: "2607.23310"
+   doi: 10.24963/ijcai.2027/123
+   paper: https://www.ijcai.org/proceedings/2027/123
```

## Field reference

| Field | Required | Notes |
|---|---|---|
| `id` | yes | lower-kebab-case, unique; it is the paper's URL. Never change it; if you must, add the old path to `aliases`. |
| `title` | yes | One line. Put "(Extended Abstract)" etc. in `note`, not in the title. |
| `authors` | yes | Your name is highlighted automatically. Append `*` for equal contribution: `"Saar Cohen*"`. |
| `type`, `status`, `presentation` | see above | |
| `year` | accepted work | |
| `date` | no | `YYYY-MM` or `YYYY-MM-DD`. Orders papers within a year; for working papers, the date first posted. |
| `venue.name` / `venue.acronym` | accepted work | Plus optional `volume`, `number`, `pages` (use an en dash: `159–175`), `publisher`, `series`. |
| `note` | no | "Extended Abstract", "Doctoral Consortium", … |
| `topics` | no | Ids from `topics:` in `src/data/profile.yaml`. They place the paper in research themes and drive "Related work" (rarer shared topics count for more). |
| `featured` | no | `true` puts the paper on the home page. With none featured, the home page shows the newest public paper from each research theme. |
| `abstract` | no | Shown in the "Abstract" drawer and on the paper page. |
| `links` | no | `paper`, `pdf`, `arxiv` (bare id), `doi` (bare DOI), `openreview`, `code`, `project`, `data`, `slides`, `poster`, `video`, `supplement`. Any URL-valued link may be a list of `{ label, url }`. |
| `versions` | no | Other versions of the *same* work, e.g. `{ label: Journal version, venue: …, year: 2027, doi: … }` or a preprint under a different title. |
| `aliases` | no | Old URLs that should redirect here. |
| `bibkey`, `bibtex` | no | Override the generated BibTeX key or the whole entry. |

### Multiple versions of one work

Keep one record per paper and list the other versions under `versions`. If a conference paper and its journal
extension should appear as **two separate publications**, make them two records and link each to the other
through `versions`.

## Everything that isn't a paper

The tagline, biography, research themes, topic vocabulary, positions, education, awards, service, teaching and
profile links are in **`src/data/profile.yaml`**. The CV PDF is `public/files/pdf/CV - Saar Cohen.pdf`; replace
the file but keep its name so existing links keep working.
