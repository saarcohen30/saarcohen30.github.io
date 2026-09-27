# Frozen scenes (read before touching any scene)

These scenes are **approved**. They are not playgrounds: change them only when the site owner asks
for a change to that specific scene. Work on any other scene must leave them pixel-identical.

**Check before every scene-related commit:**

```sh
npm run visual-check
```

It builds the site, renders every frozen scene deterministically on `/design-review/frozen/`
(fixed seed 7, fixed canvas size, device pixel ratio 1, `Math.random` seeded with 20260927, fixed
simulated time), compares each render with `tests/visual/reference/<fixture>.png`, and writes
`tests/visual/report.html` (reference | current | difference). It fails if more than 0.5% of a
fixture's pixels change. Only after an approved change: `npm run visual-check -- --update`.

First time on a new machine: `npx playwright install chromium`.

| Scene | Source | Fixtures (state) | Status |
|---|---|---|---|
| Water (display-robust) | `src/lib/field/elements/water.ts`, `water-layer.ts` (`robust: true`) | `water-desktop` 720×450, `water-mobile` 390×300 (settled + 90 frames) | Approved, frozen. Refined 2026-09-27 for weak displays (references updated deliberately). |
| Air | `src/lib/field/elements/air.ts`, `air-layer.ts` | `air-desktop`, `air-mobile` | Approved, frozen |
| Earth (Dune Field, living) | `src/lib/field/elements/earth.ts`, `dune-layer.ts` (`active: true`) | `earth-desktop`, `earth-mobile` (settled: the reduced-motion frame, no sand); `earth-gust-desktop` (drawn while stepping, 6 s: the first gust) | Approved, frozen. Refined 2026-09-27: gusts, crest streaming, slow migration, staged entrance (references updated deliberately). |
| Water and Dune Field before the refinement | `createWaterOriginal`, `createEarthOriginal` (the same files with the refinement off) | `water-original-*`, `earth-original-*` | Review comparison only. `npm run verify-originals` proves they are pixel-identical to the live code of af14c9d. |
| Fire (Converging Bursts) | `src/lib/field/elements/fire.ts`, `bursts.ts`, `flame-engine.ts` | `fire-desktop`, `fire-mobile` | Approved, frozen |
| Convergence (Dramatic Lake) | `src/lib/field/elements/convergence.ts`, `lake.ts` | `convergence-desktop`, `convergence-mobile` | Approved, frozen |
| Gather (coalitions) | `d2Gather` in `src/lib/field/research/gather.ts` (`LEGACY_SCALE`) | `d2-gather-review` 584×366, `-card` 270×169, `-phone` 343×214 (t = 4.5 s) | Approved direction, frozen |
| Adapt A1 (learning) | `d2AdaptA1` in `src/lib/field/research/adapt.ts` (`CARD_SCALE`, 12 s pre-learned) | `d2-adapt-a1-review`, `-card`, `-phone` (t = 4.5 s) | Selected, frozen |
| Share A (allocation) | `d2ShareA` in `src/lib/field/research/share.ts`: the exact code of commit 170ffa7 (moved verbatim out of `d2-protos.ts`, which re-exports it) (default `LEGACY_SCALE`, as at 170ffa7) | `d2-share-a-review`, `-card`, `-phone` (t = 4.5 s) | Selected, frozen. `npm run verify-share` proves it is pixel-identical to 170ffa7. |
| Adversarial Rounds (safe AI, storyboard G) | `d2Rounds` in `src/lib/field/research/rounds.ts` (`ROUNDS_SCALE`, its own) | `safe-rounds-review`, `-card`, `-phone` (t = 6.6 s, the reduced-motion still) | Selected; frozen after card-size QA |
| Counter-Rotating Currents mark | `src/components/Mark.astro`, `public/favicon.svg`, `public/favicon.ico`, app icons | `mark-light`, `mark-dark` (64, 32, 16 px) | Approved, frozen |

Rules:

- Scene scale is per scene (`LEGACY_SCALE`, `CARD_SCALE` in `src/lib/field/research/kit.ts`, `ROUNDS_SCALE`, or local sizes). Do not
  change a shared primitive (scale, `scene()`, `agent`, `halo`, `hair`, the elemental kit) without
  running the visual check and confirming every frozen fixture is unchanged.
- Hero scenes and research-card scenes have different size needs; keep their scales separate.
- Fixture order matters: canvases sit at fractional page positions, and a hairline scene (Water) moved
  to a different position is resampled differently. Append new fixtures at the end; never insert.
- Share A's rejected versions (the e4a29aa regression and the mound repair) are review-only history in
  `d2-share-history.ts`; never point the selected scene at them.
- The production research scenes live in `src/lib/field/research/` (the home page loads only these);
  `src/lib/field/review/d2-protos.ts` re-exports them for the review pages.
- Rejected and exploratory studies live in `src/lib/field/review/` and may change freely, but they must
  not share mutable state or scale with frozen scenes.
