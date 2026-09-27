// Coalitions & collective decisions (FROZEN). See docs/design/frozen-scenes.md.

import { clamp, mix } from '../elements/kit';
import { scene, PALE, WARM, TINTS, mixc, ease, halo, agent, hair, type RGB } from './kit';

// ------------------------------------------------------------------ Coalitions
// Agents arrive one at a time. Each pauses, weighs the existing groups (a hairline to each, brighter
// for the group it values more), then joins the one it values most, or starts a new group if none is
// worth joining. Now and then a member reconsiders and moves to a group it prefers; the structure
// settles. Groups are soft shared halos; members orbit loosely inside them.
export const d2Gather = scene((W, H, S, rand) => {
  interface G { x: number; y: number; tint: RGB; members: number }
  interface A { x: number; y: number; fx: number; fy: number; tx: number; ty: number; g: number; phase: 'arrive' | 'weigh' | 'move' | 'in' | 'leave'; t0: number; dur: number; ang: number; rad: number; util: number[]; a: number; flash: number }
  const groups: G[] = [];
  const agents: A[] = [];
  const spots = [
    [0.3, 0.36],
    [0.7, 0.34],
    [0.52, 0.72],
    [0.18, 0.72],
  ];
  const addGroup = (x: number, y: number) => {
    groups.push({ x, y, tint: TINTS[groups.length % TINTS.length], members: 0 });
    return groups.length - 1;
  };
  // Seed: two small groups already present.
  addGroup(W * spots[0][0], H * spots[0][1]);
  addGroup(W * spots[1][0], H * spots[1][1]);
  const slot = (a: A) => {
    const g = groups[a.g];
    const r = (10 + 6 * Math.sqrt(g.members)) * S;
    return [g.x + Math.cos(a.ang) * r * a.rad, g.y + Math.sin(a.ang) * r * a.rad * 0.8];
  };
  addGroup(W * spots[2][0], H * spots[2][1]);
  for (let i = 0; i < 10; i++) {
    const g = i % 3;
    groups[g].members++;
    const a: A = { x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0, g, phase: 'in', t0: 0, dur: 0, ang: rand() * 6.28, rad: 0.3 + rand() * 0.7, util: [], a: 1, flash: 0 };
    [a.x, a.y] = slot(a);
    agents.push(a);
  }
  let nextArrival = 600;
  let nextDeviation = 5200;
  const go = (a: A, phase: A['phase'], tx: number, ty: number, dur: number, t: number) => {
    a.phase = phase;
    a.fx = a.x;
    a.fy = a.y;
    a.tx = tx;
    a.ty = ty;
    a.t0 = t;
    a.dur = dur;
  };
  return {
    step(dt, t) {
      if (t > nextArrival) {
        nextArrival = t + 1700 + rand() * 700;
        const side = rand() < 0.5 ? -0.05 : 1.05;
        const a: A = { x: W * side, y: H * (0.2 + rand() * 0.6), fx: 0, fy: 0, tx: 0, ty: 0, g: -1, phase: 'arrive', t0: 0, dur: 0, ang: rand() * 6.28, rad: 0.3 + rand() * 0.7, util: [], a: 1, flash: 0 };
        go(a, 'arrive', W * (0.38 + rand() * 0.24), H * (0.44 + rand() * 0.14), 900, t);
        agents.push(a);
        // Keep the scene sparse: the oldest member drifts away.
        const inside = agents.filter((x) => x.phase === 'in');
        if (inside.length > 16) {
          const old = inside[0];
          groups[old.g].members--;
          go(old, 'leave', old.x + (old.x < W / 2 ? -1 : 1) * W * 0.5, old.y + (rand() - 0.5) * H * 0.3, 1600, t);
        }
      }
      if (t > nextDeviation) {
        nextDeviation = t + 4200 + rand() * 2500;
        const inside = agents.filter((x) => x.phase === 'in');
        if (inside.length > 3 && groups.length > 1) {
          const a = inside[Math.floor(rand() * inside.length)];
          a.util = groups.map((_, i) => (i === a.g ? 0.4 : rand()));
          groups[a.g].members--;
          a.g = -1;
          go(a, 'weigh', a.x, a.y, 900, t);
        }
      }
      for (const a of agents) {
        const u = clamp((t - a.t0) / a.dur);
        if (a.phase !== 'in') {
          a.x = mix(a.fx, a.tx, ease(u));
          a.y = mix(a.fy, a.ty, ease(u));
        }
        if (u >= 1) {
          if (a.phase === 'arrive') {
            // Utilities are revealed on arrival: how much it values each group.
            a.util = groups.map(() => rand());
            go(a, 'weigh', a.x, a.y, 1000, t);
          } else if (a.phase === 'weigh') {
            let best = a.util.indexOf(Math.max(...a.util));
            if (a.util[best] < 0.35 && groups.length < 4) best = addGroup(W * spots[groups.length][0], H * spots[groups.length][1]);
            a.g = best;
            groups[best].members++;
            const [sx, sy] = slot(a);
            go(a, 'move', sx, sy, 900, t);
          } else if (a.phase === 'move') {
            a.phase = 'in';
            a.flash = 1;
          }
        }
        if (a.phase === 'in') {
          a.ang += dt * 0.00018 * (a.g % 2 ? 1 : -1);
          const [sx, sy] = slot(a);
          a.x += (sx - a.x) * Math.min(1, dt / 500);
          a.y += (sy - a.y) * Math.min(1, dt / 500);
        }
        if (a.phase === 'leave') a.a = 1 - u;
        a.flash *= Math.pow(0.97, dt / 16);
      }
      for (let i = agents.length - 1; i >= 0; i--) if (agents[i].phase === 'leave' && agents[i].a <= 0) agents.splice(i, 1);
      // Groups drift gently and keep apart.
      for (const g of groups) {
        g.x += Math.sin(t * 0.0002 + g.y) * 0.02 * dt * 0.01 * S;
      }
    },
    draw(ctx, t) {
      ctx.globalCompositeOperation = 'lighter';
      for (const g of groups) {
        const r = (30 + 11 * Math.sqrt(g.members)) * S;
        halo(ctx, g.x, g.y, r, g.tint, 0.1 + 0.025 * g.members);
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const a of agents) {
        if (a.phase === 'weigh') {
          const u = clamp((t - a.t0) / a.dur);
          const best = a.util.indexOf(Math.max(...a.util));
          groups.forEach((g, i) => hair(ctx, a.x, a.y, g.x, g.y, i === best && u > 0.6 ? WARM : PALE, (0.08 + 0.45 * a.util[i]) * Math.sin(Math.PI * Math.min(1, u * 1.1))));
        }
      }
      for (const a of agents) {
        const c = a.g >= 0 && a.phase !== 'leave' ? mixc(PALE, groups[a.g].tint, a.phase === 'in' ? 0.75 : 0.3) : PALE;
        agent(ctx, a.x, a.y, 3 * S, a.flash > 0.05 ? mixc(c, WARM, a.flash) : c, 0.92 * a.a);
      }
    },
  };
});

