// Heightfield terrain for the Earth prototypes, rendered column by column front-to-back with an
// occlusion buffer ("voxel space"): real relief, depth and occlusion, cheaply. Colour comes from
// caller-supplied shaders: one per ground sample (top surfaces) and one per pixel for steep faces.

export interface Camera {
  horizon: number; // buffer row of the horizon
  height: number; // camera height (world units)
  scale: number; // vertical projection scale (rows per world unit at z = 1)
  zNear: number;
  zFar: number;
  width: number; // half-width of the view at z = 1 (world units)
  steps?: number;
  /** Minimum height step (world units) between samples drawn as a face. */
  faceMin?: number;
}

export type RGBA = [number, number, number, number];

/**
 * `sample(x, z)` gives the ground height at world (x, z). `top(x, z, h, k)` colours a ground sample
 * (k = 0 near … 1 far). `face(x, z, hr, k)` colours a pixel of a steep face at world height `hr`.
 * `hit`, if given, records the world (x, z) seen at each buffer pixel (for pointer picking).
 */
export function renderTerrain(
  img: ImageData,
  cam: Camera,
  sample: (x: number, z: number) => number,
  top: (x: number, z: number, h: number, k: number) => RGBA,
  face: (x: number, z: number, hr: number, k: number) => RGBA,
  hit?: Float32Array,
) {
  const W = img.width;
  const H = img.height;
  const d = img.data;
  d.fill(0);
  const steps = cam.steps ?? 170;
  const ratio = cam.zFar / cam.zNear;
  for (let c = 0; c < W; c++) {
    let yb = H;
    const sx = (c / (W - 1)) * 2 - 1;
    let prevY = H;
    let prevH = 0;
    for (let s = 0; s < steps; s++) {
      const k = s / (steps - 1);
      const z = cam.zNear * Math.pow(ratio, k); // denser sampling near the camera
      const x = sx * cam.width * z;
      const h = sample(x, z);
      const y = Math.floor(cam.horizon + ((cam.height - h) / z) * cam.scale);
      if (y < yb) {
        const t0 = Math.max(0, y);
        const jump = prevY - y;
        const steep = s > 0 && jump > 2 && h - prevH > (cam.faceMin ?? 0.012); // a real step, not a near bump
        const col = top(x, z, h, k);
        for (let r = t0; r < yb && r < H; r++) {
          const i = (r * W + c) * 4;
          let px = col;
          if (steep && r > y + 1) px = face(x, z, cam.height - ((r - cam.horizon) * z) / cam.scale, k);
          d[i] = px[0];
          d[i + 1] = px[1];
          d[i + 2] = px[2];
          d[i + 3] = px[3];
          if (hit) {
            hit[(r * W + c) * 2] = x;
            hit[(r * W + c) * 2 + 1] = z;
          }
        }
        yb = t0;
      }
      prevY = y;
      prevH = h;
      if (yb <= 0) break;
    }
  }
}

/** A low-resolution buffer for terrain, drawn scaled up. */
export function terrainBuffer(w: number, h: number, cell: number) {
  const cols = Math.max(16, Math.round(w / cell));
  const rows = Math.max(16, Math.round(h / cell));
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(cols, rows);
  return {
    cols,
    rows,
    img,
    draw(target: CanvasRenderingContext2D, dw: number, dh: number) {
      ctx.putImageData(img, 0, 0);
      target.imageSmoothingEnabled = true;
      target.imageSmoothingQuality = 'high';
      target.drawImage(canvas, 0, 0, dw, dh);
    },
  };
}

/** Cheap integer hash → [0, 1), for grain and speckle. */
export const hash2 = (x: number, y: number) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
