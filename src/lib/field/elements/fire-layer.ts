// Fire: a continuous flame BODY computed as a scalar field (not particles, not blurred sprites).
//
// For each cell of a coarse grid, in normalised coordinates (u across, v up from the base):
//   1. warp:     an upward-scrolling fbm field bends u, more strongly towards the tips (and
//                scrolls faster there), so tongues whip while the base stays planted;
//   2. envelope: several tapered "tongue" envelopes, each ending in a point at its own varying
//                height, plus a broad irregular base, merged with max();
//   3. erosion:  turbulent noise carves the body, so tongues split, merge and leave dark gaps;
//   4. colour:   the resulting temperature is banded with narrow transitions into nested regions
//                (deep red edge → orange → gold → pale core).
// The grid is written to ImageData and scaled up with bilinear filtering. Glow and embers are
// optional extras drawn afterwards; the shape alone must read as flame.
import { mulberry32 } from '../core';
import { makeNoise2, fbm2, smooth, clamp, mix, type Layer, type LayerContext } from './kit';

export interface FireOptions extends LayerContext {
  baseY?: number;
  baseX0?: number;
  baseX1?: number;
  /** Flame height as a multiple of the base width (default ≈1.5). */
  height?: number;
  /** Size of one field cell in CSS px (resolution/performance trade-off). */
  cell?: number;
  /** Draw the soft environmental glow and embers (default true). */
  extras?: boolean;
}

interface Tongue {
  u: number; // position across the base, -1..1
  w: number; // half-width at the base
  h: number; // base height (fraction of flame height)
  phase: number;
}
interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
}

// Temperature → colour stops (t, r, g, b, a): nested regions with narrow transitions.
const STOPS: [number, number, number, number, number][] = [
  [0.0, 120, 26, 10, 0],
  [0.06, 150, 34, 12, 0.55],
  [0.16, 206, 64, 18, 0.82],
  [0.3, 238, 112, 32, 0.9],
  [0.48, 250, 164, 62, 0.95],
  [0.66, 255, 208, 122, 0.97],
  [0.85, 255, 236, 192, 1],
];
function band(t: number): [number, number, number, number] {
  if (t <= 0) return [0, 0, 0, 0];
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const a = STOPS[i - 1];
      const b = STOPS[i];
      // Narrow transition near each boundary: flat-ish regions with readable contours.
      // The outer contour (edge → first band) stays crisp; inner bands blend softly.
      const k = i === 1 ? smooth(0.5, 1, (t - a[0]) / (b[0] - a[0])) : smooth(0.1, 1, (t - a[0]) / (b[0] - a[0]));
      return [mix(a[1], b[1], k), mix(a[2], b[2], k), mix(a[3], b[3], k), mix(a[4], b[4], k)];
    }
  }
  const s = STOPS.at(-1)!;
  return [s[1], s[2], s[3], s[4]];
}
// Precomputed lookup table (fast per-cell colouring). Shared with Convergence.
export const LUT = (() => {
  const n = 256;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const [r, g, b, a] = band(i / (n - 1));
    out.set([r, g, b, a * 255], i * 4);
  }
  return out;
})();

export function createFireLayer(o: FireOptions): Layer {
  const f = o.field;
  const rand = mulberry32(o.seed + 41);
  const noise = makeNoise2(o.seed + 43);
  const noise2 = makeNoise2(o.seed + 47);
  const delay = o.delay ?? 0;
  const W = f.x1 - f.x0;
  const H = f.y1 - f.y0;
  const baseY = o.baseY ?? f.y1 - H * 0.04;
  const bx0 = o.baseX0 ?? f.x0 + W * 0.22;
  const bx1 = o.baseX1 ?? f.x1 - W * 0.22;
  const cx = (bx0 + bx1) / 2;
  const half = (bx1 - bx0) / 2;
  const flameH = Math.min(baseY - f.y0, half * 2 * (o.height ?? 1.5));
  const extras = o.extras ?? true;
  const plain = () => (globalThis as { __elementPlain?: boolean }).__elementPlain === true;

  // Field box: wider than the base (tongues sway), from above the tips to just below the base.
  const boxX = cx - half * 1.6;
  const boxW = half * 3.2;
  const boxY = baseY - flameH * 1.05;
  const boxH = flameH * 1.2; // extends below the base so the soft bottom fade is never cut
  const cell = o.cell ?? (o.mobile ? 2.4 : 2.7);
  const cols = Math.max(24, Math.round(boxW / cell));
  const rows = Math.max(24, Math.round(boxH / cell));
  const buffer = document.createElement('canvas');
  buffer.width = cols;
  buffer.height = rows;
  const bctx = buffer.getContext('2d')!;
  const img = bctx.createImageData(cols, rows);

  // Tongues across the base; the middle ones are tallest.
  const nT = o.mobile ? 4 : 5;
  const tongues: Tongue[] = Array.from({ length: nT }, (_, i) => {
    const u = mix(-0.72, 0.72, nT === 1 ? 0.5 : i / (nT - 1)) + (rand() - 0.5) * 0.12;
    return { u, w: 0.3 + rand() * 0.12, h: 0.55 + 0.4 * (1 - Math.abs(u)) + rand() * 0.08, phase: rand() * 100 };
  });

  const igniteAt = delay + 250;
  let settled = false;
  const embers: Ember[] = [];

  function computeField(t: number) {
    // Offset time so noise is never sampled near the lattice origin (where it is flat).
    const T = t * 0.001 + 23.7;
    const grow = settled ? 1 : smooth(igniteAt, igniteAt + 1500, t); // flame height during ignition
    const spreadU = settled ? 9 : clamp((t - igniteAt) / 900) * 1.6; // ignition spreads from the centre
    const data = img.data;
    // Per-tongue height and sway for this frame (coherent, slow).
    const th = tongues.map((g) => g.h * (0.78 + 0.32 * noise(g.phase, T * 1.1)));
    const scaleH = Math.max(0.05, grow); // during ignition the whole flame is smaller, not reshaped
    const sw = tongues.map((g) => 0.1 * noise(g.phase + 7, T * 0.7));
    for (let r = 0; r < rows; r++) {
      const vv = (baseY - (boxY + (r + 0.5) * (boxH / rows))) / (flameH * scaleH); // 0 at base, ~1 at tip
      for (let c = 0; c < cols; c++) {
        const idx = (r * cols + c) * 4;
        const u = (boxX + (c + 0.5) * (boxW / cols) - cx) / (half * (0.55 + 0.45 * scaleH)); // -1..1 over the base
        if (vv < -0.1 || Math.abs(u) > 1.55 || Math.abs(u) > spreadU + 0.4) {
          data[idx + 3] = 0;
          continue;
        }
        // Irregular base line: it breathes a little instead of being cut flat.
        const baseWobble = 0.06 * noise(u * 2.6, T * 0.9) + 0.03 * noise(u * 7, T * 2.1);
        const up = Math.max(0, vv - baseWobble);
        // 1. Warp: upward-advected noise bends u, more towards the tips. The scroll speed is
        //    constant (a height-dependent speed would multiply time into the vertical frequency
        //    and make the flame grow ever more jagged); tips still move faster because the warp
        //    amplitude grows with height.
        const scroll = T * 1.9;
        const warp = fbm2(noise, u * 1.4, up * 2.2 - scroll, 2) * (0.16 + 0.55 * up);
        const uw = u + warp;
        // 2. Envelopes: tapered tongues, merged; plus a broad base.
        let e = -1;
        for (let k = 0; k < nT; k++) {
          if (Math.abs(tongues[k].u) > spreadU) continue;
          const hk = th[k];
          if (up > hk) continue;
          const taper = Math.pow(1 - up / hk, 0.75);
          const width = tongues[k].w * taper;
          const d = Math.abs(uw - tongues[k].u - sw[k] * up * 2) / (width + 1e-3);
          e = Math.max(e, (1 - d) * (0.7 + 0.3 * (1 - up / hk)));
        }
        // Broad, rounded base (both factors clamped: two negatives must not make a positive).
        const reach = Math.min(1.0, spreadU + 0.2) * (1 - 0.7 * up / 0.24);
        const across = Math.abs(uw) / Math.max(0.05, reach);
        const baseBand = Math.max(0, 1 - across * across) * Math.max(0, 1 - up / 0.24);
        e = Math.max(e, baseBand * 0.9);
        if (e < -0.22) {
          data[idx + 3] = 0;
          continue;
        }
        // 3. Erosion: turbulence carves tongues apart (stronger higher up).
        const turb = fbm2(noise2, uw * 2.6, up * 3.2 - scroll * 1.25, 3);
        let temp = e + turb * (0.28 + 0.3 * up) - up * 0.22;
        // Hottest a little above the fuel, cooler and redder right at it.
        temp += smooth(0.03, 0.14, up) * (1 - Math.min(1, up * 3)) * 0.2 * (1 - Math.abs(u));
        temp *= mix(0.55, 1, smooth(0, 0.1, up));
        temp = clamp(temp * 1.05, 0, 1);
        if (vv < baseWobble) temp *= clamp(1 + (vv - baseWobble) * 9); // soft, uneven bottom edge
        const li = (temp * 255) | 0;
        data[idx] = LUT[li * 4];
        data[idx + 1] = LUT[li * 4 + 1];
        data[idx + 2] = LUT[li * 4 + 2];
        data[idx + 3] = LUT[li * 4 + 3];
      }
    }
    bctx.putImageData(img, 0, 0);
  }

  return {
    step(dt, t) {
      if (t < igniteAt || !extras) return;
      // A few detached embers, rising from the tips and cooling.
      if (rand() < dt * 0.0012) {
        const x = cx + (rand() - 0.5) * half * 1.2;
        embers.push({ x, y: baseY - flameH * (0.35 + rand() * 0.35), vx: (rand() - 0.5) * 0.02, vy: -0.03 - rand() * 0.04, age: 0, life: 1600 + rand() * 1600 });
      }
      for (const e of embers) {
        e.age += dt;
        e.vx += noise(e.x * 0.01, e.age * 0.001) * 0.0004 * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      }
      for (let i = embers.length - 1; i >= 0; i--) if (embers[i].age > embers[i].life) embers.splice(i, 1);
    },
    finish() {
      settled = true;
    },
    render(ctx, t) {
      if (t < igniteAt) return;
      const bare = plain() || !extras;
      ctx.save();
      if (!bare) {
        // Secondary: a faint warm light on the surroundings.
        const glowR = half * 2.4;
        const flick = 0.85 + 0.15 * noise(t * 0.003, 3.3);
        const g = ctx.createRadialGradient(cx, baseY - flameH * 0.3, 0, cx, baseY - flameH * 0.3, glowR);
        g.addColorStop(0, `rgba(255,140,60,${(0.07 * flick * smooth(igniteAt, igniteAt + 1200, t)).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - glowR, baseY - flameH * 0.3 - glowR, glowR * 2, glowR * 2);
      }
      computeField(t);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(buffer, boxX, boxY, boxW, boxH);
      if (!bare) {
        for (const e of embers) {
          const k = e.age / e.life;
          ctx.fillStyle = `rgba(255,${(200 - k * 80) | 0},${(120 - k * 60) | 0},${(0.9 * (1 - k)).toFixed(3)})`;
          ctx.fillRect(e.x, e.y, 1.6, 1.6);
        }
      }
      ctx.restore();
    },
  };
}
