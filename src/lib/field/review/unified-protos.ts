// Architecture D studies (design review only): the research concepts as behaviours of the one
// elemental flow language. Rough by intent. Shared grammar: pale streamlines with fading trails
// (Air's language), one warm accent for material or agents that change hands, a dark stage, and
// paired / splitting / merging currents echoing the counter-rotating-currents mark.
import { mulberry32 } from '../core';
import { makeNoise2, clamp, mix } from '../elements/kit';
import type { ProtoFactory } from './common';

interface P { x: number; y: number; trail: number[]; age: number; life: number; warm: number; g: number; aux: number }
type Vel = (p: P, t: number) => [number, number];

function flow(W: number, H: number, seed: number, cfg: { count: number; spawn: (r: () => number, t: number) => Partial<P> & { x: number; y: number }; vel: Vel; trail?: number; dead?: (p: P) => boolean; update?: (p: P, dt: number, t: number) => void; under?: (ctx: CanvasRenderingContext2D, t: number) => void }) {
  const rand = mulberry32(seed);
  const ps: P[] = [];
  const S = Math.min(W, H) / 350;
  const TRAIL = cfg.trail ?? 60;
  let t = 0;
  const make = (): P => ({ trail: [], age: 0, life: 4000 + rand() * 5000, warm: 0, g: 0, aux: rand(), ...cfg.spawn(rand, t) });
  return {
    S,
    rand,
    step(dt: number, now: number) {
      t = now;
      const want = Math.min(cfg.count, Math.floor(now / 12));
      while (ps.length < want) ps.push(make());
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        const [u, v] = cfg.vel(p, now);
        p.x += u * dt * S;
        p.y += v * dt * S;
        p.age += dt;
        cfg.update?.(p, dt, now);
        p.trail.push(p.x, p.y);
        if (p.trail.length > TRAIL * 2) p.trail.splice(0, 2);
        if (p.age > p.life || p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40 || cfg.dead?.(p)) ps[i] = make();
      }
    },
    settle() {
      for (let k = 0; k < 300; k++) this.step(16, 6000 + k * 16);
    },
    render(ctx: CanvasRenderingContext2D, now: number) {
      cfg.under?.(ctx, now);
      ctx.save();
      ctx.lineCap = 'round';
      for (const p of ps) {
        const L = p.trail.length;
        if (L < 6) continue;
        const env = Math.sin(Math.PI * clamp(p.age / p.life)) * clamp(p.age / 600);
        const SEG = 4;
        const per = Math.max(4, Math.floor(L / 2 / SEG) * 2);
        for (let s = 0; s < SEG; s++) {
          const i0 = s * per;
          if (i0 + 2 >= L) break;
          const k = (s + 1) / SEG;
          const r = mix(206, 255, p.warm);
          const g = mix(216, 176, p.warm);
          const b = mix(232, 112, p.warm);
          ctx.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},${0.5 * env * k * k})`;
          ctx.lineWidth = (0.7 + 0.6 * p.aux) * S;
          ctx.beginPath();
          ctx.moveTo(p.trail[i0], p.trail[i0 + 1]);
          for (let i = i0 + 2; i < Math.min(L, i0 + per + 2); i += 2) ctx.lineTo(p.trail[i], p.trail[i + 1]);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  };
}

// Adapt: a current meets an obstacle whose position and size keep changing (conditions shift) and
// the flow re-routes smoothly around it: potential flow past a moving cylinder, in a slowly
// turning stream. The obstacle is a low stone, barely lit.
export const uAdapt: ProtoFactory = (W, H, seed = 3) => {
  const n = makeNoise2(seed);
  const obs = (t: number) => ({
    x: W * (0.5 + 0.12 * Math.sin(t * 0.00025)),
    y: H * (0.5 + 0.16 * Math.sin(t * 0.00017 + 1)),
    R: Math.min(W, H) * (0.12 + 0.05 * Math.sin(t * 0.0003 + 2)),
    a: 0.25 * Math.sin(t * 0.00011),
  });
  const F = flow(W, H, seed, {
    count: 170,
    trail: 70,
    spawn: (r) => ({ x: -10 - r() * 40, y: r() * H }),
    vel: (p, t) => {
      const o = obs(t);
      // Work in the frame of the (slowly turning) stream.
      const ca = Math.cos(o.a);
      const sa = Math.sin(o.a);
      const dx = (p.x - o.x) * ca + (p.y - o.y) * sa;
      const dy = -(p.x - o.x) * sa + (p.y - o.y) * ca;
      const r2 = dx * dx + dy * dy;
      const U = 0.075;
      const R2 = o.R * o.R;
      const r4 = r2 * r2 + 1e-6;
      let u = U * (1 - (R2 * (dx * dx - dy * dy)) / r4);
      let v = -U * ((R2 * 2 * dx * dy) / r4);
      if (r2 < R2) [u, v] = [0, 0];
      u += 0.012 * n(p.x * 0.01, t * 0.0003);
      return [u * ca - v * sa, u * sa + v * ca];
    },
    under: (ctx, t) => {
      const o = obs(t);
      const g = ctx.createRadialGradient(o.x - o.R * 0.3, o.y - o.R * 0.3, o.R * 0.1, o.x, o.y, o.R * 0.95);
      g.addColorStop(0, 'rgba(120,98,76,0.5)');
      g.addColorStop(1, 'rgba(40,32,28,0.35)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.R * 0.92, 0, Math.PI * 2);
      ctx.fill();
    },
  });
  return { step: F.step, render: F.render, settle: () => F.settle() };
};

// Exchange: two counter-rotating currents (the mark's geometry, opened out). Each carries its own
// material, cool on one side and warm on the other; where they meet, some of it changes hands and
// takes on the other's colour, so over time the two exchange without either losing its shape.
export const uExchange: ProtoFactory = (W, H, seed = 5) => {
  const R = Math.min(W * 0.19, H * 0.3);
  const A = { x: W * 0.5 - R * 0.95, y: H * 0.5 - R * 0.35, s: 1 };
  const B = { x: W * 0.5 + R * 0.95, y: H * 0.5 + R * 0.35, s: -1 };
  const F = flow(W, H, seed, {
    count: 220,
    trail: 45,
    spawn: (r) => {
      const side = r() < 0.5 ? A : B;
      const a = r() * Math.PI * 2;
      const rr = R * (0.3 + r() * 0.7);
      return { x: side.x + Math.cos(a) * rr, y: side.y + Math.sin(a) * rr, warm: side === B ? 1 : 0, g: side === B ? 1 : 0, life: 6000 + r() * 5000 };
    },
    vel: (p) => {
      const c = p.g ? B : A;
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const d = Math.hypot(dx, dy) + 1e-3;
      const sw = 0.11 * c.s;
      const pull = (R * (0.3 + 0.7 * p.aux) - d) * 0.0005; // keeps it in its current, at its own radius
      return [(-dy / d) * sw + (dx / d) * pull, (dx / d) * sw + (dy / d) * pull];
    },
    update: (p, dt) => {
      // Where the currents meet (between the centres, moving the same way), material may cross.
      const mid = Math.hypot(p.x - W * 0.5, p.y - H * 0.5) < R * 0.35;
      if (mid && Math.random() < 0.012 * (dt / 16)) {
        p.g = 1 - p.g;
        p.trail.length = 0;
      }
      p.warm += ((p.g ? 1 : 0) - p.warm) * Math.min(1, dt / 900);
    },
  });
  return { step: F.step, render: F.render, settle: () => F.settle() };
};

// Share: one source current divides among four destinations. Each new parcel goes to the branch
// that has received least so far, so the branches stay equally full: a visibly balanced division.
export const uShare: ProtoFactory = (W, H, seed = 7) => {
  const n = makeNoise2(seed);
  const src = { x: W * 0.08, y: H * 0.5 };
  const dests = [0.18, 0.4, 0.62, 0.84].map((f) => ({ x: W * 0.9, y: H * f }));
  const got = [0, 0, 0, 0];
  const path = (k: number, u: number): [number, number] => {
    // Out of the source together, then each curves to its own destination (a cubic).
    const d = dests[k];
    const x0 = src.x;
    const y0 = src.y;
    const x1 = W * 0.42;
    const y1 = src.y;
    const x2 = W * 0.58;
    const y2 = d.y;
    const x3 = d.x;
    const y3 = d.y;
    const a = 1 - u;
    return [a * a * a * x0 + 3 * a * a * u * x1 + 3 * a * u * u * x2 + u * u * u * x3, a * a * a * y0 + 3 * a * a * u * y1 + 3 * a * u * u * y2 + u * u * u * y3];
  };
  const F = flow(W, H, seed, {
    count: 180,
    trail: 40,
    spawn: (r) => {
      let k = 0;
      for (let i = 1; i < 4; i++) if (got[i] < got[k]) k = i;
      got[k]++;
      return { x: src.x, y: src.y + (r() - 0.5) * 6, g: k, aux: r(), life: 3400, warm: 0 };
    },
    vel: () => [0, 0],
    update: (p, dt, t) => {
      const u = clamp(p.age / p.life);
      const [x, y] = path(p.g, u);
      const off = (p.aux - 0.5) * 10 * (0.3 + u) + 3 * n(p.aux * 10, t * 0.001);
      p.x = x;
      p.y = y + off;
    },
    under: (ctx, t) => {
      // Destinations: calm pools that fill evenly.
      for (const d of dests) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.002 + d.y);
        ctx.strokeStyle = `rgba(206,216,232,${0.14 + 0.08 * pulse})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, 12, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(src.x, src.y, 0, src.x, src.y, 26);
      g.addColorStop(0, 'rgba(255,190,130,0.35)');
      g.addColorStop(1, 'rgba(255,190,130,0)');
      ctx.fillStyle = g;
      ctx.fillRect(src.x - 26, src.y - 26, 52, 52);
    },
  });
  return { step: F.step, render: F.render, settle: () => F.settle() };
};

// Gather: streams arrive from different directions, spiral inward, and settle into one slowly
// turning formation: separate currents becoming a stable whole.
export const uGather: ProtoFactory = (W, H, seed = 11) => {
  const C = { x: W * 0.5, y: H * 0.5 };
  const R0 = Math.min(W, H) * 0.2;
  const sources = [0.1, 0.9, 2.2, 3.6, 4.9].map((a) => a);
  const F = flow(W, H, seed, {
    count: 200,
    trail: 55,
    spawn: (r) => {
      const a = sources[Math.floor(r() * sources.length)] + (r() - 0.5) * 0.12;
      return { x: C.x + Math.cos(a) * W * 0.47, y: C.y + Math.sin(a) * H * 0.47, life: 5500 + r() * 3500, warm: 0 };
    },
    vel: (p) => {
      const dx = p.x - C.x;
      const dy = p.y - C.y;
      const d = Math.hypot(dx, dy) + 1e-3;
      const Rp = R0 * (0.55 + 0.8 * p.aux); // each settles at its own radius: a loose formation
      const radial = -0.11 * clamp((d - Rp) / (R0 * 1.5), -0.3, 1);
      const swirl = 0.05 + 0.06 * clamp(1 - (d - R0) / (R0 * 2));
      return [(dx / d) * radial + (-dy / d) * swirl, (dy / d) * radial + (dx / d) * swirl];
    },
    update: (p, dt) => {
      const d = Math.hypot(p.x - C.x, p.y - C.y);
      // Joining the formation: a little warmth as it settles.
      p.warm += ((d < R0 * 1.25 ? 0.55 : 0) - p.warm) * Math.min(1, dt / 1500);
    },
  });
  return { step: F.step, render: F.render, settle: () => F.settle() };
};

export const UNIFIED = [
  { key: 'adapt', title: 'Adapt', note: 'A current meets an obstacle whose position and size keep changing; the flow re-routes smoothly around it. Conditions change; the system adjusts without breaking.', make: uAdapt },
  { key: 'exchange', title: 'Exchange', note: 'Two counter-rotating currents (the mark, opened out), each carrying its own material. Where they meet, some of it changes hands and takes on the other’s colour: exchange without either losing its shape.', make: uExchange },
  { key: 'share', title: 'Share', note: 'One source divides among four destinations. Each new parcel goes to the branch that has received least, so the branches stay equally full: a visibly balanced division.', make: uShare },
  { key: 'gather', title: 'Gather', note: 'Streams arrive from different directions, spiral inward, and settle into one slowly turning formation: separate currents becoming a stable whole.', make: uGather },
];
