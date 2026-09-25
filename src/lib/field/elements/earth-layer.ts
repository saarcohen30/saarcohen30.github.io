// Earth: a cross-section of sedimentary strata. Bands with gently undulating boundaries are cut
// into irregular stone blocks (with visible cracks) and offset along a slanted fault. Blocks rise
// heavily from below, bottom layers first, and settle with a small burst of dust. Afterwards only
// slow creep along the fault and a few drifting motes: weight, not motion.
import { mulberry32 } from '../core';
import { makeNoise, smooth, mix, clamp, rgba, type Layer, type LayerContext } from './kit';

interface Block {
  pts: [number, number][];
  layer: number;
  cx: number;
  top: number;
  bottom: number;
  riseAt: number;
  y: number; // current vertical offset
  v: number;
  settled: boolean;
  tone: string;
  shade: number;
  fault: boolean;
  grain: number[]; // x,y pairs of mineral specks
}
interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  size: number;
}

// Mineral tones: slate, basalt, sandstone, limestone, iron-rich clay, shale.
const TONES = ['#59606a', '#40454d', '#9a8b74', '#b3ab9b', '#7d6655', '#6a6d70', '#8e8069'];

export interface EarthOptions extends LayerContext {
  layers?: number;
  /** Fraction of the rect height the formation fills (from the bottom). */
  fill?: number;
  /** Narrow the formation towards the top (0 = straight sides). */
  taper?: number;
}

export function createEarthLayer(o: EarthOptions): Layer & { topAt(x: number): number; ready(t: number): boolean } {
  const f = o.field;
  const rand = mulberry32(o.seed + 13);
  const noise = makeNoise(o.seed + 17);
  const delay = o.delay ?? 0;
  const W = f.x1 - f.x0;
  const H = f.y1 - f.y0;
  const nL = o.layers ?? (o.mobile ? 10 : 14);
  const fill = o.fill ?? 0.82;
  const taper = o.taper ?? 0.18;
  const baseY = f.y1;
  const topY = f.y1 - H * fill;

  // Layer boundaries (bottom → top), each an undulating polyline.
  const weights = Array.from({ length: nL }, () => (rand() < 0.25 ? 0.25 + rand() * 0.2 : 0.6 + rand() * 1.1));
  const total = weights.reduce((a, b) => a + b, 0);
  const bounds: number[] = [baseY];
  for (const w of weights) bounds.push(bounds.at(-1)! - ((baseY - topY) * w) / total);
  const boundaryY = (i: number, x: number) =>
    i === 0 ? baseY : bounds[i] + noise(x * 0.0045, i * 0.45, 0.5) * H * 0.05 + noise(x * 0.02, i * 1.3, 2) * H * 0.008 - (x - f.x0) * 0.035;
  // Width of the formation at a given layer (taper towards the top, a bit of erosion).
  const spanAt = (i: number) => {
    const k = i / nL;
    const inset = W * taper * k * k;
    return [f.x0 + inset + rand() * W * 0.08, f.x1 - inset - rand() * W * 0.08] as const;
  };

  // A slanted fault: blocks right of it sit a little lower.
  const faultX = f.x0 + W * (0.55 + rand() * 0.15);
  const faultSlope = 0.22;
  const faultDrop = Math.max(8, H * 0.055);

  const blocks: Block[] = [];
  for (let i = 0; i < nL; i++) {
    const [xa, xb] = spanAt(i + 1);
    const cuts: number[] = [xa];
    let x = xa;
    const avg = (o.mobile ? 0.6 : 0.46) * W * (W < 300 ? 1.6 : 1);
    while (x < xb - avg * 0.5) {
      x += avg * (0.55 + rand() * 0.9);
      cuts.push(Math.min(x, xb));
    }
    if (cuts.at(-1)! < xb) cuts.push(xb);
    for (let c = 0; c < cuts.length - 1; c++) {
      if (i >= nL - 2 && rand() < 0.45) continue; // eroded top
      const gap = 0.8;
      const lean1 = (rand() - 0.5) * 26;
      const lean2 = (rand() - 0.5) * 26;
      const x0 = cuts[c] + gap;
      const x1 = cuts[c + 1] - gap;
      const pts: [number, number][] = [];
      const samples = 5;
      for (let s = 0; s <= samples; s++) {
        const xx = mix(x0 + lean1 * 0.5, x1 + lean2 * 0.5, s / samples);
        pts.push([xx, boundaryY(i + 1, xx) + gap]);
      }
      for (let s = samples; s >= 0; s--) {
        const xx = mix(x0 - lean1 * 0.5, x1 - lean2 * 0.5, s / samples);
        pts.push([xx, boundaryY(i, xx) - gap]);
      }
      const cx = (x0 + x1) / 2;
      const fault = cx > faultX + (baseY - (bounds[i] + bounds[i + 1]) / 2) * faultSlope;
      const top = Math.min(...pts.map((p) => p[1]));
      const bottom = Math.max(...pts.map((p) => p[1]));
      const order = i * 1.0 + (cx - f.x0) / W * 0.9 + rand() * 0.3;
      blocks.push({
        pts,
        layer: i,
        cx,
        top,
        bottom,
        riseAt: delay + 120 + order * (o.mobile ? 150 : 115),
        y: H * 0.9 + (bottom - top) * 2,
        v: 0,
        settled: false,
        tone: TONES[(i * 3 + (rand() < 0.2 ? 1 : 0)) % TONES.length],
        shade: 0.82 + rand() * 0.18,
        fault,
        grain: [],
      });
      // Mineral grain: sparse specks inside the slab.
      const b = blocks.at(-1)!;
      const area = (x1 - x0) * (b.bottom - b.top);
      const n = Math.min(90, Math.floor(area / 260));
      for (let k = 0, tries = 0; k < n && tries < n * 4; tries++) {
        const gx = mix(x0, x1, rand());
        const gy = mix(b.top, b.bottom, rand());
        const lo = boundaryY(i + 1, gx) + 2;
        const hi = boundaryY(i, gx) - 2;
        if (gy > lo && gy < hi) {
          b.grain.push(gx, gy);
          k++;
        }
      }
    }
  }
  const motes: Mote[] = [];
  let creep = 0;
  let creepTarget = 0;

  function dust(b: Block, n: number, t: number) {
    for (let k = 0; k < n; k++) {
      const x = mix(b.pts[0][0], b.pts[5][0], rand());
      motes.push({ x, y: b.top + (b.fault ? faultDrop + creep : 0), vx: (rand() - 0.5) * 0.05, vy: -0.02 - rand() * 0.03, life: 1600 + rand() * 1400, age: 0, size: 0.6 + rand() * 1.1 });
    }
    if (motes.length > 140) motes.splice(0, motes.length - 140);
  }

  const drawBlock = (ctx: CanvasRenderingContext2D, b: Block, dy: number) => {
    const g = ctx.createLinearGradient(0, b.top + dy, 0, b.bottom + dy);
    g.addColorStop(0, rgba(b.tone, 0.62 * b.shade));
    g.addColorStop(1, rgba(b.tone, 0.34 * b.shade));
    ctx.fillStyle = g;
    ctx.beginPath();
    b.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + dy) : ctx.moveTo(x, y + dy)));
    ctx.closePath();
    ctx.fill();
    // Bedding lines inside the block, following the band.
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(20,22,26,0.18)';
    ctx.lineWidth = 0.8;
    const h = (b.bottom - b.top) * 0.75;
    for (let k = 1; k < (b.bottom - b.top > 18 ? 3 : 1); k++) {
      ctx.beginPath();
      for (let s = 0; s <= 5; s++) {
        const [x, y] = b.pts[s];
        const yy = y + dy + (h * k) / 4 + noise(x * 0.02, k, b.layer) * 2;
        s ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(236,228,212,0.16)';
    for (let k = 0; k < b.grain.length; k += 2) ctx.fillRect(b.grain[k], b.grain[k + 1] + dy, 1, 1);
    // Lit upper edge, darker lower edge.
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(236,226,206,0.28)';
    ctx.beginPath();
    for (let s = 0; s <= 5; s++) {
      const [x, y] = b.pts[s];
      s ? ctx.lineTo(x, y + dy) : ctx.moveTo(x, y + dy);
    }
    ctx.stroke();
  };

  return {
    /** The actual (settled) top surface under x: the highest block there, fault offset included. */
    topAt(x: number) {
      const under = blocks.filter((b) => x >= Math.min(b.pts[0][0], b.pts[11][0]) && x <= Math.max(b.pts[5][0], b.pts[6][0]));
      if (!under.length) return topY;
      return Math.min(...under.map((b) => b.top + (b.fault ? faultDrop : 0)));
    },
    ready: (t) => t > delay + 120 + nL * (o.mobile ? 150 : 115),
    step(dt, t) {
      for (const b of blocks) {
        if (b.settled || t < b.riseAt) continue;
        // Heavy spring: slow, with a small overshoot, then a thud.
        const k = 0.00045 * dt;
        b.v = (b.v - b.y * k) * Math.pow(0.9, dt / 16);
        b.y += b.v * (dt / 16);
        if (Math.abs(b.y) < 0.4 && Math.abs(b.v) < 0.05) {
          b.y = 0;
          b.settled = true;
          dust(b, o.mobile ? 4 : 7, t);
        }
      }
      creep += (creepTarget - creep) * Math.min(1, dt / 900);
      for (const m of motes) {
        m.age += dt;
        m.vy += 0.00004 * dt; // gravity wins eventually
        m.x += m.vx * dt;
        m.y += m.vy * dt;
      }
      for (let i = motes.length - 1; i >= 0; i--) if (motes[i].age > motes[i].life) motes.splice(i, 1);
    },
    finish() {
      for (const b of blocks) {
        b.y = 0;
        b.v = 0;
        b.settled = true;
      }
    },
    churn(t) {
      // Slow creep along the fault, shedding a little dust.
      creepTarget = creepTarget ? 0 : Math.max(1.5, H * 0.008);
      const faulted = blocks.filter((b) => b.fault && b.layer >= nL - 3);
      const b = faulted[Math.floor(rand() * faulted.length)];
      if (b) dust(b, 3, t);
    },
    render(ctx, t) {
      if (t < delay) return;
      ctx.save();
      for (const b of blocks) {
        if (t < b.riseAt && !b.settled) continue;
        const dy = b.y + (b.fault ? faultDrop + creep : 0);
        const alpha = smooth(0, 500, t - b.riseAt) || (b.settled ? 1 : 0);
        ctx.globalAlpha = alpha;
        drawBlock(ctx, b, dy);
      }
      ctx.globalAlpha = 1;
      // The fault trace.
      ctx.strokeStyle = 'rgba(236,226,206,0.10)';
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(faultX + (baseY - topY) * faultSlope * 0.05, baseY);
      ctx.lineTo(faultX + (baseY - topY) * faultSlope, topY - H * 0.05);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const m of motes) {
        const a = 0.5 * Math.sin((m.age / m.life) * Math.PI);
        ctx.fillStyle = `rgba(214,200,176,${clamp(a).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  };
}
