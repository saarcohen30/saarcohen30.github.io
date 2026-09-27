// Earth art-direction prototypes (design review only). Each is a terrain with real relief, depth
// and occlusion, rendered with the voxel-space renderer in ./terrain. Motion is heavy and slow.
import { mulberry32 } from '../core';
import { makeNoise2, fbm2, smooth, clamp, mix } from '../elements/kit';
import { renderTerrain, terrainBuffer, hash2, type Camera, type RGBA } from './terrain';
import type { ProtoFactory } from './common';

const FOG: [number, number, number] = [26, 28, 34];
const fogged = (r: number, g: number, b: number, k: number, amt = 0.9): RGBA => {
  const f = Math.pow(k, 1.35) * amt;
  return [mix(r, FOG[0], f), mix(g, FOG[1], f), mix(b, FOG[2], f), 255];
};
/** Lambert term from a height function (light from the upper left, a little behind). */
function lightAt(h: (x: number, z: number) => number, x: number, z: number, h0: number, e: number, exag: number) {
  const dx = ((h(x + e, z) - h0) / e) * exag;
  const dz = ((h(x, z + e) - h0) / e) * exag;
  const len = Math.hypot(dx, 1, dz);
  // L = normalize(-0.62, 0.62, 0.48)
  return clamp((-dx * -0.62 + 0.62 - dz * 0.48) / len, 0, 1);
}

// ---------------------------------------------------------------------------------------------
// A · Granular terrain: loose sand and gravel below a cohesive bank, seen from above at a slant.
// Now and then part of the bank gives way: material slumps down to the angle of repose and spreads
// into a fan, grains roll ahead of it, and freshly moved material stays darker until it dries.
// Pointer: a small, slow slump where it rests on the bank.
export const earthA: ProtoFactory = (W, H, seed = 4) => {
  const rand = mulberry32(seed);
  const n = makeNoise2(seed + 1);
  const buf = terrainBuffer(W, H, 2.2);
  const { cols, rows } = buf;
  // A high camera looking down across the slope, so the bank shows as a face with real parallax.
  const cam: Camera = { horizon: -rows * 0.2, height: 1.0, scale: rows * 0.9, zNear: 0.7, zFar: 3.0, width: 0.62, steps: 180, faceMin: 0.008 };
  const ZN = cam.zNear;
  const ZF = cam.zFar;
  const SPAN = cam.width;
  const GX = 150;
  const GZ = 110;
  const XR = SPAN * ZF;
  const dxc = (2 * XR) / (GX - 1);
  const dzc = (ZF - ZN) / (GZ - 1);
  const h = new Float32Array(GX * GZ);
  const coh = new Float32Array(GX * GZ); // extra slope the material can hold (cohesion)
  const fresh = new Float32Array(GX * GZ);
  for (let j = 0; j < GZ; j++)
    for (let i = 0; i < GX; i++) {
      const x = -XR + i * dxc;
      const z = ZN + j * dzc;
      const edge = 1.55 + 0.22 * fbm2(n, x * 1.1, 4.1, 3) + 0.05 * fbm2(n, x * 4, 8.3, 2); // where the bank rises
      const bank = smooth(edge - 0.05, edge + 0.03, z);
      h[j * GX + i] = 0.03 * fbm2(n, x * 2.2, z * 2.6, 3) + 0.05 * smooth(0.9, 1.6, z) + 0.3 * bank + 0.03 * bank * fbm2(n, x * 5, z * 5 + 9, 2);
      coh[j * GX + i] = 0.1 + 3 * smooth(edge - 0.1, edge, z);
    }
  const REPOSE = 0.65; // tan of the angle of repose
  const at = (x: number, z: number) => {
    const fx = clamp((x + XR) / dxc, 0, GX - 1.001);
    const fz = clamp((z - ZN) / dzc, 0, GZ - 1.001);
    const i = fx | 0;
    const j = fz | 0;
    const a = fx - i;
    const b = fz - j;
    const p = j * GX + i;
    return mix(mix(h[p], h[p + 1], a), mix(h[p + GX], h[p + GX + 1], a), b);
  };
  const freshAt = (x: number, z: number) => fresh[clamp(Math.round((z - ZN) / dzc), 0, GZ - 1) * GX + clamp(Math.round((x + XR) / dxc), 0, GX - 1)];
  interface Grain { x: number; z: number; vx: number; vz: number; life: number; tone: number }
  const grains: Grain[] = [];
  const weaken = (x: number, z: number, r: number, amt: number) => {
    for (let j = 0; j < GZ; j++)
      for (let i = 0; i < GX; i++) {
        const d2 = ((-XR + i * dxc - x) / r) ** 2 + ((ZN + j * dzc - z) / (r * 0.8)) ** 2;
        if (d2 < 1) coh[j * GX + i] *= 1 - amt * (1 - d2);
      }
  };
  const collapse = () => {
    // A point on the bank edge, in the middle of the view.
    const x = (rand() * 2 - 1) * SPAN * 1.5 * 0.6;
    const i = Math.round((x + XR) / dxc);
    for (let j = 0; j < GZ; j++)
      if (coh[j * GX + i] > 1.5) {
        weaken(x, ZN + j * dzc + 0.03, 0.12 + rand() * 0.1, 0.95);
        return;
      }
  };
  const tick = () => {
    // Relax slopes steeper than repose (+ cohesion), moving a fraction of the excess downhill.
    for (let j = 1; j < GZ - 1; j++)
      for (let i = 1; i < GX - 1; i++) {
        const p = j * GX + i;
        const lim = REPOSE + coh[p];
        let moved = 0;
        for (let q = 0; q < 4; q++) {
          const o = q === 0 ? p - 1 : q === 1 ? p + 1 : q === 2 ? p - GX : p + GX;
          const ex = h[p] - h[o] - lim * (q < 2 ? dxc : dzc);
          if (ex > 0) {
            const m = ex * 0.2;
            h[p] -= m;
            h[o] += m;
            fresh[o] = Math.min(1, fresh[o] + m * 50);
            moved += m;
          }
        }
        if (moved > 0.0012 && grains.length < 320 && rand() < 0.4)
          grains.push({ x: -XR + i * dxc, z: ZN + j * dzc, vx: (rand() - 0.5) * 0.02, vz: 0, life: 1400 + rand() * 1600, tone: rand() });
      }
    for (let p = 0; p < GX * GZ; p++) fresh[p] *= 0.995;
  };
  let acc = 0;
  let nextCollapse = 700;
  let lastPoke = -1e9;
  const hit = new Float32Array(cols * rows * 2);
  // Light from the camera side and the left: the bank's face is sunlit.
  const light = (x: number, z: number, h0: number) => {
    const e = 0.012;
    const dx = ((at(x + e, z) - h0) / e) * 1.3;
    const dz = ((at(x, z + e) - h0) / e) * 1.3;
    return clamp((dx * 0.55 + 0.62 + dz * 0.56) / Math.hypot(dx, 1, dz), 0, 1);
  };
  return {
    step(dt, t) {
      acc += dt;
      while (acc > 50) {
        acc -= 50;
        tick();
      }
      if (t > nextCollapse) {
        collapse();
        nextCollapse = t + 3200 + rand() * 2400;
      }
      for (let k = grains.length - 1; k >= 0; k--) {
        const g = grains[k];
        const e = 0.012;
        const h0 = at(g.x, g.z);
        const gx = (at(g.x + e, g.z) - h0) / e;
        const gz = (at(g.x, g.z + e) - h0) / e;
        g.vx = (g.vx - gx * 0.0009 * dt) * Math.pow(0.9, dt / 16);
        g.vz = (g.vz - gz * 0.0009 * dt) * Math.pow(0.9, dt / 16);
        g.x += g.vx * dt * 0.02;
        g.z += g.vz * dt * 0.02;
        g.life -= dt;
        if (g.life < 0 || g.z < ZN) grains.splice(k, 1);
      }
    },
    settle() {
      for (let k = 0; k < 3; k++) collapse();
      for (let k = 0; k < 80; k++) tick();
      grains.length = 0;
    },
    pointer(px, py, t) {
      if (t - lastPoke < 900) return;
      const q = (Math.round((py / H) * (rows - 1)) * cols + Math.round((px / W) * (cols - 1))) * 2;
      const x = hit[q];
      const z = hit[q + 1];
      if (!z) return;
      const i = clamp(Math.round((x + XR) / dxc), 0, GX - 1);
      const j = clamp(Math.round((z - ZN) / dzc), 0, GZ - 1);
      if (coh[j * GX + i] < 0.8) return; // only the bank can give way
      lastPoke = t;
      weaken(x, z, 0.07, 0.8);
    },
    render(ctx) {
      const colour = (x: number, z: number, L: number, k: number, v: number): RGBA => {
        const tone = 0.5 + 0.5 * fbm2(n, x * 3, z * 3 + 20, 3);
        const grain = hash2(Math.floor(x * 520), Math.floor(v * 520)) - 0.5;
        const pebble = hash2(Math.floor(x * 90) + 7, Math.floor(v * 90)) > 0.97 ? -0.25 : 0;
        const f = freshAt(x, z);
        const lum = (0.25 + 0.8 * L) * (1 + grain * 0.3 * (1 - k) + pebble * (1 - k)) * (1 - 0.3 * f);
        return fogged(mix(150, 190, tone) * lum, mix(108, 146, tone) * lum * (1 - 0.05 * f), mix(72, 102, tone) * lum * (1 - 0.1 * f), k, 0.6);
      };
      hit.fill(0);
      renderTerrain(
        buf.img,
        cam,
        at,
        (x, z, h0, k) => colour(x, z, light(x, z, h0), k, z),
        (x, z, hr, k) => colour(x, z, 0.85 + 0.1 * Math.sin(hr * 60 + fbm2(n, x * 3, 1.7) * 2), k, hr * 3),
        hit,
      );
      buf.draw(ctx, W, H);
      // Rolling grains.
      for (const g of grains) {
        const row = cam.horizon + ((cam.height - at(g.x, g.z) - 0.004) / g.z) * cam.scale;
        const col = ((g.x / (SPAN * g.z) + 1) / 2) * (cols - 1);
        const a = Math.min(1, g.life / 500) * 0.9;
        const sz = 2.4 / g.z;
        ctx.fillStyle = g.tone < 0.5 ? `rgba(214,178,128,${a})` : `rgba(96,68,48,${a})`;
        ctx.fillRect((col / cols) * W - sz / 2, (row / rows) * H - sz / 2, sz, sz);
      }
    },
  };
};

// ---------------------------------------------------------------------------------------------
const STRATA: [number, number, number][] = [
  [176, 118, 70],
  [132, 72, 46],
  [198, 170, 128],
  [110, 98, 90],
  [160, 104, 62],
];

// B · Tectonic terrain: a few large blocks of rock separated by faults. One block slowly rises,
// another settles; the fault scarps between them show layered strata that move with their block,
// and the far blocks recede into haze.
export const earthB: ProtoFactory = (W, H, seed = 8) => {
  const n = makeNoise2(seed + 1);
  const n2 = makeNoise2(seed + 2);
  const buf = terrainBuffer(W, H, 2.5);
  const cam: Camera = { horizon: buf.rows * 0.2, height: 0.72, scale: buf.rows * 0.72, zNear: 0.42, zFar: 4.2, width: 0.62, steps: 150 };
  // Plates: seed (x, z), base elevation, tilt (dh/dx, dh/dz), motion amplitude and phase.
  const plates = [
    { x: -0.3, z: 0.7, e: 0.02, tx: 0.03, tz: 0.06, amp: 0.0, per: 1, ph: 0 },
    { x: 0.5, z: 1.25, e: 0.2, tx: -0.12, tz: -0.1, amp: 0.08, per: 16000, ph: -1.2 },
    { x: -0.85, z: 1.9, e: 0.14, tx: 0.14, tz: 0.04, amp: -0.05, per: 21000, ph: 0.4 },
    { x: 0.35, z: 2.7, e: 0.42, tx: -0.08, tz: 0.06, amp: 0.05, per: 26000, ph: 2.1 },
  ];
  let T = 0;
  let settled = false;
  const lift = (p: (typeof plates)[number]) => {
    if (!p.amp) return 0;
    const u = settled ? 1 : smooth(300, 4200, T); // blocks move into place during the entrance
    return p.amp * (0.5 + 0.5 * Math.sin((T / p.per) * Math.PI * 2 + p.ph)) * u - p.amp * (1 - u) * 0.8;
  };
  const plateAt = (x: number, z: number) => {
    // Warped Voronoi: irregular fault lines.
    const wx = x + 0.22 * fbm2(n, x * 1.4, z * 1.4, 2);
    const wz = z + 0.22 * fbm2(n, x * 1.4 + 7, z * 1.4 + 3, 2);
    let best = 0;
    let bd = 1e9;
    for (let i = 0; i < plates.length; i++) {
      const p = plates[i];
      const d = (wx - p.x) ** 2 + ((wz - p.z) * 0.9) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  };
  const lifts = plates.map(() => 0);
  const hAt = (x: number, z: number) => {
    const i = plateAt(x, z);
    const p = plates[i];
    const ridge = 1 - Math.abs(fbm2(n2, x * 2.4 + i * 5, z * 2.4, 4));
    return p.e + lifts[i] + p.tx * (x - p.x) + p.tz * (z - p.z) + 0.07 * ridge * ridge + 0.02 * fbm2(n2, x * 9, z * 9, 2);
  };
  return {
    step(dt, t) {
      T = t;
      plates.forEach((p, i) => (lifts[i] = lift(p)));
    },
    settle() {
      settled = true;
    },
    render(ctx) {
      renderTerrain(
        buf.img,
        cam,
        hAt,
        (x, z, h0, k) => {
          const L = lightAt(hAt, x, z, h0, 0.015, 1.3);
          const tone = 0.5 + 0.5 * fbm2(n, x * 2 + 30, z * 2, 2);
          const speck = hash2(x * 700, z * 700) - 0.5;
          const lum = (0.36 + 0.7 * L) * (1 + speck * 0.12 * (1 - k));
          return fogged(mix(92, 128, tone) * lum, mix(80, 104, tone) * lum, mix(66, 80, tone) * lum, k);
        },
        (x, z, hr, k) => {
          const i = plateAt(x, z);
          const local = hr - lifts[i] - plates[i].tx * x - plates[i].tz * z; // strata ride with their block
          const b = local * 11 + 0.3 * fbm2(n2, x * 3, z * 3 + 11, 2) + i * 0.37;
          const k0 = Math.floor(b);
          const f = smooth(0.35, 0.65, b - k0); // bands blend over a short distance
          const c0 = STRATA[((k0 % 5) + 5) % 5];
          const c1 = STRATA[(((k0 + 1) % 5) + 5) % 5];
          // Faces catch less light than tops; slightly darker lower down.
          const lum = 0.58 + 0.12 * fbm2(n, x * 12, hr * 30, 2);
          return fogged(mix(c0[0], c1[0], f) * lum, mix(c0[1], c1[1], f) * lum, mix(c0[2], c1[2], f) * lum, k);
        },
      );
      buf.draw(ctx, W, H);
    },
  };
};

// ---------------------------------------------------------------------------------------------
// C · Topographic / mineral surface: terrain seen from high above at an angle, in dark mineral
// tones, hill-shaded, with nested elevation contours (every fifth an index contour). The ground
// folds very slowly; the contours tighten and loosen with it.
export const earthC: ProtoFactory = (W, H, seed = 12) => {
  const n = makeNoise2(seed + 1);
  const n2 = makeNoise2(seed + 2);
  const buf = terrainBuffer(W, H, 2);
  const { cols, rows } = buf;
  const hb = new Float32Array(cols * rows);
  const kb = new Float32Array(cols * rows);
  // Ground plane seen from above at a slant: row r looks at depth z(r); x spreads with depth.
  const zAt = (r: number) => 1 / mix(1 / 1.0, 1 / 2.6, 1 - r / (rows - 1));
  let T = 0;
  let settled = false;
  let amp = 0;
  const hAt = (x: number, z: number) => {
    const ridge = 1 - Math.abs(fbm2(n, x * 1.5, z * 1.5, 4));
    const fold = Math.sin((x * 1.1 + z * 0.7) * 3.2 - T * 0.00011) * (0.5 + 0.5 * fbm2(n2, x * 0.8, z * 0.8, 2));
    return 0.3 * ridge * ridge + 0.12 * fbm2(n2, x * 0.9 + 4, z * 0.9, 3) + 0.06 * fold * amp;
  };
  const STEP = 0.02;
  return {
    step(_dt, t) {
      T = t;
      amp = settled ? 1 : smooth(0, 3500, t);
    },
    settle() {
      settled = true;
    },
    render(ctx) {
      for (let r = 0; r < rows; r++) {
        const z = zAt(r);
        const k = (z - 1) / 1.6;
        for (let c = 0; c < cols; c++) {
          const x = ((c / (cols - 1)) * 2 - 1) * 0.75 * z;
          hb[r * cols + c] = hAt(x, z);
          kb[r * cols + c] = k;
        }
      }
      const d = buf.img.data;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const p = r * cols + c;
          const h0 = hb[p];
          const hx = (hb[p + (c < cols - 1 ? 1 : 0)] - hb[p - (c > 0 ? 1 : 0)]) * 0.5;
          const hy = (hb[p + (r < rows - 1 ? cols : 0)] - hb[p - (r > 0 ? cols : 0)]) * 0.5;
          const k = kb[p];
          const s = 60 * (1 - 0.5 * k); // screen-space slope scale (pixels shrink with depth)
          const L = clamp(0.62 + (-hx * 0.8 + hy * 0.6) * s, 0, 1.3);
          const e = clamp(h0 / 0.42);
          // Hypsometric mineral tint: basalt → iron oxide → ochre → pale stone.
          const r0 = e < 0.4 ? mix(46, 112, e / 0.4) : e < 0.75 ? mix(112, 170, (e - 0.4) / 0.35) : mix(170, 200, (e - 0.75) / 0.25);
          const g0 = e < 0.4 ? mix(40, 62, e / 0.4) : e < 0.75 ? mix(62, 128, (e - 0.4) / 0.35) : mix(128, 182, (e - 0.75) / 0.25);
          const b0 = e < 0.4 ? mix(42, 44, e / 0.4) : e < 0.75 ? mix(44, 78, (e - 0.4) / 0.35) : mix(78, 150, (e - 0.75) / 0.25);
          const speck = 1 + (hash2(c * 7 + 3, r * 13 + 1) - 0.5) * 0.1;
          const lum = (0.25 + 0.7 * L) * speck;
          let R = r0 * lum;
          let G = g0 * lum;
          let B = b0 * lum;
          // Contours, anti-aliased: distance to the nearest isoline in pixels.
          const q = h0 / STEP;
          const grad = Math.hypot(hx, hy) / STEP + 1e-4;
          const px = Math.min(q - Math.floor(q), Math.ceil(q) - q) / grad;
          const index = Math.round(q) % 5 === 0;
          const a = (1 - smooth(index ? 0.5 : 0.25, index ? 1.3 : 0.95, px)) * (index ? 0.8 : 0.42) * (1 - 0.45 * k);
          R = mix(R, 238, a);
          G = mix(G, 208, a);
          B = mix(B, 152, a);
          const [fr, fg, fb] = fogged(R, G, B, k, 0.55);
          d[p * 4] = fr;
          d[p * 4 + 1] = fg;
          d[p * 4 + 2] = fb;
          d[p * 4 + 3] = 255;
        }
      buf.draw(ctx, W, H);
    },
  };
};

// ---------------------------------------------------------------------------------------------
// D · Dune field: ridges of sand with gentle windward slopes and steep lee faces under a low sun.
// The dunes migrate very slowly and sand streams off the crests.
export const earthD: ProtoFactory = (W, H, seed = 15) => {
  const rand = mulberry32(seed);
  const n = makeNoise2(seed + 1);
  const buf = terrainBuffer(W, H, 2.5);
  const cam: Camera = { horizon: buf.rows * 0.24, height: 0.36, scale: buf.rows * 0.8, zNear: 0.3, zFar: 4.5, width: 0.62, steps: 150 };
  let T = 0;
  const profile = (u: number) => {
    const p = u - Math.floor(u);
    return p < 0.78 ? smooth(0, 0.78, p) : 1 - smooth(0.78, 1, p);
  };
  const hAt = (x: number, z: number) => {
    const u = z * 1.5 + x * 0.25 + 0.3 * fbm2(n, x * 0.7, z * 0.5, 2) + T * 0.000012; // crests run across the view
    const amp = 0.09 + 0.05 * fbm2(n, x * 0.6 + 9, z * 0.6, 2);
    return 0.03 + amp * profile(u) * 1.6 + 0.025 * fbm2(n, x * 0.8, z * 0.8 + 5, 2);
  };
  interface Wisp { x: number; z: number; age: number; life: number }
  const wisps: Wisp[] = [];
  return {
    step(dt, t) {
      T = t;
      // Sand blown off crests: spawn near crest lines (high local height relative to neighbours).
      for (let k = 0; k < 3 && wisps.length < 140; k++) {
        const z = cam.zNear * Math.pow(cam.zFar / cam.zNear, rand() * 0.6);
        const x = (rand() * 2 - 1) * cam.width * z;
        if (hAt(x, z) - hAt(x, z - 0.03) > 0.004 && hAt(x, z + 0.03) < hAt(x, z)) wisps.push({ x, z, age: 0, life: 900 + rand() * 900 });
      }
      for (let k = wisps.length - 1; k >= 0; k--) {
        const w = wisps[k];
        w.age += dt;
        w.x += dt * 0.00009;
        if (w.age > w.life) wisps.splice(k, 1);
      }
    },
    render(ctx) {
      renderTerrain(
        buf.img,
        cam,
        hAt,
        (x, z, h0, k) => {
          const L = lightAt(hAt, x, z, h0, 0.01, 3.4);
          const rip = 0.5 + 0.5 * Math.sin(z * 150 + x * 30 + fbm2(n, x * 4, z * 4) * 6);
          const lum = (0.2 + 0.95 * L) * (1 + (rip - 0.5) * 0.12 * (1 - k));
          return fogged(206 * lum, 150 * lum, 98 * lum, k, 0.8);
        },
        (_x, _z, _hr, k) => fogged(80, 52, 38, k, 0.8),
      );
      buf.draw(ctx, W, H);
      const sx = W / buf.cols;
      const sy = H / buf.rows;
      ctx.lineWidth = 1;
      for (const w of wisps) {
        const hz = hAt(w.x, w.z) + 0.004 + w.age * 0.000006;
        const col = ((w.x / (cam.width * w.z) + 1) / 2) * (buf.cols - 1);
        const row = cam.horizon + ((cam.height - hz) / w.z) * cam.scale;
        const a = Math.sin((w.age / w.life) * Math.PI) * 0.35;
        ctx.strokeStyle = `rgba(232,196,146,${a})`;
        ctx.beginPath();
        ctx.moveTo(col * sx, row * sy);
        ctx.lineTo(col * sx - 10 / w.z, row * sy + 1);
        ctx.stroke();
      }
    },
  };
};

export const EARTH_PROTOS = [
  { key: 'A', title: 'Granular terrain', note: 'Loose sand and gravel below a cohesive bank, seen from above at a slant. Parts of the bank give way now and then; material slumps into a fan, grains roll ahead of it, and fresh material stays darker until it dries. Pointer: a small, slow slump on the bank.', make: earthA },
  { key: 'B', title: 'Tectonic terrain', note: 'A few large blocks of rock separated by faults. One rises slowly, another settles; the scarps between them show layered strata that move with their block. Far blocks recede into haze. Pointer: none.', make: earthB },
  { key: 'C', title: 'Topographic surface', note: 'Terrain seen from high above at a slant, hill-shaded in dark mineral tones, with nested elevation contours (every fifth an index contour). The ground folds very slowly and the contours tighten and loosen with it. Pointer: none.', make: earthC },
  { key: 'D', title: 'Dune field', note: 'Optional. Sand ridges with gentle windward slopes and steep lee faces under a low sun; they migrate very slowly and sand streams off the crests. Pointer: none.', make: earthD },
];
