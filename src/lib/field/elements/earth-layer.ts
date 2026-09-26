// Earth: ONE coherent rock mass rising out of the dark, with geology as texture INSIDE it.
//
// Form: the top profile is a broad asymmetric envelope (it falls away at both ends, so the mass
// grows out of the ground rather than sitting like a block) sampled at irregular control points
// and joined by straight facets, the angular look of fractured stone.
// Material (baked once into an offscreen texture): dipping strata bands in low-contrast mineral
// tones, facet lighting on the surface skin, fine grain and specks, faint mineral veins, a lit
// rim, and darkening towards the base.
// Motion: a faint ground tremor, a slow decelerating rise with a small settling bump, one or two
// cracks propagating through the surface, dust drifting down; then stillness.
import { mulberry32, type Rect } from '../core';
import { makeNoise2, fbm2, smooth, clamp, mix, type Layer, type LayerContext } from './kit';

export interface EarthOptions extends LayerContext {
  /** Peak height of the mass as a fraction of the field height. */
  peak?: number;
  /** Where the summit sits across the field (0..1). */
  summitX?: number;
}

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
}
interface Crack {
  pts: [number, number][];
  at: number; // ms when it starts to propagate
  dur: number;
}

// Mineral tones (r, g, b): slate, basalt, warm grey, muted ochre, dark shale, sandstone.
const TONES: [number, number, number][] = [
  [84, 88, 96],
  [74, 78, 86],
  [90, 90, 92],
  [98, 92, 84],
  [80, 80, 84],
  [94, 94, 98],
];

export function createEarthLayer(o: EarthOptions): Layer & { profile(x: number): number; rect: Rect } {
  const f = o.field;
  const rand = mulberry32(o.seed + 53);
  const noise = makeNoise2(o.seed + 59);
  const delay = o.delay ?? 0;
  const W = f.x1 - f.x0;
  const H = f.y1 - f.y0;
  const baseY = f.y1;
  const peakH = H * (o.peak ?? 0.72);
  const sx = o.summitX ?? 0.58;
  const plain = () => (globalThis as { __elementPlain?: boolean }).__elementPlain === true;

  // ---- Form: a broad, low, flat-topped block (a mesa / tectonic slab, not a peak): a steep
  // stepped cliff at the left, a long top that is gently broken with a ledge, a stepped fall right.
  const envelope = (u: number) => {
    const cliffL = smooth(0.02, 0.1, u) * 0.62 + smooth(0.1, 0.17, u) * 0.38; // two steps up
    const cliffR = 1 - (smooth(0.8, 0.86, u) * 0.4 + smooth(0.9, 0.97, u) * 0.6); // two steps down
    const top = 1 - 0.1 * smooth(0.5, 0.62, u) + 0.05 * Math.sin(u * 9.3); // a ledge partway along
    return Math.max(0, Math.min(cliffL, cliffR) * top);
  };
  // Irregular control points joined by straight facets.
  const ctrl: [number, number][] = [];
  for (let u = 0; u <= 1.0001; ) {
    const ridge = fbm2(noise, u * 5, 3.7, 3) * 0.09 + fbm2(noise, u * 17, 9.1, 2) * 0.045;
    ctrl.push([u, clamp(envelope(u) + ridge * envelope(u) ** 0.6, 0, 1.05)]);
    u += 0.02 + rand() * 0.04;
  }
  ctrl[ctrl.length - 1][0] = 1;
  const profileU = (u: number) => {
    let i = 1;
    while (i < ctrl.length - 1 && ctrl[i][0] < u) i++;
    const [u0, h0] = ctrl[i - 1];
    const [u1, h1] = ctrl[i];
    return mix(h0, h1, clamp((u - u0) / (u1 - u0 || 1)));
  };
  /** Top of the settled mass at x (px). */
  const profile = (x: number) => baseY - profileU(clamp((x - f.x0) / W)) * peakH;

  // ---- Material: bake the textured mass once.
  const pad = 2;
  const texW = Math.ceil(W) + pad * 2;
  const texH = Math.ceil(H) + pad * 2;
  const tex = document.createElement('canvas');
  tex.width = texW;
  tex.height = texH;
  const tctx = tex.getContext('2d')!;
  const flat = document.createElement('canvas');
  flat.width = texW;
  flat.height = texH;
  const fctx = flat.getContext('2d')!;
  {
    const img = tctx.createImageData(texW, texH);
    const d = img.data;
    const fimg = fctx.createImageData(texW, texH);
    const fd = fimg.data;
    // Per-column: surface height, facet slope, strata warp.
    const top = new Float32Array(texW);
    const slope = new Float32Array(texW);
    const warp = new Float32Array(texW);
    for (let c = 0; c < texW; c++) {
      const x = f.x0 - pad + c;
      // Pixel-scale roughness on the silhouette (weathered edge, not a clean CG segment).
      top[c] = profile(x) - (f.y0 - pad) + noise(x * 0.11, 1.7) * 1.1 + noise(x * 0.045, 2.9) * 2.2;
      warp[c] = fbm2(noise, x * 0.004, 17.3, 3) * H * 0.09;
    }
    // Smoothed slope (±10 px): lighting follows the landform, not individual facets.
    for (let c = 0; c < texW; c++) slope[c] = (top[Math.min(texW - 1, c + 10)] - top[Math.max(0, c - 10)]) / 20;
    // Strata: cumulative band thicknesses with occasional thin seams.
    const bands: { y: number; tone: number; shade: number }[] = [];
    for (let y = -H; y < H * 2.5; ) {
      const thick = rand() < 0.3 ? 2 + rand() * 3 : 6 + rand() * 16;
      bands.push({ y, tone: Math.floor(rand() * TONES.length), shade: 0.94 + rand() * 0.12 });
      y += thick;
    }
    const bandAt = (s: number) => {
      let lo = 0;
      let hi = bands.length - 1;
      while (lo < hi) {
        const m = (lo + hi + 1) >> 1;
        if (bands[m].y <= s) lo = m;
        else hi = m - 1;
      }
      return bands[lo];
    };
    let seed = (o.seed * 2654435761) >>> 0;
    const hash = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
    for (let r = 0; r < texH; r++) {
      const y = f.y0 - pad + r;
      for (let c = 0; c < texW; c++) {
        const i = (r * texW + c) * 4;
        const depth = r - top[c]; // px below the surface
        if (depth < -1) continue;
        const edgeA = clamp(depth + 1); // 1-px antialiased silhouette
        const x = f.x0 - pad + c;
        // Emerges from darkness towards the base; the ends of the outcrop soften.
        const fadeBase = 1 - smooth(baseY - H * 0.34, baseY, y) * 0.9;
        const alpha = edgeA * fadeBase;
        // Flat silhouette (for the form test).
        fd[i] = 96;
        fd[i + 1] = 96;
        fd[i + 2] = 100;
        fd[i + 3] = alpha * 255;
        // Strata follow a dipping, gently warped horizontal.
        const s = y + warp[c] + (x - f.x0) * 0.12;
        const b = bandAt(s);
        const [tr, tg, tb] = TONES[b.tone];
        // Planes: the top surface (a thin skin under the profile) catches the light; faces below
        // are darker; cliff faces (steep profile) darker still. Light from the upper left.
        const skin = 1 - smooth(5, 24, depth);
        const steep = clamp(Math.abs(slope[c]) * 1.3);
        const facing = 0.85 - 0.15 * Math.tanh(slope[c] * 3); // slopes facing the upper-left light are brighter
        // Slope-dependent light only in the skin; the face below is lit evenly (no column stripes).
        let light = b.shade * mix(0.74, (1.2 - 0.34 * steep) * facing, skin);
        // The front face darkens towards the base (grounded, emerging from darkness).
        light *= 1 - 0.3 * smooth(0, H * 0.55, depth);
        // Vertical joints: faint darker fractures at irregular spacing across the face.
        const jx = fbm2(noise, x * 0.022 + y * 0.004, 5.5, 2);
        const jointBand = noise(x * 0.05, y * 0.012 + 3.3); // joints exist only in short runs
        if (Math.abs(jx) < 0.008 && depth > 26 && jointBand > 0.32) light *= 0.74 + 0.5 * (jointBand - 0.32);
        // Grain: fine per-pixel variation, sparse pale specks and dark pits.
        const g = hash();
        light *= 0.92 + 0.14 * g * (0.7 + 0.3 * noise(x * 0.25, y * 0.25));
        let add = 0;
        if (g > 0.988) add = 22;
        else if (g < 0.012) light *= 0.65;
        // Lit rim along the silhouette.
        if (depth < 1.4) add += 30 * (1 - 0.6 * steep);
        d[i] = clamp(tr * light + add, 0, 255);
        d[i + 1] = clamp(tg * light + add, 0, 255);
        d[i + 2] = clamp(tb * light + add * 0.95, 0, 255);
        d[i + 3] = alpha * 255;
      }
    }
    tctx.putImageData(img, 0, 0);
    fctx.putImageData(fimg, 0, 0);
  }

  // ---- Cracks: start at the ridge and propagate down through the mass.
  const cracks: Crack[] = [];
  const nCracks = o.mobile ? 1 : 2;
  for (let k = 0; k < nCracks; k++) {
    let x = f.x0 + W * (k === 0 ? 0.62 : 0.3) + (rand() - 0.5) * W * 0.04;
    let y = profile(x) + 1;
    const pts: [number, number][] = [[x, y]];
    const len = peakH * (0.35 + rand() * 0.25);
    for (let seg = 0; seg < 14; seg++) {
      x += (rand() - 0.5) * 12 + (k === 0 ? 1.5 : -1.5);
      y += (len / 14) * (0.6 + rand() * 0.8);
      pts.push([x, y]);
    }
    cracks.push({ pts, at: delay + 2150 + k * 280, dur: 520 });
  }

  // ---- Motion.
  const riseAt = delay + 350;
  const riseDur = 1900;
  const riseDist = peakH * 0.62;
  const dust: Dust[] = [];
  let settled = false;
  let puffed = false;

  const offsetAt = (t: number) => {
    if (settled) return 0;
    const k = clamp((t - riseAt) / riseDur);
    // Slow start, long deceleration; a small settling bump at the end.
    const ease = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const bump = Math.sin(clamp((t - riseAt - riseDur) / 380) * Math.PI) * 2.2;
    return (1 - ease) * riseDist - bump;
  };
  const puff = (t: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const x = f.x0 + W * (0.08 + rand() * 0.84);
      dust.push({ x, y: profile(x) - 2, vx: (rand() - 0.5) * 0.03, vy: -0.015 - rand() * 0.02, age: 0, life: 1800 + rand() * 1600, size: 0.7 + rand() * 1.2 });
    }
  };

  return {
    rect: f,
    profile,
    step(dt, t) {
      // Ground tremor before the rise: fine dust trembling at the base line.
      if (!settled && t > delay && t < riseAt + 500 && rand() < dt * 0.05) {
        const x = f.x0 + W * (0.1 + rand() * 0.8);
        dust.push({ x, y: baseY - 4 - rand() * 10, vx: 0, vy: -0.004, age: 0, life: 500 + rand() * 500, size: 0.6 + rand() * 0.6 });
      }
      if (!puffed && !settled && t > riseAt + riseDur - 60) {
        puffed = true;
        puff(t, o.mobile ? 16 : 30);
      }
      for (const p of dust) {
        p.age += dt;
        p.vy += 0.000018 * dt; // it settles
        p.vx *= Math.pow(0.99, dt / 16);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      for (let i = dust.length - 1; i >= 0; i--) if (dust[i].age > dust[i].life) dust.splice(i, 1);
    },
    finish() {
      settled = true;
      for (const c of cracks) c.at = -1e9;
    },
    render(ctx, t) {
      if (t < delay) return;
      const dy = offsetAt(t);
      const tremor = !settled && t > riseAt && t < riseAt + riseDur ? (rand() - 0.5) * 0.6 : 0;
      ctx.save();
      // Clip at the ground line so the mass rises out of it, not in front of it.
      ctx.beginPath();
      ctx.rect(f.x0 - 40, f.y0 - H, W + 80, baseY - f.y0 + H);
      ctx.clip();
      const img = plain() ? flat : tex;
      ctx.globalAlpha = smooth(riseAt - 200, riseAt + 500, t) || (settled ? 1 : 0);
      ctx.drawImage(img, f.x0 - pad + tremor, f.y0 - pad + dy);
      ctx.globalAlpha = 1;
      if (!plain()) {
        // Cracks: dark line with a faint lit lip, drawn progressively.
        for (const c of cracks) {
          const k = clamp((t - c.at) / c.dur);
          if (k <= 0) continue;
          const n = 1 + Math.floor(k * (c.pts.length - 1));
          const frac = k * (c.pts.length - 1) - (n - 1);
          ctx.lineJoin = 'round';
          for (const [off, col, w] of [
            [0.8, 'rgba(210,198,176,0.18)', 0.8],
            [0, 'rgba(12,12,14,0.85)', 1.3],
          ] as [number, string, number][]) {
            ctx.strokeStyle = col;
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.moveTo(c.pts[0][0] + off, c.pts[0][1] + dy);
            for (let i = 1; i < n; i++) ctx.lineTo(c.pts[i][0] + off, c.pts[i][1] + dy);
            if (n < c.pts.length) {
              const [ax, ay] = c.pts[n - 1];
              const [bx, by] = c.pts[n];
              ctx.lineTo(mix(ax, bx, frac) + off, mix(ay, by, frac) + dy);
            }
            ctx.stroke();
          }
        }
        for (const p of dust) {
          const a = 0.45 * Math.sin((p.age / p.life) * Math.PI);
          ctx.fillStyle = `rgba(206,194,172,${clamp(a).toFixed(3)})`;
          ctx.fillRect(p.x, p.y, p.size, p.size);
        }
      }
      ctx.restore();
    },
  };
}
