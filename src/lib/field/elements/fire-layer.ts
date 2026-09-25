// Fire: a flame front rather than a fountain. Emission along the base is modulated by moving
// noise, so the flame gathers into separate tongues; particles rise on buoyancy and are pushed
// sideways by a spatially coherent noise field, so neighbours lick upwards together. Pre-rendered
// radial "heat" sprites are drawn additively and cool with age (white-gold core → orange → deep
// red → a little smoke). Embers flicker and drift above. The entrance: ignition at one point,
// spreading along the base.
import { mulberry32 } from '../core';
import { makeNoise, smooth, clamp, mix, type Layer, type LayerContext } from './kit';

interface Flame {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r: number;
}
interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  phase: number;
}

export interface FireOptions extends LayerContext {
  /** Base line of the fire (defaults: bottom of the field, 60% of its width). */
  baseY?: number;
  baseX0?: number;
  baseX1?: number;
  /** Overall size multiplier. */
  scale?: number;
  /** Extra horizontal drift (px/ms) at a point, e.g. wind in Convergence. */
  wind?: (x: number, y: number, t: number) => number;
  /** Where embers land (Convergence: they fall into the water). */
  onEmberFall?: (x: number, y: number, t: number) => void;
}

function sprite(stops: [number, string][], size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export function createFireLayer(o: FireOptions): Layer {
  const f = o.field;
  const rand = mulberry32(o.seed + 19);
  const noise = makeNoise(o.seed + 23);
  const delay = o.delay ?? 0;
  const W = f.x1 - f.x0;
  const H = f.y1 - f.y0;
  const baseY = o.baseY ?? f.y1 - H * 0.06;
  const bx0 = o.baseX0 ?? f.x0 + W * 0.2;
  const bx1 = o.baseX1 ?? f.x1 - W * 0.2;
  const bw = bx1 - bx0;
  const scale = (o.scale ?? 1) * Math.min(1.25, Math.max(0.6, H / 520));
  const ignite = { x: bx0 + bw * 0.5, at: delay + 250 };
  const rate = (o.mobile ? 0.2 : 0.34) * clamp(bw / 420, 0.45, 1.4); // particles per ms

  const CORE = sprite([[0, 'rgba(255,232,178,0.95)'], [0.35, 'rgba(255,196,110,0.55)'], [1, 'rgba(255,170,80,0)']]);
  const HOT = sprite([[0, 'rgba(255,190,100,0.85)'], [0.45, 'rgba(255,128,40,0.35)'], [1, 'rgba(230,80,20,0)']]);
  const COOL = sprite([[0, 'rgba(214,72,26,0.6)'], [0.5, 'rgba(150,38,18,0.22)'], [1, 'rgba(90,20,10,0)']]);
  const SMOKE = sprite([[0, 'rgba(120,112,108,0.16)'], [1, 'rgba(80,76,74,0)']]);
  const EMBER = sprite([[0, 'rgba(255,236,190,1)'], [0.3, 'rgba(255,170,90,0.6)'], [1, 'rgba(255,120,40,0)']], 16);

  // Flames are drawn into a low-resolution buffer and scaled up: the upscale blurs the heat
  // sprites into one continuous luminous body (and is cheaper than full-resolution drawing).
  const maxH = Math.min(H * 0.8, bw * 1.1 + 120 * scale);
  const pad = 90 * scale;
  const box = { x: bx0 - pad, y: baseY - maxH - pad, w: bw + pad * 2, h: maxH + pad * 1.6 };
  const RES = 0.34;
  const buffer = document.createElement('canvas');
  buffer.width = Math.max(8, Math.round(box.w * RES));
  buffer.height = Math.max(8, Math.round(box.h * RES));
  const bctx = buffer.getContext('2d')!;

  const flames: Flame[] = [];
  const embers: Ember[] = [];
  let carry = 0;
  let settled = false;

  const spread = (t: number) => (settled ? 1e9 : Math.max(0, (t - ignite.at) * 0.32));
  const density = (x: number, t: number) => {
    const u = (x - bx0) / bw;
    const hump = Math.pow(Math.sin(Math.PI * clamp(u)), 0.7);
    const tongues = 0.25 + 0.75 * clamp(0.5 + noise(x * 0.018, t * 0.0011, 3.1) * 1.3);
    return hump * tongues;
  };

  function emit(dt: number, t: number) {
    carry += rate * dt * smooth(ignite.at, ignite.at + 900, t) + (settled ? rate * dt : 0) * 0;
    while (carry >= 1) {
      carry -= 1;
      for (let tries = 0; tries < 4; tries++) {
        const x = bx0 + rand() * bw;
        if (Math.abs(x - ignite.x) > spread(t) || rand() > density(x, t)) continue;
        flames.push({
          x,
          y: baseY + (rand() - 0.5) * 4,
          vx: (rand() - 0.5) * 0.02,
          vy: -0.02 - rand() * 0.04,
          age: 0,
          life: (700 + rand() * 700) * mix(0.75, 1.3, density(x, t)),
          r: (22 + rand() * 18) * scale * mix(0.7, 1.15, density(x, t)),
        });
        break;
      }
    }
    if (rand() < dt * (o.mobile ? 0.0025 : 0.004) && t > ignite.at) {
      const x = bx0 + bw * (0.2 + rand() * 0.6);
      if (Math.abs(x - ignite.x) < spread(t))
        embers.push({ x, y: baseY - 10 * scale, vx: (rand() - 0.5) * 0.03, vy: -0.05 - rand() * 0.06, age: 0, life: 1800 + rand() * 2400, size: 1.2 + rand() * 1.8, phase: rand() * 6 });
    }
  }

  return {
    step(dt, t) {
      if (t < ignite.at) return;
      emit(dt, t);
      const time = t * 0.001;
      for (const p of flames) {
        p.age += dt;
        p.vy -= 0.00085 * dt * scale; // buoyancy
        // Coherent sideways licking: one noise field, sampled in a frame that rises with the flame.
        const n = noise(p.x * 0.006, (p.y + t * 0.16) * 0.007, time * 0.5);
        p.vx += n * 0.0026 * dt + ((bx0 + bw / 2 - p.x) / bw) * 0.00022 * dt;
        if (o.wind) p.vx += o.wind(p.x, p.y, t) * 0.004 * dt * (p.age / p.life);
        const drag = Math.pow(0.975, dt / 16);
        p.vx *= drag;
        p.vy *= Math.pow(0.99, dt / 16);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      for (let i = flames.length - 1; i >= 0; i--) if (flames[i].age > flames[i].life || flames[i].y < baseY - maxH) flames.splice(i, 1);
      for (const e of embers) {
        e.age += dt;
        e.vx += noise(e.x * 0.01, e.y * 0.01, time) * 0.0006 * dt;
        if (o.wind) e.vx += o.wind(e.x, e.y, t) * 0.002 * dt;
        e.vx *= Math.pow(0.98, dt / 16);
        e.vy += 0.000012 * dt; // they slow, then drift down as they cool
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      }
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        if (e.age > e.life) {
          o.onEmberFall?.(e.x, e.y, t);
          embers.splice(i, 1);
        }
      }
    },
    finish() {
      settled = true;
    },
    render(ctx, t) {
      if (t < ignite.at) return;
      const warm = smooth(ignite.at, ignite.at + 1400, t);
      ctx.save();
      // The glow the flame casts around its base.
      const glowR = bw * 0.75 + 60 * scale;
      const flicker = 0.85 + 0.15 * noise(t * 0.004, 0.5, 9);
      const g = ctx.createRadialGradient(bx0 + bw / 2, baseY - 20 * scale, 0, bx0 + bw / 2, baseY - 20 * scale, glowR);
      g.addColorStop(0, `rgba(255,140,60,${(0.13 * warm * flicker).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      // Fill the whole square around the gradient: a shorter rect would cut the glow in a line.
      ctx.fillRect(bx0 + bw / 2 - glowR, baseY - 20 * scale - glowR, glowR * 2, glowR * 2);
      // Smoke first (normal blending), then flame (additive).
      for (const p of flames) {
        const k = p.age / p.life;
        if (k < 0.75) continue;
        const r = p.r * (1 + k);
        ctx.globalAlpha = (1 - k) * 0.35;
        ctx.drawImage(SMOKE, p.x - r, p.y - r * 1.4, r * 2, r * 2.8);
      }
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, buffer.width, buffer.height);
      bctx.globalCompositeOperation = 'lighter';
      bctx.setTransform(RES, 0, 0, RES, -box.x * RES, -box.y * RES);
      for (const p of flames) {
        const k = p.age / p.life;
        // Grows in from small, then shrinks as it cools so tongues come to points; stretched like flame.
        const r = p.r * (0.5 + 0.5 * smooth(0, 0.18, k)) * (1 - 0.8 * k);
        const img = k < 0.25 ? CORE : k < 0.58 ? HOT : COOL;
        // Fade out as it approaches the top of the flame.
        const top = 1 - smooth(0.55, 1, (baseY - p.y) / maxH);
        bctx.globalAlpha = clamp(k < 0.08 ? k / 0.08 : 1 - Math.max(0, k - 0.5) / 0.5) * 0.34 * top;
        bctx.drawImage(img, p.x - r, p.y - r * 1.7, r * 2, r * 3.2);
      }
      // Soften the buffer's edges so the flame's faint haze never shows the buffer's rectangle.
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.globalAlpha = 1;
      bctx.globalCompositeOperation = 'destination-in';
      const bw2 = buffer.width / 2;
      const bh2 = buffer.height / 2;
      bctx.translate(bw2, bh2);
      bctx.scale(1, bh2 / bw2);
      const mask = bctx.createRadialGradient(0, 0, bw2 * 0.55, 0, 0, bw2);
      mask.addColorStop(0, 'rgba(0,0,0,1)');
      mask.addColorStop(1, 'rgba(0,0,0,0)');
      bctx.fillStyle = mask;
      bctx.fillRect(-bw2, -bw2, bw2 * 2, bw2 * 2);
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.globalCompositeOperation = 'source-over';
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(buffer, box.x, box.y, box.w, box.h);
      for (const e of embers) {
        const k = e.age / e.life;
        const fl = 0.55 + 0.45 * Math.sin(e.age * 0.02 + e.phase);
        ctx.globalAlpha = clamp((1 - k) * fl);
        const s = e.size * 3;
        ctx.drawImage(EMBER, e.x - s, e.y - s, s * 2, s * 2);
      }
      // Ignition flash.
      const since = t - ignite.at;
      if (since < 500) {
        const r = (20 + since * 0.12) * scale;
        ctx.globalAlpha = 1 - since / 500;
        ctx.drawImage(CORE, ignite.x - r, baseY - r * 0.6, r * 2, r * 2);
      }
      ctx.restore();
    },
  };
}
