// Directed fire: invisible "heads" follow timed paths and lay down hot gas that inherits their
// velocity; as it is released, buoyancy (∝ temperature), turbulence and cooling take over. The gas
// is splatted into a low-resolution heat field, eroded at its cooler edges by rising, vertically
// stretched noise (tongues), and coloured by temperature: deep red edges, orange, amber, yellow,
// pale yellow-white cores. Sparse embers are drawn on top.
import { mulberry32 } from '../core';
import { makeNoise, makeNoise2, curl, fbm2, clamp } from './kit';

// Temperature → colour: narrow transitions between nested regions.
const STOPS: [number, number, number, number, number][] = [
  [0.0, 96, 18, 6, 0],
  [0.06, 138, 28, 10, 0.55],
  [0.18, 196, 58, 18, 0.82],
  [0.32, 232, 100, 28, 0.9],
  [0.48, 247, 146, 44, 0.94],
  [0.64, 253, 190, 82, 0.96],
  [0.82, 255, 226, 160, 0.98],
  [1.0, 255, 244, 214, 1],
];
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const FIRE_LUT = (() => {
  const out = new Uint8ClampedArray(256 * 4);
  for (let n = 0; n < 256; n++) {
    const t = n / 255;
    let rgba = STOPS[STOPS.length - 1].slice(1);
    for (let i = 1; i < STOPS.length; i++) {
      if (t <= STOPS[i][0]) {
        const a = STOPS[i - 1];
        const b = STOPS[i];
        const k = smoothstep(i === 1 ? 0.5 : 0.1, 1, (t - a[0]) / (b[0] - a[0]));
        rgba = [1, 2, 3, 4].map((j) => a[j] + (b[j] - a[j]) * k);
        break;
      }
    }
    if (t <= 0) rgba = [0, 0, 0, 0];
    out.set([rgba[0], rgba[1], rgba[2], rgba[3] * 255], n * 4);
  }
  return out;
})();

export interface Gas { x: number; y: number; vx: number; vy: number; T: number; r: number; tau: number }
export interface Ember { x: number; y: number; vx: number; vy: number; life: number; age: number; b: number }

export function flameEngine(W: number, H: number, seed: number, cell = 2.5) {
  const S = Math.min(W, H) / 400; // scale
  const rand = mulberry32(seed);
  const n3 = makeNoise(seed + 3);
  const n2 = makeNoise2(seed + 5);
  const cols = Math.max(16, Math.round(W / cell));
  const rows = Math.max(16, Math.round(H / cell));
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const bctx = canvas.getContext('2d')!;
  const img = bctx.createImageData(cols, rows);
  const heat = new Float32Array(cols * rows);
  const sx = cols / W;
  const sy = rows / H;
  const gas: Gas[] = [];
  const embers: Ember[] = [];
  // Pointer: a gentle, decaying current that nudges gas and embers along the pointer's motion.
  const pg = { x: -1e4, y: -1e4, vx: 0, vy: 0, amp: 0, lt: 0 };
  // Soft falloff towards the edges of the field (no hard frame).
  const edgeX = new Float32Array(cols);
  const edgeY = new Float32Array(rows);
  for (let i = 0; i < cols; i++) edgeX[i] = smoothstep(0, 0.1, i / cols) * smoothstep(0, 0.1, 1 - i / cols);
  for (let j = 0; j < rows; j++) edgeY[j] = smoothstep(0, 0.08, j / rows) * smoothstep(0, 0.12, 1 - j / rows);

  return {
    S,
    rand,
    gas,
    embers,
    /** Lay down hot gas at (x, y) moving with (vx, vy) px/ms. */
    emit(x: number, y: number, vx: number, vy: number, T: number, r: number, spread = 0.3, tau = 700) {
      gas.push({ x, y, vx: vx + (rand() - 0.5) * spread * S * 0.2, vy: vy + (rand() - 0.5) * spread * S * 0.2, T, r: r * S * (0.8 + rand() * 0.4), tau: tau * (0.8 + rand() * 0.4) });
    },
    ember(x: number, y: number, vx: number, vy: number, life = 1200 + rand() * 2200) {
      embers.push({ x, y, vx: vx + (rand() - 0.5) * 0.06 * S, vy: vy - rand() * 0.05 * S, life, age: 0, b: 0.6 + rand() * 0.4 });
    },
    pointer(x: number, y: number, t: number) {
      const dt = Math.max(16, t - pg.lt);
      if (pg.lt && t - pg.lt < 200) {
        pg.vx += ((x - pg.x) / dt - pg.vx) * 0.5;
        pg.vy += ((y - pg.y) / dt - pg.vy) * 0.5;
      } else {
        pg.vx = 0;
        pg.vy = 0;
      }
      pg.x = x;
      pg.y = y;
      pg.lt = t;
      pg.amp = Math.min(1, pg.amp + 0.25);
    },
    step(dt: number, t: number) {
      pg.amp *= Math.pow(0.95, dt / 16);
      const drag = Math.exp(-dt / 420);
      const R2 = (110 * S) ** 2;
      for (let i = gas.length - 1; i >= 0; i--) {
        const p = gas[i];
        // Momentum decays; buoyancy (∝ temperature) and turbulence take over.
        const [cu, cv] = curl(n3, (p.x * 0.006) / S, (p.y * 0.006) / S, t * 0.0004);
        const turb = 0.035 * S * (1.15 - p.T);
        p.vx = p.vx * drag + cu * turb * dt * 0.01;
        p.vy = p.vy * drag + cv * turb * dt * 0.01 - 0.00034 * S * p.T * dt;
        if (pg.amp > 0.01) {
          const k = pg.amp * Math.exp(-((p.x - pg.x) ** 2 + (p.y - pg.y) ** 2) / R2) * 0.012 * dt;
          p.vx += clamp(pg.vx, -1, 1) * k * 0.4;
          p.vy += clamp(pg.vy, -1, 1) * k * 0.4;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        // Fast at first, then lingering (roughly T⁴ loss plus a slow floor).
        p.T -= (p.T * p.T * p.T * p.T * 0.9 + 0.12) * (dt / p.tau);
        p.r += dt * 0.006 * S;
        if (p.T <= 0.02) gas.splice(i, 1);
      }
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.age += dt;
        e.vx = e.vx * Math.exp(-dt / 900) + n2(e.x * 0.01, t * 0.0006) * 0.0006 * S * dt;
        e.vy = e.vy * Math.exp(-dt / 900) - 0.00003 * S * dt;
        if (pg.amp > 0.01) {
          const k = pg.amp * Math.exp(-((e.x - pg.x) ** 2 + (e.y - pg.y) ** 2) / R2) * 0.01 * dt;
          e.vx += clamp(pg.vx, -1, 1) * k * 0.5;
          e.vy += clamp(pg.vy, -1, 1) * k * 0.5;
        }
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.age > e.life) embers.splice(i, 1);
      }
    },
    render(ctx: CanvasRenderingContext2D, t: number, x0 = 0, y0 = 0) {
      heat.fill(0);
      for (const p of gas) {
        const cx = p.x * sx;
        const cy = p.y * sy;
        const rr = Math.max(1.2, p.r * sx);
        // Stretch along the motion (and so upward once buoyancy leads): flames trail and rise.
        const sp = Math.hypot(p.vx, p.vy) / S;
        const ux = sp > 1e-4 ? p.vx / (sp * S) : 0;
        const uy = sp > 1e-4 ? p.vy / (sp * S) : -1;
        const along = rr * (1 + Math.min(2.8, sp * 12));
        const reach = Math.ceil(Math.max(rr, along) + 1);
        const j0 = Math.max(0, Math.floor(cy - reach));
        const j1 = Math.min(rows - 1, cy + reach);
        const i0 = Math.max(0, Math.floor(cx - reach));
        const i1 = Math.min(cols - 1, cx + reach);
        for (let j = j0; j <= j1; j++)
          for (let i = i0; i <= i1; i++) {
            const dx = i - cx;
            const dy = j - cy;
            const a = (dx * ux + dy * uy) / along;
            const b = (dx * -uy + dy * ux) / rr;
            const d2 = a * a + b * b;
            if (d2 < 1) heat[j * cols + i] += p.T * (1 - d2) * (1 - d2) * 0.42;
          }
      }
      const d = img.data;
      const time = t * 0.001;
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const q = j * cols + i;
          const h = heat[q] * edgeX[i] * edgeY[j];
          if (h < 0.01) {
            d[q * 4 + 3] = 0;
            continue;
          }
          const base = 1 - Math.exp(-h * 1.3);
          // Tall, flowing tongues: erosion stretched vertically, gently domain-warped, scrolling
          // upward; it bites deepest into the cooler outer layers.
          const wq = 0.8 * n2((i * 0.025) / S, (j * 0.02) / S - time * 0.9);
          const nz = 0.5 + fbm2(n2, (i * 0.075) / S + wq, (j * 0.032) / S + time * 1.9, 2);
          const T = clamp(base * (0.45 + 1.05 * nz * (1.15 - base * 0.5)) - 0.12 * (1 - base));
          const li = (T * 255) | 0;
          d[q * 4] = FIRE_LUT[li * 4];
          d[q * 4 + 1] = FIRE_LUT[li * 4 + 1];
          d[q * 4 + 2] = FIRE_LUT[li * 4 + 2];
          d[q * 4 + 3] = FIRE_LUT[li * 4 + 3];
        }
      bctx.putImageData(img, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, x0, y0, W, H);
      for (const e of embers) {
        const u = e.age / e.life;
        const fl = 0.6 + 0.4 * Math.sin(e.age * 0.03 + e.x);
        const a = (1 - u) * e.b * fl * edgeX[clamp(Math.round(e.x * sx), 0, cols - 1)] * edgeY[clamp(Math.round(e.y * sy), 0, rows - 1)];
        const hot = 1 - u;
        ctx.fillStyle = `rgba(255,${(150 + 80 * hot) | 0},${(60 + 80 * hot * hot) | 0},${a})`;
        const s = Math.max(0.8, 1.6 * S * (1 - u * 0.5));
        ctx.fillRect(x0 + e.x - s / 2, y0 + e.y - s / 2, s, s);
      }
      ctx.restore();
    },
  };
}

export type Key = [number, number, number]; // t (ms), x, y (fractions of the field)
/** Position along timed keyframes: time → segment, Catmull–Rom in space. */
export function pathAt(keys: Key[], t: number, W: number, H: number): [number, number] | null {
  if (t < keys[0][0] || t > keys[keys.length - 1][0]) return null;
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const u = (t - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
  const k = (n: number) => keys[Math.max(0, Math.min(keys.length - 1, n))];
  const p0 = k(i - 1);
  const p1 = k(i);
  const p2 = k(i + 1);
  const p3 = k(i + 2);
  const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  return [cr(p0[1], p1[1], p2[1], p3[1]) * W, cr(p0[2], p1[2], p2[2], p3[2]) * H];
}
export const mirror = (keys: Key[]): Key[] => keys.map(([t, x, y]) => [t, 1 - x, y]);

/** A soft warm glow, added with 'lighter' (anticipation, flares). warm = 0 is near-white. */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, warm = 1) {
  if (a <= 0.005 || r <= 0) return;
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(255,${(214 + 30 * (1 - warm)) | 0},${(150 + 80 * (1 - warm)) | 0},${a})`);
  gr.addColorStop(0.35, `rgba(246,${(140 + 40 * (1 - warm)) | 0},48,${a * 0.45})`);
  gr.addColorStop(1, 'rgba(160,40,10,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = gr;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}
