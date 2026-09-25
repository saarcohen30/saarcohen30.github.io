// Water: a dark water surface seen at a low angle. Light is visible only as short specular
// glints on perspective rows (denser and finer towards the horizon), moved by layered noise
// waves and gathered into a reflected-light column. Droplets fall and their rings spread
// across the surface, brightening the glints they pass. The entrance: the first ring reveals it.
import { mulberry32, type Rect } from '../core';
import { makeNoise, edgeFade, smooth, mix, clamp, type Layer, type LayerContext } from './kit';

interface Ripple {
  x: number;
  y: number;
  born: number; // ms (scene clock) when the drop hits
  amp: number;
  drop: boolean; // show the falling drop before impact
}

export interface WaterOptions extends LayerContext {
  /** Where the light column falls (fraction of width). */
  lightX?: number;
  /** Warm light reflected at this x (Convergence: the fire). */
  warmX?: number;
  warmStrength?: number | ((t: number) => number);
  /** First ripple reveals the surface from this point (fraction of the rect). */
  reveal?: boolean;
}

const COOL_FAR = [92, 128, 160];
const COOL_NEAR = [214, 236, 244];
const WARM = [255, 186, 120];

export function createWaterLayer(o: WaterOptions): Layer & { surface: Rect; ripple(x: number, y: number, t: number, amp?: number): void } {
  const f = o.field;
  const noise = makeNoise(o.seed + 5);
  const rand = mulberry32(o.seed + 7);
  const delay = o.delay ?? 0;
  const W = f.x1 - f.x0;
  const H = f.y1 - f.y0;
  const rows = o.mobile ? 30 : 42;
  const lightX = f.x0 + W * (o.lightX ?? 0.5);
  const ripples: Ripple[] = [];
  const firstAt = delay + 380;
  const origin = { x: f.x0 + W * 0.52, y: f.y0 + H * 0.58 };
  let revealDone = !o.reveal;
  let lastPointer = -1e9;

  const depthAt = (y: number) => clamp(Math.pow(clamp((y - f.y0) / H), 1 / 1.55));
  const ratioAt = (y: number) => 0.18 + 0.2 * depthAt(y);

  function ripple(x: number, y: number, t: number, amp = 1, drop = false) {
    ripples.push({ x, y, born: t, amp, drop });
    if (ripples.length > 7) ripples.shift();
  }
  // The entrance: one drop, then two more.
  if (o.reveal) {
    ripple(origin.x, origin.y, firstAt, 1.3, true);
    ripple(f.x0 + W * 0.28, f.y0 + H * 0.78, delay + 1150, 0.9, true);
    ripple(f.x0 + W * 0.74, f.y0 + H * 0.42, delay + 1750, 0.8, true);
  }

  return {
    surface: f,
    ripple,
    step() {},
    finish() {
      revealDone = true;
    },
    churn(t) {
      ripple(f.x0 + W * (0.15 + rand() * 0.7), f.y0 + H * (0.3 + rand() * 0.6), t + 420, 0.7 + rand() * 0.4, true);
    },
    pointer(x, y, t) {
      if (x < f.x0 || x > f.x1 || y < f.y0 || y > f.y1 || t - lastPointer < 420) return;
      lastPointer = t;
      ripple(x, y, t, 0.45);
    },
    render(ctx, t) {
      const local = t - delay;
      if (local < 0) return;
      const time = t * 0.001;
      // Reveal: the first ring uncovers the surface.
      const revealR = revealDone ? 1e9 : Math.max(0, (t - firstAt) * 0.42);
      if (!revealDone && revealR > Math.hypot(W, H) * 1.6) revealDone = true;
      const presence = smooth(0, 700, local);
      const warmNow = typeof o.warmStrength === 'function' ? o.warmStrength(t) : (o.warmStrength ?? 1);

      ctx.save();
      ctx.lineCap = 'round';
      // Each row is a continuous wave line. Its height comes from layered noise plus the rings of
      // any ripples; its brightness from its slope (where the surface tilts towards the light).
      const BUCKETS = 7;
      const paths: Path2D[] = [];
      for (let k = 0; k < rows; k++) {
        const d = (k + 1) / rows;
        const spacing = (H * 1.55 * Math.pow(d, 0.55)) / rows;
        const y0 = f.y0 + H * Math.pow(d, 1.55) + noise(k * 0.6, time * 0.15, 8) * spacing * 0.35;
        const amp = mix(0.8, 9, d * d);
        const step = mix(4, 9, d);
        const fx = 0.009 / mix(0.3, 1, d);
        const column = W * 0.1 * mix(0.5, 1.6, d);
        const lw = mix(0.55, 1.5, d);
        for (let i = 0; i < BUCKETS; i++) paths[i] = new Path2D();
        let px = f.x0;
        let py = 0;
        let first = true;
        for (let x = f.x0; x <= f.x1 + step; x += step) {
          let h = amp * (noise(x * fx, k * 0.33, time * 0.3) * 0.75 + noise(x * fx * 2.7, k * 0.8 + 7, time * 0.75) * 0.25);
          let ring = 0;
          for (const r of ripples) {
            const age = t - r.born;
            if (age < 0 || age > 3600) continue;
            const dist = Math.hypot(x - r.x, (y0 - r.y) / ratioAt(r.y));
            const R = age * 0.12;
            const env = Math.exp(-(((dist - R) / 46) ** 2)) * r.amp * (1 - age / 3600);
            h += amp * 1.5 * env * Math.sin((dist - R) * 0.1);
            ring += env;
          }
          const y = y0 + h;
          if (!first) {
            const slope = (y - py) / step;
            const light = 0.18 + 0.82 * Math.exp(-(((x - lightX) / column) ** 2));
            const spec = Math.exp(-(((slope + 0.1) / 0.09) ** 2)) * (0.45 + 0.55 * clamp(0.5 + noise(x * 0.07, k * 1.3, time * 1.6)));
            const vignette = 1 - smooth(0.55, 1, Math.abs((x - (f.x0 + f.x1) / 2) / (W / 2)));
            let a = (0.015 + 0.035 * d + spec * light * mix(0.4, 1.15, d) + ring * 0.3) * vignette * edgeFade(f, x, y0, 0.02, 0.03) * presence;
            if (!revealDone) a *= 1 - smooth(revealR - 160, revealR, Math.hypot(x - origin.x, (y0 - origin.y) / ratioAt(origin.y)));
            if (a > 0.015) {
              const bucket = Math.min(BUCKETS - 1, Math.floor(clamp(a) * BUCKETS));
              paths[bucket].moveTo(px, py);
              paths[bucket].lineTo(x, y);
            }
          }
          px = x;
          py = y;
          first = false;
        }
        const light = COOL_FAR.map((v, i) => mix(v, COOL_NEAR[i], 0.25 + 0.75 * d));
        for (let i = 0; i < BUCKETS; i++) {
          let c = light;
          if (o.warmX !== undefined && warmNow > 0.01) c = c.map((v, j) => mix(v, WARM[j], 0.55 * warmNow * (i / BUCKETS)));
          ctx.strokeStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${((i + 0.5) / BUCKETS).toFixed(3)})`;
          ctx.lineWidth = lw * (i > BUCKETS - 3 ? 1.25 : 1);
          ctx.stroke(paths[i]);
        }
        // Warm reflection: a vertical smear of the fire's light on the near rows.
        if (o.warmX !== undefined && warmNow > 0.01) {
          const wx = o.warmX + noise(k * 0.4, time * 1.3, 4) * 6 * d;
          const wl = mix(4, 26, d) * (0.6 + 0.4 * noise(k, time * 2, 6));
          ctx.strokeStyle = `rgba(255,178,110,${(0.5 * warmNow * mix(0.3, 1, d)).toFixed(3)})`;
          ctx.lineWidth = lw * 1.3;
          ctx.beginPath();
          ctx.moveTo(wx - wl / 2, y0);
          ctx.lineTo(wx + wl / 2, y0);
          ctx.stroke();
        }
      }
      // Rings themselves, very faint; and falling drops before impact.
      for (const r of ripples) {
        const age = t - r.born;
        if (r.drop && age < 0 && age > -420) {
          const k = 1 + age / 420;
          const y = r.y - (1 - k * k) * H * 0.55;
          const grad = ctx.createLinearGradient(r.x, y - 14, r.x, y);
          grad.addColorStop(0, 'rgba(214,236,244,0)');
          grad.addColorStop(1, 'rgba(214,236,244,0.8)');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(r.x, y - 14);
          ctx.lineTo(r.x, y);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  };
}
