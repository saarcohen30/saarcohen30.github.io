# Adding and editing publications

Every paper on the site comes from one file: **`src/data/publications.yaml`**.
The publications page, each paper's own page, the home page, the CV page, the year and type filters, the counts,
BibTeX, `/publications.bib`, Google Scholar metadata and redirects are all generated from it.
Nothing else needs editing.

## The fast way (about 1 minute)

```sh
npm run add-pub -- 10.1609/aaai.v39i13.33498   # prefill from a DOI (Crossref)
npm run add-pub -- 2505.18289                  # …or from an arXiv id
npm run add-pub                                # …or answer everything yourself
```

The helper fills in the title, authors, venue, pages, year and abstract where it can, and asks for the rest:
type, the short venue label, and links. It checks the record against the schema and shows it to you before
writing anything. Then:

```sh
npm run dev          # optional: look at it on http://localhost:4321/publications/
git commit -am "Add <paper>" && git push     # the site redeploys automatically
```

## By hand

Append a record anywhere in the file; order doesn't matter, because the site sorts automatically. The minimum:

```yaml
- id: learning-stable-coalitions          # becomes /publications/learning-stable-coalitions/
  title: Learning Stable Coalitions
  authors: [Saar Cohen, Noa Agmon]
  type: conference
  year: 2027
  venue:
    short: AAMAS 2027                      # shown on cards
    name: Proceedings of the 26th International Conference on Autonomous Agents and Multiagent Systems
  links:
    arxiv: "2701.01234"
    code: https://github.com/saarcohen30/repo
```

Run `npm run check` to validate. A malformed record stops `npm run dev`, `npm run build` and the deployment with a
message naming the paper and the field, for example:

```
✖ src/data/publications.yaml has 1 problem:
  • "learning-stable-coalitions" → links.doi: must be a bare DOI such as 10.1609/aaai.v39i13.33498 (no https://doi.org/ prefix)
```

## Field reference

| Field | Required | Notes |
|---|---|---|
| `id` | yes | lower-kebab-case, unique. It is the paper's URL, so don't change it once published (add the old path to `aliases` if you must). |
| `title` | yes | One line. Leave qualifiers such as "(Extended Abstract)" out of the title and put them in `note`. |
| `authors` | yes | List of names. Your name is highlighted automatically. Append `*` for equal contribution: `"Saar Cohen*"`. |
| `type` | yes | `conference`, `journal`, `survey`, `working-paper`, or a list such as `[survey, journal]` for a survey published in a journal. The paper then appears under both filters and shows both badges. |
| `status` | no | `published` (default), `to-appear`, or for working papers `under-review`, `under-revision`, `in-preparation`, `preprint`. |
| `year` | yes, unless working paper | |
| `date` | no | `YYYY-MM` or `YYYY-MM-DD`; only orders papers within a year. |
| `venue.short` | yes, unless working paper | Compact label on cards: `AAMAS 2026`, `Curr. Robot. Rep.` |
| `venue.name` | yes, unless working paper | Full proceedings or journal name, used in citations and BibTeX. |
| `venue.volume` / `number` / `pages` / `publisher` / `series` | no | Used in citations, BibTeX and Scholar metadata. Use an en dash in pages: `159–175`. |
| `note` | no | "Extended Abstract", "Doctoral Consortium", … |
| `topics` | no | Theme ids from `src/data/profile.yaml` (`online-coalition-formation`, `learning-coalitions`, `online-allocation`, `graph-learning`). Links the paper to the research themes on the home page. |
| `featured` | no | `true` puts the paper on the home page. If *no* paper is featured, the home page shows the five most recent instead. |
| `abstract` | no | Shown in the card's "Abstract" drawer and on the paper page. |
| `links` | no | See below. Links you leave out simply don't appear. |
| `versions` | no | Other versions of the *same* work (see below). |
| `aliases` | no | Old URLs that should redirect to this paper. |
| `bibkey` | no | Override the generated BibTeX key (default: `cohen2025online`). |
| `bibtex` | no | Verbatim BibTeX that replaces the generated entry. |

### Links

```yaml
links:
  paper: https://…          # official version (publisher / proceedings page)
  pdf: https://….pdf
  arxiv: "2505.18289"       # bare id; quoting it is safest
  doi: 10.1609/…            # bare DOI
  code: https://github.com/…            # or a list, e.g. two repositories:
  # code:
  #   - { label: Code (GrPR2-A), url: "https://github.com/…" }
  #   - { label: Code (GrPR2-CH), url: "https://github.com/…" }
  project: https://…
  data: https://…
  slides: https://…
  poster: https://…
  video: https://…
  supplement: https://…
```

Files you host yourself (slides, posters) can go in `public/files/…` and be linked as
`https://saarcohen30.github.io/files/…`.

### Multiple versions of one work

Keep one record per paper and list the other versions:

```yaml
versions:
  - label: Journal version
    venue: Journal of Artificial Intelligence Research
    year: 2027
    doi: 10.1613/jair.1.12345
  - label: arXiv preprint
    title: An Earlier Title        # only if it differs
    arxiv: "2010.04686"
```

Versions appear as dashed link chips on the card and in an "Other versions" section on the paper page.
If a conference paper and its journal extension should appear as **two separate publications**, make them two records
and link each to the other through `versions`.

### When a working paper is accepted

Edit its record in place (keep the `id`, so its URL survives):

```diff
- type: working-paper
- status: under-review
+ type: conference
+ year: 2027
+ venue: { short: IJCAI 2027, name: Proceedings of the 36th International Joint Conference on Artificial Intelligence }
+ links: { doi: 10.24963/ijcai.2027/123 }
```

## Everything that isn't a paper

Biography, research themes, positions, education, awards, service, teaching and profile links live in
**`src/data/profile.yaml`**. The CV PDF is `public/files/pdf/CV - Saar Cohen.pdf`; replace the file and keep the name
so existing links keep working.
