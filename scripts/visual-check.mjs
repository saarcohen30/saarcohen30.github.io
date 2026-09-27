#!/usr/bin/env node
// `npm run visual-check` — make sure work on one scene has not silently changed an approved one.
//
// Renders every frozen scene deterministically (fixed seed, size, time; /design-review/frozen/),
// compares each against tests/visual/reference/<name>.png, and writes a contact sheet
// (tests/visual/report.html and tests/visual/contact-sheet.png) with reference | current | diff.
//
//   npm run visual-check            build, render, compare (exit 1 if any fixture changed)
//   npm run visual-check -- --update   accept the current renders as the new references
//
// Needs the site built into dist/ (the npm script builds first) and Playwright's Chromium
// (once: npx playwright install chromium).
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const dir = join(root, 'tests/visual');
const refDir = join(dir, 'reference');
const curDir = join(dir, 'current');
const update = process.argv.includes('--update');
// A fixture passes when fewer than this share of pixels differ by more than THRESH in any channel.
const TOLERANCE = 0.005;
const THRESH = 24;

if (!existsSync(join(dist, 'design-review/frozen/index.html'))) {
  console.error('dist/ has no /design-review/frozen/ page. Run: npm run build');
  process.exit(1);
}
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright is missing. Run: npm install   (then, once: npx playwright install chromium)');
  process.exit(1);
}

// A tiny static server for dist/.
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(dist, p);
  if (!f.startsWith(dist) || !existsSync(f)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream' }).end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

mkdirSync(refDir, { recursive: true });
mkdirSync(curDir, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: 'no-preference' })).newPage();
  await page.goto(`${base}/design-review/frozen/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__frozenReady === true, null, { timeout: 60000 });
  const names = await page.$$eval('[data-fixture]', (els) => els.map((e) => e.dataset.fixture));
  for (const name of names) await page.locator(`[data-fixture="${name}"]`).screenshot({ path: join(curDir, `${name}.png`) });

  if (update) {
    for (const name of names) copyFileSync(join(curDir, `${name}.png`), join(refDir, `${name}.png`));
    console.log(`✔ ${names.length} references updated in tests/visual/reference/`);
  }

  // Compare in the browser (no image libraries needed).
  const b64 = (f) => (existsSync(f) ? `data:image/png;base64,${readFileSync(f).toString('base64')}` : null);
  const rows = names.map((name) => ({ name, ref: b64(join(refDir, `${name}.png`)), cur: b64(join(curDir, `${name}.png`)) }));
  const cmp = await browser.newPage();
  const results = await cmp.evaluate(
    async ({ rows, THRESH }) => {
      const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
      const out = [];
      for (const r of rows) {
        if (!r.ref) {
          out.push({ name: r.name, status: 'new', ratio: 1, diff: null });
          continue;
        }
        const [a, b] = await Promise.all([load(r.ref), load(r.cur)]);
        const w = Math.max(a.width, b.width);
        const h = Math.max(a.height, b.height);
        const get = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
        const da = get(a);
        const db = get(b);
        const dc = document.createElement('canvas');
        dc.width = w;
        dc.height = h;
        const dx = dc.getContext('2d');
        const di = dx.createImageData(w, h);
        let bad = 0;
        for (let i = 0; i < da.length; i += 4) {
          const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]), Math.abs(da[i + 3] - db[i + 3]));
          if (d > THRESH) {
            bad++;
            di.data.set([255, 64, 64, 255], i);
          } else di.data.set([da[i] * 0.25, da[i + 1] * 0.25, da[i + 2] * 0.25, 255], i);
        }
        dx.putImageData(di, 0, 0);
        out.push({ name: r.name, ratio: bad / (w * h), diff: dc.toDataURL(), size: a.width === b.width && a.height === b.height });
      }
      return out;
    },
    { rows, THRESH },
  );
  let failed = 0;
  for (const r of results) {
    r.status = r.status ?? (r.ratio <= TOLERANCE && r.size !== false ? 'ok' : 'changed');
    if (r.status !== 'ok') failed++;
  }
  // Contact sheet.
  const html = `<!doctype html><meta charset="utf-8"><title>Visual check</title><style>body{background:#111;color:#ddd;font:13px system-ui;margin:16px}td{padding:6px;vertical-align:top}img{max-width:420px;display:block;border:1px solid #333}.ok{color:#7c7}.changed,.new{color:#f77}</style>
<h1>Frozen scenes: ${failed ? `${failed} changed` : 'all unchanged'}</h1><table><tr><th>fixture</th><th>reference</th><th>current</th><th>difference (red = changed)</th></tr>
${results.map((r, i) => `<tr><td><b>${r.name}</b><br><span class="${r.status}">${r.status}</span> ${(r.ratio * 100).toFixed(2)}%</td><td>${rows[i].ref ? `<img src="${rows[i].ref}">` : '—'}</td><td><img src="${rows[i].cur}"></td><td>${r.diff ? `<img src="${r.diff}">` : '—'}</td></tr>`).join('\n')}</table>`;
  writeFileSync(join(dir, 'report.html'), html);
  await cmp.setContent(html);
  await cmp.screenshot({ path: join(dir, 'contact-sheet.png'), fullPage: true });
  for (const r of results) console.log(`${r.status === 'ok' ? '✔' : '✘'} ${r.name.padEnd(28)} ${r.status.padEnd(8)} ${(r.ratio * 100).toFixed(2)}% of pixels differ`);
  console.log(`\nContact sheet: tests/visual/report.html (and contact-sheet.png)`);
  if (failed && !update) {
    console.log(`\n${failed} frozen fixture(s) changed. If the change is intended and approved, run: npm run visual-check -- --update`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  server.close();
}
