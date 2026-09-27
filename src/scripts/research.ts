// The four research illustrations in "What I work on". Nothing loads until the section approaches
// the viewport; each card animates only while it is on screen (and the tab is visible and motion is
// not paused). With reduced motion, each card shows one representative still, drawn once.
import { motionPaused, onMotionChange, showMotionControls } from './motion';

const section = document.getElementById('research');
const canvases = [...document.querySelectorAll<HTMLCanvasElement>('canvas[data-research]')];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

type Proto = { step(dt: number, t: number): void; render(ctx: CanvasRenderingContext2D, t: number): void };
type Entry = { make: (w: number, h: number, seed?: number) => Proto; still: number };
interface Card { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; entry: Entry; proto: Proto; t: number; w: number; h: number; dpr: number; visible: boolean }

if (section && canvases.length) {
  const gate = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return;
      gate.disconnect();
      import('../lib/field/research').then(({ RESEARCH_SCENES }) => start(RESEARCH_SCENES as unknown as Record<string, Entry>));
    },
    { rootMargin: '500px 0px' },
  );
  gate.observe(section);
}

function start(scenes: Record<string, Entry>) {
  const cards: Card[] = [];
  const build = (c: Card) => {
    const r = c.canvas.getBoundingClientRect();
    c.dpr = Math.min(devicePixelRatio || 1, 2);
    c.w = r.width;
    c.h = r.height;
    c.canvas.width = Math.round(r.width * c.dpr);
    c.canvas.height = Math.round(r.height * c.dpr);
    c.proto = c.entry.make(c.w, c.h, 7);
    c.t = 0;
    // Start at a representative moment, so a card is never blank when it scrolls into view (with
    // reduced motion or motion paused, this is the one still drawn).
    while (c.t < c.entry.still) c.proto.step(16, (c.t += 16));
    paint(c);
  };
  const paint = (c: Card) => {
    c.ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
    c.ctx.clearRect(0, 0, c.w, c.h);
    c.proto.render(c.ctx, c.t);
  };
  for (const canvas of canvases) {
    const entry = scenes[canvas.dataset.research ?? ''];
    const ctx = canvas.getContext('2d');
    if (!entry || !ctx) continue;
    const c = { canvas, ctx, entry, proto: null as unknown as Proto, t: 0, w: 0, h: 0, dpr: 1, visible: false };
    build(c);
    cards.push(c);
  }
  if (reduce) {
    addEventListener('resize', () => cards.forEach(build));
    return;
  }
  showMotionControls();

  let raf = 0;
  let last = 0;
  const running = () => !motionPaused() && !document.hidden && cards.some((c) => c.visible);
  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min(48, last ? now - last : 16);
    last = now;
    for (const c of cards) {
      if (!c.visible) continue;
      c.t += dt;
      c.proto.step(dt, c.t);
      paint(c);
    }
    schedule();
  };
  const schedule = () => {
    if (!raf && running()) raf = requestAnimationFrame(frame);
    if (!running()) last = 0;
  };
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      const c = cards.find((k) => k.canvas === e.target);
      if (c) c.visible = e.isIntersecting;
    }
    schedule();
  });
  cards.forEach((c) => io.observe(c.canvas));
  document.addEventListener('visibilitychange', schedule);
  onMotionChange((p) => {
    if (p) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    schedule();
  });

  let lastW = innerWidth;
  let timer = 0;
  addEventListener('resize', () => {
    if (innerWidth === lastW) return;
    lastW = innerWidth;
    clearTimeout(timer);
    timer = window.setTimeout(() => cards.forEach(build), 200);
  });
}
