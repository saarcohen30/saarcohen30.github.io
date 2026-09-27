#!/usr/bin/env node
// `npm run verify-share` — prove the selected Share A is the approved Share A from commit 170ffa7.
//
// Takes src/lib/field/review/d2-protos.ts exactly as it was at 170ffa7 (git show), bundles it next
// to the current code, renders both versions of Share A in headless Chromium with the same seed,
// simulated time (4.5 s), size and device pixel ratio, and reports the share of differing pixels
// at review (584×366), desktop card (270×169) and phone card (343×214) size. Expected: 0.00%.
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const APPROVED = '170ffa7';
const reviewDir = join(root, 'src/lib/field/review');
const oldFile = join(reviewDir, `.share-${APPROVED}.tmp.ts`);
const entry = join(reviewDir, '.share-verify.tmp.ts');
const out = mkdtempSync(join(tmpdir(), 'share-verify-'));

// The approved file, verbatim from Git (placed beside the current one so its imports resolve).
writeFileSync(oldFile, execFileSync('git', ['show', `${APPROVED}:src/lib/field/review/d2-protos.ts`], { cwd: root, encoding: 'utf8' }));
writeFileSync(
  entry,
  `import { d2ShareA as approved } from './.share-${APPROVED}.tmp';
import { d2ShareA as current } from './d2-protos';
function draw(make, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const p = make(w, h, 7);
  let t = 0;
  while (t < 4500) p.step(16, (t += 16));
  const x = c.getContext('2d');
  x.fillStyle = '#06070a';
  x.fillRect(0, 0, w, h);
  p.render(x, t);
  return x.getImageData(0, 0, w, h).data;
}
window.compare = (w, h) => {
  const a = draw(approved, w, h);
  const b = draw(current, w, h);
  let diff = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) diff++;
  return diff / (w * h);
};
`,
);
try {
  await build({ entryPoints: [entry], bundle: true, format: 'iife', outfile: join(out, 'bundle.js'), logLevel: 'error' });
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ path: join(out, 'bundle.js') });
  let worst = 0;
  for (const [name, w, h] of [
    ['review size', 584, 366],
    ['card size', 270, 169],
    ['phone size', 343, 214],
  ]) {
    const r = await page.evaluate(([w, h]) => window.compare(w, h), [w, h]);
    worst = Math.max(worst, r);
    console.log(`${name}: ${(r * 100).toFixed(2)}%`);
  }
  await browser.close();
  if (worst > 0) {
    console.log(`\nShare A differs from ${APPROVED}.`);
    process.exitCode = 1;
  } else console.log(`\n✔ Share A is pixel-identical to the approved ${APPROVED} version.`);
} finally {
  rmSync(oldFile, { force: true });
  rmSync(entry, { force: true });
  rmSync(out, { recursive: true, force: true });
}
