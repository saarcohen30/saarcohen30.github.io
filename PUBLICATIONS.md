# Publications: Quick Start

```sh
cd ~/Documents/saarcohen30.github.io-master

# Add a new arXiv paper
npm run add-pub -- <ARXIV-ID>

# Update an existing paper (search by title words; no id needed)
npm run update-pub

# Validate
npm run validate-pubs

# Run the site locally (open the address it prints; Ctrl+C to stop)
npm run dev
```

**That's all you normally need.** Forgot? Run `npm run pubs` to print this list.

A DOI works instead of an arXiv id (`npm run add-pub -- 10.24963/ijcai.2025/422`), and `npm run add-pub` with
nothing after it lets you type everything yourself.

## Put it online

```sh
git add -A
git commit -m "Update publications"
git push
```

Both tools ask plain-English questions, show you exactly what will change,
and write nothing until you say yes. If anything would be wrong, they refuse and leave your data as it was.

---

## What the tools ask

### Adding a paper (`npm run add-pub -- <arXiv id or DOI>`)

1. It looks the paper up and shows the title and authors. **Is this correct?** Enter means yes.
2. **What is the paper's current status?**
   - **Working Paper**: public on arXiv, *not* submitted anywhere and *not* under review.
   - **Under Review**: submitted, waiting for a decision.
   - **Accepted / To Appear**: accepted; proceedings or journal issue not out yet.
   - **Published**: the proceedings or issue is out.
3. For accepted or published papers only: conference or journal, year, the full proceedings name, the short
   name shown in bold (e.g. **NeurIPS**, usually guessed for you), and for conferences the presentation:
   Oral / Spotlight / Poster / Other / Unknown, then In person / Online / Hybrid / Not specified.
   "Unknown" is always fine.
4. **Links**: arXiv, official publication page, DOI, GitHub, project page; then optionally PDF, OpenReview,
   slides, video, poster, supplementary material, dataset. Press **Enter** to skip any of them.
5. Research themes, the abstract, whether to feature it on the home page, and its web address (suggested).
6. A summary, then **Save this paper?**

### Updating a paper (`npm run update-pub`)

It asks you to search (a few title words), then shows a menu:

```
1) Status               6) DOI                          11) Video
2) Venue                7) Official publication URL     12) Authors, title or year
3) Publication type     8) GitHub / code                13) Other (abstract, themes, featured, …)
4) Presentation         9) Project page                 14) Review changes and save
5) arXiv               10) Slides                       15) Quit without saving
```

Change as many things as you like, then choose **14**. You see every change first, for example:

```
Changes:

  Status
    Under Review → Accepted / To Appear
  Venue
    — → NeurIPS 2027
  Presentation
    — → Oral

Apply these changes? [y/N]
```

Nothing is written unless you type **y**.

### The usual life of a paper

| What happened | Run | Choose |
|---|---|---|
| Posted on arXiv, not submitted | `npm run add-pub -- <arXiv id>` | Working Paper |
| Submitted | `npm run update-pub` | 1) Status → Under Review. It stops being a Working Paper automatically. |
| Accepted | `npm run update-pub` | 1) Status → Accepted / To Appear, then answer the venue questions |
| Proceedings out | `npm run update-pub` | 1) Status → Published (add the DOI if there is one) |
| New GitHub repo, slides, video … | `npm run update-pub` | 8) GitHub, 10) Slides, 11) Video … |

The paper keeps its web address (`/publications/<id>/`) through all of these, and its arXiv link stays on it.
An arXiv link never makes a paper a Working Paper by itself.

### Advanced shortcuts

- `npm run update-pub -- "budget constraints"` starts with a search.
- `npm run update-pub -- <paper-id>` goes straight to a paper (the id is the last part of its web address).
- `npm test` runs every check, including a full rehearsal of the tools on a temporary copy of the data. The same
  checks run automatically when you push, so broken data can never reach the live site.

---

# Reference: how the data file works

Everything below is for the curious. The two commands above do all of it for you.

Every paper on the site comes from one file: **`src/data/publications.yaml`**.
The publications page, each paper's own page, the home page, the CV page, the filters and counts, BibTeX,
`/publications.bib`, Google Scholar metadata and redirects are all generated from it. The helpers edit one
record at a time and keep your comments; you can also edit the file by hand at any time.

## Four separate things about a paper

Never encode one of these in another.

| Field | Answers | Values |
|---|---|---|
| `type` | What is it? | `conference`, `journal`, `survey`, `working-paper` (or a list, e.g. `[survey, journal]`) |
| `status` | Where is it in review? | `under-review`, `under-revision`, `to-appear`, `published` (default for conference/journal) |
| `presentation` | How was it presented? | `oral`, `spotlight`, `contributed-talk`, `poster`, or with the mode: `{ type: oral, mode: online }` (`mode`: `in-person`, `online` or `hybrid`). Only record what the official programme or you can confirm. |
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
