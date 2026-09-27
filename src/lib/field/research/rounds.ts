// Principled & safe AI: adversarial rounds. A deliberately general picture of adversarial
// interaction between learning systems (red teaming, safety evaluation, self-play, robustness), not
// the mechanism of any one paper. One round at a time, staged:
//   challenge:  the challenger (a warm, angular form) aims at a point on the responder and writes a
//               probe across: a ribbon carrying a short structured pattern of marks
//   response:   the responder (cool, layered arcs that cover one region) takes it in and writes a
//               structured response back
//   outcome:    a probe that lands on the covered region is handled cleanly (a small cool pulse); one
//               that lands at the edge of the cover gets through (a warmer, stronger pulse inside)
//   adaptation: after a difficult round the responder turns its layers towards where it was reached
//               and the challenger only refines; after a clean round the challenger aims somewhere
//               new with a different pattern. Faint dashed outlines keep the previous shapes in view.
// Only one message is in flight at any moment.
import { clamp, mix, smooth } from '../elements/kit';
import { scene, PALE, WARM, rgba, mixc, ease, halo, agent, type RGB } from './kit';

const COOL: RGB = [150, 182, 222];
const ROUND = 4600;
const PROBE = [300, 1400]; // written across
const LIGHT = [1300, 1900]; // responder layers light in turn
const OUTCOME = [1400, 2300]; // pulse where the probe landed
const REPLY = [1800, 2800]; // response written back
const ADAPT = [3000, 4200]; // both move to their new state
const GHOST = 3400; // how long the previous shapes stay visible after an adaptation begins
const SPREAD = 0.85; // radians of the responder's face per unit of aim / cover
const REACH = 0.6; // an aim this far from the cover lands at the edge: a difficult round

/** Card-first scale: sized for the ~270 px research card, with floors for small screens. */
const ROUNDS_SCALE = (W: number, H: number) => Math.max(0.75, Math.min(W, H) / 170);

export const d2Rounds = scene((W, H, u, rand) => {
  const AX = W * 0.2;
  const BX = W * 0.78;
  const Y = H * 0.5;
  const RAD = [20 * u, 28 * u, 36 * u]; // responder layers, inner to outer
  const HALF = 0.62; // half-span of each layer, radians
  const pattern = () => Array.from({ length: 5 }, () => 0.2 + rand() * 0.8);
  // Challenger: aim (where on the responder it probes), bend (its form), pat (its probe).
  // Responder: cover (the region its layers face).
  let aim = 0.1;
  let bend = 0.15;
  let pat = pattern();
  let cover = 0;
  let prev = { aim, bend, cover };
  let adaptT = -1e9; // time the latest adaptation began
  let hard = false;
  let reply = pat;
  let round = -1;
  let adapted = -1;

  const decide = () => {
    hard = Math.abs(aim - cover) > REACH;
    // The response: a structured answer; on a difficult round it echoes more of the probe.
    reply = pat.map((v, i) => (hard ? mix(v, 0.55, 0.35) : 0.3 + 0.12 * Math.sin(i * 1.9 + cover * 4)));
  };
  const adapt = (t: number) => {
    prev = { aim, bend, cover };
    adaptT = t;
    if (hard) {
      // Reached: the responder turns its layers towards where it was reached; the challenger refines.
      cover = clamp(mix(cover, aim, 0.8), -0.75, 0.75);
      aim = clamp(aim + (rand() - 0.5) * 0.3, -1, 1);
      bend = clamp(bend + (rand() - 0.5) * 0.3, -0.8, 0.8);
      pat = pat.map((v) => clamp(v + (rand() - 0.5) * 0.2, 0.2, 1));
    } else {
      // Handled cleanly: the challenger tries something different elsewhere.
      const side = rand() < 0.5 ? -1 : 1;
      let next = cover + side * (0.3 + rand() * 0.85);
      if (Math.abs(next) > 1) next = cover - side * (0.3 + rand() * 0.85);
      aim = clamp(next, -1, 1);
      bend = clamp(-bend * 0.5 + (rand() - 0.5) * 1.2, -0.8, 0.8);
      pat = pattern();
    }
  };

  /** A point on the responder's face at aim a and radius r. */
  const target = (a: number, r: number): [number, number] => {
    const th = Math.PI + a * SPREAD;
    return [BX + Math.cos(th) * r, Y + Math.sin(th) * r];
  };
  /** The challenger's heading towards aim a, and the tip it writes from. */
  const heading = (a: number) => {
    const [tx, ty] = target(a, RAD[2]);
    return Math.atan2(ty - Y, tx - AX);
  };

  // Drawing.
  const challenger = (ctx: CanvasRenderingContext2D, a: number, b: number, alpha: number, glow: number, ghost: boolean) => {
    const phi = heading(a);
    const s = 17 * u;
    const local: [number, number][] = [
      [-s * 0.85, -s * (0.85 + 0.3 * b)],
      [s * (0.75 + 0.2 * b), -s * 0.12 * b],
      [-s * 0.85, s * (0.85 - 0.3 * b)],
      [-s * 0.3, s * 0.06 * b],
    ];
    const c = Math.cos(phi);
    const sn = Math.sin(phi);
    if (!ghost) halo(ctx, AX, Y, s * 2.6, WARM, (0.08 + 0.16 * glow) * alpha);
    ctx.beginPath();
    local.forEach(([x, y], i) => {
      const px = AX + x * c - y * sn;
      const py = Y + x * sn + y * c;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.closePath();
    if (!ghost) {
      ctx.fillStyle = rgba(WARM, (0.1 + 0.1 * glow) * alpha);
      ctx.fill();
    }
    ctx.strokeStyle = rgba(ghost ? PALE : WARM, (ghost ? 0.45 : 0.9) * alpha);
    ctx.lineWidth = (ghost ? 0.9 : 1.5) * u;
    ctx.setLineDash(ghost ? [2.5 * u, 2.5 * u] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  /** lit[k] and the arcs are inner to outer. */
  const responder = (ctx: CanvasRenderingContext2D, cv: number, lit: number[], warmth: number, alpha: number, ghost: boolean) => {
    const mid = Math.PI + cv * SPREAD;
    if (!ghost) halo(ctx, BX, Y, 50 * u, mixc(COOL, WARM, warmth * 0.7), (0.07 + 0.12 * Math.max(...lit) + 0.12 * warmth) * alpha);
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const col = mixc(COOL, WARM, warmth * (0.4 + 0.6 * lit[k]));
      ctx.strokeStyle = rgba(ghost ? PALE : col, (ghost ? 0.42 : 0.62 + 0.38 * lit[k] - (2 - k) * 0.08) * alpha);
      ctx.lineWidth = (ghost ? 1 : 1.4 + k * 0.4) * u;
      ctx.setLineDash(ghost ? [2.5 * u, 2.5 * u] : []);
      ctx.beginPath();
      ctx.arc(BX, Y, RAD[k], mid - HALF + k * 0.04, mid + HALF - k * 0.04);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
  };
  /** A ribbon written from p0 to p1 along a bowed arc, carrying a pattern of marks. */
  const ribbon = (ctx: CanvasRenderingContext2D, p0: [number, number], p1: [number, number], bow: number, k: number, marks: number[], col: RGB, a: number) => {
    if (k <= 0 || a <= 0.01) return;
    const [x0, y0] = p0;
    const [x1, y1] = p1;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const cx = (x0 + x1) / 2 + (dy / len) * bow;
    const cy = (y0 + y1) / 2 - (dx / len) * bow;
    const at = (t: number): [number, number] => [(1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1];
    ctx.strokeStyle = rgba(col, 0.38 * a);
    ctx.lineWidth = 1 * u;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    const n = Math.ceil(40 * k);
    for (let i = 1; i <= n; i++) ctx.lineTo(...at(Math.min(k, i / 40)));
    ctx.stroke();
    // The pattern: marks across the ribbon, spaced along its middle, appearing as it is written.
    ctx.lineCap = 'round';
    marks.forEach((v, i) => {
      const t = 0.28 + (i / (marks.length - 1)) * 0.44;
      if (t > k) return;
      const [x, y] = at(t);
      const [x2, y2] = at(t + 0.01);
      const ang = Math.atan2(y2 - y, x2 - x) + Math.PI / 2;
      const h = (4 + 10 * v) * u;
      ctx.strokeStyle = rgba(col, 0.92 * a);
      ctx.lineWidth = 1.8 * u;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(ang) * h * 0.5, y - Math.sin(ang) * h * 0.5);
      ctx.lineTo(x + Math.cos(ang) * h * 0.5, y + Math.sin(ang) * h * 0.5);
      ctx.stroke();
    });
    ctx.lineCap = 'butt';
    const [hx, hy] = at(k);
    if (k < 1) agent(ctx, hx, hy, 2 * u, col, a);
  };

  return {
    step(_dt, t) {
      const r = Math.floor(t / ROUND);
      if (r !== round) {
        round = r;
        decide();
      }
      if (t - r * ROUND >= ADAPT[0] && adapted !== r) {
        adapted = r;
        adapt(r * ROUND + ADAPT[0]);
      }
    },
    draw(ctx, t) {
      const lt = t - Math.max(0, round) * ROUND;
      const ph = (a: number[]) => clamp((lt - a[0]) / (a[1] - a[0]));
      const since = t - adaptT;
      const m = ease(clamp(since / (ADAPT[1] - ADAPT[0])));
      const ghostA = smooth(0, 300, since) * (1 - smooth(GHOST - 800, GHOST, since));
      const a = mix(prev.aim, aim, m);
      const b = mix(prev.bend, bend, m);
      const cv = mix(prev.cover, cover, m);
      if (ghostA > 0.01) {
        challenger(ctx, prev.aim, prev.bend, ghostA, 0, true);
        responder(ctx, prev.cover, [0, 0, 0], 0, ghostA, true);
      }
      // This round's messages use the aim the round was played with (the adaptation starts after).
      const played = lt < ADAPT[0] ? aim : prev.aim;
      const phi = heading(played);
      const tip: [number, number] = [AX + Math.cos(phi) * 13 * u, Y + Math.sin(phi) * 13 * u];
      const land = target(played, hard ? RAD[0] - 3 * u : RAD[2] + 3 * u);
      const compose = smooth(0, PROBE[0], lt) * (1 - smooth(PROBE[1], PROBE[1] + 400, lt));
      challenger(ctx, a, b, 1, compose, false);
      const lp = ph(LIGHT);
      const fade = 1 - smooth(REPLY[1], ADAPT[0] + 300, lt);
      const lit = [2, 1, 0].map((k) => smooth(k / 3, k / 3 + 0.4, lp) * fade); // outer lights first
      const out = ph(OUTCOME);
      const warmth = hard ? smooth(0, 0.25, out) * (1 - smooth(REPLY[1], ADAPT[1], lt)) : 0;
      responder(ctx, cv, lit, warmth, 1, false);
      // One message in flight at a time: the probe, then the response.
      const probeFade = 1 - smooth(REPLY[0] + 100, REPLY[1] - 100, lt);
      ribbon(ctx, tip, land, H * 0.13, ease(ph(PROBE)), pat, WARM, probeFade);
      const replyFade = 1 - smooth(ADAPT[0] - 200, ADAPT[0] + 700, lt);
      ribbon(ctx, target(played, RAD[2] + 3 * u), [tip[0], tip[1] + 4 * u], H * 0.15, ease(ph(REPLY)), reply, COOL, replyFade);
      // The outcome: a pulse where the probe landed; warmer, larger and inside when it got through.
      if (out > 0 && out < 1) {
        const s = Math.sin(Math.PI * out);
        halo(ctx, land[0], land[1], (hard ? 26 : 12) * u * (0.6 + 0.4 * out), hard ? WARM : COOL, (hard ? 0.55 : 0.35) * s);
      }
    },
  };
}, ROUNDS_SCALE);
