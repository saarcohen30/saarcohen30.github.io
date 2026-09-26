// Convergence composition studies (design review only). Cheap studies of how the four elements
// could share one environment; not finished scenes. Water and Air are the approved layers, used
// unchanged through their public APIs.
import { mulberry32 } from '../core';
import { makeNoise2, fbm2, smooth, clamp, mix } from '../elements/kit';
import { createWaterLayer } from '../elements/water-layer';
import { createAirLayer } from '../elements/air-layer';
import { fieldBuffer, FIRE_LUT, type ProtoFactory } from './common';
import { fireC } from './fire-protos';
import { earthB } from './earth-protos';

const lc = (W: number, H: number, seed: number, field: { x0: number; x1: number; y0: number; y1: number }) => ({ field, width: W, height: H, mobile: false, seed });

/** Additive heat splats → fire colour (continuous bodies where splats overlap). */
function heatCanvas(W: number, H: number, cell: number) {
  const b = fieldBuffer(W, H, cell);
  const sx = b.cols / W;
  const sy = b.rows / H;
  return {
    clear: () => b.heat.fill(0),
    splat(x: number, y: number, r: number, amt: number, stretch = 1.6) {
      const cx = x * sx;
      const cy = y * sy;
      const rr = Math.max(1, r * sx);
      const ry = rr * stretch;
      for (let j = Math.max(0, Math.floor(cy - ry * 2)); j <= Math.min(b.rows - 1, cy + ry); j++)
        for (let i = Math.max(0, Math.floor(cx - rr)); i <= Math.min(b.cols - 1, cx + rr); i++) {
          const dx = (i - cx) / rr;
          const dy = (j - cy) / (j < cy ? ry * 2 : ry); // longer above: flames rise
          const d2 = dx * dx + dy * dy;
          if (d2 < 1) b.heat[j * b.cols + i] += amt * (1 - d2) * (1 - d2);
        }
    },
    draw(ctx: CanvasRenderingContext2D, noise?: (i: number, j: number) => number) {
      const d = b.img.data;
      for (let p = 0; p < b.heat.length; p++) {
        let t = b.heat[p];
        if (noise && t > 0) t *= 0.75 + 0.5 * noise(p % b.cols, (p / b.cols) | 0);
        t = clamp(t * 0.9 - 0.08);
        const li = (t * 255) | 0;
        d.set(FIRE_LUT.subarray(li * 4, li * 4 + 4), p * 4);
      }
      b.draw(ctx, 0, 0, W, H);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// A · Layered atmospheric field: depth planes. Beyond a distant ridge, a broad band of heat haze;
// the ridge (Earth) sits in the middle distance; still water fills the foreground; wind (Air)
// streams across all of it.
export const convA: ProtoFactory = (W, H, seed = 30) => {
  const horizon = H * 0.64;
  const heat = fireC(W, H * 0.8, 21);
  const ground = earthB(W, H, 8);
  const water = createWaterLayer({ ...lc(W, H, seed, { x0: 0, x1: W, y0: horizon, y1: H }), lightX: 0.62, warmX: 0.5, warmStrength: 0.45 });
  const air = createAirLayer({ ...lc(W, H, seed, { x0: 0, x1: W, y0: H * 0.06, y1: horizon }), density: 0.5, wind: 0.8, vortices: 2 });
  const off = document.createElement('canvas');
  off.width = Math.round(W);
  off.height = Math.round(H);
  const octx = off.getContext('2d')!;
  return {
    step(dt, t) {
      heat.step(dt, t);
      ground.step(dt, t);
      water.step(dt, t);
      air.step(dt, t);
    },
    settle() {
      heat.settle?.();
      ground.settle?.();
      water.finish?.();
      air.finish?.();
    },
    pointer(x, y, t) {
      water.pointer?.(x, y, t);
      air.pointer?.(x, y, t);
    },
    render(ctx, t) {
      // Heat, far behind the ridge: dimmed and hazed by distance.
      ctx.save();
      // A broad, low band of heat haze along the horizon (not a column rising from one point).
      ctx.globalAlpha = 0.55;
      ctx.translate(-W * 0.25, H * 0.2);
      ctx.scale(1.5, 0.5);
      heat.render(ctx, t);
      ctx.restore();
      // The ridge: the terrain, squashed into a distant band, cut at the waterline.
      octx.clearRect(0, 0, W, H);
      ground.render(octx, t);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, horizon);
      ctx.clip();
      ctx.drawImage(off, 0, H * 0.33, W, H * 0.5);
      ctx.restore();
      ctx.fillStyle = '#0b0d11';
      ctx.fillRect(0, horizon, W, H - horizon);
      water.render(ctx, t);
      air.render(ctx, t);
    },
  };
};

// ---------------------------------------------------------------------------------------------
// B · Material transformation path: one S-shaped path across the field along which material
// changes state. Grains of earth tumble up from the lower left, heat and ignite into flame, burn
// out into streaks of air, and condense into drops that fall into water at the lower right.
export const convB: ProtoFactory = (W, H, seed = 31) => {
  const rand = mulberry32(seed);
  const n = makeNoise2(seed + 1);
  const waterTop = H * 0.7;
  const water = createWaterLayer({ ...lc(W, H, seed, { x0: W * 0.5, x1: W, y0: waterTop, y1: H }), lightX: 0.4 });
  const fire = heatCanvas(W, H, 3);
  // Path through normalised points (Catmull–Rom).
  const P = [
    [0.04, 0.9],
    [0.18, 0.8],
    [0.3, 0.62],
    [0.4, 0.42],
    [0.52, 0.26],
    [0.68, 0.2],
    [0.82, 0.28],
    [0.88, 0.44],
  ];
  const path = (s: number): [number, number] => {
    const f = clamp(s) * (P.length - 1);
    const i = Math.min(P.length - 2, Math.floor(f));
    const u = f - i;
    const p0 = P[Math.max(0, i - 1)];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[Math.min(P.length - 1, i + 2)];
    const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
    return [cr(p0[0], p1[0], p2[0], p3[0]) * W, cr(p0[1], p1[1], p2[1], p3[1]) * H];
  };
  interface Q { s: number; off: number; speed: number; x: number; y: number; vy: number; fall: boolean; trail: number[]; seed: number }
  const qs: Q[] = [];
  const COUNT = 420;
  let released = 0;
  let settled = false;
  let lastRipple = 0;
  const make = (s: number): Q => ({ s, off: rand() * 2 - 1, speed: 0.6 + rand() * 0.8, x: 0, y: 0, vy: 0, fall: false, trail: [], seed: rand() * 100 });
  return {
    step(dt, t) {
      water.step(dt, t);
      const want = settled ? COUNT : Math.min(COUNT, Math.floor(t * 0.09));
      while (released < want) {
        qs.push(make(settled ? rand() * 0.95 : 0));
        released++;
      }
      for (const q of qs) {
        if (q.fall) {
          q.vy += 0.0012 * dt;
          q.y += q.vy * dt;
          if (q.y >= waterTop + (H - waterTop) * (0.2 + 0.4 * ((q.seed * 7) % 1))) {
            if (t - lastRipple > 260) {
              water.ripple(q.x, q.y, t, 0.5);
              lastRipple = t;
            }
            Object.assign(q, make(0));
          }
          continue;
        }
        // Earth is slow and heavy; fire quickens; air is fastest.
        const s = q.s;
        const v = s < 0.3 ? 0.00007 : s < 0.52 ? 0.0001 : 0.00015;
        q.s += v * q.speed * dt;
        const [px, py] = path(q.s);
        const [ax, ay] = path(q.s + 0.004);
        const len = Math.hypot(ax - px, ay - py) || 1;
        const nx = -(ay - py) / len;
        const ny = (ax - px) / len;
        const spread = H * (0.035 + 0.05 * smooth(0.25, 0.6, s) - 0.04 * smooth(0.75, 0.95, s));
        const wob = fbm2(n, q.seed + s * 6, t * 0.0004, 2) * 0.6;
        q.x = px + nx * (q.off + wob) * spread;
        q.y = py + ny * (q.off + wob) * spread;
        if (s > 0.52) {
          q.trail.push(q.x, q.y);
          if (q.trail.length > 24) q.trail.splice(0, 2);
        }
        if (q.s >= 1) {
          q.fall = true;
          q.vy = 0.02;
          q.trail.length = 0;
        }
      }
    },
    settle() {
      settled = true;
      water.finish?.();
    },
    pointer(x, y, t) {
      water.pointer?.(x, y, t);
    },
    render(ctx, t) {
      fire.clear();
      for (const q of qs) {
        const s = q.s;
        if (!q.fall && s > 0.24 && s < 0.6) {
          const k = smooth(0.24, 0.34, s) * (1 - smooth(0.48, 0.6, s));
          fire.splat(q.x, q.y, H * (0.02 + 0.014 * k), 0.11 * k);
        }
      }
      fire.draw(ctx, (i, j) => 0.5 + 0.5 * n(i * 0.15, j * 0.15 + t * 0.002));
      ctx.lineCap = 'round';
      for (const q of qs) {
        const s = q.s;
        if (q.fall) {
          ctx.fillStyle = 'rgba(206,228,240,0.8)';
          ctx.fillRect(q.x - 0.8, q.y - 2.5, 1.6, 3.5);
        } else if (s < 0.34) {
          // Earth grains; the hottest glow as embers where they begin to ignite.
          const e = smooth(0.2, 0.32, s);
          const r = mix(150, 255, e);
          const g = mix(112, 140, e);
          const b = mix(76, 40, e);
          ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${0.9 - 0.4 * smooth(0.3, 0.34, s)})`;
          const sz = mix(2.4, 1.4, e);
          ctx.fillRect(q.x - sz / 2, q.y - sz / 2, sz, sz);
        } else if (s > 0.52 && q.trail.length > 4) {
          // Air: pale streaks, becoming cool and blue as they condense.
          const c = smooth(0.78, 0.96, s);
          ctx.strokeStyle = `rgba(${mix(226, 196, c) | 0},${mix(230, 222, c) | 0},${mix(238, 244, c) | 0},${0.35 * smooth(0.52, 0.62, s)})`;
          ctx.lineWidth = mix(0.8, 1.4, c);
          ctx.beginPath();
          ctx.moveTo(q.trail[0], q.trail[1]);
          for (let i = 2; i < q.trail.length; i += 2) ctx.lineTo(q.trail[i], q.trail[i + 1]);
          ctx.stroke();
        }
      }
      water.render(ctx, t);
    },
  };
};

// ---------------------------------------------------------------------------------------------
// C · Shared dynamic field: one wind field (the Air layer's own velocity) acts on every material.
// Dust, flame and spray are all carried by the same currents and vortices over open water, so
// the elements read as one system. Flames arrive on the wind from the left.
export const convC: ProtoFactory = (W, H, seed = 32) => {
  const rand = mulberry32(seed);
  const n = makeNoise2(seed + 1);
  const waterTop = H * 0.72;
  const air = createAirLayer({ ...lc(W, H, seed, { x0: 0, x1: W, y0: H * 0.04, y1: waterTop }), density: 0.55, wind: 1, vortices: 3 });
  const water = createWaterLayer({ ...lc(W, H, seed, { x0: 0, x1: W, y0: waterTop, y1: H }), lightX: 0.6, warmX: 0.3, warmStrength: 0.35 });
  const fire = heatCanvas(W, H, 3);
  type Kind = 0 | 1 | 2; // dust, flame, spray
  interface P { k: Kind; x: number; y: number; vx: number; vy: number; age: number; life: number; trail: number[] }
  const ps: P[] = [];
  let settled = false;
  let lastRipple = 0;
  const spawn = (k: Kind, anywhere: boolean): P => {
    const life = 4000 + rand() * 5000;
    if (k === 2) {
      const x = rand() * W;
      return { k, x, y: waterTop + 2, vx: 0, vy: -(0.05 + rand() * 0.08), age: 0, life: 2500, trail: [] };
    }
    const band = k === 0 ? [0.35, 0.95] : [0.25, 0.8];
    const y = H * 0.04 + (waterTop - H * 0.04) * (band[0] + (band[1] - band[0]) * rand());
    return { k, x: anywhere ? rand() * W : -rand() * W * 0.08, y, vx: 0, vy: 0, age: anywhere ? rand() * life * 0.5 : 0, life, trail: [] };
  };
  const target = [180, 200, 40];
  return {
    step(dt, t) {
      air.step(dt, t);
      water.step(dt, t);
      const ramp = settled ? 1 : smooth(600, 3000, t);
      for (const k of [0, 1, 2] as Kind[]) {
        const have = ps.filter((p) => p.k === k).length;
        const want = Math.floor(target[k] * ramp);
        for (let i = have; i < want; i++) ps.push(spawn(k, settled));
      }
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.age += dt;
        const [u, v] = air.velocity(p.x, Math.min(p.y, waterTop - 4), t);
        if (p.k === 2) {
          // Spray: lifted by the wind's updrafts, pulled back by gravity.
          p.vx = mix(p.vx, u, 0.05);
          p.vy += 0.00022 * dt + v * 0.002;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.y > waterTop + 2 && p.age > 200) {
            if (t - lastRipple > 300) {
              water.ripple(p.x, waterTop + (H - waterTop) * 0.15, t, 0.35);
              lastRipple = t;
            }
            ps[i] = spawn(2, false);
          }
        } else {
          const drag = p.k === 0 ? 0.85 : 1.1; // dust lags a little; flame is light and quick
          p.x += u * drag * dt;
          p.y += (v * drag - (p.k === 1 ? 0.012 : -0.003)) * dt;
          p.trail.push(p.x, p.y);
          if (p.trail.length > (p.k === 0 ? 10 : 6)) p.trail.splice(0, 2);
          if (p.x > W * 1.05 || p.age > p.life || p.y < 0 || p.y > waterTop) ps[i] = spawn(p.k, false);
        }
      }
    },
    settle() {
      settled = true;
      air.finish?.();
      water.finish?.();
    },
    pointer(x, y, t) {
      air.pointer?.(x, y, t);
      water.pointer?.(x, y, t);
    },
    render(ctx, t) {
      water.render(ctx, t);
      ctx.save();
      ctx.globalAlpha = 0.55;
      air.render(ctx, t);
      ctx.restore();
      fire.clear();
      for (const p of ps) {
        if (p.k !== 1) continue;
        const life = Math.sin(Math.PI * clamp(p.age / p.life)) * (0.7 + 0.3 * fbm2(n, p.x * 0.01, t * 0.001, 2));
        fire.splat(p.x, p.y, H * 0.036, 0.26 * life, 1.3);
      }
      fire.draw(ctx, (i, j) => 0.5 + 0.5 * n(i * 0.18 - t * 0.0009, j * 0.18 + t * 0.0022));
      for (const p of ps) {
        if (p.k === 0 && p.trail.length > 2) {
          const a = Math.sin(Math.PI * clamp(p.age / p.life)) * 0.7;
          ctx.strokeStyle = `rgba(176,136,96,${a})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(p.trail[0], p.trail[1]);
          for (let i = 2; i < p.trail.length; i += 2) ctx.lineTo(p.trail[i], p.trail[i + 1]);
          ctx.stroke();
        } else if (p.k === 2 && p.y < waterTop - 5) {
          ctx.fillStyle = 'rgba(214,234,244,0.75)';
          ctx.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6);
        }
      }
    },
  };
};

export const CONVERGENCE_PROTOS = [
  { key: 'A', title: 'Layered atmospheric field', note: 'Depth planes: a broad band of heat haze hangs beyond a distant ridge; the ridge sits in the middle distance; still water fills the foreground; wind streams across all of it. Uses the approved Water and Air layers unchanged. Pointer: water ripple and air eddy.', make: convA },
  { key: 'B', title: 'Material transformation path', note: 'One S-shaped path across the field along which material changes state: earth grains tumble up from the lower left, ignite into flame, burn out into streaks of air, and condense into drops that fall into the water at the lower right. Pointer: water ripple.', make: convB },
  { key: 'C', title: 'Shared dynamic field', note: 'One wind field (the Air layer’s own velocity) carries every material: dust, flame and spray follow the same currents and vortices over open water. Flame arrives on the wind from the left. Pointer: air eddy and water ripple.', make: convC },
];

