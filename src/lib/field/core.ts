// Shared primitives for the hero's scene family: one visual language (nodes, edges, halos,
// pings, token bars), one palette, one spring model. Scenes only define behaviour.
// Pure and DOM-free, so the same code draws the live canvas and build-time SVG stills.

export const PALETTE = ['#8fa9ff', '#5fd3aa', '#f0b45c', '#e592d8', '#c8d0e0'];
export const INK = '#eeebe4';

export interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface SceneOptions {
  width: number;
  height: number;
  /** Region the scene should occupy (kept clear of the hero text). */
  field: Rect;
  /** Rough number of agents/nodes; scenes scale their own counts from it. */
  density: number;
  seed?: number;
  /** 'side' on wide screens, 'top' on phones. */
  layout: 'side' | 'top';
}

/** Anything a scene exposes for pointer highlighting. */
export interface Hoverable {
  x: number;
  y: number;
  group: number;
  alpha: number;
}

export interface Painter {
  halo(x: number, y: number, r: number, colour: string, a: number): void;
  line(x1: number, y1: number, x2: number, y2: number, colour: string, a: number, w?: number, dash?: number[]): void;
  curve(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, colour: string, a: number, w?: number, dash?: number[]): void;
  dot(x: number, y: number, r: number, colour: string, a: number): void;
  ring(x: number, y: number, r: number, colour: string, a: number, w?: number): void;
  square(x: number, y: number, s: number, colour: string, a: number): void;
  bar(x: number, y: number, len: number, angle: number, colour: string, a: number, thick?: number): void;
}

export interface Scene {
  /** Advance by dt milliseconds. */
  step(dt: number): void;
  /** Jump to the settled state (skip, reduced motion, stills). */
  finish(): void;
  /** Ambient life after the intro; called every few seconds. */
  churn(): void;
  draw(p: Painter, hot: number): void;
  /** Nodes the pointer can "consider" joining. */
  hoverables(): Hoverable[];
  readonly introMs: number;
  readonly clock: number;
  /** Mean ms between ambient `churn` calls (default ≈ 3.9 s). */
  readonly churnEvery?: number;
}

export type SceneFactory = (opts: SceneOptions) => Scene;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const gaussian = (rand: () => number) => () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());

export const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Base length unit for a field: node spacing, halo sizes, etc. */
export const unitFor = (o: SceneOptions) =>
  Math.max(8, Math.min(Math.min(o.width, o.height) * 0.026, (o.field.y1 - o.field.y0) * 0.075));

/** Critically-damped-ish spring used by every scene, so motion feels the same everywhere. */
export function spring(n: { x: number; y: number; vx: number; vy: number }, tx: number, ty: number, dt: number, k = 0.0017) {
  const kk = k * dt;
  const damp = Math.pow(0.86, dt / 16);
  n.vx = (n.vx + (tx - n.x) * kk) * damp;
  n.vy = (n.vy + (ty - n.y) * kk) * damp;
  n.x += n.vx * (dt / 16);
  n.y += n.vy * (dt / 16);
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/** Point on a quadratic Bézier. */
export const bezier = (t: number, a: number, c: number, b: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;

/** Arrival ping drawn by every scene the same way. */
export function ping(p: Painter, x: number, y: number, age: number, unit: number, colour = INK) {
  if (age < 0 || age > 900) return;
  const k = age / 900;
  p.ring(x, y, 3 + k * unit * 1.6, colour, (1 - k) * 0.55);
}
