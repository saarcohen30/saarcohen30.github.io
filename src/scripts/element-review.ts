// Harness for /design-review/elements/: one animation loop for every visible card, with
// replay / pause / reset (settled) / slow controls, pointer forwarding, offline frame strips and
// still frames. Cards inside collapsed sections are built only when the section is opened.
import { ENTRIES } from '../lib/field/review/registry';
import type { Proto } from '../lib/field/review/common';

const byId = new Map(ENTRIES.map((e) => [e.id, e]));
const dpr = Math.min(devicePixelRatio || 1, 2);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SETTLED_AT = 6000; // a settled card resumes at this scene time

interface Card {
  id: string;
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  pauseBtn: HTMLButtonElement;
  slowBtn: HTMLButtonElement;
  proto: Proto | null;
  t: number;
  w: number;
  h: number;
  paused: boolean;
  slow: boolean;
  visible: boolean;
}

function sizeCanvas(canvas: HTMLCanvasElement) {
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  return { w: r.width, h: r.height };
}

/** Run a fresh instance offline to scene time `at` (or settled, when at < 0) and draw it. */
function drawAt(canvas: HTMLCanvasElement, id: string, at: number, mobile = false, live = false) {
  const { w, h } = sizeCanvas(canvas);
  if (w < 2) return;
  const p = byId.get(id)!.make(w, h, undefined, { mobile });
  let t = 0;
  // Live: draw while stepping, as on the page (scenes whose motion depends on what they have drawn).
  const ctx0 = canvas.getContext('2d')!;
  const tick = () => {
    if (live) p.render(ctx0, t);
  };
  if (at < 0) {
    // Settled, then a moment of live motion (some scenes, like Air, fill in as they run).
    p.settle?.();
    t = SETTLED_AT;
    for (let k = 0; k < 96; k++) {
      p.step(16, (t += 16));
      tick();
    }
  } else
    while (t < at) {
      t += 16;
      p.step(16, t);
      tick();
    }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  p.render(ctx, t);
}

function build(card: Card, settle: boolean) {
  const { w, h } = sizeCanvas(card.canvas);
  card.w = w;
  card.h = h;
  if (w < 2) {
    card.proto = null; // hidden (collapsed section): built when shown
    return;
  }
  card.proto = byId.get(card.id)!.make(w, h);
  card.t = 0;
  if (settle) {
    card.proto.settle?.();
    card.t = SETTLED_AT;
    card.proto.step(16, card.t);
  }
  paint(card);
}

function paint(card: Card) {
  if (!card.proto) return;
  const { ctx } = card;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, card.w, card.h);
  card.proto.render(ctx, card.t);
}

function setPaused(card: Card, p: boolean) {
  card.paused = p;
  card.pauseBtn.textContent = p ? 'Play' : 'Pause';
  card.pauseBtn.setAttribute('aria-pressed', String(p));
}

function drawFrames(root: ParentNode) {
  for (const strip of root.querySelectorAll<HTMLElement>('[data-frames]')) {
    if (strip.dataset.done) continue;
    const id = strip.dataset.frames!;
    const figs = [...strip.querySelectorAll<HTMLElement>('[data-at]')];
    if (!figs.length || figs[0].getBoundingClientRect().width < 2) continue;
    strip.dataset.done = '1';
    figs.forEach((fig, i) => setTimeout(() => drawAt(fig.querySelector('canvas')!, id, Number(fig.dataset.at)), 60 * i));
  }
}

const cards: Card[] = [];
const io = new IntersectionObserver((es) => {
  for (const e of es) {
    const c = cards.find((k) => k.canvas === e.target);
    if (!c) continue;
    c.visible = e.isIntersecting;
    if (c.visible && !c.proto) build(c, reduce);
  }
});

for (const el of document.querySelectorAll<HTMLElement>('[data-card]')) {
  const canvas = el.querySelector<HTMLCanvasElement>('.stage canvas')!;
  const card: Card = {
    id: el.dataset.card!,
    el,
    canvas,
    ctx: canvas.getContext('2d')!,
    pauseBtn: el.querySelector<HTMLButtonElement>('[data-act="pause"]')!,
    slowBtn: el.querySelector<HTMLButtonElement>('[data-act="slow"]')!,
    proto: null,
    t: 0,
    w: 0,
    h: 0,
    paused: false,
    slow: false,
    visible: false,
  };
  cards.push(card);
  build(card, reduce);
  setPaused(card, reduce);
  io.observe(canvas);
  el.querySelector('[data-act="replay"]')!.addEventListener('click', () => {
    build(card, false);
    setPaused(card, false);
  });
  card.pauseBtn.addEventListener('click', () => setPaused(card, !card.paused));
  el.querySelector('[data-act="reset"]')!.addEventListener('click', () => build(card, true));
  card.slowBtn.addEventListener('click', () => {
    card.slow = !card.slow;
    card.slowBtn.setAttribute('aria-pressed', String(card.slow));
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (card.paused || !card.proto) return;
    const r = canvas.getBoundingClientRect();
    card.proto.pointer?.(ev.clientX - r.left, ev.clientY - r.top, card.t);
  });
}

// Collapsed sections: build their cards when opened.
for (const d of document.querySelectorAll<HTMLDetailsElement>('details[data-lazy]')) {
  d.addEventListener('toggle', () => {
    if (!d.open) return;
    for (const c of cards) if (d.contains(c.el)) build(c, reduce);
  });
}

let resizeTimer = 0;
let lastW = innerWidth;
addEventListener('resize', () => {
  if (innerWidth === lastW) return;
  lastW = innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    cards.forEach((c) => build(c, c.t > 0 && c.paused));
    document.querySelectorAll<HTMLElement>('[data-frames]').forEach((s) => delete s.dataset.done);
    drawFrames(document);
  }, 250);
});

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(50, now - last);
  last = now;
  for (const c of cards) {
    if (!c.visible || c.paused || !c.proto || document.hidden) continue;
    const step = c.slow ? dt * 0.25 : dt;
    c.t += step;
    c.proto.step(step, c.t);
    paint(c);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Frame strips (fire studies) and the still-frame grid are computed offline, once visible.
const lazyIo = new IntersectionObserver((es) => {
  for (const e of es) {
    if (!e.isIntersecting) continue;
    lazyIo.unobserve(e.target);
    const el = e.target as HTMLElement;
    if (el.dataset.frames !== undefined) setTimeout(() => drawFrames(el.parentElement!), 80);
    else
      el.querySelectorAll<HTMLElement>('[data-still]').forEach((fig, i) =>
        setTimeout(() => drawAt(fig.querySelector('canvas')!, fig.dataset.still!, Number(fig.dataset.at ?? 4500), fig.dataset.mobile !== undefined, fig.dataset.live !== undefined), 80 + i * 40),
      );
  }
});
document.querySelectorAll('[data-frames], [data-stills]').forEach((el) => lazyIo.observe(el));
