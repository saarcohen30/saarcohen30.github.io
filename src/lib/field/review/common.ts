// Shared bits for the design-review prototypes (not used by the live site).
import { smooth, mix, clamp } from '../elements/kit';

export interface Proto {
  step(dt: number, t: number): void;
  render(ctx: CanvasRenderingContext2D, t: number): void;
  pointer?(x: number, y: number, t: number): void;
  settle?(): void;
}
export type ProtoFactory = (w: number, h: number, seed?: number) => Proto;

// ---------------------------------------------------------------- fire palette
// Temperature → colour with narrow transitions between nested regions:
// deep red-orange edge, orange, amber, yellow, pale yellow-white.
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
export const FIRE_LUT = (() => {
  const out = new Uint8ClampedArray(256 * 4);
  for (let n = 0; n < 256; n++) {
    const t = n / 255;
    let c = STOPS[STOPS.length - 1];
    let rgba = [c[1], c[2], c[3], c[4]];
    for (let i = 1; i < STOPS.length; i++) {
      if (t <= STOPS[i][0]) {
        const a = STOPS[i - 1];
        const b = STOPS[i];
        const k = i === 1 ? smooth(0.5, 1, (t - a[0]) / (b[0] - a[0])) : smooth(0.1, 1, (t - a[0]) / (b[0] - a[0]));
        rgba = [mix(a[1], b[1], k), mix(a[2], b[2], k), mix(a[3], b[3], k), mix(a[4], b[4], k)];
        break;
      }
    }
    if (t <= 0) rgba = [0, 0, 0, 0];
    out.set([rgba[0], rgba[1], rgba[2], rgba[3] * 255], n * 4);
  }
  return out;
})();

/** Write a temperature (0..1) into ImageData at pixel index j, keeping the hotter value. */
export function putTemp(d: Uint8ClampedArray, heat: Float32Array, j: number, temp: number, blue = 0) {
  if (temp <= heat[j]) return;
  heat[j] = temp;
  const li = (clamp(temp) * 255) | 0;
  let r = FIRE_LUT[li * 4];
  let g = FIRE_LUT[li * 4 + 1];
  let b = FIRE_LUT[li * 4 + 2];
  if (blue > 0) {
    r = mix(r, 140, blue);
    g = mix(g, 172, blue);
    b = mix(b, 255, blue);
  }
  const i = j * 4;
  d[i] = r;
  d[i + 1] = g;
  d[i + 2] = b;
  d[i + 3] = FIRE_LUT[li * 4 + 3];
}

/** A low-resolution field buffer, drawn scaled up. */
export function fieldBuffer(w: number, h: number, cell: number) {
  const cols = Math.max(8, Math.round(w / cell));
  const rows = Math.max(8, Math.round(h / cell));
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(cols, rows);
  const heat = new Float32Array(cols * rows);
  return {
    cols,
    rows,
    img,
    heat,
    clear() {
      img.data.fill(0);
      heat.fill(0);
    },
    draw(target: CanvasRenderingContext2D, x: number, y: number, dw: number, dh: number) {
      ctx.putImageData(img, 0, 0);
      target.imageSmoothingEnabled = true;
      target.imageSmoothingQuality = 'high';
      target.drawImage(canvas, x, y, dw, dh);
    },
  };
}

/** Pointer gust: a decaying local push that prototypes can add to their sampling coordinates. */
export function gust() {
  const g = { x: -1e4, y: -1e4, vx: 0, vy: 0, amp: 0, lx: 0, ly: 0, lt: 0 };
  return {
    move(x: number, y: number, t: number) {
      const dt = Math.max(16, t - g.lt);
      if (g.lt) {
        g.vx = mix(g.vx, (x - g.lx) / dt, 0.5);
        g.vy = mix(g.vy, (y - g.ly) / dt, 0.5);
      }
      g.x = x;
      g.y = y;
      g.lx = x;
      g.ly = y;
      g.lt = t;
      g.amp = Math.min(1, g.amp + 0.25);
    },
    decay(dt: number) {
      g.amp *= Math.pow(0.96, dt / 16);
    },
    /** Horizontal push (px) at a point. */
    push(x: number, y: number, radius: number) {
      if (g.amp < 0.01) return 0;
      const d2 = (x - g.x) ** 2 + (y - g.y) ** 2;
      return g.amp * clamp(g.vx * 30, -1, 1) * radius * 0.35 * Math.exp(-d2 / (radius * radius));
    },
    near(x: number, y: number, radius: number) {
      if (g.amp < 0.01) return 0;
      return g.amp * Math.exp(-((x - g.x) ** 2 + (y - g.y) ** 2) / (radius * radius));
    },
  };
}
