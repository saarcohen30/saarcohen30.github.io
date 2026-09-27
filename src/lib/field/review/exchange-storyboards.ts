// Safe-AI storyboards (design review only): four STATIC frames per concept, drawn at card size, to
// approve the causal story before any motion is built. See docs/design/exchange-storyboards.md.
//
// Shared vocabulary (each element has one job):
//   attacker  — a warm-edged, angular form (exploratory); its shape is its current strategy
//   defender  — cool, layered arcs facing the attacker (structured, stabilising); shape = its policy
//   pressure  — ONE line between the two roles: taut and bright = adversarial pressure; slack and
//               faint = pressure has collapsed
//   anchor    — a broad, quiet, neutral base beneath both (the frozen shared model); never changes
//   coupled   — one shared translucent body joining both roles; they change as mirror images
//   challenge — one warm arc from attacker to defender; response — one cool arc back
//   ghosts    — faint outlines of the previous shapes, so an update is visible in a still frame
import { clamp } from '../elements/kit';
import { agent, halo, hair, rgba, mixc, PALE, WARM, type RGB } from './d2-protos';
import type { ProtoFactory } from './common';

const COOL: RGB = [150, 182, 222];
const NEUTRAL: RGB = [140, 146, 158];

interface Ctx { ctx: CanvasRenderingContext2D; W: number; H: number; u: number }

function stage({ ctx, W, H }: Ctx) {
  const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.7);
  g.addColorStop(0, 'rgba(80,100,170,0.10)');
  g.addColorStop(1, 'rgba(80,100,170,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
/** Attacker: an angular, faceted form pointing at the defender. `bend` changes its strategy. */
function attacker(c: Ctx, x: number, y: number, bend: number, col: RGB, a: number, ghost = false) {
  const { ctx, u } = c;
  const s = 16 * u;
  const pts: [number, number][] = [
    [x - s * 0.9, y - s * (0.9 + 0.3 * bend)],
    [x + s * (0.7 + 0.25 * bend), y - s * 0.15 * bend],
    [x - s * 0.9, y + s * (0.9 - 0.3 * bend)],
    [x - s * 0.35, y + s * 0.05 * bend],
  ];
  if (!ghost) halo(ctx, x, y, s * 2.6, col, 0.12 * a);
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fillStyle = rgba(col, (ghost ? 0 : 0.12) * a);
  ctx.fill();
  ctx.strokeStyle = rgba(col, (ghost ? 0.25 : 0.85) * a);
  ctx.lineWidth = (ghost ? 0.7 : 1.3) * u;
  ctx.setLineDash(ghost ? [2 * u, 2 * u] : []);
  ctx.stroke();
  ctx.setLineDash([]);
}
/** Defender: three layered arcs opening towards the attacker. `shape` changes its policy. */
function defender(c: Ctx, x: number, y: number, shape: number, col: RGB, a: number, lit = 0, ghost = false) {
  const { ctx, u } = c;
  if (!ghost) halo(ctx, x, y, 44 * u, col, (0.1 + 0.2 * lit) * a);
  for (let k = 0; k < 3; k++) {
    const r = (10 + k * 6 + shape * k * 1.5) * u;
    const span = 1.1 + 0.25 * shape - k * 0.12;
    ctx.strokeStyle = rgba(col, (ghost ? 0.22 : 0.55 + 0.35 * lit - k * 0.12) * a);
    ctx.lineWidth = (ghost ? 0.7 : 1.4 - k * 0.25) * u;
    ctx.setLineDash(ghost ? [2 * u, 2 * u] : []);
    ctx.beginPath();
    ctx.arc(x + k * 3 * u, y, r, Math.PI - span, Math.PI + span);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}
/** The pressure line between the roles: tension 1 = taut and bright, 0 = slack and faint. */
function pressure(c: Ctx, x0: number, x1: number, y: number, tension: number) {
  const { ctx, u, H } = c;
  const sag = (1 - tension) * H * 0.16;
  ctx.strokeStyle = rgba(mixc(NEUTRAL, PALE, tension), 0.12 + 0.55 * tension);
  ctx.lineWidth = (0.6 + 0.9 * tension) * u;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.quadraticCurveTo((x0 + x1) / 2, y + sag, x1, y);
  ctx.stroke();
}
/** One arc from a to b; `reach` 0..1 draws part of it (a challenge or a response). */
function arc(c: Ctx, x0: number, y0: number, x1: number, y1: number, lift: number, reach: number, col: RGB, a: number, w = 1.6) {
  const { ctx, u } = c;
  const cx = (x0 + x1) / 2;
  const cy = Math.min(y0, y1) - lift;
  ctx.strokeStyle = rgba(col, a);
  ctx.lineWidth = w * u;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  const n = 24;
  let hx = x0;
  let hy = y0;
  for (let i = 1; i <= n * clamp(reach); i++) {
    const t = i / n;
    hx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
    hy = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
    ctx.lineTo(hx, hy);
  }
  ctx.stroke();
  agent(ctx, hx, hy, 2.2 * u, col, a);
}
/** The frozen shared anchor: a broad, low, quiet base beneath both roles. */
function anchor(c: Ctx, a = 1) {
  const { ctx, W, H, u } = c;
  const y = H * 0.84;
  const g = ctx.createLinearGradient(0, y - 10 * u, 0, y + 10 * u);
  g.addColorStop(0, rgba(NEUTRAL, 0.2 * a));
  g.addColorStop(1, rgba(NEUTRAL, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(W * 0.14, y + 8 * u);
  ctx.quadraticCurveTo(W * 0.5, y - 16 * u, W * 0.86, y + 8 * u);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba(NEUTRAL, 0.45 * a);
  ctx.lineWidth = 1.1 * u;
  ctx.beginPath();
  ctx.moveTo(W * 0.14, y + 8 * u);
  ctx.quadraticCurveTo(W * 0.5, y - 16 * u, W * 0.86, y + 8 * u);
  ctx.stroke();
  // Each role rests on the anchor through its own short stem (its own adaptation).
  hair(ctx, W * 0.26, y - 2 * u, W * 0.26, H * 0.62, NEUTRAL, 0.3 * a, 0.9 * u);
  hair(ctx, W * 0.74, y - 2 * u, W * 0.74, H * 0.62, NEUTRAL, 0.3 * a, 0.9 * u);
}
/** Coupled: one shared translucent body joining both roles (they are the same trainable model). */
function coupled(c: Ctx, a = 1) {
  const { ctx, W, H } = c;
  ctx.save();
  ctx.translate(W / 2, H * 0.48);
  ctx.scale(1, 0.34);
  halo(ctx, 0, 0, W * 0.34, NEUTRAL, 0.2 * a);
  ctx.restore();
}

type Frame = (c: Ctx) => void;
function board(frames: Frame[]): ProtoFactory {
  return (W, H) => ({
    step() {},
    render(ctx, t) {
      const c: Ctx = { ctx, W, H, u: Math.max(0.75, Math.min(W, H) / 170) };
      stage(c);
      frames[clamp(Math.round(t / 1000), 0, frames.length - 1)](c);
    },
  });
}

// Positions used by every board.
const AX = 0.26;
const DX = 0.74;
const Y = 0.46;

// D · Mirror → separation.
const mirrorCoupled: Frame = (c) => {
  const { W, H } = c;
  coupled(c);
  attacker(c, W * AX, H * Y, 0.4, mixc(WARM, NEUTRAL, 0.3), 1);
  defender(c, W * DX, H * Y, 0.4, mixc(COOL, NEUTRAL, 0.3), 1);
  pressure(c, W * (AX + 0.07), W * (DX - 0.08), H * Y, 0.85);
  arc(c, W * (AX + 0.07), H * Y, W * (DX - 0.1), H * Y, H * 0.12, 0.55, WARM, 0.8);
};
const mirrorCollapse: Frame = (c) => {
  const { W, H } = c;
  coupled(c, 1.2);
  attacker(c, W * AX, H * Y, 0.4, NEUTRAL, 0.35, true);
  defender(c, W * DX, H * Y, 0.4, NEUTRAL, 0.35, 0, true);
  // After coupled updates: the two roles have become mirror images of each other, in the same grey.
  attacker(c, W * (AX + 0.04), H * Y, 0, mixc(WARM, NEUTRAL, 0.75), 0.9);
  defender(c, W * (DX - 0.04), H * Y, 0, mixc(COOL, NEUTRAL, 0.75), 0.9);
  pressure(c, W * (AX + 0.11), W * (DX - 0.12), H * Y, 0.08);
  // The challenge curls back on itself: it avoids what the defender already refuses.
  arc(c, W * (AX + 0.11), H * Y, W * 0.44, H * Y + 2, H * 0.1, 1, mixc(WARM, NEUTRAL, 0.6), 0.5, 1.1);
};
const mirrorSeparate: Frame = (c) => {
  const { W, H } = c;
  anchor(c);
  attacker(c, W * AX, H * Y, 0.3, WARM, 1);
  defender(c, W * DX, H * Y, 0.6, COOL, 1);
  pressure(c, W * (AX + 0.07), W * (DX - 0.08), H * Y, 0.7);
};
const mirrorSustained: Frame = (c) => {
  const { W, H } = c;
  anchor(c);
  attacker(c, W * AX, H * Y, 0.3, WARM, 0.5, true);
  defender(c, W * DX, H * Y, 0.6, COOL, 0.5, 0, true);
  attacker(c, W * AX, H * Y, 0.9, WARM, 1);
  defender(c, W * DX, H * Y, 1.1, COOL, 1, 0.8);
  pressure(c, W * (AX + 0.07), W * (DX - 0.08), H * Y, 1);
  arc(c, W * (AX + 0.07), H * Y, W * (DX - 0.1), H * Y, H * 0.16, 1, WARM, 0.95, 1.8);
};

// F · Shared core, independent adaptations.
const coreRest: Frame = (c) => {
  const { W, H } = c;
  anchor(c);
  attacker(c, W * AX, H * Y, 0.3, WARM, 1);
  defender(c, W * DX, H * Y, 0.5, COOL, 1);
};
const coreInteract: Frame = (c) => {
  coreRest(c);
  const { W, H } = c;
  arc(c, W * (AX + 0.07), H * Y, W * (DX - 0.1), H * Y, H * 0.14, 1, WARM, 0.9);
};
const coreAdapt: Frame = (c) => {
  const { W, H } = c;
  anchor(c);
  attacker(c, W * AX, H * Y, 0.3, WARM, 0.55, true);
  defender(c, W * DX, H * Y, 0.5, COOL, 0.55, 0, true);
  attacker(c, W * AX, H * Y, -0.5, WARM, 1);
  defender(c, W * DX, H * Y, 1.2, COOL, 1, 0.4);
};
const coreNext: Frame = (c) => {
  const { W, H } = c;
  anchor(c);
  attacker(c, W * AX, H * Y, -0.5, WARM, 1);
  defender(c, W * DX, H * Y, 1.2, COOL, 1, 0.6);
  arc(c, W * (AX + 0.07), H * Y + 4, W * (DX - 0.1), H * Y + 6, H * 0.06, 1, WARM, 0.95, 1.8);
};

// G · Adversarial game rounds.
const gChallenge: Frame = (c) => {
  const { W, H } = c;
  attacker(c, W * AX, H * Y, 0.2, WARM, 1);
  defender(c, W * DX, H * Y, 0.4, COOL, 1);
  arc(c, W * (AX + 0.07), H * Y, W * (DX - 0.1), H * Y, H * 0.14, 0.7, WARM, 0.9);
};
const gResponse: Frame = (c) => {
  const { W, H } = c;
  attacker(c, W * AX, H * Y, 0.2, WARM, 1);
  defender(c, W * DX, H * Y, 0.4, COOL, 1, 1);
  arc(c, W * (AX + 0.07), H * Y, W * (DX - 0.1), H * Y, H * 0.14, 1, WARM, 0.35);
  arc(c, W * (DX - 0.1), H * Y + 6, W * (AX + 0.07), H * Y + 6, -H * 0.14, 0.8, COOL, 0.9);
};
const gUpdate: Frame = (c) => {
  const { W, H } = c;
  attacker(c, W * AX, H * Y, 0.2, WARM, 0.5, true);
  defender(c, W * DX, H * Y, 0.4, COOL, 0.5, 0, true);
  attacker(c, W * AX, H * Y, 0.8, WARM, 1);
  defender(c, W * DX, H * Y, 0.9, COOL, 1, 0.3);
  // The outcome of the round: defended (a cool mark at the defender).
  halo(c.ctx, W * (DX - 0.1), H * Y, 14 * c.u, COOL, 0.5);
};
const gStronger: Frame = (c) => {
  const { W, H } = c;
  attacker(c, W * AX, H * Y, 0.8, WARM, 1);
  defender(c, W * DX, H * Y, 0.9, COOL, 1, 0.5);
  arc(c, W * (AX + 0.07), H * Y - 3, W * (DX - 0.07), H * Y - 2, H * 0.22, 1, WARM, 1, 2.1);
};

// H · Hybrid (D + G): the paper's story, then the loop it enables.
const hCoupled: Frame = (c) => mirrorCollapse(c);
const hSeparate: Frame = (c) => mirrorSeparate(c);
const hRound: Frame = (c) => {
  const { W, H } = c;
  anchor(c);
  attacker(c, W * AX, H * Y, 0.3, WARM, 1);
  defender(c, W * DX, H * Y, 0.6, COOL, 1, 0.9);
  pressure(c, W * (AX + 0.07), W * (DX - 0.08), H * Y, 0.85);
  arc(c, W * (AX + 0.07), H * Y, W * (DX - 0.1), H * Y, H * 0.14, 1, WARM, 0.45);
  arc(c, W * (DX - 0.1), H * Y + 6, W * (AX + 0.07), H * Y + 6, -H * 0.12, 0.85, COOL, 0.9);
};
const hStronger: Frame = (c) => mirrorSustained(c);

export const STORYBOARDS = [
  {
    key: 'hybrid',
    title: 'H · Mirror, separation, rounds (D + G)',
    frames: ['Coupled: one shared body; the roles have become mirror images; the pressure line has gone slack; the challenge curls back', 'Separation: a quiet anchor beneath; two distinct roles on their own stems; pressure returns', 'A round: challenge, then the defender answers', 'Both updated differently (ghosts show before); a stronger challenge; pressure sustained'],
    make: board([hCoupled, hSeparate, hRound, hStronger]),
  },
  {
    key: 'mirror',
    title: 'D · Mirror → separation',
    frames: ['Coupled roles on one shared body, with a live challenge and taut pressure', 'Coupled updates make them mirror images; pressure slackens; the challenge curls back', 'Separation onto a quiet anchor; distinct roles; pressure returns', 'Separate updates; a strong challenge; pressure sustained'],
    make: board([mirrorCoupled, mirrorCollapse, mirrorSeparate, mirrorSustained]),
  },
  {
    key: 'core',
    title: 'F · Shared core, independent adaptations',
    frames: ['A quiet shared base with two distinct roles', 'An interaction between the roles; the base does not change', 'Each role adapts its own way (ghosts show before); the base is unchanged', 'The next interaction, between the new shapes'],
    make: board([coreRest, coreInteract, coreAdapt, coreNext]),
  },
  {
    key: 'rounds',
    title: 'G · Adversarial rounds',
    frames: ['Challenge: the attacker sends one probe', 'Response: the defender lights and answers', 'Outcome (defended) and both update (ghosts show before)', 'A stronger challenge in the next round'],
    make: board([gChallenge, gResponse, gUpdate, gStronger]),
  },
];
