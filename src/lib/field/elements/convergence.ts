// Convergence: one abstract event, not four objects in a landscape.
//
// A single flow (an eccentric vortex around an off-centre point, plus curl-noise turbulence)
// carries everything. Each material behaves by its own nature within it:
//   air   : long pale streamlines trace the current as it establishes itself;
//   water : fluid ribbons (follow-the-leader chains drawn as tapered translucent bands with a
//           specular crest) are drawn into the flow;
//   earth : loose mineral grains are carried inwards and condense into a partial crescent;
//   fire  : heat ignites along part of the crescent; flame tongues (the same continuous-field
//           technique as the Fire scene) grow from the grains' outer edge and are bent downstream.
// Interactions: the flow drives water and grains; the current bends the flame; the crescent
// deflects the ribbons; the fire lights the grains near it; water passing the flame cools it
// locally and leaves a faint trace of steam.
import { mulberry32, type SceneFactory } from '../core';
import { makeNoise2, fbm2, curl, makeNoise, smooth, clamp, mix, edgeFade, sceneFromLayers, ctxFrom, type Layer } from './kit';
import { LUT } from './fire-layer';

interface Tracer {
  x: number;
  y: number;
  trail: number[];
  age: number;
  life: number;
  w: number;
}
interface Grain {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number; // target angle on the crescent
  rr: number; // target radius
  stuck: boolean;
  born: number;
  tone: number;
  size: number;
}
interface Steam {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
}

const GRAIN_TONES: [number, number, number][] = [
  [150, 142, 128],
  [118, 114, 108],
  [168, 156, 132],
  [96, 98, 104],
  [140, 126, 104],
];

export const createConvergence: SceneFactory = (o) => {
  const base = ctxFrom(o);
  const f = o.field;
  const W = f.x1 - f.x0;
  const H = f.y1 - f.y0;
  const side = o.layout === 'side';
  const rand = mulberry32(base.seed + 71);
  const n2 = makeNoise2(base.seed + 73);
  const n3 = makeNoise(base.seed + 79);
  const cx = f.x0 + W * (side ? 0.5 : 0.5);
  const cy = f.y0 + H * (side ? 0.5 : 0.52);
  const R = Math.min(W, H) * (side ? 0.4 : 0.44); // overall radius of the system
  const ecc = 0.82; // vertical squash: an ellipse, not a perfect circle
  const ringR = R * 0.56; // where earth condenses
  const ringT = R * 0.11; // crescent thickness
  // One arc that transforms: stones condense along the lower arc (the current flows right→left
  // along the bottom); at its left end the arc turns into fire, which streams up the far side.
  const arcFrom = 0.45;
  const arcTo = 2.45;
  // Fire: a flame drawn into the current. Its source sits low on the left, where the flow rises;
  // the flame body streams downstream along a traced streamline (with a buoyant lift).
  const fireSrcA = 2.62; // just past the stones' left end

  const T = { air: 0, water: 650, earth: 1350, fire: 2250 };
  let clock = 0;
  let settled = false;
  const since = (t0: number) => (settled ? 1e9 : clock - t0);

  // ---- The shared flow.
  const spin = () => smooth(0, 900, since(T.air));
  function flow(x: number, y: number): [number, number] {
    const dx = x - cx;
    const dy = (y - cy) / ecc;
    const r = Math.hypot(dx, dy) + 1;
    // Tangential speed: rises, then falls off outside the system.
    const vt = 0.13 * spin() * (r / R) * Math.exp(-((r / R) ** 2) * 0.55) * 2.2;
    let u = (-dy / r) * vt;
    let v = (dx / r) * vt * ecc;
    // A slight inward drift near the rim, outward in the middle (keeps material in orbit).
    const drift = 0.012 * spin() * (r / R - 0.62);
    u += (-dx / r) * drift;
    v += (-dy / r) * drift * ecc;
    const [cu, cv] = curl(n3, x * 0.004, y * 0.004, clock * 0.00012);
    return [u + cu * 0.03, v + cv * 0.03];
  }
  function flowSettled(x: number, y: number): [number, number] {
    const dx = x - cx;
    const dy = (y - cy) / ecc;
    const r = Math.hypot(dx, dy) + 1;
    const vt = 0.13 * (r / R) * Math.exp(-((r / R) ** 2) * 0.55) * 2.2;
    return [(-dy / r) * vt, (dx / r) * vt * ecc];
  }
  const polar = (x: number, y: number) => {
    const dx = x - cx;
    const dy = (y - cy) / ecc;
    return { r: Math.hypot(dx, dy), a: Math.atan2(dy, dx) };
  };
  const fromPolar = (r: number, a: number): [number, number] => [cx + Math.cos(a) * r, cy + Math.sin(a) * r * ecc];

  // ---- Air.
  const nAir = side ? 70 : 42;
  const TRAIL = side ? 46 : 34;
  const tracers: Tracer[] = [];
  const spawnTracer = (): Tracer => {
    const a = rand() * Math.PI * 2;
    const r = R * (0.25 + rand() * 1.0);
    const [x, y] = fromPolar(r, a);
    return { x, y, trail: [], age: 0, life: 3000 + rand() * 3500, w: 0.4 + rand() * 0.7 };
  };

  // ---- Water ribbons.
  const nRib = 3;
  const SEG = side ? 80 : 56;
  const segLen = R * 0.022;
  const ribbons = Array.from({ length: nRib }, (_, k) => {
    const a0 = (k / nRib) * Math.PI * 2 + 0.6;
    const r0 = k === 0 ? ringR * 1.05 : R * (0.82 + 0.12 * k);
    const [hx, hy] = fromPolar(r0, a0);
    return { pts: Array.from({ length: SEG }, () => [hx, hy] as [number, number]), r0, width: R * (0.04 + 0.012 * k), phase: rand() * 10 };
  });

  // ---- Earth grains.
  const nGrain = side ? 2000 : 1200;
  const grains: Grain[] = [];
  const spawnGrain = (born: number): Grain => {
    const a = mix(arcFrom, arcTo, Math.pow(rand(), 0.9));
    const rr = ringR + (rand() - 0.5) * 2 * ringT * (0.4 + 0.6 * Math.sin(((a - arcFrom) / (arcTo - arcFrom)) * Math.PI));
    const sa = a - 1.2 - rand() * 1.6; // they arrive from upstream
    const [x, y] = fromPolar(R * (0.95 + rand() * 0.3), sa);
    const mid = Math.sin(((a - arcFrom) / (arcTo - arcFrom)) * Math.PI);
    return { x, y, vx: 0, vy: 0, a, rr, stuck: false, born, tone: Math.floor(rand() * GRAIN_TONES.length), size: 0.9 + rand() * (0.8 + 1.8 * mid) };
  };

  // ---- Fire: flame body in a curved coordinate system that follows the flow.
  const cell = side ? 2.6 : 2.3;
  const fireLen = R * (side ? 1.3 : 1.2); // length of the flame along the stream
  const fireHalf = R * 0.17; // half-width at the source
  const NPATH = 44;
  const path: [number, number][] = [];
  const tang: [number, number][] = [];
  function tracePath() {
    // Integrate the (settled) flow plus a buoyant lift from the source.
    let [x, y] = fromPolar(ringR, fireSrcA);
    path.length = 0;
    const step = fireLen / (NPATH - 1);
    for (let i = 0; i < NPATH; i++) {
      path.push([x, y]);
      let [u, v] = flowSettled(x, y);
      v -= 0.045; // heat rises
      const l = Math.hypot(u, v) || 1;
      x += (u / l) * step;
      y += (v / l) * step;
    }
    tang.length = 0;
    for (let i = 0; i < NPATH; i++) {
      const a = path[Math.max(0, i - 1)];
      const b = path[Math.min(NPATH - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      tang.push([(b[0] - a[0]) / l, (b[1] - a[1]) / l]);
    }
  }
  let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
  let buf: HTMLCanvasElement, bctx: CanvasRenderingContext2D, img: ImageData, cols = 0, rows = 0;
  function setupFire() {
    tracePath();
    for (const [x, y] of path) {
      bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y);
    }
    const m = fireHalf * 2.2;
    bx0 -= m; by0 -= m * 1.4; bx1 += m; by1 += m;
    cols = Math.max(8, Math.round((bx1 - bx0) / cell));
    rows = Math.max(8, Math.round((by1 - by0) / cell));
    buf = document.createElement('canvas');
    buf.width = cols;
    buf.height = rows;
    bctx = buf.getContext('2d')!;
    img = bctx.createImageData(cols, rows);
  }
  const steam: Steam[] = [];
  // Cooling by water: per path sample, how close is the nearest ribbon.
  const coolAt = new Float32Array(NPATH);

  function fireField() {
    const TT = clock * 0.001 + 31.3;
    const ignite = clamp(since(T.fire) / 1400); // the flame grows out along the stream
    for (let k = 0; k < NPATH; k += 2) {
      let best = 1e9;
      for (const rb of ribbons) for (let i = 0; i < rb.pts.length; i += 3) {
        const d2 = (rb.pts[i][0] - path[k][0]) ** 2 + (rb.pts[i][1] - path[k][1]) ** 2;
        if (d2 < best) best = d2;
      }
      coolAt[k] = coolAt[Math.min(NPATH - 1, k + 1)] = smooth(R * 0.03, R * 0.14, Math.sqrt(best));
    }
    const d = img.data;
    const segLen = fireLen / (NPATH - 1);
    for (let r = 0; r < rows; r++) {
      const y = by0 + (r + 0.5) * ((by1 - by0) / rows);
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 4;
        const x = bx0 + (c + 0.5) * ((bx1 - bx0) / cols);
        // Closest point on the path → along (0..1) and signed offset.
        let bestD = 1e18;
        let bestK = 0;
        for (let k = 0; k < NPATH; k += 2) {
          const d2 = (path[k][0] - x) ** 2 + (path[k][1] - y) ** 2;
          if (d2 < bestD) {
            bestD = d2;
            bestK = k;
          }
        }
        for (let k = Math.max(0, bestK - 2); k <= Math.min(NPATH - 1, bestK + 2); k++) {
          const d2 = (path[k][0] - x) ** 2 + (path[k][1] - y) ** 2;
          if (d2 < bestD) {
            bestD = d2;
            bestK = k;
          }
        }
        const [tx, ty] = tang[bestK];
        const dx = x - path[bestK][0];
        const dy = y - path[bestK][1];
        const proj = dx * tx + dy * ty;
        // A projection far from the nearest sample means the mapping jumps (inside a bend):
        // not part of the flame.
        if (bestK > 0 && bestK < NPATH - 1 && Math.abs(proj) > segLen * 1.5) {
          d[i + 3] = 0;
          continue;
        }
        const alongPx = bestK * segLen + proj;
        const off = dx * -ty + dy * tx; // signed distance across the stream
        const up = alongPx / (fireLen * (0.2 + 0.8 * ignite));
        const u = off / fireHalf;
        if (up < -0.2 || up > 1.02 || Math.abs(u) > 1.35) {
          d[i + 3] = 0;
          continue;
        }
        const upc = Math.max(0, up);
        const warp = fbm2(n2, u * 2.1, upc * 2.6 - TT * 1.9, 2) * (0.2 + 0.85 * upc);
        const uw = u + warp;
        // Three unequal tongues across the stream, plus a broad body near the source.
        let e = -1;
        // One body that splits into two unequal tips (and occasionally a third), whose positions
        // drift so they merge and separate rather than running in parallel.
        for (let k = 0; k < 3; k++) {
          const cu = [-0.3, 0.32, 0.05][k] + 0.35 * n2(k * 2.2 + 9, TT * 0.55) * upc;
          const hk = [1, 0.72, 0.45][k] * (0.62 + 0.38 * (0.5 + 0.5 * n2(k * 5.3, TT * 1.3)));
          if (upc > hk) continue;
          const w = [0.5, 0.44, 0.34][k] * Math.pow(1 - upc / hk, 0.75);
          e = Math.max(e, (1 - Math.abs(uw - cu) / (w + 1e-3)) * (0.7 + 0.3 * (1 - upc / hk)));
        }
        const across = Math.abs(uw) / (1.0 - 0.6 * Math.min(1, upc / 0.3));
        e = Math.max(e, Math.max(0, 1 - across * across) * Math.max(0, 1 - upc / 0.3) * 0.9);
        // Rounded source: behind the start of the path the flame closes in a cap.
        if (alongPx < 0) e = Math.min(e, 0.9 - Math.hypot(u, alongPx / (fireHalf * 0.7)));
        if (e < -0.02) {
          d[i + 3] = 0;
          continue;
        }
        const turb = fbm2(n2, uw * 2.4 + 50, upc * 3.1 - TT * 2.3, 3);
        // Erosion only carves into the body; it never grows detached fragments outside it.
        let temp = e + Math.min(turb, 0.12) * (0.28 + 0.3 * upc) - upc * 0.24;
        temp += smooth(0.02, 0.12, upc) * (1 - Math.min(1, upc * 3)) * 0.18;
        temp *= mix(0.55, 1, smooth(0, 0.08, upc));
        temp *= mix(0.45, 1, coolAt[bestK]); // water passing nearby cools the flame
        temp *= 1 - smooth(0.85, 1.3, Math.abs(u)); // fade before the band limit: no hard edge

        temp = clamp(temp * 1.05);
        const li = (temp * 255) | 0;
        d[i] = LUT[li * 4];
        d[i + 1] = LUT[li * 4 + 1];
        d[i + 2] = LUT[li * 4 + 2];
        d[i + 3] = LUT[li * 4 + 3];
      }
    }
    bctx.putImageData(img, 0, 0);
  }

  const layer: Layer = {
    step(dt, t) {
      clock = t;
      // Air.
      const wantAir = Math.floor(nAir * smooth(0, 900, since(T.air)));
      while (tracers.length < wantAir) tracers.push(spawnTracer());
      for (const p of tracers) {
        p.age += dt;
        const [u, v] = flow(p.x, p.y);
        p.x += u * dt;
        p.y += v * dt;
        p.trail.push(p.x, p.y);
        if (p.trail.length > TRAIL * 2) p.trail.splice(0, 2);
        if (p.age > p.life) Object.assign(p, spawnTracer());
      }
      // Water: heads move with the flow (deflected by the crescent); the chain follows.
      if (since(T.water) > 0) {
        for (const rb of ribbons) {
          const h = rb.pts[0];
          let [u, v] = flow(h[0], h[1]);
          const pr = polar(h[0], h[1]);
          // Earth diverts water: pushed outwards when it nears the crescent.
          const inArc = pr.a > arcFrom - 0.2 && pr.a < arcTo + 0.2;
          if (inArc && pr.r < ringR + ringT * 3.2 && since(T.earth) > 400) {
            const push = 0.05 * (1 - (pr.r - ringR) / (ringT * 3.2));
            u += Math.cos(pr.a) * push;
            v += Math.sin(pr.a) * push * ecc;
          }
          // Keep each ribbon near its own orbit.
          const back = (rb.r0 - pr.r) * 0.00012 * dt;
          const speed = 1 + 0.35 * Math.sin(t * 0.0007 + rb.phase);
          h[0] += (u * speed) * dt + Math.cos(pr.a) * back;
          h[1] += (v * speed) * dt + Math.sin(pr.a) * back * ecc;
          for (let i = 1; i < rb.pts.length; i++) {
            const a = rb.pts[i - 1];
            const b = rb.pts[i];
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const dd = Math.hypot(dx, dy) || 1;
            if (dd > segLen) {
              b[0] = a[0] + (dx / dd) * segLen;
              b[1] = a[1] + (dy / dd) * segLen;
            }
          }
        }
      }
      // Earth: grains released over time, carried by the flow, then condensing onto the crescent.
      if (since(T.earth) > 0) {
        const want = Math.floor(nGrain * smooth(0, 1100, since(T.earth)));
        while (grains.length < want) grains.push(spawnGrain(t));
        for (const g of grains) {
          if (g.stuck) continue;
          const [u, v] = flow(g.x, g.y);
          const [tx, ty] = fromPolar(g.rr, g.a);
          const age = t - g.born;
          const pull = smooth(300, 1400, age); // at first carried, then drawn to its place
          g.vx = mix(u, (tx - g.x) * 0.004, pull);
          g.vy = mix(v, (ty - g.y) * 0.004, pull);
          g.x += g.vx * dt;
          g.y += g.vy * dt;
          if (age > 1800 && Math.hypot(tx - g.x, ty - g.y) < 1) g.stuck = true;
        }
      }
      // Steam where water crosses the fire.
      if (since(T.fire) > 400 && rand() < dt * 0.03) {
        const k = Math.floor(rand() * NPATH * 0.8);
        if (coolAt[k] < 0.6) {
          const [x, y] = path[k];
          steam.push({ x: x + (rand() - 0.5) * fireHalf, y, vx: (rand() - 0.5) * 0.02, vy: -0.02 - rand() * 0.02, age: 0, life: 900 + rand() * 700 });
        }
      }
      for (const s of steam) {
        s.age += dt;
        const [u, v] = flow(s.x, s.y);
        s.x += (u * 0.6 + s.vx) * dt;
        s.y += (v * 0.6 + s.vy) * dt;
      }
      for (let i = steam.length - 1; i >= 0; i--) if (steam[i].age > steam[i].life) steam.splice(i, 1);
    },
    finish() {
      settled = true;
      while (tracers.length < nAir) tracers.push(spawnTracer());
      while (grains.length < nGrain) grains.push(spawnGrain(clock - 5000));
      for (const g of grains) {
        [g.x, g.y] = fromPolar(g.rr, g.a);
        g.stuck = true;
      }
    },
    render(ctx) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Air: pale streamlines.
      for (const p of tracers) {
        const n = p.trail.length / 2;
        if (n < 3) continue;
        const life = Math.min(1, p.age / 500) * Math.min(1, (p.life - p.age) / 600);
        for (let c = 0; c < 4; c++) {
          const i0 = Math.floor(((n - 1) * c) / 4);
          const i1 = Math.floor(((n - 1) * (c + 1)) / 4);
          const a = life * ((c + 1) / 4) ** 1.4 * 0.36 * edgeFade(f, p.trail[i1 * 2], p.trail[i1 * 2 + 1], 0.08, 0.08);
          if (a < 0.01) continue;
          ctx.strokeStyle = `rgba(214,224,238,${a.toFixed(3)})`;
          ctx.lineWidth = p.w * mix(0.5, 1, (c + 1) / 4);
          ctx.beginPath();
          ctx.moveTo(p.trail[i0 * 2], p.trail[i0 * 2 + 1]);
          for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(p.trail[i * 2], p.trail[i * 2 + 1]);
          ctx.stroke();
        }
      }
      // Water: tapered translucent bands with a specular crest.
      const wIn = smooth(0, 900, since(T.water));
      if (wIn > 0) {
        for (const rb of ribbons) {
          const pts = rb.pts;
          const left: [number, number][] = [];
          const right: [number, number][] = [];
          for (let i = 0; i < pts.length; i++) {
            const a = pts[Math.max(0, i - 1)];
            const b = pts[Math.min(pts.length - 1, i + 1)];
            let nx = -(b[1] - a[1]);
            let ny = b[0] - a[0];
            const nl = Math.hypot(nx, ny) || 1;
            nx /= nl;
            ny /= nl;
            const k = i / (pts.length - 1);
            const w = rb.width * Math.sin(Math.PI * Math.min(1, k * 1.1)) ** 0.8 * (0.85 + 0.15 * Math.sin(k * 9 + clock * 0.003 + rb.phase));
            left.push([pts[i][0] + nx * w, pts[i][1] + ny * w]);
            right.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
          }
          const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts.at(-1)![0], pts.at(-1)![1]);
          g.addColorStop(0, `rgba(128,184,212,${(0.5 * wIn).toFixed(3)})`);
          g.addColorStop(1, 'rgba(90,140,176,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          left.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
          ctx.closePath();
          ctx.fill();
          // Specular crest: broken glints along one edge.
          for (let i = 1; i < pts.length - 1; i += 2) {
            const s = n2(i * 0.35 + rb.phase, clock * 0.0015);
            if (s < 0.1) continue;
            const k = i / (pts.length - 1);
            ctx.strokeStyle = `rgba(222,240,248,${(clamp(s * 1.4) * 0.8 * (1 - k) * wIn).toFixed(3)})`;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            const [ax, ay] = left[i];
            const [bx, by] = left[i + 1];
            ctx.moveTo(mix(ax, pts[i][0], 0.35), mix(ay, pts[i][1], 0.35));
            ctx.lineTo(mix(bx, pts[i + 1][0], 0.35), mix(by, pts[i + 1][1], 0.35));
            ctx.stroke();
          }
        }
      }
      // Earth: grains, warmed near the fire.
      const fireOn = smooth(0, 1200, since(T.fire));
      for (const g of grains) {
        const [r0, g0, b0] = GRAIN_TONES[g.tone];
        const pr = polar(g.x, g.y);
        let near = 1e9;
        for (let k = 0; k < NPATH; k += 4) near = Math.min(near, (path[k][0] - g.x) ** 2 + (path[k][1] - g.y) ** 2);
        const heat = fireOn * (1 - smooth(R * 0.05, R * 0.3, Math.sqrt(near)));
        void pr;
        const r = mix(r0, 236, heat * 0.75);
        const gg = mix(g0, 142, heat * 0.75);
        const b = mix(b0, 72, heat * 0.75);
        ctx.fillStyle = `rgba(${r | 0},${gg | 0},${b | 0},${g.stuck ? 0.95 : 0.75})`;
        // Angular chips rather than square dots.
        const s2 = g.size;
        ctx.beginPath();
        ctx.moveTo(g.x, g.y - s2 * 0.6);
        ctx.lineTo(g.x + s2 * 0.7, g.y + s2 * 0.1);
        ctx.lineTo(g.x + s2 * 0.1, g.y + s2 * 0.7);
        ctx.lineTo(g.x - s2 * 0.6, g.y + s2 * 0.2);
        ctx.closePath();
        ctx.fill();
      }
      // Fire.
      if (since(T.fire) > 0) {
        fireField();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(buf, bx0, by0, bx1 - bx0, by1 - by0);
      }
      // Steam.
      for (const s of steam) {
        const a = 0.22 * Math.sin((s.age / s.life) * Math.PI);
        ctx.fillStyle = `rgba(226,230,236,${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.6 + (s.age / s.life) * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  };
  setupFire();
  return sceneFromLayers([layer], 3400, 1e9);
};
