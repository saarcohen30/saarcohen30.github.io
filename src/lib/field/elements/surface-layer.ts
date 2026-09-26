// A broad mineral surface seen at a shallow angle (the same perspective as the Water scene),
// through which fractures propagate. Used by Earth (the whole field) and Convergence (a low
// shelf at the waterline).
//
// Surface: every screen pixel is inverse-projected onto plane coordinates (u across, v depth),
// where layered noise gives basalt/slate tones with muted brown, faint strata, mineral flecks and
// grain; it fades into darkness at every edge (no visible border). Baked once.
// Fractures: grown in plane space before the animation (deterministic): fronts walk with
// correlated direction noise, occasional kinks, branch at 50–90°, stop at random or when they
// meet an existing fracture (T-junction). Each sample has a birth time, so the animation reveals
// them as they propagate. Widths taper; a lit lip on one side suggests a tiny vertical offset.
import { mulberry32, type Rect } from '../core';
import { makeNoise2, fbm2, smooth, clamp, mix, type Layer, type LayerContext } from './kit';

export interface SurfaceOptions extends LayerContext {
  /** Extra alpha mask in plane coordinates (0..1), e.g. an irregular shoreline. */
  mask?: (u: number, v: number) => number;
  /** Number of initial stress points. */
  seeds?: number;
  /** Plane-space step between fracture samples, and total growth budget. */
  budget?: number;
  /** Faint amber inside the widest fissures (0 = none). */
  ember?: number;
  /** Time scale of the fracture growth (ms per unit length). */
  msPerUnit?: number;
  /** Brightness multiplier of the surface. */
  light?: number;
  /** Perspective: width at the far edge relative to the near edge. */
  farScale?: number;
  /** Width of the edge fades (1 = broad, as in Earth; small = crisp, as for a shelf). */
  soft?: number;
  /** Strength of the lit lip along fractures. */
  lip?: number;
}

export interface Fissure {
  pts: { u: number; v: number; t: number; w: number }[];
  ember: boolean;
}

export function createSurfaceLayer(o: SurfaceOptions): Layer & { fissures: Fissure[]; project(u: number, v: number): [number, number]; rect: Rect } {
  const f = o.field;
  const W = f.x1 - f.x0;
  const H = f.y1 - f.y0;
  const cx = (f.x0 + f.x1) / 2;
  const rand = mulberry32(o.seed + 91);
  const noise = makeNoise2(o.seed + 93);
  const delay = o.delay ?? 0;
  const farScale = o.farScale ?? 0.42;
  const P = 1.55;
  const sAt = (v: number) => mix(farScale, 1.15, v);
  const project = (u: number, v: number): [number, number] => [cx + (u - 0.5) * W * sAt(v), f.y0 + H * Math.pow(clamp(v), P)];
  const unproject = (x: number, y: number): [number, number] => {
    const v = Math.pow(clamp((y - f.y0) / H), 1 / P);
    return [0.5 + (x - cx) / (W * sAt(v)), v];
  };
  const mask = o.mask ?? (() => 1);
  // Organic boundary: an elliptical falloff perturbed by noise, so the ground fades into
  // darkness without any straight side.
  const edge = (u: number, v: number) => {
    // Ground plane: sides fade over a wide, noisy margin; the far edge recedes softly into the
    // dark like a horizon; the near edge fades before the frame. No straight side survives.
    const k = o.soft ?? 1;
    const wob = fbm2(noise, u * 2.4 + 40, v * 3.0, 2) * 0.12;
    const side = smooth(0.0, 0.3 * k, u + wob) * (1 - smooth(1 - 0.3 * k, 1.0, u - wob));
    const far = smooth(0.04 * k, 0.42 * k, v + wob * 0.6 * k);
    const near = 1 - smooth(1 - 0.13 * k, 0.99, v);
    return side * far * near * mask(u, v);
  };

  // ---------- Bake the surface.
  const tex = document.createElement('canvas');
  const TW = Math.max(8, Math.ceil(W * 1.35));
  const TH = Math.max(8, Math.ceil(H));
  const tx0 = cx - TW / 2;
  tex.width = TW;
  tex.height = TH;
  {
    const tctx = tex.getContext('2d')!;
    const img = tctx.createImageData(TW, TH);
    const d = img.data;
    const light = o.light ?? 1;
    let hs = (o.seed * 2246822519) >>> 0;
    const hash = () => {
      hs ^= hs << 13;
      hs ^= hs >>> 17;
      hs ^= hs << 5;
      return (hs >>> 0) / 4294967296;
    };
    for (let r = 0; r < TH; r++) {
      const y = f.y0 + r + 0.5;
      for (let c = 0; c < TW; c++) {
        const x = tx0 + c + 0.5;
        const [u, v] = unproject(x, y);
        const a = edge(u, v);
        const i = (r * TW + c) * 4;
        if (a <= 0.003) continue;
        // Plane-space material: a height field lit from the far upper left (relief), broad
        // tonal regions, a hint of strata, mineral colour variation and grain.
        const hAt = (uu: number, vv: number) => fbm2(noise, uu * 7, vv * 9, 4);
        const h = hAt(u, v);
        const e = 0.004;
        const relief = (hAt(u + e, v) - h) * -0.6 + (hAt(u, v + e) - h) * -1.0;
        const broad = fbm2(noise, u * 1.7, v * 2.4, 2);
        const strata = noise(v * 18 + broad * 2.5 + u * 1.5, 7.7);
        const warm = smooth(-0.15, 0.45, fbm2(noise, u * 1.6 + 20, v * 2.2, 2));
        let rr = mix(66, 92, warm);
        let gg = mix(70, 82, warm);
        let bb = mix(80, 68, warm);
        let k = (0.84 + 0.13 * broad + 0.05 * strata + clamp(relief * 3.5, -0.08, 0.09)) * light;
        // Lit a little more towards the viewer, as on the water.
        k *= mix(0.62, 1.05, v);
        const g = hash();
        k *= 0.84 + 0.32 * g * g;
        let add = 0;
        if (g > 0.992) add = 38 * v; // mineral flecks catch the light
        rr = rr * k + add;
        gg = gg * k + add;
        bb = bb * k + add * 0.9;
        d[i] = clamp(rr, 0, 255);
        d[i + 1] = clamp(gg, 0, 255);
        d[i + 2] = clamp(bb, 0, 255);
        d[i + 3] = 255 * a;
      }
    }
    tctx.putImageData(img, 0, 0);
  }

  // ---------- Grow the fracture network (plane space).
  const fissures: Fissure[] = [];
  const CELL = 0.02;
  const grid = new Map<string, { u: number; v: number; id: number }[]>();
  const key = (u: number, v: number) => `${Math.floor(u / CELL)},${Math.floor(v / CELL)}`;
  const add = (u: number, v: number, id: number) => {
    const k = key(u, v);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push({ u, v, id });
  };
  const hit = (u: number, v: number, id: number, parentId: number) => {
    const cu = Math.floor(u / CELL);
    const cv = Math.floor(v / CELL);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const list = grid.get(`${cu + a},${cv + b}`);
        if (!list) continue;
        for (const q of list) if (q.id !== id && q.id !== parentId && (q.u - u) ** 2 + (q.v - v) ** 2 < 0.009 ** 2) return q;
      }
    return null;
  };
  const msPerUnit = o.msPerUnit ?? 2600;
  const step = 0.009;
  let budget = o.budget ?? 5.5;
  interface Front {
    u: number;
    v: number;
    a: number;
    w: number;
    t: number;
    id: number;
    parent: number;
    len: number;
    maxLen: number;
    ember: boolean;
    a0?: number;
  }
  const queue: Front[] = [];
  const nSeeds = o.seeds ?? 3;
  for (let s = 0; s < nSeeds; s++) {
    const u = 0.3 + rand() * 0.4;
    const v = 0.45 + rand() * 0.4;
    // Primary fractures run mostly across the plane (visible in perspective, not all converging).
    const a = (rand() < 0.5 ? 0 : Math.PI) + (rand() - 0.5) * 1.1;
    const t0 = delay + 500 + s * 420;
    // Each stress point sends two fronts in opposite directions.
    for (const da of [0, Math.PI]) {
      queue.push({ u, v, a: a + da + (rand() - 0.5) * 0.3, w: 1, t: t0, id: -1, parent: -1, len: 0, maxLen: 0.4 + rand() * 0.35, ember: s === 0 && rand() < 0.8 });
    }
  }
  let nextId = 0;
  while (queue.length && budget > 0) {
    const fr = queue.shift()!;
    fr.id = nextId++;
    const fis: Fissure = { pts: [{ u: fr.u, v: fr.v, t: fr.t, w: fr.w }], ember: fr.ember && fr.w > 0.7 };
    fissures.push(fis);
    let { u, v, a, t, len } = fr;
    fr.a0 = a;
    const wobbleSeed = rand() * 100;
    while (len < fr.maxLen && budget > 0) {
      // Fracture paths: gentle drift plus small angular jitter and occasional kinks.
      // Low curvature, jagged at small scale, occasional kinks.
      a += fbm2(noise, wobbleSeed + len * 6, 3.3, 2) * 0.1 + (rand() - 0.5) * 0.38 + (rand() < 0.05 ? (rand() - 0.5) * 0.9 : 0);
      a += (fr.a0 - a) * 0.08; // keeps its overall heading
      const du = Math.cos(a) * step;
      const dv = Math.sin(a) * step * 0.8;
      u += du;
      v += dv;
      len += step;
      budget -= step;
      t += step * msPerUnit * (1 + len * 1.5); // fronts slow as they run out of energy
      const w = fr.w * (1 - 0.55 * (len / fr.maxLen));
      if (edge(u, v) < 0.15) break;
      const q = hit(u, v, fr.id, fr.parent);
      fis.pts.push({ u, v, t, w });
      add(u, v, fr.id);
      if (q) {
        fis.pts.push({ u: q.u, v: q.v, t: t + 20, w }); // meets another fracture and stops
        break;
      }
      // Secondary cracks leave at roughly right angles and usually run until they meet another
      // fracture (T-junctions close the polygons of a fractured surface).
      if (fr.w > 0.3 && rand() < 0.05) {
        const side = rand() < 0.5 ? -1 : 1;
        queue.push({ u, v, a: a + side * (Math.PI / 2 + (rand() - 0.5) * 0.5), w: w * 0.55, t, id: -1, parent: fr.id, len: 0, maxLen: 0.15 + rand() * 0.35, ember: false });
      } else if (rand() < 0.03) {
        // Hairline.
        const side = rand() < 0.5 ? -1 : 1;
        queue.push({ u, v, a: a + side * (0.7 + rand() * 0.9), w: 0.18, t, id: -1, parent: fr.id, len: 0, maxLen: 0.03 + rand() * 0.06, ember: false });
      }
    }
  }

  // ---------- Dust and motion.
  interface Dust {
    x: number;
    y: number;
    vy: number;
    vx: number;
    age: number;
    life: number;
    s: number;
  }
  const dust: Dust[] = [];
  const tremorEnd = delay + 900 + nSeeds * 420 + 1400;
  let settled = false;
  let clock = 0;

  const pxWidth = (w: number, v: number) => Math.max(0.35, w * 2.2 * sAt(v));

  return {
    fissures,
    project,
    rect: f,
    step(dt, t) {
      clock = t;
      if (settled) return;
      // Dust rises briefly from fracture tips that are still growing.
      for (const fis of fissures) {
        const tip = fis.pts.findLast?.((p) => p.t <= t);
        const last = fis.pts[fis.pts.length - 1];
        if (!tip || last.t < t - 60 || rand() > dt * 0.006) continue;
        const [x, y] = project(tip.u, tip.v);
        dust.push({ x, y, vx: (rand() - 0.5) * 0.01, vy: -0.012 - rand() * 0.015, age: 0, life: 900 + rand() * 900, s: 0.6 + rand() * 0.9 });
      }
      for (const p of dust) {
        p.age += dt;
        p.vy += 0.000012 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      for (let i = dust.length - 1; i >= 0; i--) if (dust[i].age > dust[i].life) dust.splice(i, 1);
    },
    finish() {
      settled = true;
      dust.length = 0;
    },
    render(ctx, t) {
      if (t < delay) return;
      const tt = settled ? 1e12 : t;
      // Heavy, low-frequency tremor while the surface is under stress.
      const shake = !settled && t < tremorEnd ? 0.5 * Math.sin(t * 0.021) * smooth(delay, delay + 400, t) * (1 - smooth(tremorEnd - 600, tremorEnd, t)) : 0;
      ctx.save();
      ctx.globalAlpha = settled ? 1 : smooth(delay, delay + 700, t);
      ctx.drawImage(tex, tx0, f.y0 + shake);
      ctx.globalAlpha = 1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const fis of fissures) {
        const pts = fis.pts;
        if (pts[0].t > tt) continue;
        // Visible part of this fracture.
        let n = 1;
        while (n < pts.length && pts[n].t <= tt) n++;
        // Continuous strokes in short chunks (width tapers along the fracture).
        const CH = 5;
        for (let i0 = 0; i0 < n - 1; i0 += CH) {
          const i1 = Math.min(n - 1, i0 + CH);
          const pm = pts[i1];
          const a = edge(pm.u, pm.v);
          if (a < 0.05) continue;
          const open = smooth(0, 700, tt - pm.t);
          const w = pxWidth(pm.w, pm.v) * (0.6 + 0.4 * open);
          const path = new Path2D();
          for (let i = i0; i <= i1; i++) {
            const [x, y] = project(pts[i].u, pts[i].v);
            i === i0 ? path.moveTo(x, y + shake) : path.lineTo(x, y + shake);
          }
          // A faint lit lip one pixel above (the slightly raised side), then the dark gap.
          ctx.save();
          ctx.translate(0, -Math.max(0.8, w * 0.55));
          ctx.strokeStyle = `rgba(214,204,184,${((o.lip ?? 0.13) * a * open).toFixed(3)})`;
          ctx.lineWidth = 0.8;
          ctx.stroke(path);
          ctx.restore();
          ctx.strokeStyle = `rgba(8,8,10,${(0.9 * a).toFixed(3)})`;
          ctx.lineWidth = w;
          ctx.stroke(path);
          if (fis.ember && (o.ember ?? 0) > 0 && pm.w > 0.55) {
            ctx.strokeStyle = `rgba(206,132,70,${((o.ember ?? 0) * a * open * pm.w).toFixed(3)})`;
            ctx.lineWidth = Math.max(0.4, w * 0.3);
            ctx.stroke(path);
          }
        }
        // Growing tip.
        if (n < pts.length && n > 0) {
          const p0 = pts[n - 1];
          const p1 = pts[n];
          const k = clamp((tt - p0.t) / (p1.t - p0.t));
          const [x0, y0] = project(p0.u, p0.v);
          const [x1, y1] = project(mix(p0.u, p1.u, k), mix(p0.v, p1.v, k));
          ctx.strokeStyle = 'rgba(8,8,10,0.9)';
          ctx.lineWidth = pxWidth(p0.w, p0.v) * 0.6;
          ctx.beginPath();
          ctx.moveTo(x0, y0 + shake);
          ctx.lineTo(x1, y1 + shake);
          ctx.stroke();
        }
      }
      for (const p of dust) {
        const a = 0.5 * Math.sin((p.age / p.life) * Math.PI);
        ctx.fillStyle = `rgba(200,188,166,${clamp(a).toFixed(3)})`;
        ctx.fillRect(p.x, p.y, p.s, p.s);
      }
      ctx.restore();
    },
  };
}
