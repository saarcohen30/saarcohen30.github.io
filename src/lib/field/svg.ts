// SVG implementation of the shared Painter, for the build-time still (no-JS, reduced motion).
import type { Painter } from './core';

const f = (n: number) => (Math.round(n * 10) / 10).toString();
const op = (a: number) => (Math.round(Math.max(0, Math.min(1, a)) * 100) / 100).toString();

export function svgPainter() {
  const parts: string[] = [];
  const defs: string[] = [];
  let gradients = 0;
  const dashAttr = (dash?: number[]) => (dash?.length ? ` stroke-dasharray="${dash.join(' ')}"` : '');
  const painter: Painter = {
    halo(x, y, r, colour, a) {
      if (a <= 0.004) return;
      const id = `h${gradients++}`;
      defs.push(`<radialGradient id="${id}"><stop offset="0" stop-color="${colour}" stop-opacity="${op(a)}"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient>`);
      parts.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="url(#${id})"/>`);
    },
    line(x1, y1, x2, y2, colour, a, w = 1, dash) {
      if (a <= 0.01) return;
      parts.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${colour}" stroke-opacity="${op(a)}" stroke-width="${w}"${dashAttr(dash)}/>`);
    },
    curve(x1, y1, cx, cy, x2, y2, colour, a, w = 1, dash) {
      if (a <= 0.01) return;
      parts.push(`<path d="M${f(x1)} ${f(y1)}Q${f(cx)} ${f(cy)} ${f(x2)} ${f(y2)}" fill="none" stroke="${colour}" stroke-opacity="${op(a)}" stroke-width="${w}"${dashAttr(dash)}/>`);
    },
    dot(x, y, r, colour, a) {
      if (a <= 0.01) return;
      parts.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${colour}" fill-opacity="${op(a)}"/>`);
    },
    ring(x, y, r, colour, a, w = 1) {
      if (a <= 0.01) return;
      parts.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="none" stroke="${colour}" stroke-opacity="${op(a)}" stroke-width="${w}"/>`);
    },
    square(x, y, s, colour, a) {
      if (a <= 0.01) return;
      parts.push(`<rect x="${f(x - s / 2)}" y="${f(y - s / 2)}" width="${f(s)}" height="${f(s)}" rx="1" fill="${colour}" fill-opacity="${op(a)}"/>`);
    },
    bar(x, y, len, angle, colour, a, thick = 2) {
      if (a <= 0.01) return;
      const dx = (Math.cos(angle) * len) / 2;
      const dy = (Math.sin(angle) * len) / 2;
      parts.push(`<line x1="${f(x - dx)}" y1="${f(y - dy)}" x2="${f(x + dx)}" y2="${f(y + dy)}" stroke="${colour}" stroke-opacity="${op(a)}" stroke-width="${thick}" stroke-linecap="round"/>`);
    },
  };
  return { painter, toString: () => `<defs>${defs.join('')}</defs>${parts.join('')}` };
}
