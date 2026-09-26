// Harness for /design-review/elements/: one animation loop for every visible card, with
// replay / pause / reset (settled) controls, pointer forwarding, and offline still frames.
import { ENTRIES } from '../lib/field/review/registry';
import type { Proto } from '../lib/field/review/common';

const byId = new Map(ENTRIES.map((e) => [e.id, e]));
const dpr = Math.min(devicePixelRatio || 1, 2);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Card {
  id: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  pauseBtn: HTMLButtonElement;
  proto: Proto;
  t: number;
  w: number;
  h: number;
  paused: boolean;
  visible: boolean;
}

function sizeCanvas(canvas: HTMLCanvasElement) {
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  return { w: r.width, h: r.height };
}

function build(card: Card, settle: boolean) {
  const { w, h } = sizeCanvas(card.canvas);
  card.w = w;
  card.h = h;
  card.proto = byId.get(card.id)!.make(w, h);
  card.t = 0;
  if (settle) {
    card.proto.settle?.();
    card.t = 6000;
    card.proto.step(16, card.t);
  }
  paint(card);
}

function paint(card: Card) {
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

const cards: Card[] = [];
const io = new IntersectionObserver((es) => {
  for (const e of es) {
    const c = cards.find((k) => k.canvas === e.target);
    if (c) c.visible = e.isIntersecting;
  }
});

for (const el of document.querySelectorAll<HTMLElement>('[data-card]')) {
  const canvas = el.querySelector('canvas')!;
  const card: Card = {
    id: el.dataset.card!,
    canvas,
    ctx: canvas.getContext('2d')!,
    pauseBtn: el.querySelector<HTMLButtonElement>('[data-act="pause"]')!,
    proto: null as unknown as Proto,
    t: 0,
    w: 0,
    h: 0,
    paused: false,
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
  canvas.addEventListener('pointermove', (ev) => {
    if (card.paused) return;
    const r = canvas.getBoundingClientRect();
    card.proto.pointer?.(ev.clientX - r.left, ev.clientY - r.top, card.t);
  });
}

let resizeTimer = 0;
let lastW = innerWidth;
addEventListener('resize', () => {
  if (innerWidth === lastW) return;
  lastW = innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => cards.forEach((c) => build(c, c.t > 0 && c.paused)), 250);
});

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(50, now - last);
  last = now;
  for (const c of cards) {
    if (!c.visible || c.paused || document.hidden) continue;
    c.t += dt;
    c.proto.step(dt, c.t);
    paint(c);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Still frames: every entry stepped offline to the same moment.
const STILL_MS = 4500;
function renderStills() {
  for (const fig of document.querySelectorAll<HTMLElement>('[data-still]')) {
    const canvas = fig.querySelector('canvas')!;
    const { w, h } = sizeCanvas(canvas);
    const p = byId.get(fig.dataset.still!)!.make(w, h);
    let t = 0;
    while (t < STILL_MS) {
      t += 16;
      p.step(16, t);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    p.render(ctx, t);
  }
}
const stillsIo = new IntersectionObserver((es, obs) => {
  if (es.some((e) => e.isIntersecting)) {
    obs.disconnect();
    setTimeout(renderStills, 50);
  }
});
const firstStills = document.querySelector('[data-stills]');
if (firstStills) stillsIo.observe(firstStills);
