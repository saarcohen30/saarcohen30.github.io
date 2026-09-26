// Fire as a field: several flame fronts along an invisible, gently curved ignition line. One
// scalar field is computed for the whole region: each front contributes a continuous flame body
// (upward-advected domain warp, tapered tongues, turbulent erosion) and overlapping fronts merge,
// keeping the hotter value. Fronts ignite in sequence, breathe, collapse and reignite.
//
// Colour is temperature: each front has its own heat, so hot fronts reach pale yellow-white (with a
// faint blue at the hottest base) while cooler ones stay amber, orange and deep red. The field is
// written at low resolution and scaled up; glow and embers are optional and secondary.
import { mulberry32 } from '../core';
import { makeNoise2, fbm2, smooth, clamp, mix, type Layer, type LayerContext } from './kit';

export interface FireFront {
  /** Centre of the front's base (px) and half-width (px). */
  x: number;
  half: number;
  /** Flame height (px) at full strength. */
  height: number;
  /** Temperature multiplier (≈0.8 cool … 1.15 hot). */
  heat: number;
  /** When it ignites (ms, scene clock). */
  at: number;
}

export interface FireOptions extends LayerContext {
  fronts: FireFront[];
  /** Base line y(x) of the ignition field (px). */
  baseline: (x: number) => number;
  /** Sideways lean at a point (wind), as a fraction of the front's half-width per unit height. */
  lean?: (x: number, y: number, t: number) => number;
  cell?: number;
  extras?: boolean;
  /** Current light of each burning front (for reflections): x and strength 0..1. */
  onLight?: (lights: { x: number; level: number }[]) => void;
}

// Temperature → colour (r, g, b, a): deep red edge, orange, amber, yellow, pale core.
const STOPS: [number, number, number, number, number][] = [
  [0.0, 110, 22, 8, 0],
  [0.07, 142, 30, 12, 0.6],
  [0.2, 204, 64, 20, 0.84],
  [0.36, 236, 108, 30, 0.92],
  [0.52, 248, 152, 46, 0.95],
  [0.7, 255, 200, 92, 0.97],
  [0.88, 255, 236, 186, 1],
  [1.0, 255, 246, 222, 1],
];
function band(t: number): [number, number, number, number] {
  if (t <= 0) return [0, 0, 0, 0];
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const a = STOPS[i - 1];
      const b = STOPS[i];
      const k = i === 1 ? smooth(0.5, 1, (t - a[0]) / (b[0] - a[0])) : smooth(0.1, 1, (t - a[0]) / (b[0] - a[0]));
      return [mix(a[1], b[1], k), mix(a[2], b[2], k), mix(a[3], b[3], k), mix(a[4], b[4], k)];
    }
  }
  const s = STOPS.at(-1)!;
  return [s[1], s[2], s[3], s[4]];
}
const LUT = (() => {
  const n = 256;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const [r, g, b, a] = band(i / (n - 1));
    out.set([r, g, b, a * 255], i * 4);
  }
  return out;
})();

interface FrontState extends FireFront {
  phase: number;
  level: number; // current strength 0..1
  target: number;
  tongues: { u: number; w: number; h: number; p: number }[];
}

export function createFireLayer(o: FireOptions): Layer {
  const rand = mulberry32(o.seed + 41);
  const noise = makeNoise2(o.seed + 43);
  const noise2 = makeNoise2(o.seed + 47);
  const extras = o.extras ?? true;
  const plain = () => (globalThis as { __elementPlain?: boolean }).__elementPlain === true;
  const fronts: FrontState[] = o.fronts.map((fr, i) => {
    const nT = fr.half > 80 ? 3 : 2 + (fr.half > 45 ? 1 : 0);
    return {
      ...fr,
      phase: rand() * 100 + i * 17,
      level: 0,
      target: 1,
      tongues: Array.from({ length: nT }, (_, k) => {
        const u = mix(-0.55, 0.55, nT === 1 ? 0.5 : k / (nT - 1)) + (rand() - 0.5) * 0.18;
        // Tallest near the middle, clearly lower towards the flanks (no symmetric "U").
        return { u, w: 0.44 + rand() * 0.16, h: 0.42 + 0.58 * (1 - Math.abs(u) * 1.3) + rand() * 0.12, p: rand() * 50 };
      }),
    };
  });

  // One field covering all fronts.
  const x0 = Math.min(...fronts.map((fr) => fr.x - fr.half * 1.7));
  const x1 = Math.max(...fronts.map((fr) => fr.x + fr.half * 1.7));
  const yTop = Math.min(...fronts.map((fr) => o.baseline(fr.x) - fr.height * 1.1));
  const yBot = Math.max(...fronts.map((fr) => o.baseline(fr.x))) + 16;
  const cell = o.cell ?? (o.mobile ? 2.6 : 3);
  const cols = Math.max(16, Math.round((x1 - x0) / cell));
  const rows = Math.max(16, Math.round((yBot - yTop) / cell));
  const buf = document.createElement('canvas');
  buf.width = cols;
  buf.height = rows;
  const bctx = buf.getContext('2d')!;
  const img = bctx.createImageData(cols, rows);
  const heatBuf = new Float32Array(cols * rows);
  let settled = false;
  interface Ember {
    x: number;
    y: number;
    vx: number;
    vy: number;
    age: number;
    life: number;
  }
  const embers: Ember[] = [];

  function field(t: number) {
    const T = t * 0.001 + 23.7;
    const d = img.data;
    d.fill(0);
    heatBuf.fill(0);
    for (const fr of fronts) {
      if (fr.level < 0.02) continue;
      const hEff = fr.height * (0.3 + 0.7 * fr.level);
      const hk = fr.tongues.map((g) => g.h * (0.72 + 0.38 * (0.5 + 0.5 * noise(g.p, T * 1.1))));
      const sway = fr.tongues.map((g) => 0.12 * noise(g.p + 7, T * 0.7));
      const cA = Math.max(0, Math.floor((fr.x - fr.half * 1.65 - x0) / cell));
      const cB = Math.min(cols - 1, Math.ceil((fr.x + fr.half * 1.65 - x0) / cell));
      for (let c = cA; c <= cB; c++) {
        const x = x0 + (c + 0.5) * cell;
        const base = o.baseline(x);
        const u = (x - fr.x) / fr.half;
        const rA = Math.max(0, Math.floor((base - hEff * 1.06 - yTop) / cell));
        const rB = Math.min(rows - 1, Math.ceil((base + 12 - yTop) / cell));
        for (let r = rA; r <= rB; r++) {
          const y = yTop + (r + 0.5) * cell;
          const wob = 0.06 * noise(u * 2.6 + fr.phase, T * 0.9) + 0.03 * noise(u * 7 + fr.phase, T * 2.1);
          const vv = (base - y) / hEff - wob;
          if (vv < -0.12) continue;
          const up = Math.max(0, vv);
          const lean = o.lean ? o.lean(x, y, t) * up * up : 0;
          const warp = fbm2(noise, u * 1.4 + fr.phase, up * 2.2 - T * 1.9, 2) * (0.16 + 0.55 * up) - lean;
          const uw = u + warp;
          let e = -1;
          for (let k = 0; k < fr.tongues.length; k++) {
            const g = fr.tongues[k];
            if (up > hk[k]) continue;
            const w = g.w * Math.pow(1 - up / hk[k], 0.75);
            e = Math.max(e, (1 - Math.abs(uw - g.u - sway[k] * up * 2) / (w + 1e-3)) * (0.7 + 0.3 * (1 - up / hk[k])));
          }
          const reach = 1 - 0.7 * (up / 0.24);
          const across = Math.abs(uw) / Math.max(0.05, reach);
          e = Math.max(e, Math.max(0, 1 - across * across) * Math.max(0, 1 - up / 0.24) * 0.9);
          if (e < -0.22) continue;
          const turb = fbm2(noise2, uw * 2.6 + fr.phase, up * 3.2 - T * 1.9, 3);
          let temp = e + turb * (0.28 + 0.3 * up) - up * 0.22;
          temp += smooth(0.03, 0.14, up) * (1 - Math.min(1, up * 3)) * 0.2 * (1 - Math.abs(u));
          temp *= mix(0.55, 1, smooth(0, 0.1, up));
          if (vv < 0) temp *= clamp(1 + vv * 9);
          temp *= 1 - smooth(1.15, 1.6, Math.abs(u));
          temp = clamp(temp * 1.05 * fr.heat * (0.82 + 0.18 * fr.level));
          const j = r * cols + c;
          if (temp <= heatBuf[j]) continue; // overlapping fronts merge: keep the hotter
          heatBuf[j] = temp;
          const li = (temp * 255) | 0;
          let R = LUT[li * 4];
          let G = LUT[li * 4 + 1];
          let B = LUT[li * 4 + 2];
          // A faint blue at the hottest base of hot fronts.
          if (fr.heat > 1.03 && up < 0.08 && temp > 0.7) {
            const k = clamp(0.5 * (1 - up / 0.08) * (fr.heat - 1.03) * 7);
            R = mix(R, 140, k);
            G = mix(G, 170, k);
            B = mix(B, 255, k);
          }
          const i = j * 4;
          d[i] = R;
          d[i + 1] = G;
          d[i + 2] = B;
          d[i + 3] = LUT[li * 4 + 3];
        }
      }
    }
    bctx.putImageData(img, 0, 0);
  }

  return {
    step(dt, t) {
      for (const fr of fronts) {
        if (!settled && t < fr.at) continue;
        const goal = fr.target * (0.7 + 0.3 * (0.5 + 0.5 * noise(fr.phase, t * 0.0004)));
        fr.level += (goal - fr.level) * Math.min(1, dt / (fr.level < goal ? 650 : 1200));
      }
      if (!extras) return;
      for (const fr of fronts) {
        if (fr.level > 0.5 && rand() < dt * 0.0003 * fr.level) {
          const x = fr.x + (rand() - 0.5) * fr.half;
          embers.push({ x, y: o.baseline(x) - fr.height * (0.45 + rand() * 0.4), vx: (rand() - 0.5) * 0.02, vy: -0.03 - rand() * 0.04, age: 0, life: 1500 + rand() * 1500 });
        }
      }
      for (const e of embers) {
        e.age += dt;
        e.vx += (o.lean ? o.lean(e.x, e.y, t) * 0.00002 * dt : 0) + noise(e.x * 0.01, e.age * 0.001) * 0.0003 * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      }
      for (let i = embers.length - 1; i >= 0; i--) if (embers[i].age > embers[i].life) embers.splice(i, 1);
    },
    finish() {
      settled = true;
      for (const fr of fronts) fr.level = fr.target;
    },
    churn() {
      // Gentle variation only: a region flares a little or settles a little. (Previously a random
      // region was pushed down to 10–35% each time, which drained the fire towards half-extinguished
      // within seconds; that looked like the pointer was putting it out.)
      const fr = fronts[Math.floor(rand() * fronts.length)];
      fr.target = 0.75 + rand() * 0.25;
    },
    render(ctx, t) {
      field(t);
      const bare = plain() || !extras;
      ctx.save();
      if (!bare) {
        for (const fr of fronts) {
          if (fr.level < 0.05) continue;
          const gy = o.baseline(fr.x) - fr.height * 0.3;
          const R = fr.half * 2.6;
          const g = ctx.createRadialGradient(fr.x, gy, 0, fr.x, gy, R);
          g.addColorStop(0, `rgba(255,140,60,${(0.05 * fr.level).toFixed(3)})`);
          g.addColorStop(1, 'rgba(255,120,40,0)');
          ctx.fillStyle = g;
          ctx.fillRect(fr.x - R, gy - R, R * 2, R * 2);
        }
      }
      o.onLight?.(fronts.map((fr) => ({ x: fr.x, level: fr.level })));
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(buf, x0, yTop, x1 - x0, yBot - yTop);
      if (!bare) {
        for (const e of embers) {
          const k = e.age / e.life;
          ctx.fillStyle = `rgba(255,${(200 - k * 80) | 0},${(120 - k * 60) | 0},${(0.85 * (1 - k)).toFixed(3)})`;
          ctx.fillRect(e.x, e.y, 1.5, 1.5);
        }
      }
      ctx.restore();
    },
  };
}
