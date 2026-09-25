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
src/lib/coalition-sim.ts     the hero's online coalition formation simulation (pure, deterministic)
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

- **Motif.** The hero is a small, real instance of online coalition formation. Agents arrive one at a time in random
  order, value each other through additively separable hedonic utilities, and are irrevocably assigned to the
  coalition they value most, or found a new one. The same visual language (nodes, edges, coalitions) is used for
  the site mark, research-theme diagrams, type glyphs and the 404 page.
- **Entrance.** The full sequence (about 2.5 s, skippable by any key, click or scroll) plays at most once every
  12 hours. Returning visitors see the settled field immediately. With `prefers-reduced-motion` or without
  JavaScript, a static SVG rendered at build time is shown and no animation code is loaded.
- **Performance.** No framework runtime. Page JavaScript is roughly 4 KB site-wide, plus 8 KB for the hero canvas
  (home page only) and 4 KB for the filters (publications page only). Two self-hosted variable fonts (Newsreader,
  JetBrains Mono; latin subset); images are optimised at build time.
- **Themes.** Light, dark and system, stored per visitor. The hero and 404 "stage" are always dark.
- **Accessibility.** Semantic landmarks and headings, a skip link, visible focus, labelled controls, filter results
  announced to screen readers, no colour-only encoding (each publication type has a glyph and a text label), and
  touch targets of at least 32 px.
- **Venue logos** are deliberately not used. Several conferences (e.g. AAAI, NeurIPS) require written permission for
  their marks, arXiv prohibits unauthorised logo use, and consistent text badges read better than a patchwork of logos.
  The GitHub mark and ORCID iD icon are used as their brand guidelines permit.
