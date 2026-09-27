// Canvas implementation of the shared Painter.
import type { Painter } from './core';

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
};

export function canvasPainter(ctx: CanvasRenderingContext2D): Painter {
  const stroke = (colour: string, a: number, w = 1, dash?: number[]) => {
    ctx.strokeStyle = rgba(colour, a);
    ctx.lineWidth = w;
    ctx.setLineDash(dash ?? []);
  };
  return {
    halo(x, y, r, colour, a) {
      if (a <= 0.002) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(colour, a));
      g.addColorStop(1, rgba(colour, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    },
    line(x1, y1, x2, y2, colour, a, w, dash) {
      if (a <= 0.002) return;
      stroke(colour, a, w, dash);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    },
    curve(x1, y1, cx, cy, x2, y2, colour, a, w, dash) {
      if (a <= 0.002) return;
      stroke(colour, a, w, dash);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cx, cy, x2, y2);
      ctx.stroke();
    },
    dot(x, y, r, colour, a) {
      if (a <= 0.002) return;
      ctx.fillStyle = rgba(colour, a);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    },
    ring(x, y, r, colour, a, w = 1) {
      if (a <= 0.002) return;
      stroke(colour, a, w);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    },
    square(x, y, s, colour, a) {
      if (a <= 0.002) return;
      ctx.fillStyle = rgba(colour, a);
      ctx.beginPath();
      ctx.roundRect(x - s / 2, y - s / 2, s, s, 1);
      ctx.fill();
    },
    bar(x, y, len, angle, colour, a, thick = 2) {
      if (a <= 0.002) return;
      stroke(colour, a, thick);
      ctx.lineCap = 'round';
      const dx = (Math.cos(angle) * len) / 2;
      const dy = (Math.sin(angle) * len) / 2;
      ctx.beginPath();
      ctx.moveTo(x - dx, y - dy);
      ctx.lineTo(x + dx, y + dy);
      ctx.stroke();
    },
  };
}
