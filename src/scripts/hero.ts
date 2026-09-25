// Canvas renderer for the hero's online-coalition-formation field.
// Loaded only on the home page, and only when motion is allowed.
import { createSim, COALITION_COLOURS, type Sim } from '../lib/coalition-sim';

const root = document.documentElement;
const hero = document.querySelector<HTMLElement>('[data-stage-root]');
const canvas = hero?.querySelector<HTMLCanvasElement>('canvas[data-field]');
const counter = hero?.querySelector<HTMLElement>('[data-counter]');
const skipBtn = hero?.querySelector<HTMLButtonElement>('[data-skip]');

const PROBE_MS = 240;
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
};

if (hero && canvas) start(hero, canvas);

function start(hero: HTMLElement, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  let intro = root.classList.contains('intro');
  let W = 0;
  let H = 0;
  let dpr = 1;
  let sim: Sim;
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
    // Keep the coalitions clear of the text: measure where the text actually is.
    const box = (sel: string) => hero.querySelector<HTMLElement>(sel)?.getBoundingClientRect();
    const inner = box('[data-hero-text]');
    const cap = box('.caption');
    const textRight = Math.max(...['.name', '.tagline', '.cta'].map((s) => box(s)?.right ?? 0)) - rect.left;
    const capTop = (cap?.top ?? rect.bottom) - rect.top;
    const field = side
      ? {
          x0: Math.max(W * 0.46, textRight + 72),
          x1: Math.min(W * 0.95, (inner ? inner.right - rect.left : W) - 24),
          y0: H * 0.15,
          y1: Math.min(H * 0.78, capTop - H * 0.1),
        }
      : {
          x0: W * 0.1,
          x1: W * 0.9,
          y0: 64 + 24,
          y1: Math.max(64 + 140, capTop - 28),
        };
    const fieldArea = ((field.x1 - field.x0) * (field.y1 - field.y0)) / 1e5;
    sim = createSim({
      width: W,
      height: H,
      count: Math.round(Math.max(26, Math.min(side ? 72 : 40, fieldArea * 22))),
      layout: side ? 'side' : 'top',
      seed: 30,
      field,
    });
    if (!fromIntro) sim.finish();
    nextChurn = sim.clock + 4200;
  }

  function draw() {
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, W, H);
    const { agents, coalitions, unit } = sim;

    // Which coalition is the pointer "considering"? (nearest agent within reach)
    let hot = -1;
    let hotAgent = -1;
    if (pointer.active) {
      let best = (unit * 7) ** 2;
      for (const a of agents) {
        if (a.state !== 'committed') continue;
        const d = (a.x - pointer.x) ** 2 + (a.y - pointer.y) ** 2;
        if (d < best) {
          best = d;
          hot = a.coalition;
          hotAgent = a.id;
        }
      }
    }

    // Soft halos: the coalitions' presence.
    for (const c of coalitions) {
      const n = c.members.length;
      if (!n) continue;
      const r = unit * (2.4 + Math.sqrt(n) * 1.5);
      const g = ctx!.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
      const colour = COALITION_COLOURS[c.id % COALITION_COLOURS.length];
      g.addColorStop(0, rgba(colour, c.id === hot ? 0.16 : 0.085));
      g.addColorStop(1, rgba(colour, 0));
      ctx!.fillStyle = g;
      ctx!.beginPath();
      ctx!.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx!.fill();
    }

    // Edges: each agent's link to the member it attached to.
    ctx!.lineCap = 'round';
    for (const a of agents) {
      if ((a.state !== 'committed' && a.state !== 'leaving') || a.parent < 0) continue;
      const p = agents[a.parent];
      if (!p || p.state === 'gone') continue;
      const colour = COALITION_COLOURS[a.coalition % COALITION_COLOURS.length];
      // Edges appear as the agent settles into its coalition, not while it is in transit.
      const [tx, ty] = sim.slot(a);
      const settle = Math.max(0, 1 - Math.hypot(tx - a.x, ty - a.y) / (unit * 3));
      if (settle <= 0) continue;
      const fresh = a.state === 'committed' ? Math.max(0, 1 - a.t / 900) * settle : 0;
      const base = a.coalition === hot ? 0.55 : 0.3;
      ctx!.strokeStyle = rgba(colour, Math.min(a.alpha, p.alpha) * settle * (base + fresh * 0.5));
      ctx!.lineWidth = 1 + fresh * 0.8;
      ctx!.beginPath();
      ctx!.moveTo(a.x, a.y);
      ctx!.lineTo(p.x, p.y);
      ctx!.stroke();
    }

    // Probing: an arriving agent weighs its best candidate coalitions.
    ctx!.setLineDash([2, 4]);
    for (const a of agents) {
      if (a.state !== 'probing') continue;
      const k = 1 - a.t / PROBE_MS;
      // Short feelers towards the candidate coalitions, strongest for the best.
      a.candidates.forEach((cid, rank) => {
        const c = coalitions[cid];
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const reach = Math.min(len, unit * (5 - rank * 1.3)) * Math.min(1, a.t / 120);
        ctx!.strokeStyle = rgba(COALITION_COLOURS[cid % COALITION_COLOURS.length], 0.7 * k * (1 - rank * 0.3));
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(a.x, a.y);
        ctx!.lineTo(a.x + (dx / len) * reach, a.y + (dy / len) * reach);
        ctx!.stroke();
      });
    }
    ctx!.setLineDash([]);

    // Pointer: a would-be arrival, tethered to the agent it is nearest to.
    if (hotAgent >= 0) {
      const a = agents[hotAgent];
      ctx!.strokeStyle = rgba(COALITION_COLOURS[a.coalition % COALITION_COLOURS.length], 0.45);
      ctx!.setLineDash([1.5, 3.5]);
      ctx!.beginPath();
      ctx!.moveTo(pointer.x, pointer.y);
      ctx!.lineTo(a.x, a.y);
      ctx!.stroke();
      ctx!.setLineDash([]);
      ctx!.fillStyle = 'rgba(238,235,228,0.8)';
      ctx!.beginPath();
      ctx!.arc(pointer.x, pointer.y, 2, 0, Math.PI * 2);
      ctx!.fill();
    }

    // Agents.
    for (const a of agents) {
      if (a.state === 'waiting' || a.state === 'gone') continue;
      const colour = a.coalition >= 0 ? COALITION_COLOURS[a.coalition % COALITION_COLOURS.length] : '#eeebe4';
      const age = a.state === 'probing' ? a.t : a.t + PROBE_MS;
      // Arrival ping.
      if (a.state !== 'leaving' && age < 900) {
        const k = age / 900;
        ctx!.strokeStyle = rgba(a.coalition >= 0 ? colour : '#eeebe4', (1 - k) * 0.55);
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.arc(a.x, a.y, 3 + k * unit * 1.6, 0, Math.PI * 2);
        ctx!.stroke();
      }
      const r = a.state === 'probing' ? 2.6 : a.coalition === hot ? 2.9 : 2.3;
      ctx!.fillStyle = rgba(colour, a.alpha * (a.state === 'probing' ? 1 : 0.95));
      ctx!.beginPath();
      ctx!.arc(a.x, a.y, r, 0, Math.PI * 2);
      ctx!.fill();
    }
  }

  let shownArrivals = -1;
  function updateCounter() {
    if (!counter) return;
    const n = sim.arrivals;
    if (n === shownArrivals) return;
    shownArrivals = n;
    const k = sim.coalitions.filter((c) => c.members.length).length;
    counter.textContent = `t = ${String(n).padStart(2, '0')} · ${k} coalition${k === 1 ? '' : 's'}`;
  }

  function frame(now: number) {
    raf = 0;
    const dt = Math.min(48, last ? now - last : 16);
    last = now;
    sim.step(dt);
    if (!intro && sim.clock > nextChurn) {
      sim.churn();
      nextChurn = sim.clock + 3800 + Math.random() * 2600;
    }
    draw();
    updateCounter();
    if (intro && sim.clock > sim.introMs) endIntro();
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
    removeSkipListeners();
  }

  /** Fast-forward: remaining agents rush in, and the text resolves immediately. */
  function skip() {
    if (!intro) return;
    const now = sim.clock;
    sim.agents
      .filter((a) => a.state === 'waiting')
      .forEach((a, i) => {
        a.arriveAt = now + i * 6;
      });
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
  function removeSkipListeners() {
    for (const [ev, fn] of skipEvents) removeEventListener(ev, fn);
  }
  if (intro) {
    for (const [ev, fn] of skipEvents) addEventListener(ev, fn, { passive: true });
    skipBtn?.removeAttribute('hidden');
    skipBtn?.addEventListener('click', skip);
    try {
      localStorage.setItem('intro-seen', String(Date.now()));
    } catch {}
  }

  build(intro);
  draw();
  canvas.classList.add('ready');
  schedule();

  // Pause when off-screen or in a background tab.
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
        const h = hero.getBoundingClientRect().height;
        H = h;
        canvas.height = Math.round(h * dpr);
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
