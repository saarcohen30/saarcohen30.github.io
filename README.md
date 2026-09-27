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
| `npm run visual-check` | check that approved (frozen) scenes and the mark have not changed; see `docs/design/frozen-scenes.md` |
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

The hero shows one of the five elemental scenes, chosen **at random on every page load** (each 20%,
independently, so repeats happen). To review a particular scene, add query parameters to the home page URL.
They also work on the live site.

| Scene | With the entrance | Settled (no entrance) |
|---|---|---|
| Water | `/?scene=water&intro=1` | `/?scene=water` |
| Air | `/?scene=air&intro=1` | `/?scene=air` |
| Earth | `/?scene=earth&intro=1` | `/?scene=earth` |
| Fire | `/?scene=fire&intro=1` | `/?scene=fire` |
| Convergence | `/?scene=convergence&intro=1` | `/?scene=convergence` |

The elemental scenes live in `src/lib/field/elements/`, with one layer per element plus a small toolkit (`kit.ts`:
gradient noise, curl noise, easing). Convergence composes the four layers. `HERO_IDS` in
`src/lib/field/scenes/meta.ts` is the hero family; the choice itself is `pickHeroScene` in
`src/lib/field/scenes/pick.mjs` (tested by `scripts/test-hero.mjs`).

An unknown scene name is ignored (a random element is shown). With *reduce motion* enabled in the operating
system, the entrance never plays and the chosen scene is drawn once, settled: accessibility wins over `intro=1`.
Only the chosen scene's code is downloaded.

The research illustrations in *What I work on* (Gather, Share A, Adapt A1, Adversarial Rounds) live in
`src/lib/field/research/`. They load only when that section approaches the screen and animate only while
visible. One "Pause animations" control (in the hero and in the section header) stops all motion and is
remembered on the device.

## Where things live

```
src/data/publications.yaml   every paper: the single source of truth
src/data/profile.yaml        bio, research themes, positions, awards, service, links
public/files/pdf/            CV PDF (URL unchanged from the old site)
src/pages/                   routes: /, /publications/, /publications/<id>/, /cv/, 404, /publications.bib
src/components/              Hero, Header/Footer, publication components (pubs/)
src/lib/pubs/                publication schema, validation, sorting, BibTeX/citation generation
src/lib/field/               canvas scenes: elements/ (the five hero scenes), scenes/ (meta.ts = hero family, pick.mjs = random choice, index.ts = lazy loaders), research/ (the four research cards), review/ (design-review studies only)
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

- **Motif.** The hero is elemental: Water, Air, Earth, Fire and Convergence (all four together), one per
  visit at random. The research cards explain the research, each with its own mechanism in a shared art
  direction: coalitions form (Gather), resources are shared evenly over time (Share A), agents learn to
  coordinate (Adapt A1), and two systems challenge, respond and adapt in rounds (Adversarial Rounds).
- **Entrance.** A visit that is eligible for the full entrance (the first visit, or 12 hours since the last one)
  plays it (skippable by any key, click or scroll); other visits show the scene already settled. `localStorage`
  stores `intro-seen` (when the entrance last played) and, if the visitor pauses motion, `motion-paused`. The
  scene choice is made in `<head>` before first paint and is never stored. Without JavaScript the hero shows its
  text on the dark stage.
- **Performance.** No framework runtime. Page JavaScript is roughly 4 KB site-wide, plus the hero engine and one elemental scene
  (home page only; the research cards load later, on approach) and 4 KB for the filters (publications page only). Two self-hosted variable fonts (Newsreader,
  JetBrains Mono; latin subset); images are optimised at build time.
- **Themes.** Light, dark and system, stored per visitor. The hero and 404 "stage" are always dark.
- **Accessibility.** Semantic landmarks and headings, a skip link, visible focus, labelled controls, filter results
  announced to screen readers, no colour-only encoding (each publication type has a glyph and a text label), and
  touch targets of at least 32 px.
- **Venue logos** are deliberately not used. Several conferences (e.g. AAAI, NeurIPS) require written permission for
  their marks, arXiv prohibits unauthorised logo use, and consistent text badges read better than a patchwork of logos.
  The GitHub mark and ORCID iD icon are used as their brand guidelines permit.
