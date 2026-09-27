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
    const ly = 0.28;
    const nl = (-hx * lx + ly - hz * lz) / (Math.hypot(hx, 1, hz) * Math.hypot(lx, ly, lz));
    const lit = clamp(nl);
    // Wind ripples: fine lines across the windward slopes, fading with distance (no aliasing).
    // (Scaled so one ripple spans a few pixels near the viewer; they fade out before aliasing.)
    const rip = 0.035 * Math.pow(clamp(0.55 / z), 2) * Math.sin(z * 820 + x * 260 + fbm2(n2, x * 5, z * 5) * 9) * (pA < BRINK ? 1 : 0.3);
    // A thin brighter rim just below the brink, where the grazing light catches the crest.
    const rim = smooth(BRINK - 0.06, BRINK - 0.005, pA) * (pA < BRINK ? 1 : 0) * 0.22 * lit;
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
    if (z < zNear || z > zFar) return;
    const h = ground(x, z);
    const p = project(x, z, h);
    const c = Math.round((p.sx - f.x0) * res);
    const r = Math.round((p.sy - f.y0) * res) - 1;
    if (c < 0 || c >= cols || r < 0 || r >= rows) return;
    const seen = zbuf[r * cols + c];
    if (!seen || Math.abs(seen - z) > z * 0.08) return; // hidden behind a nearer dune
    wisps.push({ x, z, sx: p.sx, sy: p.sy, age: 0, life: 1600 + rand() * 1800, len: (8 + rand() * 18) / z });
  }

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
}
