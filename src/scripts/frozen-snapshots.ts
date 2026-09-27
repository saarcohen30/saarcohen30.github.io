// Deterministic renders of every frozen scene for the visual regression check
// (/design-review/frozen/, driven by scripts/visual-check.mjs). Fixed canvas size, device pixel
// ratio 1, seeded randomness and a fixed simulated time, so the same code gives the same pixels.
import { mulberry32 } from '../lib/field/core';

// Seed the only non-deterministic source in the review harness (churn timing) before anything runs.
Math.random = mulberry32(20260927);

const { ENTRIES } = await import('../lib/field/review/registry');
const byId = new Map(ENTRIES.map((e) => [e.id, e]));

for (const el of document.querySelectorAll<HTMLCanvasElement>('canvas[data-fixture]')) {
  const id = el.dataset.entry!;
  const w = Number(el.dataset.w);
  const h = Number(el.dataset.h);
  const mode = el.dataset.mode; // 'settled' (hero scenes) or a time in ms (research cards)
  el.width = w;
  el.height = h;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  const p = byId.get(id)!.make(w, h, 7, { mobile: el.dataset.mobile === '1' });
  let t = 0;
  if (mode === 'settled') {
    p.settle?.();
    t = 6000;
    for (let k = 0; k < 90; k++) p.step(16, (t += 16));
  } else {
    const end = Number(mode);
    while (t < end) p.step(16, (t += 16));
  }
  const ctx = el.getContext('2d')!;
  ctx.fillStyle = '#06070a';
  ctx.fillRect(0, 0, w, h);
  p.render(ctx, t);
}
(window as unknown as { __frozenReady: boolean }).__frozenReady = true;
