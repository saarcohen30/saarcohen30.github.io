// Shared art direction for the research illustrations ("What I work on"): palette, stage, halos,
// agents, hairlines, easing, and the scene wrapper (fade-up, settle). Each scene declares its own
// scale so changing one never resizes another. See docs/design/research-scene-briefs.md.
import { mulberry32 } from '../core';
import { smooth, clamp, mix } from '../elements/kit';
import type { Proto, ProtoFactory } from '../review/common';

export type RGB = [number, number, number];
export const PALE: RGB = [210, 220, 236];
export const WARM: RGB = [255, 176, 112];
export const TINTS: RGB[] = [
  [150, 182, 222], // mist blue
  [222, 196, 156], // sand
  [168, 204, 188], // sage
  [196, 178, 216], // dusk
];
export const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a)})`;
export const mixc = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
export const ease = (t: number) => smooth(0, 1, t);

export function stage(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const g = ctx.createRadialGradient(W * 0.6, H * 0.4, 0, W * 0.6, H * 0.4, Math.max(W, H) * 0.7);
  g.addColorStop(0, 'rgba(80,100,170,0.10)');
  g.addColorStop(1, 'rgba(80,100,170,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
export function halo(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: RGB, a: number) {
  if (a <= 0.005 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(c, a));
  g.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
export function agent(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: RGB, a: number) {
  halo(ctx, x, y, r * 4, c, a * 0.28);
  ctx.fillStyle = rgba(c, a);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
export function hair(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, c: RGB, a: number, w = 0.8) {
  if (a <= 0.005) return;
  ctx.strokeStyle = rgba(c, a);
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
/**
 * Scene scale. Each scene declares its own, so changing one never resizes another.
 * LEGACY: the scale the first D2 studies (Gather, Share B, Adapt A0/B, Exchange 0) were approved or
 * reviewed at. CARD: floors the size on small cards (Adapt A1 and later studies were built with it).
 */
export const LEGACY_SCALE = (W: number, H: number) => Math.min(W, H) / 330;
export const CARD_SCALE = (W: number, H: number) => Math.max(0.72, Math.min(W, H) / 300);

/** Wrap a scene: fade up over ~1 s; settle() jumps ahead. */
export function scene(
  init: (W: number, H: number, S: number, rand: () => number) => { step(dt: number, t: number): void; draw(ctx: CanvasRenderingContext2D, t: number): void },
  scale: (W: number, H: number) => number = LEGACY_SCALE,
): ProtoFactory {
  return (W, H, seed = 7) => {
    const S = scale(W, H);
    const s = init(W, H, S, mulberry32(seed));
    let settled = false;
    const p: Proto = {
      step: (dt, t) => s.step(dt, t),
      render(ctx, t) {
        stage(ctx, W, H);
        ctx.save();
        ctx.globalAlpha = settled ? 1 : smooth(0, 1000, t);
        s.draw(ctx, t);
        ctx.restore();
      },
      settle() {
        settled = true;
        for (let k = 0; k < 500; k++) s.step(16, 6000 - (500 - k) * 16);
      },
    };
    return p;
  };
}

