// Fire studies D, E, F (design review only): choreographed fire. See docs/design/fire-brief.md.
// D and F share a small directed-fire engine: invisible "heads" follow timed paths and lay down hot
// gas that inherits their velocity; buoyancy, cooling and turbulence take over as it is released.
// E is concentrated heat: a thin seam, shimmer, motes that ignite, restrained flares.
// (Study F, converging bursts, became the production Fire scene: ../elements/bursts.ts.)
import { mulberry32 } from '../core';
import { makeNoise2, fbm2, smooth, clamp, mix } from '../elements/kit';
import { flameEngine, pathAt, mirror, glow, type Key } from '../elements/flame-engine';
import { fieldBuffer, FIRE_LUT, gust, type ProtoFactory } from './common';

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
      E.pointer(x, y, t);
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

];
