// Fire art-direction prototypes (design review only). Three different compositions; none has a
// shared baseline. All render a temperature field at low resolution and share one palette.
import { mulberry32 } from '../core';
import { makeNoise2, fbm2, smooth, clamp, mix } from '../elements/kit';
import { fieldBuffer, putTemp, gust, type Proto, type ProtoFactory } from './common';

// ---------------------------------------------------------------------------------------------
// A · Sweeping flame current: a broad current of fire sweeps diagonally up through the field.
// Heat rides along it; tongues peel off its upper side, sheared along the flow; it thins, splits
// and rejoins, leaving dark gaps. Temperature varies along the current.
export const fireA: ProtoFactory = (W, H, seed = 3) => {
  const n1 = makeNoise2(seed + 1);
  const n2 = makeNoise2(seed + 2);
  const n3 = makeNoise2(seed + 3);
  const buf = fieldBuffer(W, H, 3);
  const g = gust();
  let settled = false;
  // Centre line of the current (by x) and its thickness.
  const cy = (x: number, T: number) => {
    const u = x / W;
    return H * (0.86 - 0.62 * u + 0.1 * Math.sin(u * 5.2 + 0.4) + 0.025 * Math.sin(u * 11 - T * 0.6));
  };
  const thick = (x: number) => H * (0.035 + 0.05 * Math.sin(Math.PI * clamp(x / W)));
  return {
    step(dt) {
      g.decay(dt);
    },
    settle() {
      settled = true;
    },
    pointer(x, y, t) {
      g.move(x, y, t);
    },
    render(ctx, t) {
      const T = t * 0.001 + 11.3;
      const reach = settled ? 1 : smooth(200, 2600, t); // the current sweeps in from the lower left
      buf.clear();
      const { cols, rows, img, heat } = buf;
      const d = img.data;
      for (let r = 0; r < rows; r++) {
        const y = (r + 0.5) * (H / rows);
        for (let c = 0; c < cols; c++) {
          let x = (c + 0.5) * (W / cols);
          if (x / W > reach * 1.1 + 0.02) continue;
          x += g.push(x, y, H * 0.3);
          const yc = cy(x, T);
          const th = thick(x);
          const off = (yc - y) / th; // >0 above the core
          if (off < -3.5 || off > 9) continue;
          // Along-flow coordinate: noise scrolls along the current (it flows up and right).
          const along = x * 0.006 - T * 0.55;
          // Heat varies along the current and breaks it into sections that split and rejoin.
          const heatAlong = 0.75 + 0.4 * fbm2(n3, x * 0.004 - T * 0.12, 1.7, 2);
          const gap = smooth(-0.35, 0.1, fbm2(n3, x * 0.009 - T * 0.25, 5.1, 2));
          // Core band, eroded on both sides so neither edge is a clean line.
          const under = fbm2(n2, x * 0.02 - T * 0.4, off * 0.5 + 3.1, 2);
          let e = 1 - (off * off) / (off < 0 ? 2.2 + 1.6 * under : 2.2) + (off < 0 ? 0.35 * under : 0);
          // Tongues above the core: taller than wide, rising (the pattern scrolls upward) and
          // sheared a little along the flow.
          if (off > 0) {
            const up = off / 8;
            const tongue = fbm2(n1, x * 0.016 - off * 0.22, off * 0.28 - T * 1.7, 3);
            e = Math.max(e, (0.95 - up * 1.55 + tongue * 1.25) * (1 - up * 0.6));
          }
          const turb = fbm2(n2, along * 5 + off * 0.3, off * 0.35 - T * 2.1, 3);
          let temp = (e + turb * 0.35) * heatAlong * (0.35 + 0.65 * gap);
          temp *= smooth(reach * 1.1 + 0.02, reach * 1.1 - 0.12, x / W);
          if (temp <= 0.02) continue;
          const hotCore = off > -0.6 && off < 0.8 && heatAlong > 1.02 ? clamp((heatAlong - 1.02) * 3) * 0.35 * (1 - Math.abs(off)) : 0;
          putTemp(d, heat, r * cols + c, clamp(temp), hotCore);
        }
      }
      buf.draw(ctx, 0, 0, W, H);
    },
  };
};

// ---------------------------------------------------------------------------------------------
// B · Drifting ignition field: separate flame bodies at different depths (sizes, softness,
// brightness). No shared ground: each rises out of darkness from a rounded hot core. One ignites,
// then another catches nearby; some flare, some settle. Distant ones are smaller and cooler.
function flameTemp(u: number, v: number, T: number, n1: (a: number, b: number) => number, n2: (a: number, b: number) => number, ph: number, hs: number[]) {
  // v: 0 at the hot core, 1 at the tips. u: across, about -1..1.
  const up = Math.max(0, v);
  const warp = fbm2(n1, u * 1.4 + ph, up * 2.2 - T * 1.9, 2) * (0.16 + 0.55 * up);
  const uw = u + warp;
  let e = -1;
  const pos = [-0.42, 0.04, 0.46];
  for (let k = 0; k < 3; k++) {
    const hk = hs[k];
    if (up > hk) continue;
    const w = 0.5 * Math.pow(1 - up / hk, 0.7);
    e = Math.max(e, (1 - Math.abs(uw - pos[k]) / (w + 1e-3)) * (0.7 + 0.3 * (1 - up / hk)));
  }
  // Rounded hot core instead of a flat base: the flame rises out of darkness.
  const core = 1 - (uw * uw) / 0.6 - ((v - 0.1) / 0.22) ** 2;
  e = Math.max(e, core * 0.9);
  // Below the core the flame fades into darkness along a rounded, broken edge (no base line).
  const cap = 0.85 - Math.hypot(uw * 0.8, Math.min(0, v - 0.1) / (0.16 + 0.08 * fbm2(n1, uw * 3 + ph, T * 0.8, 2)));
  e = Math.min(e, mix(cap, 1.2, smooth(0.1, 0.4, v)));
  e = Math.min(e, 1 - (uw / (0.8 * (1 - 0.45 * up))) ** 2); // one teardrop envelope
  const turb = fbm2(n2, uw * 2.6 + ph, up * 3.2 - T * 1.9, 3);
  let temp = e + turb * (0.28 + 0.3 * up) - up * 0.22;
  temp *= 1 - smooth(1.1, 1.5, Math.abs(u));
  temp *= smooth(-0.13, 0.06, v + 0.05 * turb); // fades out below the core, never a cut
  return clamp(temp * 1.05);
}

export const fireB: ProtoFactory = (W, H, seed = 5) => {
  const rand = mulberry32(seed);
  const n1 = makeNoise2(seed + 1);
  const n2 = makeNoise2(seed + 2);
  const g = gust();
  let settled = false;
  // x, y = hot core position; s = scale (depth); heat; at = ignition time.
  const flames = [
    { x: 0.3, y: 0.92, s: 1.0, heat: 1.0, at: 200 },
    { x: 0.66, y: 0.7, s: 0.6, heat: 0.93, at: 900 },
    { x: 0.86, y: 0.4, s: 0.36, heat: 0.86, at: 1500 },
    { x: 0.5, y: 0.34, s: 0.24, heat: 0.8, at: 2000 },
    { x: 0.12, y: 0.52, s: 0.3, heat: 0.82, at: 2500 },
    { x: 0.7, y: 0.24, s: 0.17, heat: 0.76, at: 3000 },
  ].map((f, i) => ({ ...f, ph: rand() * 60 + i * 13, level: 0, target: 1, hs: [0.6 + rand() * 0.2, 0.9 + rand() * 0.1, 0.55 + rand() * 0.25] }));
  // Draw far (small) to near (large); far flames use a softer, lower-resolution buffer.
  const order = [...flames].sort((a, b) => a.s - b.s);
  const bufs = order.map((f) => fieldBuffer(H * 0.55 * f.s, H * 0.9 * f.s, f.s > 0.5 ? 2.6 : 3.4));
  let nextFlare = 3500;
  return {
    step(dt, t) {
      g.decay(dt);
      for (const f of flames) {
        if (!settled && t < f.at) continue;
        const goal = f.target * (0.8 + 0.2 * (0.5 + 0.5 * n1(f.ph, t * 0.0004)));
        f.level += (goal - f.level) * Math.min(1, dt / 700);
      }
      if (t > nextFlare) {
        // One region flares, another settles (never out).
        const a = flames[Math.floor(rand() * flames.length)];
        a.target = 0.72 + rand() * 0.35;
        nextFlare = t + 2200 + rand() * 1800;
      }
    },
    settle() {
      settled = true;
      for (const f of flames) f.level = f.target;
    },
    pointer(x, y, t) {
      g.move(x, y, t);
    },
    render(ctx, t) {
      const T = t * 0.001 + 7.1;
      order.forEach((f, k) => {
        if (f.level < 0.02) return;
        const b = bufs[k];
        const bw = H * 0.55 * f.s;
        const bh = H * 0.9 * f.s;
        const bx = W * f.x - bw / 2;
        const by = H * f.y - bh * 0.88;
        b.clear();
        const { cols, rows, img, heat } = b;
        const hEff = 0.35 + 0.65 * f.level;
        const push = g.push(W * f.x, H * f.y - bh * 0.4, H * 0.3) / (bw * 0.5);
        for (let r = 0; r < rows; r++) {
          const vy = 1 - (r + 0.5) / rows; // 0 bottom … 1 top of box
          const v = (vy - 0.12) / (0.86 * hEff);
          for (let c = 0; c < cols; c++) {
            const u = ((c + 0.5) / cols) * 2 - 1 - push * Math.max(0, v) * Math.max(0, v);
            const temp = flameTemp(u * 1.35, v, T, n1, n2, f.ph, f.hs) * f.heat * (0.8 + 0.2 * f.level);
            if (temp > 0.02) putTemp(img.data, heat, r * cols + c, clamp(temp));
          }
        }
        // Atmospheric depth: distant flames are dimmer.
        ctx.globalAlpha = mix(0.55, 1, clamp((f.s - 0.25) / 0.6));
        b.draw(ctx, bx, by, bw, bh);
        ctx.globalAlpha = 1;
      });
    },
  };
};

// ---------------------------------------------------------------------------------------------
// C · Turbulent thermal field: a broad region of hot, turbulent gas rising through the field,
// shown as nested temperature contours. Tongues form where plumes of heat push upward and
// dissolve at the top. Between natural fire and generative art.
export const fireC: ProtoFactory = (W, H, seed = 9) => {
  const n1 = makeNoise2(seed + 1);
  const n2 = makeNoise2(seed + 2);
  const buf = fieldBuffer(W, H, 3);
  const g = gust();
  let settled = false;
  return {
    step(dt) {
      g.decay(dt);
    },
    settle() {
      settled = true;
    },
    pointer(x, y, t) {
      g.move(x, y, t);
    },
    render(ctx, t) {
      const T = t * 0.001 + 3.3;
      const bloom = settled ? 1 : smooth(150, 2400, t);
      buf.clear();
      const { cols, rows, img, heat } = buf;
      for (let r = 0; r < rows; r++) {
        const y = (r + 0.5) * (H / rows);
        for (let c = 0; c < cols; c++) {
          const x = (c + 0.5) * (W / cols);
          const u = x / W;
          const v = 1 - y / H; // 0 bottom … 1 top
          // Region: a broad, lopsided mass of heat whose top edge rises and breaks up.
          const cxu = 0.52 + 0.08 * Math.sin(v * 3 + T * 0.3);
          const spread = 0.42 - 0.18 * v;
          const inside = 1 - Math.abs(u - cxu) / spread;
          if (inside < -0.3) continue;
          const turbLocal = 1 + 1.5 * g.near(x, y, H * 0.25);
          // Rising turbulence: domain-warped fbm advected upward.
          const wx = fbm2(n1, u * 2.2, v * 2.2 - T * 0.5, 2) * 0.35 * turbLocal;
          const s = fbm2(n2, u * 5.2 + wx, v * 2.3 - T * 1.1, 4);
          const top = (0.58 + 0.28 * fbm2(n1, u * 4 + 7, T * 0.35, 2)) * bloom;
          const tv = v / Math.max(0.05, top);
          let temp = inside * 0.6 + s * 0.9 + 0.5 - tv * 0.95;
          temp *= smooth(-0.3, 0.25, inside);
          if (tv > 1.3 || temp <= 0.03) continue;
          // Quantize softly into nested isotherms (the contours give the generative character).
          const t7 = temp * 0.86 * 7;
          const fl = Math.floor(t7);
          temp = (fl + smooth(0.25, 0.75, t7 - fl)) / 7;
          putTemp(img.data, heat, r * cols + c, clamp(temp));
        }
      }
      buf.draw(ctx, 0, 0, W, H);
    },
  };
};

export const FIRE_PROTOS: { key: string; title: string; note: string; make: ProtoFactory; proto?: Proto }[] = [
  { key: 'A', title: 'Sweeping flame current', note: 'A broad current of fire sweeps diagonally up through space; tongues peel off its upper side and shear along the flow; heat varies along it and it splits and rejoins. No ground, no baseline. Pointer: a gust bends the current locally.', make: fireA },
  { key: 'B', title: 'Drifting ignition field', note: 'Separate flame bodies at different depths (size, softness, brightness) rise out of darkness from rounded hot cores; they ignite one after another and flare or settle. Distant ones are smaller and cooler. Pointer: a gust bends nearby flames.', make: fireB },
  { key: 'C', title: 'Turbulent thermal field', note: 'A broad mass of hot, turbulent gas rises through the field, drawn as nested temperature contours; tongues form where plumes push upward and dissolve at the top. The most abstract. Pointer: stirs local turbulence.', make: fireC },
];
