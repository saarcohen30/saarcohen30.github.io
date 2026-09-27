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
| Water | `src/lib/field/elements/water.ts`, `water-layer.ts` | `water-desktop` 720×450, `water-mobile` 390×300 (settled + 90 frames) | Approved, frozen |
| Air | `src/lib/field/elements/air.ts`, `air-layer.ts` | `air-desktop`, `air-mobile` | Approved, frozen |
| Earth (Dune Field) | `src/lib/field/elements/earth.ts`, `dune-layer.ts` | `earth-desktop`, `earth-mobile` | Approved, frozen |
| Fire (Converging Bursts) | `src/lib/field/elements/fire.ts`, `bursts.ts`, `flame-engine.ts` | `fire-desktop`, `fire-mobile` | Approved, frozen |
| Convergence (Dramatic Lake) | `src/lib/field/elements/convergence.ts`, `lake.ts` | `convergence-desktop`, `convergence-mobile` | Approved, frozen |
| Gather (coalitions) | `d2Gather` in `src/lib/field/review/d2-protos.ts` (`LEGACY_SCALE`) | `d2-gather-review` 584×366, `-card` 270×169, `-phone` 343×214 (t = 4.5 s) | Approved direction, frozen |
| Adapt A1 (learning) | `d2AdaptA1` in `src/lib/field/review/d2-protos.ts` (`CARD_SCALE`, 12 s pre-learned) | `d2-adapt-a1-review`, `-card`, `-phone` (t = 4.5 s) | Selected, frozen |
| Share A (allocation) | `d2ShareA` in `src/lib/field/review/d2-protos.ts`: the exact code of commit 170ffa7 (default `LEGACY_SCALE`, as at 170ffa7) | `d2-share-a-review`, `-card`, `-phone` (t = 4.5 s) | Selected, frozen. `npm run verify-share` proves it is pixel-identical to 170ffa7. |
| Counter-Rotating Currents mark | `src/components/Mark.astro`, `public/favicon.svg`, `public/favicon.ico`, app icons | `mark-light`, `mark-dark` (64, 32, 16 px) | Approved, frozen |

Rules:

- Scene scale is per scene (`LEGACY_SCALE`, `CARD_SCALE` in `d2-protos.ts`, or local sizes). Do not
  change a shared primitive (scale, `scene()`, `agent`, `halo`, `hair`, the elemental kit) without
  running the visual check and confirming every frozen fixture is unchanged.
- Hero scenes and research-card scenes have different size needs; keep their scales separate.
- Share A's rejected versions (the e4a29aa regression and the mound repair) are review-only history in
  `d2-share-history.ts`; never point the selected scene at them.
- Rejected and exploratory studies live in `src/lib/field/review/` and may change freely, but they must
  not share mutable state or scale with frozen scenes.
