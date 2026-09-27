// Convergence: a night lake. A low island of sand and stone sits in the middle distance with a
// bonfire at its centre; the fire lights the island and is reflected, broken by the waves, in the
// water; mist drifts low over the lake; smoke and embers rise from the fire. Air is perceived
// through the way all of it moves: one wind field drives the long currents in the sky, the smoke,
// the embers, the mist, the gust patches running across the water and the lean of the flames.
//
// Everything is composed through one camera: horizon at yh; a point (x, h, z) (x across, h up,
// z into the distance; water at h = 0) projects to (W/2 + x / z * f, yh + (CAM - h) / z * f).
import { mulberry32 } from '../core';
import { makeNoise2, fbm2, smooth, clamp, mix } from './kit';
import { FIRE_LUT } from './flame-engine';

export interface Lake {
  step(dt: number, t: number): void;
  render(ctx: CanvasRenderingContext2D, t: number): void;
  pointer(x: number, y: number, t: number): void;
  settle(): void;
}

interface Variant {
  wind: number;
  fire: number; // flame size
  flicker: number;
  embers: number; // per second
  reflect: number;
  mist: number;
  tracers: number;
  gusts: boolean;
}
const DRAMATIC: Variant = { wind: 1.25, fire: 1.18, flicker: 1.6, embers: 18, reflect: 0.62, mist: 1, tracers: 7, gusts: true };

function lake(V: Variant) {
  return (W: number, H: number, seed = 90): Lake => {
    const rand = mulberry32(seed);
    const n = makeNoise2(seed + 1);
    const n2 = makeNoise2(seed + 2);
    const CAM = 1;
    const yh = H * 0.4;
    const f = H * 1.35;
    const X = (x: number, z: number) => W / 2 + (x / z) * f;
    const Y = (h: number, z: number) => yh + ((CAM - h) / z) * f;
    const S = H / 350;

    // ------------------------------------------------------------------ island (static relief)
    const ZI = 4.8; // island centre depth
    const RX = 1.3;
    const RZ = 0.75;
    const GX = 140;
    const GZ = 80;
    const hgt = new Float32Array(GX * GZ);
    const rock = new Float32Array(GX * GZ);
    const shore = (a: number) => 1 + 0.16 * n(Math.cos(a) * 1.3 + 3, Math.sin(a) * 1.3) + 0.08 * n(Math.cos(a) * 3.1, Math.sin(a) * 3.1 + 5);
    const rocks = [
      [-0.95, -0.25, 0.1, 0.07],
      [-0.8, 0.3, 0.08, 0.05],
      [0.9, -0.1, 0.11, 0.08],
      [0.55, -0.45, 0.07, 0.045],
      [-0.3, 0.55, 0.09, 0.05],
    ];
    for (let j = 0; j < GZ; j++)
      for (let i = 0; i < GX; i++) {
        const lx = ((i / (GX - 1)) * 2 - 1) * RX * 1.35;
        const lz = ((j / (GZ - 1)) * 2 - 1) * RZ * 1.35;
        const a = Math.atan2(lz / RZ, lx / RX);
        const s = Math.hypot(lx / RX, lz / RZ) / shore(a);
        // Low mound with soft sandy undulation; a slightly flattened centre for the fire.
        let h = s < 1 ? 0.3 * Math.pow(1 - s * s, 1.1) : -0.02 * (s - 1);
        h += s < 1 ? 0.012 * fbm2(n2, lx * 5, lz * 5, 2) * (1 - s) : 0;
        h = mix(h, Math.min(h, 0.26), smooth(0.3, 0.1, Math.hypot(lx, lz * 1.6)));
        let rk = 0;
        for (const [rx, rz, rr, rh] of rocks) {
          const d2 = ((lx - rx * RX) ** 2 + ((lz - rz * RZ) * 1.4) ** 2) / (rr * rr);
          if (d2 < 1) {
            const bump = rh * Math.sqrt(1 - d2) * (0.85 + 0.3 * n(lx * 20, lz * 20));
            if (bump > rk) rk = bump;
          }
        }
        hgt[j * GX + i] = h + rk;
        rock[j * GX + i] = rk > 0.005 ? 1 : 0;
      }
    const hAt = (x: number, z: number) => {
      const fx = clamp(((x / (RX * 1.35) + 1) / 2) * (GX - 1), 0, GX - 1.001);
      const fz = clamp((((z - ZI) / (RZ * 1.35) + 1) / 2) * (GZ - 1), 0, GZ - 1.001);
      const i = fx | 0;
      const j = fz | 0;
      const a = fx - i;
      const b = fz - j;
      const p = j * GX + i;
      return mix(mix(hgt[p], hgt[p + 1], a), mix(hgt[p + GX], hgt[p + GX + 1], a), b);
    };
    const rockAt = (x: number, z: number) => {
      const i = clamp(Math.round(((x / (RX * 1.35) + 1) / 2) * (GX - 1)), 0, GX - 1);
      const j = clamp(Math.round((((z - ZI) / (RZ * 1.35) + 1) / 2) * (GZ - 1)), 0, GZ - 1);
      return rock[j * GX + i];
    };
    const HF = hAt(0, ZI); // fire base height
    const fx = X(0, ZI);
    const fy = Y(HF, ZI);
    const mirrorY = Y(0, ZI);

    // island buffer (screen bbox)
    const ix0 = Math.floor(X(-RX * 1.4, ZI - RZ));
    const ix1 = Math.ceil(X(RX * 1.4, ZI - RZ));
    const iy0 = Math.floor(Y(0.3, ZI + RZ * 1.4));
    const iy1 = Math.ceil(Y(-0.05, ZI - RZ * 1.4));
    const icell = 1.25;
    const icols = Math.max(8, Math.round((ix1 - ix0) / icell));
    const irows = Math.max(8, Math.round((iy1 - iy0) / icell));
    const ican = document.createElement('canvas');
    ican.width = icols;
    ican.height = irows;
    const ictx = ican.getContext('2d')!;
    const iimg = ictx.createImageData(icols, irows);

    // ------------------------------------------------------------------ bonfire buffer
    const FH = 0.62 * V.fire; // flame height (world)
    const flamePx = (FH / ZI) * f;
    const bw = flamePx * 2.3;
    const bh = flamePx * 1.35;
    const fcell = 1.5;
    const fcols = Math.round(bw / fcell);
    const frows = Math.round(bh / fcell);
    const fcan = document.createElement('canvas');
    fcan.width = fcols;
    fcan.height = frows;
    const fctx = fcan.getContext('2d')!;
    const fimg = fctx.createImageData(fcols, frows);
    const tongues = Array.from({ length: 7 }, (_, k) => ({ p: (k / 6) * 1.1 - 0.55 + (rand() - 0.5) * 0.14, h: (k === 3 ? 1 : 0.35 + rand() * 0.55), ph: rand() * 50 }));

    // ------------------------------------------------------------------ living things
    interface Smoke { x: number; y: number; vx: number; vy: number; r: number; age: number; life: number }
    interface Ember { x: number; y: number; vx: number; vy: number; age: number; life: number; b: number }
    interface Tracer { x: number; y: number; d: number; trail: number[]; age: number; life: number }
    interface Ring { x: number; z: number; born: number; amp: number }
    const smoke: Smoke[] = [];
    const embers: Ember[] = [];
    const tracers: Tracer[] = [];
    const rings: Ring[] = [];
    const stars = Array.from({ length: 34 }, () => ({ x: rand() * W, y: rand() * yh * 0.92, a: 0.1 + rand() * 0.3, tw: rand() * 10 }));
    let gustX = -1e4;
    let gustY = -1e4;
    let gustA = 0;
    let settled = false;
    let T = 0; // scene time (ms)
    let fi = 0; // fire intensity 0..1
    let lean = 0;
    let spark: { x: number; y: number } | null = null;
    let windPhase = 0; // how far the air has travelled (px): gusts and waves drift with it
    const mistX = Array.from({ length: 6 }, (_, k) => k * W * 0.31);

    // ONE wind field. A steady breeze from the left; gust fronts that travel across the scene at
    // the wind's own speed; a slow meander carried with the air; a thermal that lifts and curls the
    // flow above the fire. Over the water, apparent speed falls with distance (perspective).
    const U0 = 0.05 * S * V.wind;
    const gustAt = (x: number) => (V.gusts ? Math.pow(Math.max(0, Math.sin(((x - windPhase) / W) * Math.PI * 1.25 + 0.6)), 4) : 0);
    const windAt = (x: number, y: number, t: number): [number, number] => {
      const depth = y > yh ? clamp(((y - yh) / (H - yh)) * 1.3 + 0.3) : 1;
      let u = U0 * (1 + 0.9 * gustAt(x)) * (1 + 0.25 * n(y * 0.008, t * 0.00015));
      let v = U0 * 0.22 * n((x - windPhase) * 0.006, y * 0.006 + 3);
      if (y < fy) {
        const th = Math.exp(-(((x - fx - (fy - y) * 0.35) / (W * 0.1)) ** 2)) * Math.exp(-(fy - y) / (H * 0.45)) * fi;
        v -= U0 * 1.5 * th;
        u += U0 * 0.3 * th;
      }
      if (gustA > 0.01) {
        const d2 = ((x - gustX) ** 2 + (y - gustY) ** 2) / (70 * S) ** 2;
        const k = gustA * Math.exp(-d2);
        u += k * 0.06 * S;
        v += k * 0.02 * S * n(x * 0.05, t * 0.002);
      }
      return [u * depth, v * depth];
    };
    const onWater = (x: number, y: number) => {
      if (y <= yh + 2) return null;
      const z = ((CAM - 0) * f) / (y - yh);
      const wx = ((x - W / 2) * z) / f;
      if (hAt(wx, z) > 0 && Math.abs(z - ZI) < RZ * 1.4 && Math.abs(wx) < RX * 1.4) return null;
      return { x: wx, z };
    };

    // Timeline (entrance): darkness → water → island → wind → a spark lands → ignition → settle.
    const t_water = 400;
    const t_island = 1200;
    const t_wind = 1900;
    const t_spark = 2600;
    const t_land = 3300;
    const t_full = 4800;

    function stepAll(dt: number, t: number) {
      windPhase += U0 * dt;
      T = t;
      const ign = settled ? 1 : smooth(t_land, t_full, t);
      fi = ign * (0.92 + 0.08 * n(t * 0.002, 1.7) * V.flicker);
      const [wu] = windAt(fx, fy - flamePx, t);
      lean = mix(lean, (wu / U0) * 0.3, Math.min(1, dt / 300));
      gustA *= Math.pow(0.95, dt / 16);
      // The spark: carried in on the wind from the left, landing where the fire will be.
      if (!settled && t > t_spark && t < t_land) {
        const u = (t - t_spark) / (t_land - t_spark);
        const e = u * u * (3 - 2 * u);
        spark = { x: mix(W * 0.08, fx, e), y: mix(yh * 0.6, fy, e) + Math.sin(u * Math.PI) * -30 * S };
      } else spark = null;
      // Air: a few long currents at different depths (near ones faster, brighter, wider). They
      // follow the same field, so they rise and curl over the fire's thermal.
      if (settled || t > t_wind) {
        while (tracers.length < V.tracers) {
          const low = rand() < 0.35;
          const d = low ? 0.35 + rand() * 0.25 : 0.5 + rand() * 0.5;
          const y = low ? yh - rand() * H * 0.06 : H * 0.06 + rand() * (yh - H * 0.14);
          tracers.push({ x: settled ? rand() * W * 0.6 : -rand() * W * 0.25, y, d, trail: [], age: 0, life: 9000 + rand() * 6000 });
        }
      }
      for (let i = tracers.length - 1; i >= 0; i--) {
        const p = tracers[i];
        const [u, v] = windAt(p.x, p.y, t);
        p.x += u * dt * p.d * 2.6;
        p.y += v * dt * p.d * 2.6;
        p.age += dt;
        p.trail.push(p.x, p.y);
        if (p.trail.length > 1040) p.trail.splice(0, 2);
        if (p.age > p.life || (p.x > W + 60 && p.trail[0] > W)) tracers.splice(i, 1);
      }
      // Smoke from the flame tips.
      if (fi > 0.3 && rand() < (dt / 16) * 0.55 * fi) smoke.push({ x: fx + (rand() - 0.5) * flamePx * 0.3 + lean * flamePx * 0.5, y: fy - flamePx * 0.95, vx: 0, vy: -0.03 * S, r: 6 * S, age: 0, life: 5200 + rand() * 2800 });
      for (let i = smoke.length - 1; i >= 0; i--) {
        const s = smoke[i];
        const [u, v] = windAt(s.x, s.y, t);
        // Rises on its own heat at first, then is taken by the current and stretched along it.
        const buoy = Math.exp(-s.age / 1400);
        s.vx = mix(s.vx, u * 1.15, 0.035);
        s.vy = mix(s.vy, v - 0.03 * S * buoy, 0.035);
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.r += dt * 0.008 * S;
        s.age += dt;
        if (s.age > s.life) smoke.splice(i, 1);
      }
      // Embers: lifted by the fire, carried by the wind; a few come down on the water.
      if (fi > 0.4 && rand() < (dt / 1000) * V.embers * fi) embers.push({ x: fx + (rand() - 0.5) * flamePx * 0.4, y: fy - flamePx * (0.3 + rand() * 0.5), vx: (rand() - 0.5) * 0.02 * S, vy: -(0.04 + rand() * 0.05) * S, age: 0, life: 1500 + rand() * 2500, b: 0.6 + rand() * 0.4 });
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        const [u, v] = windAt(e.x, e.y, t);
        e.vx = mix(e.vx, u * 1.3, 0.03);
        e.vy = e.vy + (e.age > e.life * 0.55 ? 0.00005 : -0.00001) * S * dt + v * 0.01;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.age += dt;
        const w = onWater(e.x, e.y);
        const reachedWater = w && e.age > 300 && e.y > Y(0, w.z) - 1 && e.vy > 0;
        if (reachedWater) {
          rings.push({ x: w!.x, z: w!.z, born: t, amp: 0.4 });
          embers.splice(i, 1);
        } else if (e.age > e.life) embers.splice(i, 1);
      }
      for (let i = rings.length - 1; i >= 0; i--) if (t - rings[i].born > 3200) rings.splice(i, 1);
      // Mist drifts with the wind at its own height.
      for (let k = 0; k < mistX.length; k++) mistX[k] += windAt(mistX[k] % W, yh + (H - yh) * (0.05 + k * 0.085), t)[0] * dt;
    }

    function renderIsland(amb: number) {
      const d = iimg.data;
      d.fill(0);
      const flick = fi * (0.85 + 0.15 * n(T * 0.004 * V.flicker, 3.3));
      for (let c = 0; c < icols; c++) {
        const sx = ix0 + (c + 0.5) * icell;
        let yb = irows; // occlusion (buffer rows)
        let prevY = irows;
        let pR = -1;
        let pG = 0;
        let pB = 0;
        for (let s = 0; s < 280; s++) {
          const z = ZI - RZ * 1.4 + (s / 279) * RZ * 2.8;
          const x = ((sx - W / 2) * z) / f;
          const h = hAt(x, z);
          const yw = (Y(0, z) - iy0) / icell;
          if (h <= 0.0015) {
            // Water in front of/behind the island occludes nothing, but nothing below the waterline
            // of a nearer sample can be island.
            yb = Math.min(yb, Math.floor(yw));
            prevY = yw;
            pR = -1;
            continue;
          }
          const y = (Y(h, z) - iy0) / icell;
          if (y < yb) {
            // Surface normal and lighting: faint cool ambient plus warm firelight.
            const e = 0.02;
            const hx = (hAt(x + e, z) - h) / e;
            const hz = (hAt(x, z + e) - h) / e;
            const nl = Math.hypot(hx, 1, hz);
            const lx = -x;
            const ly = HF + FH * 0.35 - h;
            const lz = ZI - z;
            const ld = Math.hypot(lx, ly, lz) + 1e-3;
            const lam = clamp((-hx * lx + ly - hz * lz) / (nl * ld));
            const fall = 1 / (1 + (ld * ld) / 0.9);
            const fire = flick * lam * fall * 1.25;
            const moon = amb * (0.1 + 0.12 * clamp((-hx * 0.5 + 0.8 + hz * 0.3) / nl));
            const isRock = rockAt(x, z);
            const wet = smooth(0.03, 0.0, h);
            const br = isRock ? [70, 66, 64] : [120, 98, 78];
            // Material: patches of darker and paler sand and gravel.
            const k = (1 - wet * 0.45) * (0.72 + 0.5 * (0.5 + fbm2(n2, x * 7 + 3, z * 9, 3)));
            const R = (br[0] * moon * 0.9 + 255 * fire * (br[0] / 140)) * k;
            const G = (br[1] * moon + 150 * fire * (br[1] / 120)) * k;
            const B = (br[2] * moon * 1.15 + 70 * fire * (br[2] / 100)) * k;
            const top = Math.max(0, Math.floor(y));
            const edge = clamp(top + 1 - y);
            const span = Math.max(1e-3, prevY - y);
            for (let r = top; r < yb && r < irows; r++) {
              const i = (r * icols + c) * 4;
              // Blend towards the previous (nearer) sample across the rows between them, and add
              // per-pixel grain: no banding between depth samples.
              const tt = pR < 0 ? 0 : clamp((r + 0.5 - y) / span);
              const grain = 1 + ((((c * 73856093) ^ (r * 19349663)) >>> 0) / 4294967296 - 0.5) * 0.24;
              d[i] = mix(R, pR < 0 ? R : pR, tt) * grain;
              d[i + 1] = mix(G, pR < 0 ? G : pG, tt) * grain;
              d[i + 2] = mix(B, pR < 0 ? B : pB, tt) * grain;
              d[i + 3] = (r === top ? edge : 1) * 255 * Math.min(1, amb * 1.4 + fi);
            }
            // A partly covered top row stays open, so the ground behind fills it (no see-through
            // lines); only the true silhouette keeps a soft edge.
            // A partly covered top row stays open, so the ground behind fills it (no see-through
            // lines); only the true silhouette keeps a soft edge.
            yb = edge < 0.999 ? top + 1 : top;
            pR = R;
            pG = G;
            pB = B;
          }
          prevY = y;
        }
      }
      ictx.putImageData(iimg, 0, 0);
    }

    function renderFlame(t: number) {
      const d = fimg.data;
      const time = t * 0.001;
      const grow = fi;
      for (let j = 0; j < frows; j++) {
        const v = (frows - 1 - j) / (frows - 1) / 0.74 - 0.08; // 0 at base
        for (let i = 0; i < fcols; i++) {
          const q = (j * fcols + i) * 4;
          const u0 = ((i + 0.5) / fcols) * 2 - 1;
          const up = Math.max(0, v);
          const u = u0 * 2.2 - lean * up * up * 1.3;
          const warp = fbm2(n2, u * 1.8, up * 2.3 - time * 2.1 * V.flicker, 3) * (0.16 + 0.6 * up);
          const uw = u + warp;
          let e = -1;
          for (const tg of tongues) {
            const hk = tg.h * grow * (0.72 + 0.4 * n(tg.ph, time * 1.9 * V.flicker));
            if (up > hk || hk <= 0) continue;
            const w = (0.26 + 0.12 * tg.h) * Math.pow(1 - up / hk, 0.8);
            e = Math.max(e, 1 - Math.pow(Math.abs(uw - tg.p) / (w + 1e-3), 1.7)); // rounded, not wedge-sided
          }
          // Hot core low in the middle, rounded; the flame is broader than tall at the base.
          e = Math.max(e, (1 - uw * uw / 0.55 - ((v - 0.08) / 0.22) ** 2) * grow);
          e = Math.min(e, 1 - (uw / (1.05 * (1 - 0.5 * up))) ** 2);
          let T2 = e + fbm2(n, uw * 2.6, up * 3 - time * 2.4 * V.flicker, 3) * (0.25 + 0.3 * up) - up * 0.25;
          // Erosion by rising, vertically stretched noise: tongues fray and lick instead of ending in
          // clean points.
          const nz = 0.5 + fbm2(n2, uw * 3.2 + 9, up * 1.4 - time * 2.6 * V.flicker, 2);
          T2 = T2 * (0.62 + 0.62 * nz) * 0.94 - 0.1 * up * (1 - nz);
          const vb = 0.12 * (uw / 1.05) ** 2; // a rounded base, lifting towards the sides
          T2 *= smooth(vb - 0.03, vb + 0.06, v) * (1 - smooth(0.7, 0.98, Math.abs(u0))); // nothing below the base or at the box edges
          const li = (clamp(T2 * 1.02) * 255) | 0;
          d[q] = FIRE_LUT[li * 4];
          d[q + 1] = FIRE_LUT[li * 4 + 1];
          d[q + 2] = FIRE_LUT[li * 4 + 2];
          d[q + 3] = FIRE_LUT[li * 4 + 3] * clamp(grow * 3);
        }
      }
      fctx.putImageData(fimg, 0, 0);
    }

    function drawWater(ctx: CanvasRenderingContext2D, t: number, amb: number) {
      // Perspective rows of glints (the same language as the Water scene, drawn for this camera).
      const time = t * 0.001;
      const rows = 52;
      ctx.save();
      ctx.lineCap = 'round';
      for (let k = 0; k < rows; k++) {
        const u = (k + 1) / rows;
        const y = yh + 2 + Math.pow(u, 1.7) * (H - yh);
        const z = f / (y - yh);
        const appear = settled ? 1 : smooth(t_water + (1 - u) * 900, t_water + (1 - u) * 900 + 900, t);
        if (appear <= 0) continue;
        const step = mix(3, 8, u);
        const lw = mix(0.5, 1.5, u);
        const spread = mix(0.2, 1, u) * flamePx * (0.9 + V.reflect);
        for (let x = 0; x < W; x += step) {
          const wx = ((x - W / 2) * z) / f;
          if (z > ZI - RZ * 1.3 && z < ZI + RZ * 1.3 && hAt(wx, z) > 0) continue; // under the island
          const xw = x - windPhase * (0.25 + 0.75 * u); // the wave pattern drifts downwind
          const paw = gustAt(x) * (0.4 + 0.6 * u); // a gust roughening the surface as it passes
          let slope = n(xw * 0.02 / mix(0.4, 1, u), k * 0.37 + time * 0.25) + 0.5 * n(xw * 0.055, k * 0.9 - time * 0.6) + paw * 0.35 * n(xw * 0.12, k * 1.7 + time);
          for (const r of rings) {
            const age = t - r.born;
            const R = age * 0.00028 * f / 6;
            const dd = Math.hypot(wx - r.x, (z - r.z) * 2.2) * f / 6;
            const ring = Math.exp(-(((dd - R) / (4 * S)) ** 2)) * r.amp * (1 - age / 3200);
            slope += ring * 2;
          }
          const g = clamp(slope * 1.4 - 0.55);
          if (g <= 0.02) continue;
          // Warm where the fire's light is reflected (a broken column below it); faint cool elsewhere.
          const warm = y > mirrorY ? Math.exp(-(((x - fx) / (spread * (0.6 + 0.8 * u))) ** 2)) * fi * V.reflect * 1.6 : 0;
          const cool = amb * 0.42 * (0.4 + 0.6 * u) * (1 + 0.7 * paw);
          const a = (cool + warm) * g * appear;
          if (a < 0.02) continue;
          const wr = clamp(warm / (cool + warm + 1e-3));
          ctx.strokeStyle = `rgba(${mix(150, 255, wr) | 0},${mix(176, 178, wr) | 0},${mix(196, 104, wr) | 0},${Math.min(0.9, a)})`;
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + step * (0.8 + 0.8 * paw), y + (slope - 0.5) * 0.6 - paw * 0.6);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    function drawReflection(ctx: CanvasRenderingContext2D, t: number) {
      // The flame mirrored about the waterline at its own depth, broken into strips by the waves.
      if (fi < 0.02) return;
      const top = mirrorY + (HF / ZI) * f; // reflection of the flame's base
      const strip = 2;
      const hPx = bh * 0.95;
      ctx.save();
      for (let yy = 0; yy < hPx; yy += strip) {
        const dy = yy / hPx;
        const off = n(yy * 0.12, t * 0.0012) * (2 + 10 * dy) * S * (1 + 0.8 * gustAt(fx));
        const wide = bw * (1 + 0.35 * dy);
        const a = V.reflect * Math.pow(1 - dy, 1.3) * clamp(0.3 + 0.9 * n(yy * 0.3 + 5, t * 0.002)) * fi;
        if (a <= 0.02) continue;
        ctx.globalAlpha = Math.min(1, a);
        const srcY = frows * (1 - 0.08 * 0.74 - yy / bh) - (strip / bh) * frows; // mirrored from the flame's base row up
        ctx.drawImage(fcan, 0, Math.max(0, srcY), fcols, Math.max(1, (strip / bh) * frows), fx - wide / 2 + off, top + yy, wide, strip);
      }
      ctx.restore();
    }

    return {
      step(dt, t) {
        stepAll(dt, t);
      },
      settle() {
        settled = true;
        for (let k = 0; k < 360; k++) stepAll(16, 6000 - (360 - k) * 16);
      },
      pointer(x, y, t) {
        gustA = Math.min(1, gustA + 0.2);
        gustX = x;
        gustY = y;
        const w = onWater(x, y);
        if (w && !rings.some((r) => t - r.born < 420)) rings.push({ x: w.x, z: w.z, born: t, amp: 0.55 });
      },
      render(ctx, t) {
        const amb = settled ? 1 : smooth(t_island, t_island + 1300, t);
        const waterOn = settled ? 1 : smooth(t_water, t_water + 1200, t);
        // Sky: faint stars; the far shore as a low dark silhouette defining the horizon.
        for (const s of stars) {
          ctx.fillStyle = `rgba(214,222,236,${s.a * waterOn * (0.7 + 0.3 * Math.sin(t * 0.001 + s.tw))})`;
          ctx.fillRect(s.x, s.y, 1, 1);
        }
        ctx.save();
        ctx.globalAlpha = amb;
        const shoreG = ctx.createLinearGradient(0, 0, W, 0);
        shoreG.addColorStop(0, 'rgba(14,17,24,0)');
        shoreG.addColorStop(0.25, 'rgba(14,17,24,1)');
        shoreG.addColorStop(0.75, 'rgba(14,17,24,1)');
        shoreG.addColorStop(1, 'rgba(14,17,24,0)');
        ctx.fillStyle = shoreG;
        ctx.beginPath();
        ctx.moveTo(0, yh + 1);
        for (let x = 0; x <= W; x += 6) ctx.lineTo(x, yh - (4 + 7 * (0.5 + 0.5 * fbm2(n, x * 0.006, 2.2, 3))) * S);
        ctx.lineTo(W, yh + 1);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // Air: long currents, fading in along their length towards the head, varying with depth.
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const p of tracers) {
          const L = p.trail.length;
          if (L < 12) continue;
          const life = Math.sin(Math.PI * clamp(p.age / p.life)) * amb;
          const SEG = 8;
          const per = Math.max(4, Math.floor(L / 2 / SEG) * 2);
          for (let sgi = 0; sgi < SEG; sgi++) {
            const i0 = sgi * per;
            if (i0 + 2 >= L) break;
            const k = (sgi + 1) / SEG;
            ctx.strokeStyle = `rgba(210,220,236,${0.34 * p.d * life * Math.pow(k, 1.3)})`;
            ctx.lineWidth = (0.55 + 0.9 * p.d) * S;
            ctx.beginPath();
            ctx.moveTo(p.trail[i0], p.trail[i0 + 1]);
            for (let i = i0 + 2; i < Math.min(L, i0 + per + 2); i += 2) ctx.lineTo(p.trail[i], p.trail[i + 1]);
            ctx.stroke();
          }
        }
        ctx.restore();
        // Water and the fire's reflection (behind the island).
        drawWater(ctx, t, amb * waterOn);
        renderFlame(t);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        drawReflection(ctx, t);
        ctx.restore();
        // Mist over the water (dramatic variant), lit warm near the fire.
        if (V.mist > 0) {
          ctx.save();
          for (let k = 0; k < mistX.length; k++) {
            const my = yh + (H - yh) * (0.05 + k * 0.085);
            const mx = (((mistX[k] % (W * 1.7)) + W * 1.7) % (W * 1.7)) - W * 0.35;
            const warm = Math.exp(-(((mx - fx) / (W * 0.3)) ** 2)) * fi;
            const gr = ctx.createRadialGradient(mx, my, 0, mx, my, W * 0.35);
            gr.addColorStop(0, `rgba(${mix(150, 220, warm) | 0},${mix(160, 150, warm) | 0},${mix(176, 120, warm) | 0},${0.06 * V.mist * amb})`);
            gr.addColorStop(1, 'rgba(120,130,150,0)');
            ctx.fillStyle = gr;
            ctx.save();
            ctx.translate(mx, my);
            ctx.scale(1, 0.12);
            ctx.translate(-mx, -my);
            ctx.fillRect(mx - W * 0.35, my - W * 0.35, W * 0.7, W * 0.7);
            ctx.restore();
          }
          ctx.restore();
        }
        // The island, lit by the fire.
        renderIsland(amb);
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(ican, ix0, iy0, icols * icell, irows * icell);
        ctx.restore();
        // Contact: a thin line of light where water meets the near shore on the fire's side.
        // Firelight glow on the ground and in the air around the fire.
        if (fi > 0.01) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const g1 = ctx.createRadialGradient(fx, fy, 0, fx, fy, flamePx * 2.6);
          g1.addColorStop(0, `rgba(255,150,70,${0.22 * fi})`);
          g1.addColorStop(1, 'rgba(120,40,10,0)');
          ctx.fillStyle = g1;
          ctx.save();
          ctx.translate(fx, fy);
          ctx.scale(1, 0.35);
          ctx.translate(-fx, -fy);
          ctx.fillRect(fx - flamePx * 2.6, fy - flamePx * 2.6, flamePx * 5.2, flamePx * 5.2);
          ctx.restore();
          const g2 = ctx.createRadialGradient(fx, fy - flamePx * 0.4, 0, fx, fy - flamePx * 0.4, flamePx * 2.2);
          g2.addColorStop(0, `rgba(255,170,90,${0.12 * fi})`);
          g2.addColorStop(1, 'rgba(120,40,10,0)');
          ctx.fillStyle = g2;
          ctx.fillRect(fx - flamePx * 2.2, fy - flamePx * 2.6, flamePx * 4.4, flamePx * 4.4);
          ctx.restore();
        }
        // Logs and the ember bed (the fire is attached to the ground).
        if (fi > 0.01 || spark === null) {
          const lw = flamePx * 0.42;
          ctx.save();
          ctx.lineCap = 'round';
          ctx.strokeStyle = `rgba(44,30,22,${Math.min(1, amb * 1.2)})`;
          ctx.lineWidth = Math.max(1.5, 2.6 * S);
          for (const [a, b] of [[-1, 0.35], [1, 0.2], [-0.4, -0.3], [0.6, -0.25]]) {
            ctx.beginPath();
            ctx.moveTo(fx - lw * a, fy + lw * 0.12 * b);
            ctx.lineTo(fx + lw * a * 0.15, fy - lw * 0.1);
            ctx.stroke();
          }
          ctx.globalCompositeOperation = 'lighter';
          const eb = ctx.createRadialGradient(fx, fy, 0, fx, fy, lw * 1.1);
          eb.addColorStop(0, `rgba(255,190,110,${0.55 * fi})`);
          eb.addColorStop(0.5, `rgba(230,90,30,${0.3 * fi})`);
          eb.addColorStop(1, 'rgba(120,30,10,0)');
          ctx.fillStyle = eb;
          ctx.save();
          ctx.translate(fx, fy);
          ctx.scale(1, 0.3);
          ctx.translate(-fx, -fy);
          ctx.fillRect(fx - lw * 1.1, fy - lw * 1.1, lw * 2.2, lw * 2.2);
          ctx.restore();
          ctx.restore();
        }
        // The flame itself, standing on the ember bed.
        if (fi > 0.01) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.imageSmoothingEnabled = true;
          // Row of the base (v = 0) is 0.08 · 0.74 of the box height above its bottom edge.
          ctx.drawImage(fcan, fx - bw / 2, fy - bh * (1 - 0.08 * 0.74), bw, bh);
          ctx.restore();
        }
        // Smoke, lit from below near the fire; stretched along the current that carries it.
        ctx.save();
        for (const s of smoke) {
          const u = s.age / s.life;
          const a = 0.09 * Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u);
          const lit = Math.exp(-u * 5) * fi;
          const sp = Math.hypot(s.vx, s.vy) / (U0 + 1e-6);
          const ang = Math.atan2(s.vy, s.vx);
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(ang);
          ctx.scale(1 + Math.min(1.6, sp * 0.8), 1);
          const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, s.r);
          gr.addColorStop(0, `rgba(${mix(120, 200, lit) | 0},${mix(122, 140, lit) | 0},${mix(128, 110, lit) | 0},${a})`);
          gr.addColorStop(1, 'rgba(110,112,120,0)');
          ctx.fillStyle = gr;
          ctx.fillRect(-s.r, -s.r, s.r * 2, s.r * 2);
          ctx.restore();
        }
        ctx.restore();
        // Embers and the entrance spark.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const e of embers) {
          const u = e.age / e.life;
          const a = e.b * (1 - u) * (0.6 + 0.4 * Math.sin(e.age * 0.03 + e.x));
          ctx.fillStyle = `rgba(255,${(150 + 70 * (1 - u)) | 0},${(70 + 50 * (1 - u)) | 0},${a})`;
          ctx.fillRect(e.x - 0.7 * S, e.y - 0.7 * S, 1.4 * S, 1.4 * S);
        }
        if (spark) {
          const gr = ctx.createRadialGradient(spark.x, spark.y, 0, spark.x, spark.y, 6 * S);
          gr.addColorStop(0, 'rgba(255,220,150,0.95)');
          gr.addColorStop(1, 'rgba(255,120,40,0)');
          ctx.fillStyle = gr;
          ctx.fillRect(spark.x - 6 * S, spark.y - 6 * S, 12 * S, 12 * S);
        }
        ctx.restore();
      },
    };
  };
}

export const createLake = lake(DRAMATIC);
