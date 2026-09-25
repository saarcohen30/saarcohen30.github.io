// Small toolkit for the experimental elemental scenes: gradient noise, curl noise, easing, and a
// "layer" abstraction. Layers draw with their own primitives straight onto the canvas; scenes
// are one layer (Water, Earth, Fire, Air) or several composed (Convergence).
import { mulberry32, type Rect, type Scene, type SceneOptions } from '../core';

/** 3D gradient noise (improved Perlin), range about [-1, 1]. */
export function makeNoise(seed: number) {
  const rand = mulberry32(seed);
  const p = new Uint8Array(512);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + t * (b - a);
  const grad = (h: number, x: number, y: number, z: number) => {
    const g = h & 15;
    const u = g < 8 ? x : y;
    const v = g < 4 ? y : g === 12 || g === 14 ? x : z;
    return ((g & 1) === 0 ? u : -u) + ((g & 2) === 0 ? v : -v);
  };
  return (x: number, y: number, z = 0) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);
    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;
    return lerp(
      lerp(lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u), lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u), lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v),
      w,
    );
  };
}
export type Noise = ReturnType<typeof makeNoise>;

/** Divergence-free 2D velocity from a noise potential (curl noise). */
export function curl(noise: Noise, x: number, y: number, z: number, eps = 0.01): [number, number] {
  const dx = (noise(x, y + eps, z) - noise(x, y - eps, z)) / (2 * eps);
  const dy = (noise(x + eps, y, z) - noise(x - eps, y, z)) / (2 * eps);
  return [dx, -dy];
}

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** 1 inside the rect, fading to 0 over `m` (fraction of size) at the edges. */
export const edgeFade = (r: Rect, x: number, y: number, mx = 0.1, my = 0.1) => {
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  return smooth(r.x0, r.x0 + w * mx, x) * (1 - smooth(r.x1 - w * mx, r.x1, x)) * smooth(r.y0, r.y0 + h * my, y) * (1 - smooth(r.y1 - h * my, r.y1, y));
};

/** "#rrggbb" + alpha → rgba() string. */
export const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${clamp(a).toFixed(3)})`;
};

export interface Layer {
  /** t = ms since the scene began. */
  step(dt: number, t: number): void;
  render(ctx: CanvasRenderingContext2D, t: number): void;
  /** Jump to the settled look. */
  finish?(): void;
  churn?(t: number): void;
  pointer?(x: number, y: number, t: number): void;
}

export interface LayerContext {
  field: Rect;
  width: number;
  height: number;
  mobile: boolean;
  seed: number;
  /** ms after the scene begins at which this layer starts its entrance. */
  delay?: number;
}

export const ctxFrom = (o: SceneOptions, extra: Partial<LayerContext> = {}): LayerContext => ({
  field: o.field,
  width: o.width,
  height: o.height,
  mobile: o.layout === 'top',
  seed: o.seed ?? 30,
  ...extra,
});

/** Wrap layers as a Scene the shared renderer understands. */
export function sceneFromLayers(layers: Layer[], introMs: number, churnEvery = 3200): Scene {
  let clock = 0;
  return {
    introMs,
    churnEvery,
    get clock() {
      return clock;
    },
    step(dt) {
      clock += dt;
      for (const l of layers) l.step(dt, clock);
    },
    finish() {
      clock = Math.max(clock, introMs);
      for (const l of layers) l.finish?.();
    },
    churn() {
      for (const l of layers) l.churn?.(clock);
    },
    render(ctx) {
      for (const l of layers) l.render(ctx, clock);
    },
    pointer(x, y) {
      for (const l of layers) l.pointer?.(x, y, clock);
    },
    draw() {},
    hoverables: () => [],
  };
}
