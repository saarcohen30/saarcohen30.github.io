// Earth: a dune field at dusk. Sand ridges with gentle windward slopes and steep lee faces recede
// to a dark horizon under a low, grazing light. The dunes migrate imperceptibly, the light shifts
// very slowly, and sand streams off the crests in thin wisps.
//
// Rendering: the dune shape is analytic (a smooth phase field u(x, z) through an asymmetric dune
// profile), so crests stay crisp at any resolution. The ground is ray-marched column by column
// from near to far with depth-adaptive steps, composited front to back (anti-aliased
// silhouettes), and colours are interpolated between successive samples (no banding). The
// terrain image is re-rendered only a few times a second; wisps are drawn every frame on top.
import { mulberry32, type Rect } from '../core';
import { makeNoise2, fbm2, smooth, clamp, mix, type Layer, type LayerContext } from './kit';

export interface DuneOptions extends LayerContext {
  /** Horizon position as a fraction of the field height. */
  horizon?: number;
  /**
   * The living dune field (production Earth). The dunes stay massive and slow; the sand shows the
   * landscape is alive: a varied rhythm of calm, building wind, gusts and settling; grains hop up
   * the windward faces and stream off the crests as a thin veil that falls back behind the brink;
   * crests and ripples migrate slowly downwind; a staged entrance. Without it: the original scene.
   */
  active?: boolean;
}

const SKY: [number, number, number] = [6, 7, 10]; // hero stage background
const SAND: [number, number, number] = [176, 132, 92];
const SHADE: [number, number, number] = [30, 25, 27];

export function createDuneLayer(o: DuneOptions): Layer {
  const f: Rect = o.field;
  const W = f.x1 - f.x0;
  const H = f.y1 - f.y0;
  const rand = mulberry32(o.seed + 41);
  const n1 = makeNoise2(o.seed + 43);
  const n2 = makeNoise2(o.seed + 47);
  const delay = o.delay ?? 0;
  const A = !!o.active;

  // Buffer: about one pixel per CSS pixel (capped), drawn with smoothing onto the canvas.
  const res = Math.min(1, 1100 / W);
  const cols = Math.max(64, Math.round(W * res));
  const rows = Math.max(48, Math.round(H * res));
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const bctx = canvas.getContext('2d')!;
  const img = bctx.createImageData(cols, rows);
  const acc = new Float32Array(cols * rows * 4); // premultiplied rgb + coverage
  const zbuf = new Float32Array(cols * rows); // depth of the nearest ground seen at each pixel

  // Camera (buffer pixels). World: x across, z into the distance, h up.
  const horizon = rows * (o.horizon ?? 0.3);
  const camH = 0.36;
  const scale = (rows - horizon) * 1.25 * 0.3 / camH; // the nearest ground sits below the buffer
  const zNear = 0.3;
  const zFar = 6;
  const spread = 0.62 * (cols / rows) / 1.6; // half-width of the view at z = 1

  // Smooth fields on a grid (bilinear): the dune phase u, its amplitude, and a base swell.
  const GX = 160;
  const GZ = 160;
  const XR = spread * zFar;
  const uA = new Float32Array(GX * GZ);
  const uB = new Float32Array(GX * GZ);
  const ampA = new Float32Array(GX * GZ);
  const base = new Float32Array(GX * GZ);
  for (let j = 0; j < GZ; j++)
    for (let i = 0; i < GX; i++) {
      const x = -XR + (2 * XR * i) / (GX - 1);
      const z = zNear + ((zFar - zNear) * j) / (GZ - 1);
      const p = j * GX + i;
      // Main ridges run across the view; their line meanders. A second, finer family crosses them.
      uA[p] = z * 1.55 + x * 0.6 + 0.45 * fbm2(n1, x * 0.45, z * 0.35, 3);
      uB[p] = z * 3.1 - x * 1.4 + 0.5 * fbm2(n2, x * 0.8, z * 0.8, 2);
      ampA[p] = 0.085 + 0.045 * fbm2(n2, x * 0.35 + 7, z * 0.3, 2);
      base[p] = 0.035 * fbm2(n1, x * 0.5 + 3, z * 0.5 + 9, 2);
    }
  const dxg = (2 * XR) / (GX - 1);
  const dzg = (zFar - zNear) / (GZ - 1);
  let gi = 0;
  let ga = 0;
  let gb = 0;
  const locate = (x: number, z: number) => {
    const fx = clamp((x + XR) / dxg, 0, GX - 1.001);
    const fz = clamp((z - zNear) / dzg, 0, GZ - 1.001);
    const i = fx | 0;
    const j = fz | 0;
    gi = j * GX + i;
    ga = fx - i;
    gb = fz - j;
  };
  const lerp = (g: Float32Array) => mix(mix(g[gi], g[gi + 1], ga), mix(g[gi + GX], g[gi + GX + 1], ga), gb);
  const dgx = (g: Float32Array) => mix(g[gi + 1] - g[gi], g[gi + GX + 1] - g[gi + GX], gb) / dxg;
  const dgz = (g: Float32Array) => mix(g[gi + GX] - g[gi], g[gi + GX + 1] - g[gi + 1], ga) / dzg;

  // Asymmetric dune profile over one period p ∈ [0, 1): a long windward rise to a sharp brink,
  // then a short steep lee face. Returns height and slope.
  const BRINK = 0.76;
  let dP = 0;
  const profile = (u: number) => {
    const p = u - Math.floor(u);
    if (p < BRINK) {
      const w = p / BRINK;
      dP = (1.7 * Math.pow(w, 0.7)) / BRINK;
      return Math.pow(w, 1.7);
    }
    const q = (p - BRINK) / (1 - BRINK);
    dP = (-1.35 * Math.pow(1 - q, 0.35)) / (1 - BRINK);
    return Math.pow(1 - q, 1.35);
  };

  let phase = 0; // migration
  let lightAz = 0; // slow drift of the light
  let lyNow = 0.28; // light elevation (lower = only the crests catch it: the entrance)
  let ripT = 0; // ripple migration (active)
  let rimBoost = 1; // the entrance: crest rims lit first
  // Height and gradient at (x, z).
  let hx = 0;
  let hz = 0;
  let pA = 0;
  const ground = (x: number, z: number) => {
    locate(x, z);
    const ua = lerp(uA) + phase;
    const a = lerp(ampA);
    const PA = profile(ua);
    const dA = dP;
    pA = ua - Math.floor(ua);
    const ub = lerp(uB) + phase * 1.6;
    const PB = profile(ub);
    const dB = dP;
    const ab = a * 0.18;
    hx = a * dA * dgx(uA) + ab * dB * dgx(uB) + dgx(base);
    hz = a * dA * dgz(uA) + ab * dB * dgz(uB) + dgz(base);
    return lerp(base) + a * PA + ab * PB;
  };

  // Colour of the ground at a sample (0..255 floats into out).
  const out = [0, 0, 0];
  const shadeAt = (x: number, z: number, k: number) => {
    // Low, grazing light from the front left: windward slopes catch it, lee faces fall into
    // shadow. Its direction drifts a little over time.
    const lx = -0.72 * Math.cos(lightAz) + 0.4 * Math.sin(lightAz);
    const lz = -0.45 * Math.cos(lightAz) - 0.5 * Math.sin(lightAz);
    const ly = lyNow;
    const nl = (-hx * lx + ly - hz * lz) / (Math.hypot(hx, 1, hz) * Math.hypot(lx, ly, lz));
    const lit = clamp(nl);
    // Wind ripples: fine lines across the windward slopes, fading with distance (no aliasing).
    // (Scaled so one ripple spans a few pixels near the viewer; they fade out before aliasing.)
    const rip = 0.035 * Math.pow(clamp(0.55 / z), 2) * Math.sin(z * 820 + x * 260 + fbm2(n2, x * 5, z * 5) * 9 - ripT) * (pA < BRINK ? 1 : 0.3);
    // A thin brighter rim just below the brink, where the grazing light catches the crest.
    const rim = smooth(BRINK - 0.06, BRINK - 0.005, pA) * (pA < BRINK ? 1 : 0) * 0.22 * lit * rimBoost;
    const mineral = 0.5 + 0.5 * fbm2(n1, x * 1.6 + 11, z * 1.6, 2);
    const e = clamp(0.04 + 0.9 * Math.pow(lit, 1.6) + rim + rip);
    const warm = mix(0.92, 1.04, mineral);
    // Atmospheric perspective: into darkness with distance, and the lee sides go almost black.
    const fog = Math.pow(k, 1.1);
    const vis = 1 - fog * 0.93;
    out[0] = mix(SHADE[0], SAND[0] * warm, e) * vis + SKY[0] * (1 - vis);
    out[1] = mix(SHADE[1], SAND[1] * warm, e) * vis + SKY[1] * (1 - vis);
    out[2] = mix(SHADE[2], SAND[2] * mix(1, 0.94, mineral), e) * vis + SKY[2] * (1 - vis);
  };

  // Render columns [c0, c1) into the image data (shown on the next putImageData).
  function renderColumns(c0: number, c1: number) {
    const k0 = Math.log(zNear);
    const kSpan = Math.log(zFar) - k0;
    const d = img.data;
    for (let c = c0; c < c1; c++) {
      for (let r = 0; r < rows; r++) {
        const i = (r * cols + c) * 4;
        acc[i] = acc[i + 1] = acc[i + 2] = acc[i + 3] = 0;
        zbuf[r * cols + c] = 0;
      }
      const sx = (c / (cols - 1)) * 2 - 1;
      let yFull = rows; // rows at and below this are opaque
      let prevY = rows + 40;
      let pr = 0;
      let pg = 0;
      let pb = 0;
      let z = zNear;
      while (z < zFar && yFull > 0) {
        const x = sx * spread * z;
        const h = ground(x, z);
        const y = horizon + ((camH - h) / z) * scale;
        const k = (Math.log(z) - k0) / kSpan;
        shadeAt(x, z, k);
        if (y < yFull) {
          // Rows between this sample and the previous one: interpolate colour; the top row is
          // only partly covered (anti-aliased silhouette).
          const top = Math.max(0, Math.floor(y));
          const span = Math.max(1e-3, prevY - y);
          for (let r = Math.min(yFull - 1, rows - 1); r >= top; r--) {
            const cov = r === top ? clamp(top + 1 - y) : 1;
            const t = clamp((r + 0.5 - y) / span);
            const R = mix(out[0], pr, t);
            const G = mix(out[1], pg, t);
            const B = mix(out[2], pb, t);
            const i = (r * cols + c) * 4;
            const rem = (1 - acc[i + 3]) * cov;
            if (rem <= 0) continue;
            acc[i] += R * rem;
            acc[i + 1] += G * rem;
            acc[i + 2] += B * rem;
            acc[i + 3] += rem;
            if (!zbuf[r * cols + c]) zbuf[r * cols + c] = z;
          }
          yFull = y - top > 0.02 ? top + (acc[(top * cols + c) * 4 + 3] > 0.995 ? 0 : 1) : top;
        }
        prevY = y;
        pr = out[0];
        pg = out[1];
        pb = out[2];
        // Depth-adaptive step: about one buffer pixel of ground per step.
        // Finer far away, where crests are thin and silhouettes nearly horizontal.
        z += Math.max(0.002, (z * z * mix(0.9, 0.3, clamp(k * 1.6))) / (camH * scale));
      }
      // Resolve to straight alpha, with a faint grain so the sand never looks like flat colour.
      for (let r = 0; r < rows; r++) {
        const p = r * cols + c;
        const q = p * 4;
        const a = acc[q + 3];
        if (a <= 0.001) {
          d[q + 3] = 0;
          continue;
        }
        const g = 1 + (((p * 2654435761) >>> 0) / 4294967296 - 0.5) * 0.06;
        d[q] = (acc[q] / a) * g;
        d[q + 1] = (acc[q + 1] / a) * g;
        d[q + 2] = (acc[q + 2] / a) * g;
        d[q + 3] = a * 255;
      }
    }
  }

  // Sand wisps streaming off crests (world positions, drawn every frame).
  interface Wisp { x: number; z: number; sx: number; sy: number; age: number; life: number; len: number }
  const wisps: Wisp[] = [];
  const project = (x: number, z: number, h: number) => ({
    sx: f.x0 + ((x / (spread * z) + 1) / 2) * (cols - 1) / res,
    sy: f.y0 + (horizon + ((camH - h) / z) * scale) / res,
  });
  function spawnWisp() {
    // A point on a crest brink, in the middle distance, that is actually visible.
    const z0 = mix(0.6, 3.2, Math.pow(rand(), 1.4));
    const x = (rand() * 1.6 - 0.8) * spread * z0;
    const c = crestAt(x, z0);
    if (c) wisps.push({ x, z: c.z, sx: c.sx, sy: c.sy, age: 0, life: 1600 + rand() * 1800, len: (8 + rand() * 18) / c.z });
  }
  /** The visible crest brink nearest (x, z0) along the view direction, projected; null if hidden. */
  function crestAt(x: number, z0: number) {
    let z = z0;
    for (let it = 0; it < 3; it++) {
      ground(x, z);
      locate(x, z);
      const g = dgz(uA) || 1.25;
      let dp = BRINK - pA;
      if (dp > 0.5) dp -= 1;
      if (dp < -0.5) dp += 1;
      z += dp / g;
    }
    if (z < zNear || z > zFar) return null;
    const h = ground(x, z);
    const p = project(x, z, h);
    const c = Math.round((p.sx - f.x0) * res);
    const r = Math.round((p.sy - f.y0) * res) - 1;
    if (c < 0 || c >= cols || r < 0 || r >= rows) return null;
    const seen = zbuf[r * cols + c];
    if (!seen || Math.abs(seen - z) > z * 0.08) {
      // The original test (the pixel above the brink) mostly sees the farther dune behind it, which
      // is why the original wisps were rare. The living field tests the windward face just below.
      if (!A) return null;
      const below = r + 3 < rows ? zbuf[(r + 3) * cols + c] : 0;
      if (!below || below > z * 1.02 || below < z * 0.8) return null;
    }
    return { z, sx: p.sx, sy: p.sy };
  }

  if (A) return activeLayer();

  // The terrain is refreshed progressively (a slice of columns per frame, then shown at once), so
  // no single frame pays for the whole image. The motion it shows is far too slow to need more.
  let lastRender = -1;
  let cursor = -1;
  const SLICES = 12;
  const REFRESH = 900; // ms between refreshes
  let settled = false;

  return {
    step(dt, t) {
      // Imperceptible migration and light drift (one dune period in several minutes).
      phase = t * 0.0000024;
      lightAz = 0.12 * Math.sin(t * 0.00005);
      const local = t - delay;
      if (local > 1400 || settled) {
        const want = local > 3200 || settled ? 0.05 : 0.02;
        if (wisps.length < 26 && rand() < want * (dt / 16)) spawnWisp();
      }
      for (let i = wisps.length - 1; i >= 0; i--) {
        const w = wisps[i];
        w.age += dt;
        if (w.age > w.life) wisps.splice(i, 1);
      }
    },
    finish() {
      settled = true;
    },
    render(ctx, t) {
      if (lastRender < 0 || t < lastRender) {
        renderColumns(0, cols);
        bctx.putImageData(img, 0, 0);
        lastRender = t;
        cursor = -1;
      } else if (cursor < 0 && t - lastRender > REFRESH) cursor = 0;
      if (cursor >= 0) {
        const next = Math.min(cols, cursor + Math.ceil(cols / SLICES));
        renderColumns(cursor, next);
        cursor = next;
        if (cursor >= cols) {
          bctx.putImageData(img, 0, 0);
          lastRender = t;
          cursor = -1;
        }
      }
      const local = t - delay;
      // Entrance: the ground emerges from darkness, far to near, as the low light comes up.
      const reveal = settled ? 1 : smooth(0, 2600, local);
      if (reveal <= 0) return;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = reveal;
      ctx.drawImage(canvas, f.x0, f.y0, W, H);
      ctx.restore();
      if (!settled && reveal < 1) {
        // The near ground lags a little behind the horizon.
        const g = ctx.createLinearGradient(0, f.y0 + (horizon / res) * 0.9, 0, f.y1);
        g.addColorStop(0, 'rgba(6,7,10,0)');
        g.addColorStop(1, `rgba(6,7,10,${(1 - smooth(600, 3000, local)) * 0.9})`);
        ctx.fillStyle = g;
        ctx.fillRect(f.x0, f.y0, W, H);
      }
      // Edges dissolve into the stage along a soft ellipse (no rectangular frame).
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      // Centred on the horizon; it reaches the image's edges only at its extreme points.
      const cy = f.y0 + horizon / res;
      ctx.translate(f.x0 + W / 2, cy);
      ctx.scale(1, (f.y1 - cy) / (W / 2));
      const m = ctx.createRadialGradient(0, 0, 0, 0, 0, W / 2);
      m.addColorStop(0, 'rgba(0,0,0,1)');
      m.addColorStop(0.45, 'rgba(0,0,0,1)');
      m.addColorStop(0.72, 'rgba(0,0,0,0.6)');
      m.addColorStop(0.9, 'rgba(0,0,0,0.15)');
      m.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = m;
      ctx.fillRect(-W, -W, W * 2, W * 2);
      ctx.restore();
      // Wisps: a faint spray of grains lifted off the brink and carried downwind.
      for (const w of wisps) {
        const u = w.age / w.life;
        const env = Math.sin(Math.PI * u) * reveal * clamp(1.4 - w.z / 3);
        const run = w.len * (0.4 + 1.2 * u);
        const sz = Math.max(0.6, 1.1 / Math.sqrt(w.z));
        for (let g = 0; g < 14; g++) {
          // Each grain has its own (stable) speed and height, so the spray fans out irregularly.
          const hA = Math.sin(w.x * 97.1 + g * 12.9) * 43758.5453;
          const ra = hA - Math.floor(hA);
          const hB = Math.sin(w.z * 61.7 + g * 7.3) * 24634.6345;
          const rb = hB - Math.floor(hB);
          const s = clamp(u * (0.5 + ra) * 1.2);
          const px = w.sx + run * s * (0.6 + 0.8 * ra);
          const py = w.sy - w.len * (0.08 + 0.3 * rb) * Math.sin(Math.PI * Math.min(1, s * 1.2)) - rb * sz;
          ctx.fillStyle = `rgba(214,186,150,${env * 0.26 * (1 - s) * (0.4 + 0.6 * rb)})`;
          ctx.fillRect(px, py, sz, sz);
        }
      }
    },
  };
  /** The living dune field (see `active`). */
  function activeLayer(): Layer & { stats(): { grains: number; emitters: number; wind: number } } {
    const ellX = f.x0 + W / 2;
    const ellY = f.y0 + horizon / res;
    const ellRy = f.y1 - ellY;
    /** The soft ellipse the terrain dissolves into (particles use it too). */
    const inside = (x: number, y: number) => 1 - smooth(0.62, 1, Math.hypot((x - ellX) / (W / 2), (y - ellY) / ellRy));
    const px = W / 1000; // screen scale (the field is ~700-1000 px wide on desktop, ~400 on phones)

    // Terrain: refreshed progressively and cross-faded, so the slow migration never steps.
    const prev = document.createElement('canvas');
    prev.width = cols;
    prev.height = rows;
    const pctx = prev.getContext('2d')!;
    const graze = document.createElement('canvas'); // the entrance: only the crests catch a very low light
    graze.width = cols;
    graze.height = rows;
    let swapT = -1e9;
    let lastRender = -1;
    let cursor = -1;
    const SLICES = 12;
    const REFRESH = 420;
    const XF = 520; // cross-fade after each refresh (the migration per refresh is well under a pixel)
    let settled = false;

    // Wind: a slow breeze plus gusts on a varied schedule (calm, build, gust, settle). A gust front
    // sweeps across the field from the left.
    interface Gust { t0: number; rise: number; hold: number; fall: number; peak: number }
    let gust: Gust = { t0: delay + 2300, rise: 1300, hold: 1700, fall: 2600, peak: 0.85 }; // the first, in the entrance
    let before: Gust | null = null;
    const end = (g: Gust) => g.t0 + g.rise + g.hold + g.fall;
    const env = (g: Gust | null, t: number) => {
      if (!g) return 0;
      const u = t - g.t0;
      if (u < 0) return 0;
      if (u < g.rise) return g.peak * smooth(0, g.rise, u);
      if (u < g.rise + g.hold) return g.peak * (1 + 0.1 * Math.sin(u * 0.0042));
      return g.peak * (1 - smooth(0, g.fall, u - g.rise - g.hold));
    };
    const FRONT = 1500; // ms for a gust front to cross the field
    let ptr = { x: 0, y: 0, t: -1e9 };
    const windAt = (x: number, t: number) => {
      const lag = clamp((x - f.x0) / W) * FRONT;
      const g = Math.max(env(gust, t - lag), env(before, t - lag));
      const breeze = 0.1 + 0.06 * n1(t * 0.00012, 3.3);
      const age = t - ptr.t;
      const local = age < 900 ? 0.5 * (1 - age / 900) * Math.exp(-(((x - ptr.x) / (70 * px + 20)) ** 2)) : 0;
      return breeze + g + local;
    };

    // Grains: a fixed pool (typed arrays, swap-remove), capped per device.
    const MAX = o.mobile ? 380 : 800;
    const gx = new Float32Array(MAX);
    const gy = new Float32Array(MAX);
    const gvx = new Float32Array(MAX);
    const gvy = new Float32Array(MAX);
    const gage = new Float32Array(MAX);
    const glife = new Float32Array(MAX);
    const gk = new Float32Array(MAX); // depth scale
    const gy0 = new Float32Array(MAX); // the brink it left (falling back below it = settled)
    const ga = new Float32Array(MAX); // base opacity
    const gband = new Uint8Array(MAX); // 0 near, 1 middle, 2 far
    let n = 0;
    // Emitters: a stretch of visible crest releasing grains while the wind is up.
    interface Emitter { ax: number; ay: number; bx: number; by: number; k: number; band: number; age: number; life: number; rate: number }
    const emitters: Emitter[] = [];
    const MAXE = o.mobile ? 6 : 10;
    function addEmitter(band: number, nearX?: number, nearY?: number) {
      const z0 = band === 0 ? mix(0.45, 0.8, rand()) : band === 1 ? mix(0.8, 2.4, rand()) : mix(2.4, 4.6, rand());
      let x = (rand() * 1.6 - 0.8) * spread * z0;
      let z = z0;
      if (nearX !== undefined && nearY !== undefined) {
        // The crest under the pointer: the depth whose ground projects nearest to it.
        let best = 1e9;
        for (let zi = 0.45; zi < 4.6; zi *= 1.18) {
          const xi = (((nearX - f.x0) * res) / (cols - 1) * 2 - 1) * spread * zi;
          const d = Math.abs(project(xi, zi, ground(xi, zi)).sy - nearY);
          if (d < best) {
            best = d;
            z = zi;
            x = xi;
          }
        }
      }
      const a = crestAt(x, z);
      if (!a) return;
      const b = crestAt(x + spread * a.z * 0.1, a.z);
      const k = Math.min(1.9, 0.95 / Math.pow(a.z, 0.85));
      const L = (70 + rand() * 110) * px * k;
      // Follow the crest where it is found on both sides; otherwise its usual gentle fall to the right.
      let slope = b && Math.abs(b.sy - a.sy) < Math.abs(b.sx - a.sx) * 0.6 ? (b.sy - a.sy) / (b.sx - a.sx || 1) : 0.12;
      slope = clamp(slope, -0.5, 0.5);
      emitters.push({ ax: a.sx - L / 2, ay: a.sy - (slope * L) / 2, bx: a.sx + L / 2, by: a.sy + (slope * L) / 2, k, band: z0 < 0.8 ? 0 : z0 < 2.4 ? 1 : 2, age: 0, life: 900 + rand() * 1800, rate: band === 0 ? 30 : band === 1 ? 150 : 80 });
    }
    function emit(e: Emitter, t: number) {
      if (n >= MAX) return;
      const s = rand();
      const x = mix(e.ax, e.bx, s);
      const y = mix(e.ay, e.by, s);
      const w = windAt(x, t);
      const salt = rand() < 0.22; // starts on the windward face and hops up to the brink
      gx[n] = x;
      gy[n] = salt ? y + (2 + rand() * 6) * e.k * px : y;
      gy0[n] = y;
      gk[n] = e.k * px;
      gvx[n] = (0.4 + 0.6 * rand()) * 110 * gk[n] * (0.3 + w);
      gvy[n] = -(salt ? 10 + rand() * 12 : (0.3 + 0.7 * rand()) * 26 * (0.4 + w)) * gk[n];
      gage[n] = 0;
      glife[n] = (e.band === 0 ? 600 : 900) + rand() * 1400;
      ga[n] = (e.band === 0 ? 0.4 : e.band === 1 ? 0.45 : 0.3) * (0.35 + 0.65 * rand());
      gband[n] = e.band;
      n++;
    }
    // Far haze: a few soft dusty patches that drift over the distant crests when the wind is up.
    const haze = Array.from({ length: o.mobile ? 3 : 5 }, (_, i) => ({ x: f.x0 + W * (i / 4) * 1.1, dy: (rand() - 0.3) * 14, w: (0.14 + rand() * 0.14) * W }));
    let lastPtr = -1e9;
    let lastT = 0;

    return {
      step(dt, t) {
        lastT = t;
        // Slow migration downwind (one dune period in about two and a half minutes); ripples travel
        // faster along the faces; the light drifts a little.
        phase = -t / 150000;
        ripT = t * 0.0005;
        lightAz = 0.12 * Math.sin(t * 0.00005);
        if (t > end(gust) - FRONT) {
          // Schedule the next gust: controlled variation in timing, shape and strength.
          before = gust;
          const strong = rand() < 0.25;
          gust = { t0: end(gust) + 2200 + rand() * 5200, rise: 900 + rand() * 1700, hold: 600 + rand() * 2300, fall: 1800 + rand() * 2600, peak: strong ? 0.9 + rand() * 0.15 : 0.4 + rand() * 0.38 };
        }
        const local = t - delay;
        if (local < 1800 && !settled) return;
        const w = windAt(f.x0 + W * 0.5, t);
        // New stretches of crest become active as the wind rises: mostly the middle distance.
        if (emitters.length < MAXE && rand() < (dt / 16) * (0.012 + 0.1 * w * w)) {
          const r = rand();
          addEmitter(r < 0.18 ? 0 : r < 0.78 ? 1 : 2);
        }
        if (t - ptr.t < 500 && emitters.length < MAXE + 2 && rand() < (dt / 16) * 0.2) addEmitter(1, ptr.x, ptr.y);
        for (let i = emitters.length - 1; i >= 0; i--) {
          const e = emitters[i];
          e.age += dt;
          const we = windAt((e.ax + e.bx) / 2, t);
          const life = Math.sin(Math.PI * clamp(e.age / e.life));
          let want = (e.rate * we * we * life * dt) / 1000;
          while (want > 0 && (want >= 1 || rand() < want)) {
            emit(e, t);
            want -= 1;
          }
          if (e.age > e.life) emitters.splice(i, 1);
        }
        const sec = dt / 1000;
        for (let i = n - 1; i >= 0; i--) {
          gage[i] += dt;
          const k = gk[i];
          const w = windAt(gx[i], t);
          gvx[i] += (110 * k * (0.25 + w) - gvx[i]) * Math.min(1, dt * 0.004); // grains ride the wind
          gvy[i] += (16 - 12 * w * (0.5 + 0.5 * n2(gx[i] * 0.03, t * 0.002))) * k * sec; // gravity against lift: fine grains hang in the wind
          gvy[i] += n2(gx[i] * 0.05 + i, gy[i] * 0.05 + t * 0.0012) * 40 * w * k * sec; // turbulence
          gx[i] += gvx[i] * sec;
          gy[i] += gvy[i] * sec;
          const fell = gage[i] > 300 && gvy[i] > 0 && gy[i] > gy0[i] + 2.5 * k; // settled behind the brink
          if (gage[i] > glife[i] || fell) {
            n--;
            gx[i] = gx[n];
            gy[i] = gy[n];
            gvx[i] = gvx[n];
            gvy[i] = gvy[n];
            gage[i] = gage[n];
            glife[i] = glife[n];
            gk[i] = gk[n];
            gy0[i] = gy0[n];
            ga[i] = ga[n];
            gband[i] = gband[n];
          }
        }
        for (const h of haze) {
          h.x += 70 * 0.3 * px * windAt(h.x, t) * sec;
          if (h.x - h.w > f.x1) h.x = f.x0 - h.w;
        }
      },
      finish() {
        settled = true;
      },
      /** For the review harness: current particle load and wind. */
      stats: () => ({ grains: n, emitters: emitters.length, wind: windAt(f.x0 + W / 2, lastT) }),
      pointer(x, y, t) {
        // A weak local gust: lifts a few grains from the crest nearby; the dunes never move.
        if (x < f.x0 || x > f.x1 || y < ellY - 10 || y > f.y1 || t - lastPtr < 90) return;
        lastPtr = t;
        ptr = { x, y, t };
      },
      render(ctx, t) {
        const local = t - delay;
        const intro = !settled && local < 3200;
        if (lastRender < 0 || t < lastRender) {
          if (intro) {
            lyNow = 0.05;
            rimBoost = 7;
            renderColumns(0, cols);
            graze.getContext('2d')!.putImageData(img, 0, 0);
            lyNow = 0.28;
            rimBoost = 1;
          }
          renderColumns(0, cols);
          bctx.putImageData(img, 0, 0);
          pctx.drawImage(canvas, 0, 0);
          lastRender = t;
          cursor = -1;
        } else if (cursor < 0 && t - lastRender > REFRESH) cursor = 0;
        if (cursor >= 0) {
          const next = Math.min(cols, cursor + Math.ceil(cols / SLICES));
          renderColumns(cursor, next);
          cursor = next;
          if (cursor >= cols) {
            pctx.clearRect(0, 0, cols, rows);
            pctx.drawImage(canvas, 0, 0);
            bctx.putImageData(img, 0, 0);
            lastRender = t;
            swapT = t;
            cursor = -1;
          }
        }
        // Entrance: darkness; silhouettes and the crests catch a very low light; the light rises
        // over the whole field; then the first gust lifts sand off the crests.
        const grazeA = settled ? 0 : smooth(250, 1500, local);
        const fullA = settled ? 1 : smooth(1400, 3000, local);
        if (grazeA <= 0 && fullA <= 0) return;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (fullA < 1 && grazeA > 0) {
          ctx.globalAlpha = grazeA;
          ctx.drawImage(graze, f.x0, f.y0, W, H);
        }
        const xf = clamp((t - swapT) / XF);
        if (xf < 1) {
          ctx.globalAlpha = fullA;
          ctx.drawImage(prev, f.x0, f.y0, W, H);
        }
        ctx.globalAlpha = fullA * xf;
        ctx.drawImage(canvas, f.x0, f.y0, W, H);
        ctx.restore();
        if (!settled && fullA < 1) {
          // The near ground lags a little behind the horizon.
          const g = ctx.createLinearGradient(0, f.y0 + (horizon / res) * 0.9, 0, f.y1);
          g.addColorStop(0, 'rgba(6,7,10,0)');
          g.addColorStop(1, `rgba(6,7,10,${(1 - smooth(600, 3000, local)) * 0.9})`);
          ctx.fillStyle = g;
          ctx.fillRect(f.x0, f.y0, W, H);
        }
        // Edges dissolve into the stage along a soft ellipse (no rectangular frame).
        ctx.save();
        ctx.globalCompositeOperation = 'destination-in';
        ctx.translate(ellX, ellY);
        ctx.scale(1, ellRy / (W / 2));
        const m = ctx.createRadialGradient(0, 0, 0, 0, 0, W / 2);
        m.addColorStop(0, 'rgba(0,0,0,1)');
        m.addColorStop(0.45, 'rgba(0,0,0,1)');
        m.addColorStop(0.72, 'rgba(0,0,0,0.6)');
        m.addColorStop(0.9, 'rgba(0,0,0,0.15)');
        m.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = m;
        ctx.fillRect(-W, -W, W * 2, W * 2);
        ctx.restore();
        const show = Math.max(grazeA, fullA);
        // Far haze over the distant crests, only while the wind is up.
        for (const h of haze) {
          const a = 0.05 * clamp(windAt(h.x, t) - 0.15) * inside(h.x, ellY) * show;
          if (a < 0.004) continue;
          ctx.save();
          ctx.translate(h.x, ellY + h.dy * px + 4);
          ctx.scale(1, 0.09);
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, h.w);
          g.addColorStop(0, `rgba(200,178,150,${a.toFixed(3)})`);
          g.addColorStop(1, 'rgba(200,178,150,0)');
          ctx.fillStyle = g;
          ctx.fillRect(-h.w, -h.w, h.w * 2, h.w * 2);
          ctx.restore();
        }
        // The veil: a soft band of airborne sand along each active stretch of crest, carried a little
        // downwind; the grains give it texture.
        for (const e of emitters) {
          const mx = (e.ax + e.bx) / 2;
          const we = windAt(mx, t);
          const a = (e.band === 2 ? 0.05 : 0.075) * clamp(we - 0.2) * Math.sin(Math.PI * clamp(e.age / e.life)) * inside(mx, (e.ay + e.by) / 2) * show;
          if (a < 0.004) continue;
          const len = Math.hypot(e.bx - e.ax, e.by - e.ay) / 2 + 26 * e.k * px;
          ctx.save();
          ctx.translate(mx + 16 * e.k * px * we, (e.ay + e.by) / 2 - 3 * e.k * px);
          ctx.rotate(Math.atan2(e.by - e.ay, e.bx - e.ax) - 0.06);
          ctx.scale(1, (5 * e.k * px + 1.5) / len);
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
          g.addColorStop(0, `rgba(214,190,156,${a.toFixed(3)})`);
          g.addColorStop(1, 'rgba(214,190,156,0)');
          ctx.fillStyle = g;
          ctx.fillRect(-len, -len, len * 2, len * 2);
          ctx.restore();
        }
        // Grains: short streaks along their motion, batched by depth band and opacity.
        const B = 5;
        const paths: Path2D[] = Array.from({ length: 3 * B }, () => new Path2D());
        for (let i = 0; i < n; i++) {
          const u = gage[i] / glife[i];
          const a = ga[i] * smooth(0, 0.12, u) * (1 - smooth(0.55, 1, u)) * inside(gx[i], gy[i]) * show;
          if (a < 0.03) continue;
          const b = gband[i] * B + Math.min(B - 1, Math.floor(a * B * 1.4));
          const tail = gband[i] === 0 ? 0.03 : gband[i] === 1 ? 0.075 : 0.1; // near grains read as grains, far ones as streaks
          paths[b].moveTo(gx[i] - gvx[i] * tail, gy[i] - gvy[i] * tail);
          paths[b].lineTo(gx[i], gy[i]);
        }
        ctx.save();
        ctx.lineCap = 'round';
        for (let band = 0; band < 3; band++) {
          const col = band === 2 ? '186,170,152' : '226,200,164';
          ctx.lineWidth = (band === 0 ? 1.7 : band === 1 ? 0.95 : 0.7) * Math.max(0.8, Math.sqrt(px));
          for (let j = 0; j < B; j++) {
            ctx.strokeStyle = `rgba(${col},${Math.min(0.85, (j + 0.5) / (B * 1.4) + 0.02).toFixed(3)})`;
            ctx.stroke(paths[band * B + j]);
          }
        }
        ctx.restore();
      },
    };
  }
}
