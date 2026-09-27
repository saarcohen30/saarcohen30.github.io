#!/usr/bin/env node
// `npm run verify-originals`: prove the review copies of the pre-refinement Water and Dune Field are
// the scenes that were live at commit af14c9d.
//
// Takes water.ts, water-layer.ts, earth.ts and dune-layer.ts exactly as they were at af14c9d (git
// show), bundles them next to the current code, renders the old scenes and the current
// createWaterOriginal / createEarthOriginal in headless Chromium with the same seed, size, layout and
// simulated time, and reports the share of differing pixels. Expected: 0.00%.
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const LIVE = 'af14c9d';
const dir = join(root, 'src/lib/field/elements');
const old = (file, rename = []) => {
  let src = execFileSync('git', ['show', `${LIVE}:src/lib/field/elements/${file}`], { cwd: root, encoding: 'utf8' });
  for (const [a, b] of rename) src = src.replaceAll(a, b);
  return src;
};
const files = {
  '.water-layer-live.tmp.ts': old('water-layer.ts'),
  '.water-live.tmp.ts': old('water.ts', [["'./water-layer'", "'./.water-layer-live.tmp'"]]),
  '.dune-layer-live.tmp.ts': old('dune-layer.ts'),
  '.earth-live.tmp.ts': old('earth.ts', [["'./dune-layer'", "'./.dune-layer-live.tmp'"]]),
  '.originals-verify.tmp.ts': `import { createWater as liveWater } from './.water-live.tmp';
import { createEarth as liveEarth } from './.earth-live.tmp';
import { createWaterOriginal } from './water';
import { createEarthOriginal } from './earth';
function draw(factory, w, h, mobile, steps) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const field = { x0: w * 0.04, x1: w * 0.96, y0: h * 0.06, y1: h * 0.94 };
  const s = factory({ width: w, height: h, field, density: (((field.x1 - field.x0) * (field.y1 - field.y0)) / 1e5) * 22, layout: mobile ? 'top' : 'side', seed: 30 });
  for (let k = 0; k < steps; k++) s.step(16);
  const x = c.getContext('2d');
  x.fillStyle = '#06070a';
  x.fillRect(0, 0, w, h);
  s.render(x);
  return x.getImageData(0, 0, w, h).data;
}
const PAIRS = { water: [liveWater, createWaterOriginal], earth: [liveEarth, createEarthOriginal] };
window.compare = (name, w, h, mobile, steps) => {
  const [a, b] = PAIRS[name].map((f) => draw(f, w, h, mobile, steps));
  let diff = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) diff++;
  return diff / (w * h);
};
`,
};
const out = mkdtempSync(join(tmpdir(), 'originals-verify-'));
try {
  for (const [f, src] of Object.entries(files)) writeFileSync(join(dir, f), src);
  await build({ entryPoints: [join(dir, '.originals-verify.tmp.ts')], bundle: true, format: 'iife', outfile: join(out, 'bundle.js'), logLevel: 'error' });
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ path: join(out, 'bundle.js') });
  let worst = 0;
  for (const name of ['water', 'earth'])
    for (const [label, w, h, mobile] of [
      ['desktop', 720, 450, false],
      ['phone', 390, 300, true],
    ])
      for (const steps of [40, 160, 400]) {
        // From the entrance (step 0) through the settled scene.
        const r = await page.evaluate(([n, w, h, m, s]) => window.compare(n, w, h, m, s), [name, w, h, mobile, steps]);
        worst = Math.max(worst, r);
        console.log(`${name.padEnd(6)} ${label.padEnd(8)} ${String(steps * 16).padStart(5)} ms: ${(r * 100).toFixed(2)}%`);
      }
  await browser.close();
  if (worst > 0) {
    console.log(`\nThe originals differ from ${LIVE}.`);
    process.exitCode = 1;
  } else console.log(`\n✔ The original Water and Dune Field are pixel-identical to the live ${LIVE} scenes.`);
} finally {
  for (const f of Object.keys(files)) rmSync(join(dir, f), { force: true });
  rmSync(out, { recursive: true, force: true });
}
