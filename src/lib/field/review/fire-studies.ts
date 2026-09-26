// Fire studies D, E, F (design review only): choreographed fire. See docs/design/fire-brief.md.
// D and F share a small directed-fire engine: invisible "heads" follow timed paths and lay down hot
// gas that inherits their velocity; buoyancy, cooling and turbulence take over as it is released.
// E is concentrated heat: a thin seam, shimmer, motes that ignite, restrained flares.
import { mulberry32 } from '../core';
import { makeNoise, makeNoise2, curl, fbm2, smooth, clamp, mix } from '../elements/kit';
import { fieldBuffer, FIRE_LUT, gust, type ProtoFactory } from './common';

// ------------------------------------------------------------------------------------ engine
interface Gas { x: number; y: number; vx: number; vy: number; T: number; r: number; tau: number }
interface Ember { x: number; y: number; vx: number; vy: number; life: number; age: number; b: number }

function flameEngine(W: number, H: number, seed: number) {
  const S = Math.min(W, H) / 400; // scale
  const rand = mulberry32(seed);
  const n3 = makeNoise(seed + 3);
  const n2 = makeNoise2(seed + 5);
  const buf = fieldBuffer(W, H, 2.5);
  const sx = buf.cols / W;
  const sy = buf.rows / H;
  const gas: Gas[] = [];
  const embers: Ember[] = [];
  const g = gust();
  return {
    S,
    rand,
    gas,
    embers,
    gust: g,
    /** Lay down hot gas at (x, y) moving with (vx, vy) px/ms. */
    emit(x: number, y: number, vx: number, vy: number, T: number, r: number, spread = 0.3, tau = 700) {
      gas.push({ x, y, vx: vx + (rand() - 0.5) * spread * S * 0.2, vy: vy + (rand() - 0.5) * spread * S * 0.2, T, r: r * S * (0.8 + rand() * 0.4), tau: tau * (0.8 + rand() * 0.4) });
    },
    ember(x: number, y: number, vx: number, vy: number) {
      embers.push({ x, y, vx: vx + (rand() - 0.5) * 0.06 * S, vy: vy - rand() * 0.05 * S, life: 1200 + rand() * 2200, age: 0, b: 0.6 + rand() * 0.4 });
    },
    step(dt: number, t: number) {
      g.decay(dt);
      const drag = Math.exp(-dt / 420);
      for (let i = gas.length - 1; i >= 0; i--) {
        const p = gas[i];
        // Momentum decays; buoyancy (∝ temperature) and turbulence take over.
        const [cu, cv] = curl(n3, p.x * 0.006 / S, p.y * 0.006 / S, t * 0.0004);
        const turb = 0.035 * S * (1.15 - p.T);
        p.vx = p.vx * drag + cu * turb * dt * 0.01;
        p.vy = p.vy * drag + cv * turb * dt * 0.01 - 0.00034 * S * p.T * dt;
        const gp = g.push(p.x, p.y, 120 * S);
        p.x += p.vx * dt + gp * 0.02;
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
        e.x += e.vx * dt + g.push(e.x, e.y, 120 * S) * 0.03;
        e.y += e.vy * dt;
        if (e.age > e.life) embers.splice(i, 1);
      }
    },
    render(ctx: CanvasRenderingContext2D, t: number) {
      buf.heat.fill(0);
      const heat = buf.heat;
      const C = buf.cols;
      const R = buf.rows;
      for (const p of gas) {
        const cx = p.x * sx;
        const cy = p.y * sy;
        const rr = Math.max(1.2, p.r * sx);
        // Stretch along the motion and upward: flames trail and rise.
        const sp = Math.hypot(p.vx, p.vy) / S;
        const ux = sp > 1e-4 ? p.vx / (sp * S) : 0;
        const uy = sp > 1e-4 ? p.vy / (sp * S) : -1;
        const along = rr * (1 + Math.min(2.8, sp * 12));
        const reach = Math.ceil(Math.max(rr, along) + 1);
        for (let j = Math.max(0, Math.floor(cy - reach)); j <= Math.min(R - 1, cy + reach); j++)
          for (let i = Math.max(0, Math.floor(cx - reach)); i <= Math.min(C - 1, cx + reach); i++) {
            const dx = i - cx;
            const dy = j - cy;
            const a = (dx * ux + dy * uy) / along;
            const b = (dx * -uy + dy * ux) / rr;
            const d2 = a * a + b * b;
            if (d2 < 1) heat[j * C + i] += p.T * (1 - d2) * (1 - d2) * 0.42;
          }
      }
      const d = buf.img.data;
      const time = t * 0.001;
      for (let j = 0; j < R; j++)
        for (let i = 0; i < C; i++) {
          const q = j * C + i;
          const h = heat[q];
          if (h < 0.01) {
            d[q * 4 + 3] = 0;
            continue;
          }
          // Saturating accumulation, eroded at the edges by rising noise (tongues, flicker).
          const base = 1 - Math.exp(-h * 1.3);
          // Erosion scrolls upward (rising gas); it bites deepest into the cooler outer layers, which
          // is what turns a smooth body into tongues and licks.
          // Tall, flowing tongues: noise stretched vertically and gently domain-warped.
          const wq = 0.8 * n2(i * 0.025 / S, j * 0.02 / S - time * 0.9);
          const nz = 0.5 + fbm2(n2, i * 0.075 / S + wq, j * 0.032 / S + time * 1.9, 2);
          const T = clamp(base * (0.45 + 1.05 * nz * (1.15 - base * 0.5)) - 0.12 * (1 - base));
          const li = (T * 255) | 0;
          d[q * 4] = FIRE_LUT[li * 4];
          d[q * 4 + 1] = FIRE_LUT[li * 4 + 1];
          d[q * 4 + 2] = FIRE_LUT[li * 4 + 2];
          d[q * 4 + 3] = FIRE_LUT[li * 4 + 3];
        }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      buf.draw(ctx, 0, 0, W, H);
      for (const e of embers) {
        const u = e.age / e.life;
        const fl = 0.6 + 0.4 * Math.sin(e.age * 0.03 + e.x);
        const a = (1 - u) * e.b * fl;
        const hot = 1 - u;
        ctx.fillStyle = `rgba(255,${(150 + 80 * hot) | 0},${(60 + 80 * hot * hot) | 0},${a})`;
        const s = Math.max(0.8, 1.6 * S * (1 - u * 0.5));
        ctx.fillRect(e.x - s / 2, e.y - s / 2, s, s);
      }
      ctx.restore();
    },
  };
}

type Key = [number, number, number]; // t (ms), x, y (fractions)
/** Position along timed keyframes: time → segment, Catmull–Rom in space. */
function pathAt(keys: Key[], t: number, W: number, H: number): [number, number] | null {
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
const mirror = (keys: Key[]): Key[] => keys.map(([t, x, y]) => [t, 1 - x, y]);

/** A glow drawn with 'lighter' (anticipation, flares). */
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, warm = 1) {
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

// ------------------------------------------------------------------------------------ D
// Directed ribbon. Gather → ignition → strike (fast arc) → one coil (circular redirection) →
// release (whip out, flare) → the ribbon rises, breaks into tongues, cools to embers. Repeats with
// the path mirrored, so it never settles into a loop you can predict at a glance.
const D_KEYS: Key[] = [
  [0, 0.12, 0.8],
  [260, 0.24, 0.62],
  [560, 0.4, 0.44],
  [900, 0.56, 0.36],
  [1180, 0.67, 0.4],
  [1420, 0.71, 0.52],
  [1640, 0.64, 0.6],
  [1840, 0.56, 0.52],
  [2020, 0.6, 0.41],
  [2200, 0.72, 0.34],
  [2420, 0.88, 0.25],
  [2600, 1.0, 0.18],
];
export const fireD: ProtoFactory = (W, H, seed = 51) => {
  const E = flameEngine(W, H, seed);
  const S = E.S;
  const CYCLE = 8200;
  const GATHER = 1000;
  let settledOffset = 0;
  let prev: [number, number] | null = null;
  let lastCycle = -1;
  return {
    step(dt, t0) {
      const t = t0 + settledOffset;
      const cyc = Math.floor(t / CYCLE);
      const local = t - cyc * CYCLE;
      const keys = cyc % 2 ? mirror(D_KEYS) : D_KEYS;
      if (cyc !== lastCycle) {
        lastCycle = cyc;
        prev = null;
      }
      // Gather: embers drawn towards the anchor.
      const [ax, ay] = [keys[0][1] * W, keys[0][2] * H];
      if (local < GATHER && E.rand() < 0.25) {
        const a = E.rand() * Math.PI * 2;
        const r = (60 + E.rand() * 60) * S;
        E.embers.push({ x: ax + Math.cos(a) * r, y: ay + Math.sin(a) * r, vx: -Math.cos(a) * 0.1 * S, vy: -Math.sin(a) * 0.1 * S, life: 700, age: 0, b: 0.5 });
      }
      const pt = local - GATHER;
      const pos = pathAt(keys, pt, W, H);
      if (pos && prev) {
        const [x, y] = pos;
        const vx = (x - prev[0]) / dt;
        const vy = (y - prev[1]) / dt;
        const dist = Math.hypot(x - prev[0], y - prev[1]);
        const n = Math.max(1, Math.ceil(dist / (1.6 * S)));
        const strike = pt < 250 ? 1.18 : 1; // ignition overshoot
        const release = pt > 2200 ? smooth(2200, 2600, pt) : 0;
        for (let k = 0; k < n; k++) {
          const f = (k + 1) / n;
          const px = mix(prev[0], x, f);
          const py = mix(prev[1], y, f);
          E.emit(px, py, vx * 0.3, vy * 0.3, strike, mix(5.5, 10, release), 0.5 + release * 2.5, mix(460, 720, release));
        }
        if (E.rand() < 0.3 + release) E.ember(x, y, vx * 0.3, vy * 0.3);
      }
      prev = pos;
      E.step(dt, t);
    },
    settle() {
      // Live state: mid-way through a later cycle's settle (tongues rising, embers).
      // (The review harness resumes a settled card at t = 6000 ms.)
      settledOffset = CYCLE * 2 + 4600 - 6000;
      for (let k = 90; k > 0; k--) this.step(16, 6000 - k * 16);
    },
    pointer(x, y, t) {
      E.gust.move(x, y, t);
    },
    render(ctx, t0) {
      const t = t0 + settledOffset;
      const cyc = Math.floor(t / CYCLE);
      const local = t - cyc * CYCLE;
      const keys = cyc % 2 ? mirror(D_KEYS) : D_KEYS;
      const [ax, ay] = [keys[0][1] * W, keys[0][2] * H];
      // Gather: a glow that contracts and brightens (breath in), then the ignition flash.
      if (local < GATHER + 300) {
        const u = clamp(local / GATHER);
        const flash = local > GATHER ? 1 - (local - GATHER) / 300 : 0;
        glow(ctx, ax, ay, (70 - 50 * u) * S + flash * 90 * S, 0.12 + 0.4 * u * u + flash * 0.6, 1 - flash);
      }
      E.render(ctx, t);
    },
  };
};

// ------------------------------------------------------------------------------------ F
// Converging bursts. Two directed bursts ignite in turn, the second curving wide around the
// first; they meet in a brief flare, and the merged energy rises in one column and dissipates.
const F_A: Key[] = [
  [0, 0.06, 0.86],
  [300, 0.2, 0.72],
  [650, 0.36, 0.64],
  [1000, 0.5, 0.56],
];
const F_B: Key[] = [
  [0, 0.98, 0.3],
  [250, 0.84, 0.24],
  [500, 0.66, 0.26],
  [700, 0.52, 0.36],
  [800, 0.5, 0.52],
  [900, 0.5, 0.56],
];
export const fireF: ProtoFactory = (W, H, seed = 61) => {
  const E = flameEngine(W, H, seed);
  const S = E.S;
  const CYCLE = 8600;
  const A_AT = 800;
  const B_AT = 900;
  const MEET = A_AT + 1000;
  let settledOffset = 0;
  const prev: ([number, number] | null)[] = [null, null];
  let flared = -1;
  return {
    step(dt, t0) {
      const t = t0 + settledOffset;
      const cyc = Math.floor(t / CYCLE);
      const local = t - cyc * CYCLE;
      const flip = cyc % 2 === 1;
      const paths = [
        { keys: flip ? mirror(F_A) : F_A, at: A_AT },
        { keys: flip ? mirror(F_B) : F_B, at: B_AT },
      ];
      paths.forEach((p, i) => {
        const pos = pathAt(p.keys, local - p.at, W, H);
        const pv = prev[i];
        if (pos && pv) {
          const vx = (pos[0] - pv[0]) / dt;
          const vy = (pos[1] - pv[1]) / dt;
          const n = Math.max(1, Math.ceil(Math.hypot(pos[0] - pv[0], pos[1] - pv[1]) / (1.6 * S)));
          const early = local - p.at < 200 ? 1.15 : 1;
          for (let k = 0; k < n; k++) {
            const f = (k + 1) / n;
            E.emit(mix(pv[0], pos[0], f), mix(pv[1], pos[1], f), vx * 0.3, vy * 0.3, early, i ? 5.5 : 7, 0.5, 420);
          }
          if (E.rand() < 0.25) E.ember(pos[0], pos[1], vx * 0.3, vy * 0.3);
        }
        prev[i] = pos;
      });
      // Meeting point: a brief flare, then the merged column rises.
      if (local >= MEET && flared !== cyc) {
        flared = cyc;
        const [mx, my] = [0.5 * W, 0.56 * H];
        for (let k = 0; k < 90; k++) {
          const a = E.rand() * Math.PI * 2;
          const sp = (0.08 + E.rand() * 0.25) * S;
          E.emit(mx, my, Math.cos(a) * sp, Math.sin(a) * sp - 0.05 * S, 0.95, 8, 0.5, 520);
        }
        for (let k = 0; k < 40; k++) E.ember(mx, my, (E.rand() - 0.5) * 0.4 * S, -(0.1 + E.rand() * 0.3) * S);
      }
      if (local > MEET && local < MEET + 2600) {
        // The merged energy: a column feeding upward, weakening.
        const w = 1 - (local - MEET) / 2600;
        const [mx, my] = [0.5 * W + Math.sin(local * 0.004) * 10 * S, 0.56 * H];
        for (let k = 0; k < 3; k++) E.emit(mx + (E.rand() - 0.5) * 20 * S, my, 0, -0.12 * S * w, 0.85 * w + 0.1, 8, 0.4, 700);
      }
      E.step(dt, t);
    },
    settle() {
      settledOffset = CYCLE * 2 + MEET + 900 - 6000;
      for (let k = 90; k > 0; k--) this.step(16, 6000 - k * 16);
    },
    pointer(x, y, t) {
      E.gust.move(x, y, t);
    },
    render(ctx, t0) {
      const t = t0 + settledOffset;
      const local = t - Math.floor(t / CYCLE) * CYCLE;
      const flip = Math.floor(t / CYCLE) % 2 === 1;
      // Anticipation: two faint glows gathering where the bursts will start.
      for (const [keys, at] of [[F_A, A_AT], [F_B, B_AT]] as [Key[], number][]) {
        const k = flip ? mirror(keys) : keys;
        if (local < at + 200) {
          const u = clamp(local / at);
          const flash = local > at ? 1 - (local - at) / 200 : 0;
          glow(ctx, k[0][1] * W, k[0][2] * H, (50 - 30 * u) * S + flash * 60 * S, 0.1 + 0.3 * u * u + flash * 0.5, 1 - flash);
        }
      }
      // The flare where they meet, with a faint ring of heat spreading out.
      const since = local - MEET;
      if (since > 0 && since < 1400) {
        const u = since / 1400;
        glow(ctx, 0.5 * W, 0.56 * H, (40 + 160 * u) * S, 0.7 * Math.pow(1 - u, 2.2), 1 - Math.max(0, 1 - since / 200));
        ctx.save();
        ctx.strokeStyle = `rgba(255,170,90,${0.18 * (1 - u)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0.5 * W, 0.56 * H, (20 + 220 * Math.sqrt(u)) * S, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      E.render(ctx, t);
    },
  };
};

// ------------------------------------------------------------------------------------ E
// Concentrated heat. Darkness and drifting motes; a pinpoint of heat appears and stretches into a
// thin seam; the air above it begins to shimmer and motes near it lift and ignite; a low sheet of
// flame surges along the seam and collapses back; then the seam holds, breathing, with rare
// restrained flares.
export const fireE: ProtoFactory = (W, H, seed = 71) => {
  const rand = mulberry32(seed);
  const n2 = makeNoise2(seed + 1);
  const n3 = makeNoise2(seed + 2);
  const S = Math.min(W, H) / 400;
  const buf = fieldBuffer(W, H, 2);
  const cx = W * 0.52;
  const cy = H * 0.64;
  const HALF = W * 0.26; // seam half-length when fully open
  const g = gust();
  interface Mote { x: number; y: number; vx: number; vy: number; heat: number; seed: number }
  const motes: Mote[] = Array.from({ length: 70 }, () => ({ x: rand() * W, y: rand() * H, vx: 0, vy: 0, heat: 0, seed: rand() * 100 }));
  let settled = false;
  let flareAt = 3400;
  let lastFlare = -1e9;
  let flareX = 0;
  let flareW = 1;
  let flareH = 1;
  const seamY = (x: number) => cy + Math.sin((x - cx) / HALF * 1.2) * 6 * S; // a slight curve
  const openAt = (t: number) => (settled ? 1 : smooth(1800, 2900, t));
  const powerAt = (t: number) => (settled ? 1 : smooth(1200, 2900, t));
  return {
    step(dt, t) {
      g.decay(dt);
      const open = openAt(t);
      const power = powerAt(t);
      for (const m of motes) {
        // Ambient drift; near the seam heat lifts motes and they ignite.
        const dx = (m.x - cx) / (HALF * Math.max(0.05, open) + 30 * S);
        const dy = (m.y - cy) / (80 * S);
        const near = Math.exp(-(dx * dx) * 2 - dy * dy) * power;
        m.heat = mix(m.heat, near, Math.min(1, dt / 400));
        m.vx = mix(m.vx, 0.006 * S + n2(m.seed, t * 0.0002) * 0.01 * S, 0.02);
        m.vy = mix(m.vy, -0.004 * S - near * 0.09 * S, 0.03);
        m.x += m.vx * dt + g.push(m.x, m.y, 100 * S) * 0.02;
        m.y += m.vy * dt;
        if (m.y < -10 || m.x > W + 10) {
          m.x = rand() * W;
          m.y = H + 5;
          m.heat = 0;
        }
      }
      if (t > flareAt) {
        // A restrained flare somewhere along the seam.
        flareX = t < 3500 && !settled ? 0 : (rand() - 0.5) * 1.4;
        flareW = t < 3500 && !settled ? 1 : 0.18 + rand() * 0.25;
        flareH = t < 3500 && !settled ? 1 : 0.5 + rand() * 0.4;
        flareAt = t + 5200 + rand() * 3200;
        lastFlare = t;
      }
    },
    settle() {
      settled = true;
      lastFlare = -1e9;
    },
    pointer(x, y, t) {
      g.move(x, y, t);
    },
    render(ctx, t) {
      const time = t * 0.001;
      const open = openAt(t);
      const power = powerAt(t);
      const breathe = 0.9 + 0.1 * Math.sin(t * 0.0016);
      // Heat haze above the seam: a dim warm field with rising shimmer bands.
      buf.heat.fill(0);
      const d = buf.img.data;
      const C = buf.cols;
      const R = buf.rows;
      const fl = t - lastFlare;
      const flare = fl > 0 && fl < 1300 ? Math.sin(Math.PI * Math.min(1, fl / 1300)) * (fl < 400 ? smooth(0, 400, fl) : 1) : 0;
      for (let j = 0; j < R; j++) {
        const y = (j + 0.5) / R * H;
        for (let i = 0; i < C; i++) {
          const x = (i + 0.5) / C * W;
          const q = j * C + i;
          const along = (x - cx) / (HALF * Math.max(0.02, open));
          const inSeam = 1 - smooth(0.75, 1.05, Math.abs(along));
          const sy0 = seamY(x);
          const up = (sy0 - y) / S; // px above the seam (scaled)
          let T = 0;
          // The seam: very thin, very hot. A pinpoint before it opens.
          const pin = Math.exp(-(((x - cx) / (6 * S)) ** 2) - ((y - cy) / (5 * S)) ** 2) * smooth(1200, 1700, t) * (1 - open);
          const seam = Math.exp(-(((y - sy0) / (2.2 * S)) ** 2)) * inSeam * power * breathe;
          T = Math.max(T, seam * 1.05, pin * 1.1);
          // Haze: rising shimmer.
          if (up > -10 && up < 170) {
            // Shimmer: thin vertical streaks rising through the haze (refraction in hot air).
            const sh = 0.5 + 0.5 * n2(x * 0.06 / S, (y + t * 0.08 * S) * 0.02 / S);
            const width = 1 - smooth(0.45 - up * 0.002, 1.1 - up * 0.003, Math.abs(along));
            const hz = Math.exp(-Math.max(0, up) / 55) * smooth(-10, 3, up) * width * power;
            T = Math.max(T, hz * (0.07 + 0.12 * sh));
          }
          // Flare: a low sheet of tongues rising along a stretch of the seam, then collapsing.
          if (flare > 0 && up > -4) {
            const fa = (along - flareX) / flareW;
            if (Math.abs(fa) < 1.2) {
              const env = (1 - smooth(0.6, 1.1, Math.abs(fa))) * flare;
              const hmax = 70 * S * flareH * env;
              const tongue = fbm2(n3, x * 0.03 / S, up * 0.04 - time * 3.2, 3);
              const v = up / Math.max(1, hmax);
              T = Math.max(T, clamp((1 - v) * 0.85 + tongue * 0.6 - 0.15) * env * (up < hmax * 1.3 ? 1 : 0));
            }
          }
          const li = (clamp(T) * 255) | 0;
          let r = FIRE_LUT[li * 4];
          let gg = FIRE_LUT[li * 4 + 1];
          let b = FIRE_LUT[li * 4 + 2];
          // Plausible blue only just below the seam, where it is thinnest and hottest.
          if (seam > 0.4 && y > sy0 + 1.2 * S) {
            const bl = clamp((y - sy0) / (3 * S)) * 0.45;
            r = mix(r, 150, bl);
            gg = mix(gg, 180, bl);
            b = mix(b, 255, bl);
          }
          d[q * 4] = r;
          d[q * 4 + 1] = gg;
          d[q * 4 + 2] = b;
          d[q * 4 + 3] = FIRE_LUT[li * 4 + 3];
        }
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      buf.draw(ctx, 0, 0, W, H);
      // Wide faint bloom around the seam.
      if (power > 0) {
        const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, HALF * 1.3 * Math.max(0.2, open));
        gr.addColorStop(0, `rgba(255,170,90,${0.16 * power * breathe + 0.2 * flare})`);
        gr.addColorStop(1, 'rgba(120,30,10,0)');
        ctx.fillStyle = gr;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, 0.45);
        ctx.translate(-cx, -cy);
        ctx.fillRect(0, 0, W, H * 2.2);
        ctx.restore();
      }
      // Motes: dim ash far from the seam; they catch and glow as they are drawn into the heat.
      // The shimmer displaces them (heat distortion made visible).
      for (const m of motes) {
        const shimmer = m.heat * 3 * S;
        const ox = n2(m.x * 0.05, t * 0.012) * shimmer;
        const hot = m.heat;
        const a = 0.25 + 0.7 * hot;
        ctx.fillStyle = hot > 0.15 ? `rgba(255,${(150 + 90 * hot) | 0},${(70 + 80 * hot) | 0},${a})` : `rgba(160,150,140,${0.22})`;
        const s = hot > 0.15 ? 1.5 * S : 1.1 * S;
        ctx.fillRect(m.x + ox - s / 2, m.y - s / 2, s, s);
      }
      ctx.restore();
    },
  };
};

export const FIRE_STUDIES = [
  {
    key: 'D',
    title: 'Directed ribbon',
    note: 'Gathered, launched, redirected, released. Embers are drawn to a point and a glow contracts; ignition flashes; a ribbon of fire strikes along a fast arc, coils once, whips out and flares; then it rises, breaks into tongues and cools to embers. The next cycle mirrors the path. Pointer: a gust bends the fire.',
    make: fireD,
  },
  {
    key: 'E',
    title: 'Concentrated heat',
    note: 'Restraint instead of a big flame. A pinpoint of heat stretches into a thin, white-hot seam; the air above it shimmers, ash motes are drawn in and ignite; a low sheet of flame surges along the seam and collapses back; then the seam holds, breathing, with rare small flares. Pointer: a gust moves the motes.',
    make: fireE,
  },
  {
    key: 'F',
    title: 'Converging bursts',
    note: 'Two glows gather at opposite edges; a burst strikes from one, a second curves wide around it; they meet in a brief flare with a ring of heat, and the merged energy rises in one column and dissipates into embers. The next cycle mirrors it. Pointer: a gust bends the fire.',
    make: fireF,
  },
];
