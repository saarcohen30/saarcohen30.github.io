// Learning in multi-agent systems (FROZEN): Adapt A1. See docs/design/frozen-scenes.md.

import { makeNoise2, clamp, mix } from '../elements/kit';
import { scene, CARD_SCALE, PALE, WARM, TINTS, rgba, mixc, ease, halo, agent, hair, type RGB } from './kit';

// ------------------------------------------------------------------ Learning A1: coalitions learned
// Agents drift slowly. Proximity only creates the OPPORTUNITY to interact: now and then an agent
// sends a signal to a nearby agent. What happens next depends on feedback, not on distance: the
// interaction pays off or it does not (it depends on hidden compatibility the agents do not know).
// Positive feedback strengthens the link; negative feedback weakens it. Strong links draw agents
// gently together; links to agents who drift away fade and disappear; nearby strangers may try a
// tentative link. So coalitions are LEARNED: they emerge, separate, bridge and reconnect over time.
// Occasionally an agent's circumstances change (its hidden type shifts), and it gradually detaches
// and finds a new group.
/** Review-only: coalition sizes, for tuning the study headlessly. */
export const A1_DEBUG = { sizes: [] as number[] };
export const d2AdaptA1 = scene((W, H, S, rand) => {
  const n = makeNoise2(21);
  const N = 20;
  const T = 4;
  // How likely an interaction between two types pays off; types 0 and 1 are partly compatible, so
  // bridges between their groups form and break.
  const P = [
    [0.9, 0.28, 0.08, 0.08],
    [0.28, 0.9, 0.08, 0.08],
    [0.08, 0.08, 0.9, 0.08],
    [0.08, 0.08, 0.08, 0.9],
  ];
  // Memory of bad experiences outlives the link, so agents that did not get on keep some distance.
  const bad = new Map<string, number>();
  interface Ag { x: number; y: number; vx: number; vy: number; type: number; conf: number; pos: number; neg: number; comp: number }
  const ag: Ag[] = Array.from({ length: N }, (_, i) => ({ x: W * (0.1 + rand() * 0.8), y: H * (0.14 + rand() * 0.72), vx: 0, vy: 0, type: i % T, conf: 0, pos: 0, neg: 0, comp: -1 }));
  interface L { w: number; bad: number }
  const links = new Map<string, L>();
  const key = (i: number, j: number) => (i < j ? i * 100 + j : j * 100 + i).toString();
  const d = (i: number, j: number) => Math.hypot(ag[i].x - ag[j].x, ag[i].y - ag[j].y);
  const Rint = Math.min(W, H) * 0.42;
  const rest = Rint * 0.3;
  interface Sig { i: number; j: number; t0: number }
  const sigs: Sig[] = [];
  let next = 400;
  let nextShift = 9000;
  const compTint: RGB[] = [TINTS[0], TINTS[1], TINTS[2], TINTS[3]];
  let comps: { members: number[]; type: number }[] = [];
  const components = () => {
    const parent = ag.map((_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    // A coalition is held together by well-established links; a single newer bridge does not merge two.
    for (const [k, l] of links) if (l.w > 0.6) {
      const a = Math.floor(Number(k) / 100);
      const b = Number(k) % 100;
      parent[find(a)] = find(b);
    }
    const groups = new Map<number, number[]>();
    ag.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
    comps = [...groups.values()].filter((m) => m.length >= 2).map((m) => {
      const counts = [0, 0, 0, 0];
      for (const i of m) counts[ag[i].type]++;
      return { members: m, type: counts.indexOf(Math.max(...counts)) };
    });
    ag.forEach((a) => (a.comp = -1));
    comps.forEach((c, ci) => c.members.forEach((i) => (ag[i].comp = ci)));
    A1_DEBUG.sizes = comps.map((c) => c.members.length).sort((x, y) => y - x);
  };
  const inner = {
    step(dt: number, t: number) {
      // Interaction opportunities: an agent and a neighbour within reach (a few at a time, calmly).
      if (t > next && sigs.length < 6) {
        next = t + 55 + rand() * 40;
        const i = Math.floor(rand() * N);
        const near = ag.map((_, j) => j).filter((j) => j !== i && d(i, j) < Rint);
        if (near.length) {
          // Mostly existing links; sometimes a tentative try with a stranger.
          const linked = near.filter((j) => links.has(key(i, j)));
          const j = linked.length && rand() < 0.7 ? linked[Math.floor(rand() * linked.length)] : near[Math.floor(rand() * near.length)];
          sigs.push({ i, j, t0: t });
        }
      }
      for (let k = sigs.length - 1; k >= 0; k--) {
        const s = sigs[k];
        if (t - s.t0 < 500) continue;
        sigs.splice(k, 1);
        const good = rand() < P[ag[s.i].type][ag[s.j].type];
        const kk = key(s.i, s.j);
        const l = links.get(kk) ?? { w: 0.08, bad: 0 };
        l.w = clamp(l.w + (good ? 0.28 : -0.2));
        if (!good) {
          l.bad = 1;
          bad.set(kk, Math.min(1, (bad.get(kk) ?? 0) + 0.5));
        }
        if (l.w < 0.04) links.delete(kk);
        else links.set(kk, l);
        const b = ag[s.j];
        b.conf = Math.min(1, b.conf + 0.05);
        if (good) b.pos = 1;
        else b.neg = 1;
      }
      if (t > nextShift) {
        nextShift = t + 8000 + rand() * 4000;
        const a = ag[Math.floor(rand() * N)];
        a.type = (a.type + 1 + Math.floor(rand() * (T - 1))) % T;
      }
      for (const [k, v] of bad) {
        const nv = v - dt * 0.00005;
        if (nv <= 0) bad.delete(k);
        else bad.set(k, nv);
      }
      // Links: slow forgetting; links to agents who drift out of reach fade quickly.
      for (const [k, l] of links) {
        const i = Math.floor(Number(k) / 100);
        const j = Number(k) % 100;
        l.w -= dt * 0.000006;
        if (d(i, j) > Rint * 1.5) l.w -= dt * 0.0004;
        l.bad *= Math.pow(0.97, dt / 16);
        if (l.w < 0.03) links.delete(k);
      }
      // Movement: slow wander; strong links attract gently; bad experiences push slightly apart;
      // everyone keeps a little personal space; soft edges.
      // Agents without strong relationships explore more widely; well-connected ones settle.
      const deg = ag.map(() => 0);
      for (const [k, l] of links) if (l.w > 0.36) {
        deg[Math.floor(Number(k) / 100)]++;
        deg[Number(k) % 100]++;
      }
      for (let i = 0; i < N; i++) {
        const a = ag[i];
        const roam = 1 + 3 * (1 - Math.min(1, deg[i] / 2));
        a.vx = a.vx * 0.94 + n(i * 3.1, t * 0.00012) * 0.0012 * S * roam;
        a.vy = a.vy * 0.94 + n(i * 5.3 + 9, t * 0.00012) * 0.0012 * S * roam;
        for (let j = 0; j < N; j++) {
          if (j === i) continue;
          const b = ag[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dd = Math.hypot(dx, dy) + 1;
          const l = links.get(key(i, j));
          let f = 0;
          if (l) f += l.w * 0.0002 * (dd - rest) - l.bad * 0.0005;
          if (dd < rest * 0.8) f -= 0.0015 * (1 - dd / (rest * 0.8));
          const bm = bad.get(key(i, j));
          if (bm && dd < Rint) f -= 0.0003 * bm;
          a.vx += (dx / dd) * f;
          a.vy += (dy / dd) * f;
        }
        const m = Math.min(W, H) * 0.08;
        if (a.x < m) a.vx += 0.002;
        if (a.x > W - m) a.vx -= 0.002;
        if (a.y < m) a.vy += 0.002;
        if (a.y > H - m) a.vy -= 0.002;
        a.x += a.vx * dt;
        a.y += a.vy * dt;
        a.pos *= Math.pow(0.95, dt / 16);
        a.neg *= Math.pow(0.95, dt / 16);
      }
      components();
    },
    draw(ctx: CanvasRenderingContext2D, t: number) {
      // Learned coalitions: a very soft shared halo and a common muted tint (no outlines).
      ctx.globalCompositeOperation = 'lighter';
      for (const c of comps) {
        if (c.members.length < 3) continue;
        const cx = c.members.reduce((s, i) => s + ag[i].x, 0) / c.members.length;
        const cy = c.members.reduce((s, i) => s + ag[i].y, 0) / c.members.length;
        const r = Math.max(...c.members.map((i) => Math.hypot(ag[i].x - cx, ag[i].y - cy))) + 16 * S;
        halo(ctx, cx, cy, r * 1.3, compTint[c.type], 0.09);
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const [k, l] of links) {
        const i = Math.floor(Number(k) / 100);
        const j = Number(k) % 100;
        const strong = l.w > 0.36;
        hair(ctx, ag[i].x, ag[i].y, ag[j].x, ag[j].y, PALE, strong ? 0.12 + 0.5 * l.w : 0.04 + 0.12 * l.w, strong ? (0.6 + 1.1 * l.w) * S : 0.6 * S);
      }
      for (const s of sigs) {
        const u = clamp((t - s.t0) / 500);
        const a = ag[s.i];
        const b = ag[s.j];
        agent(ctx, mix(a.x, b.x, ease(u)), mix(a.y, b.y, ease(u)), 1.3 * S, PALE, 0.85);
      }
      for (const a of ag) {
        const tint = a.comp >= 0 ? compTint[comps[a.comp].type] : PALE;
        const c = mixc([150, 156, 168], tint, a.comp >= 0 ? 0.35 + 0.6 * a.conf : 0.2 * a.conf);
        agent(ctx, a.x, a.y, 2.6 * S, c, 0.6 + 0.35 * a.conf);
        // Feedback: a brief ring (warm = it paid off, cool and dim = it did not).
        if (a.pos > 0.05) {
          ctx.strokeStyle = rgba(WARM, 0.6 * a.pos);
          ctx.lineWidth = 0.9 * S;
          ctx.beginPath();
          ctx.arc(a.x, a.y, (4 + 6 * (1 - a.pos)) * S, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (a.neg > 0.05) {
          ctx.strokeStyle = rgba([120, 140, 170], 0.5 * a.neg);
          ctx.lineWidth = 0.9 * S;
          ctx.beginPath();
          ctx.arc(a.x, a.y, (4 + 3 * (1 - a.neg)) * S, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    },
  };
  // Open in a representative state: some structure already learned, learning still under way.
  const PRE = 12000;
  for (let t = 16; t <= PRE; t += 16) inner.step(16, t);
  return { step: (dt: number, t: number) => inner.step(dt, t + PRE), draw: (ctx: CanvasRenderingContext2D, t: number) => inner.draw(ctx, t + PRE) };
}, CARD_SCALE);

