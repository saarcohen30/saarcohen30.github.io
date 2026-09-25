# saarcohen30.github.io

Personal academic website of Saar Cohen, built with [Astro](https://astro.build) as a fully static site and deployed
to GitHub Pages by GitHub Actions.

**To add a paper, read [PUBLICATIONS.md](PUBLICATIONS.md).** In short: `npm run add-pub -- <DOI or arXiv id>`.

## Commands

| Command | |
|---|---|
| `npm install` | once, after cloning (Node 22+) |
| `npm run dev` | local preview with live reload at http://localhost:4321 |
| `npm run add-pub` | add a publication interactively |
| `npm run check` | validate `src/data/publications.yaml` |
| `npm test` | schema rules + data validation (also runs in CI) |
| `npm run build` | build the static site into `dist/` |
| `npm run preview` | serve the built site |

## Where things live

```
src/data/publications.yaml   every paper: the single source of truth
src/data/profile.yaml        bio, research themes, positions, awards, service, links
public/files/pdf/            CV PDF (URL unchanged from the old site)
src/pages/                   routes: /, /publications/, /publications/<id>/, /cv/, 404, /publications.bib
src/components/              Hero, Header/Footer, publication components (pubs/)
src/lib/pubs/                publication schema, validation, sorting, BibTeX/citation generation
src/lib/field/               the hero: one engine (core, canvas/SVG painters) + scenes/ (adapt, exchange, share, gather)
src/scripts/                 small client scripts: hero canvas, publication filters, theme/disclosure/copy
src/styles/global.css        design tokens (colour, type scale, motion) and base styles
scripts/                     add-publication and validate-publications CLIs
```

## Deployment

Pushing to `master` runs `.github/workflows/deploy.yml`, which validates the data, builds, and publishes `dist/`.
**One-time setting:** repository *Settings → Pages → Build and deployment → Source* must be **GitHub Actions**
(the previous Jekyll site was built from the branch directly).

Old Jekyll URLs (`/publication/2023-ocsf`, `/about/`, `/resume`, …) redirect to their new pages. The paper redirects
come from each record's `aliases`.

## Design notes

- **Motif.** The hero is an abstract image of the research territory, not a diagram of one model. One small
  engine (nodes, edges, halos, arrival pings, token bars, one spring model) drives a family of four scenes that
  differ only in behaviour:
  - **Adapt**: an uncertain network learns and regroups (learning under uncertainty).
  - **Exchange**: sequences pass between two mirrored groups, some stopped at the boundary (language models,
    interaction, safety).
  - **Share**: resources arrive and are distributed evenly (fair allocation).
  - **Gather**: agents arrive and form groups (strategic interaction, coalitions).
- **Entrance and rotation.** A visit that is eligible for the full entrance (the first visit, or 12 hours since
  the last one) advances to the next scene and plays it (about 2.5 s, skippable by any key, click or scroll).
  Other visits show the same scene already settled. The choice is made in `<head>` before first paint. Only
  the chosen scene's code (about 2 KB gzipped) is downloaded. With `prefers-reduced-motion` or without
  JavaScript, a build-time SVG still of the Adapt scene is shown and no animation code loads. If
  `localStorage` is unavailable, the first scene is shown.
- **Performance.** No framework runtime. Page JavaScript is roughly 4 KB site-wide, plus about 4.5 KB gzipped for the hero engine and one scene
  (home page only) and 4 KB for the filters (publications page only). Two self-hosted variable fonts (Newsreader,
  JetBrains Mono; latin subset); images are optimised at build time.
- **Themes.** Light, dark and system, stored per visitor. The hero and 404 "stage" are always dark.
- **Accessibility.** Semantic landmarks and headings, a skip link, visible focus, labelled controls, filter results
  announced to screen readers, no colour-only encoding (each publication type has a glyph and a text label), and
  touch targets of at least 32 px.
- **Venue logos** are deliberately not used. Several conferences (e.g. AAAI, NeurIPS) require written permission for
  their marks, arXiv prohibits unauthorised logo use, and consistent text badges read better than a patchwork of logos.
  The GitHub mark and ORCID iD icon are used as their brand guidelines permit.
