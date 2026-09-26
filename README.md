# saarcohen30.github.io

Personal academic website of Saar Cohen, built with [Astro](https://astro.build) as a fully static site and deployed
to GitHub Pages by GitHub Actions.

**To add a paper, read [PUBLICATIONS.md](PUBLICATIONS.md).** In short: `npm run add-pub -- <DOI or arXiv id>`.

## Commands

| Command | |
|---|---|
| `npm install` | once, after cloning (Node 22+) |
| `npm run dev` | local development server with live reload (see *Local preview*) |
| `npm run add-pub -- <arXiv id or DOI>` | add a publication (see PUBLICATIONS.md) |
| `npm run update-pub -- <id or title words>` | change a publication's stage, venue, presentation or links |
| `npm run validate-pubs` | check the publication data (same as `npm run check`) |
| `npm test` | schema rules + data validation (also runs in CI) |
| `npm run build` | build the static site into `dist/` |
| `npm run preview` | serve the built site |
| `npm run preview:stop` / `dev:stop` | stop a preview / dev server that is stuck or already running (see *Local preview*) |

## Local preview

There are two ways to look at the site locally:

- **`npm run dev`**: for editing. It serves the site from source and reloads as you change files. Open the URL it
  prints (normally http://localhost:4321).
- **`npm run build` then `npm run preview`**: the production site. It builds into `dist/` and serves exactly what
  will be deployed. Run `npm run build` first each time, or you will see the previous build.

```sh
cd ~/Documents/saarcohen30.github.io-master
npm run build
npm run preview
```

Then open http://localhost:4321/.

**To stop a server, press Ctrl+C** in its terminal. **Do not press Ctrl+Z.** Ctrl+Z only *suspends* the server:
it keeps the port and Astro still counts it as running, but it never answers, so the page just hangs and the next
`npm run preview` says *"Another astro preview server is already running"*.

### If Astro says a server is already running (or localhost hangs)

```sh
npm run preview:stop     # or: npm run dev:stop
npm run preview
```

This works even for a suspended server. If the old terminal then shows a stopped job (see `jobs`), type `fg` there
and it will exit.

| Command | |
|---|---|
| `npm run preview:status` / `npm run dev:status` | Is a preview / dev server for this project running? |
| `npm run preview:stop` / `npm run dev:stop` | Stop it (also one started in the background or suspended) |

Astro 7 allows one dev server and one preview server per project and tracks them in `.astro/` (not committed).
When an automated tool runs `astro preview` or `astro dev`, Astro starts it in the background on purpose, so it
keeps running after the tool finishes; the `stop` commands end those too.

## Previewing hero scenes

Normal visitors get the rotation described under *Design notes*. To review a particular scene, add query
parameters to the home page URL. These overrides **never read or write the stored rotation**, so they cannot
change what normal visits see. They also work on the live site.

| Scene | With the entrance | Settled (no entrance) |
|---|---|---|
| Adapt | `/?scene=adapt&intro=1` | `/?scene=adapt` |
| Exchange | `/?scene=exchange&intro=1` | `/?scene=exchange` |
| Share | `/?scene=share&intro=1` | `/?scene=share` |
| Gather | `/?scene=gather&intro=1` | `/?scene=gather` |

**Experimental elemental scenes** can be previewed the same way but are **not** in the normal rotation.
`ROTATION_IDS` in `src/lib/field/scenes/meta.ts` decides what normal visitors see.

| Scene | With the entrance | Settled |
|---|---|---|
| Water | `/?scene=water&intro=1` | `/?scene=water` |
| Earth | `/?scene=earth&intro=1` | `/?scene=earth` |
| Fire | `/?scene=fire&intro=1` | `/?scene=fire` |
| Air | `/?scene=air&intro=1` | `/?scene=air` |
| Convergence | `/?scene=convergence&intro=1` | `/?scene=convergence` |

The elemental scenes live in `src/lib/field/elements/`, with one layer per element plus a small toolkit (`kit.ts`:
gradient noise, curl noise, easing). They draw with their own primitives through the scene's optional `render()`
hook, and Convergence composes the four layers.

Reload to replay. An unknown scene name is ignored, and the page behaves normally. With *reduce motion* enabled
in the operating system, the entrance never plays and the static still is shown: accessibility wins over
`intro=1`. Only the requested scene's code is downloaded.

To replay the *normal* rotation locally, run `localStorage.removeItem('intro-seen')` in the browser console and
reload. Each such reload advances one scene.

## Where things live

```
src/data/publications.yaml   every paper: the single source of truth
src/data/profile.yaml        bio, research themes, positions, awards, service, links
public/files/pdf/            CV PDF (URL unchanged from the old site)
src/pages/                   routes: /, /publications/, /publications/<id>/, /cv/, 404, /publications.bib
src/components/              Hero, Header/Footer, publication components (pubs/)
src/lib/pubs/                publication schema, validation, sorting, BibTeX/citation generation
src/lib/field/               the hero: one engine (core, canvas/SVG painters) + scenes/ (meta.ts = names and rotation, index.ts = lazy loaders) + elements/ (experimental)
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
  Other visits show the same scene already settled. `localStorage` stores just two values: `scene` (the index of
  the scene shown last) and `intro-seen` (when the entrance last played). See *Previewing hero scenes* for
  review URLs. The choice is made in `<head>` before first paint. Only
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
