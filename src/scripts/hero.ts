// Renderer for the hero's scene family. Loaded only on the home page, and only when motion is
// allowed. The scene (chosen in <head>, see index.astro) is lazy-loaded; everything else —
// skipping, pausing off-screen, pointer interaction, resizing — is shared by all scenes.
import { SCENES } from '../lib/field/scenes';
import { canvasPainter } from '../lib/field/canvas';
import { PALETTE, type Scene, type SceneFactory, type Rect } from '../lib/field/core';

const root = document.documentElement;
const hero = document.querySelector<HTMLElement>('[data-stage-root]');
const canvas = hero?.querySelector<HTMLCanvasElement>('canvas[data-field]');
const skipBtn = hero?.querySelector<HTMLButtonElement>('[data-skip]');

if (hero && canvas) {
  const index = Math.abs(Number(root.dataset.scene) || 0) % SCENES.length;
  SCENES[index]
    .load()
    .then((factory) => start(hero, canvas, factory))
    .catch(() => {
      // Never let the animation block the page: keep the still and finish the intro.
      root.classList.remove('intro');
      root.classList.add('no-field');
    });
}

function start(hero: HTMLElement, canvas: HTMLCanvasElement, factory: SceneFactory) {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  const paint = canvasPainter(ctx);

  let intro = root.classList.contains('intro');
  let W = 0;
  let H = 0;
  let dpr = 1;
  let scene: Scene;
  let last = 0;
  let raf = 0;
  let visible = true;
  let nextChurn = 0;
  const pointer = { x: -1e4, y: -1e4, active: false };
  const finePointer = matchMedia('(pointer: fine)').matches;

  function build(fromIntro: boolean) {
    const rect = hero.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const side = W >= 860;
    // Keep the scene clear of the text: measure where the text actually is.
    const box = (sel: string) => hero.querySelector<HTMLElement>(sel)?.getBoundingClientRect();
    const inner = box('[data-hero-text]');
    const textRight = Math.max(...['.name', '.tagline', '.cta', '.areas'].map((s) => box(s)?.right ?? 0)) - rect.left;
    const textTop = (box('.role')?.top ?? rect.bottom) - rect.top;
    const field: Rect = side
      ? {
          x0: Math.max(W * 0.46, textRight + 72),
          x1: Math.min(W * 0.95, (inner ? inner.right - rect.left : W) - 24),
          y0: H * 0.15,
          y1: H * 0.8,
        }
      : { x0: W * 0.1, x1: W * 0.9, y0: 64 + 24, y1: Math.max(64 + 140, textTop - 36) };
    const area = ((field.x1 - field.x0) * (field.y1 - field.y0)) / 1e5;
    scene = factory({ width: W, height: H, field, density: area * 22, layout: side ? 'side' : 'top', seed: 30 });
    if (!fromIntro) scene.finish();
    nextChurn = scene.clock + 3200;
  }

  function draw() {
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, W, H);
    if (scene.render) {
      scene.render(ctx!);
      return;
    }
    // Which group is the pointer "considering"? (nearest node within reach)
    let hot = -1;
    let tether: { x: number; y: number; group: number } | null = null;
    if (pointer.active) {
      let best = 90 ** 2;
      for (const n of scene.hoverables()) {
        const d = (n.x - pointer.x) ** 2 + (n.y - pointer.y) ** 2;
        if (n.alpha > 0.5 && d < best) {
          best = d;
          hot = n.group;
          tether = n;
        }
      }
    }
    scene.draw(paint, hot);
    if (tether) {
      paint.line(pointer.x, pointer.y, tether.x, tether.y, PALETTE[tether.group % PALETTE.length], 0.45, 1, [1.5, 3.5]);
      paint.dot(pointer.x, pointer.y, 2, '#eeebe4', 0.8);
    }
  }

  function frame(now: number) {
    raf = 0;
    const dt = Math.min(48, last ? now - last : 16);
    last = now;
    scene.step(dt);
    if (!intro && scene.clock > nextChurn) {
      scene.churn();
      const every = scene.churnEvery ?? 3900;
      nextChurn = scene.clock + every * (0.7 + Math.random() * 0.6);
    }
    draw();
    if (intro && scene.clock > scene.introMs) endIntro();
    schedule();
  }
  function schedule() {
    if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }

  function endIntro() {
    if (!intro) return;
    intro = false;
    root.classList.remove('intro');
    skipBtn?.setAttribute('hidden', '');
    for (const [ev, fn] of skipEvents) removeEventListener(ev, fn);
  }

  /** Skip: the scene settles at once and the text resolves immediately. */
  function skip() {
    if (!intro) return;
    scene.finish();
    root.classList.add('intro-skip');
    endIntro();
  }
  const onKey = (e: KeyboardEvent) => {
    if (['Escape', 'Enter', ' ', 'ArrowDown', 'PageDown', 'Tab'].includes(e.key)) skip();
  };
  const skipEvents: [string, EventListener][] = [
    ['wheel', skip],
    ['touchmove', skip],
    ['keydown', onKey as EventListener],
    ['pointerdown', skip],
  ];
  if (intro) {
    for (const [ev, fn] of skipEvents) addEventListener(ev, fn, { passive: true });
    skipBtn?.removeAttribute('hidden');
    skipBtn?.addEventListener('click', skip);
  }

  build(intro);
  // Elemental scenes draw their own material; the dot lattice belongs to the research scenes.
  hero.classList.toggle('elemental', !!scene.render);
  draw();
  canvas.classList.add('ready');
  schedule();

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    last = 0;
    schedule();
  }).observe(hero);
  document.addEventListener('visibilitychange', () => {
    last = 0;
    schedule();
  });

  if (finePointer) {
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.active = true;
      scene.pointer?.(pointer.x, pointer.y);
    });
    hero.addEventListener('pointerleave', () => (pointer.active = false));
  }

  // Rebuild on meaningful width changes only (mobile URL bars change height constantly).
  let lastW = W;
  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const w = hero.getBoundingClientRect().width;
      if (Math.abs(w - lastW) < 40) {
        H = hero.getBoundingClientRect().height;
        canvas.height = Math.round(H * dpr);
        draw();
        return;
      }
      lastW = w;
      endIntro();
      build(false);
      draw();
    }, 150);
  });
}
