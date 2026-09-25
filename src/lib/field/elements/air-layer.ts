// Air: visible only through what it carries. Pale streaks with fading tails are advected through a
// steady wind, a few drifting vortices (Lamb–Oseen-like swirl) and curl-noise turbulence. The
// entrance: a gust sweeps in from the left while the vortices spin up. The pointer stirs a small eddy.
import { mulberry32, type Rect } from '../core';
import { makeNoise, curl, edgeFade, smooth, clamp, mix, type Layer, type LayerContext } from './kit';

interface Tracer {
  x: number;
  y: number;
  trail: number[]; // x0,y0,x1,y1,... newest last
  age: number;
  life: number;
  width: number;
  tone: number;
}
interface Vortex {
  x: number;
  y: number;
  gamma: number; // signed strength
  core: number;
}

export interface AirOptions extends LayerContext {
  /** Relative strength of the steady wind (default 1). */
  wind?: number;
  /** Fewer/more tracers (default 1). */
  density?: number;
  vortices?: number;
  /** Streak colour tones. */
  tones?: [number, number, number][];
}

export function createAirLayer(o: AirOptions): Layer & { velocity(x: number, y: number, t: number): [number, number] } {
  const f: Rect = o.field;
  const rand = mulberry32(o.seed + 29);
  const noise = makeNoise(o.seed + 31);
  const delay = o.delay ?? 0;
  const W = f.x1 - f.x0;
  const H = f.y1 - f.y0;
  const scale = Math.min(W, H);
  const U = 0.15 * (o.wind ?? 1) * clamp(W / 600, 0.6, 1.3); // px/ms
  const count = Math.round((o.mobile ? 80 : 150) * (o.density ?? 1) * clamp((W * H) / 3e5, 0.5, 1.4));
  const TRAIL = o.mobile ? 55 : 80;
  const tones = o.tones ?? [
    [222, 230, 240],
    [186, 204, 226],
    [236, 238, 242],
  ];
  const vortices: Vortex[] = Array.from({ length: o.vortices ?? (o.mobile ? 2 : 3) }, (_, i) => ({
    x: f.x0 + W * (0.25 + 0.3 * i + rand() * 0.1),
    y: f.y0 + H * (0.3 + rand() * 0.4),
    gamma: (i % 2 ? -1 : 1) * scale * (0.55 + rand() * 0.3) * U * 2.2,
    core: scale * (0.09 + rand() * 0.05),
  }));
  const eddy = { x: 0, y: 0, strength: 0 };
  let spin = 0;

  const tracers: Tracer[] = [];
  const spawn = (fromLeft: boolean): Tracer => {
    const x = fromLeft ? f.x0 - W * 0.05 - rand() * W * 0.1 : f.x0 + rand() * W;
    const y = f.y0 + rand() * H;
    return { x, y, trail: [], age: 0, life: 3500 + rand() * 4000, width: 0.45 + rand() * 0.8, tone: Math.floor(rand() * tones.length) };
  };
  let released = 0; // tracers released so far during the gust

  function velocity(x: number, y: number, t: number): [number, number] {
    let u = U * (1 + 0.25 * noise(y * 0.004, t * 0.0002, 1));
    let v = U * 0.08 * noise(x * 0.003, t * 0.0002, 2);
    const add = (cx: number, cy: number, gamma: number, core: number) => {
      const dx = x - cx;
      const dy = y - cy;
      const r2 = dx * dx + dy * dy + 1;
      const k = (gamma / (2 * Math.PI * r2)) * (1 - Math.exp(-r2 / (core * core)));
      u += -dy * k;
      v += dx * k;
    };
    for (const vo of vortices) add(vo.x, vo.y, vo.gamma * spin, vo.core);
    if (eddy.strength > 0.01) add(eddy.x, eddy.y, scale * U * 1.6 * eddy.strength, scale * 0.07);
    const [cu, cv] = curl(noise, x * 0.0035, y * 0.0035, t * 0.00015);
    u += cu * U * 0.35;
    v += cv * U * 0.35;
    return [u, v];
  }

  return {
    velocity,
    step(dt, t) {
      const local = t - delay;
      if (local < 0) return;
      spin = smooth(200, 1800, local);
      eddy.strength *= Math.pow(0.97, dt / 16);
      for (const vo of vortices) {
        // Vortices drift slowly downstream and come back upstream.
        vo.x += U * 0.18 * dt;
        if (vo.x > f.x1 + W * 0.15) {
          vo.x = f.x0 - W * 0.1;
          vo.y = f.y0 + H * (0.25 + rand() * 0.5);
        }
      }
      // The gust: tracers are released from the left over the first ~1.6 s.
      const want = Math.min(count, Math.floor(count * smooth(0, 1600, local)));
      while (released < want) {
        tracers.push(spawn(true));
        released++;
      }
      const sub = Math.min(3, Math.ceil(dt / 12));
      const h = dt / sub;
      for (const p of tracers) {
        p.age += dt;
        for (let s = 0; s < sub; s++) {
          // Midpoint (RK2) advection.
          const [u1, v1] = velocity(p.x, p.y, t);
          const [u2, v2] = velocity(p.x + u1 * h * 0.5, p.y + v1 * h * 0.5, t);
          p.x += u2 * h;
          p.y += v2 * h;
        }
        p.trail.push(p.x, p.y);
        if (p.trail.length > TRAIL * 2) p.trail.splice(0, 2);
        const out = p.x > f.x1 + W * 0.08 || p.y < f.y0 - H * 0.15 || p.y > f.y1 + H * 0.15;
        if (out || p.age > p.life) Object.assign(p, spawn(out || rand() < 0.6));
      }
    },
    finish() {
      spin = 1;
      while (released < count) {
        tracers.push(spawn(false));
        released++;
      }
    },
    pointer(x, y) {
      if (x < f.x0 || x > f.x1 || y < f.y0 || y > f.y1) return;
      eddy.x = x;
      eddy.y = y;
      eddy.strength = Math.min(1, eddy.strength + 0.15);
    },
    render(ctx) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const p of tracers) {
        const n = p.trail.length / 2;
        if (n < 3) continue;
        const life = Math.min(1, p.age / 500) * Math.min(1, (p.life - p.age) / 700);
        const [r, g, b] = tones[p.tone];
        // Draw the tail in a few chunks, fading towards the end.
        const chunks = 6;
        for (let c = 0; c < chunks; c++) {
          const i0 = Math.floor(((n - 1) * c) / chunks);
          const i1 = Math.floor(((n - 1) * (c + 1)) / chunks);
          const mx = p.trail[i1 * 2];
          const my = p.trail[i1 * 2 + 1];
          const a = life * ((c + 1) / chunks) ** 1.4 * 0.42 * edgeFade(f, mx, my, 0.12, 0.12);
          if (a < 0.01) continue;
          ctx.strokeStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
          ctx.lineWidth = p.width * mix(0.4, 1, (c + 1) / chunks);
          ctx.beginPath();
          ctx.moveTo(p.trail[i0 * 2], p.trail[i0 * 2 + 1]);
          for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(p.trail[i * 2], p.trail[i * 2 + 1]);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  };
}
