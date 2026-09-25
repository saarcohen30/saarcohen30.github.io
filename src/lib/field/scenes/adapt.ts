// Scene C — Adapt: learning under uncertainty.
// A network starts uncertain (grey nodes, dashed edges). A few informed nodes send signals along
// the edges; a neighbour adopts what it hears when the feedback is consistent with what it
// observes, and cuts the link when it is not. Structure emerges and the network regroups.
import { PALETTE, INK, mulberry32, unitFor, spring, ping, easeInOut, type SceneFactory, type Hoverable } from '../core';

interface Node {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hx: number;
  hy: number;
  truth: number;
  label: number;
  learnedAt: number;
  appearAt: number;
  alpha: number;
}
interface Edge {
  a: number;
  b: number;
  state: 'open' | 'kept' | 'cut';
  changedAt: number;
}
interface Signal {
  edge: number;
  from: number;
  to: number;
  label: number;
  t: number;
}

const HOP = 360;

export const createAdapt: SceneFactory = (o) => {
  const rand = mulberry32((o.seed ?? 30) + 23);
  const unit = unitFor(o);
  const f = o.field;
  const introMs = 2800;
  const K = o.layout === 'side' ? 4 : 3;
  const n = Math.round(Math.max(24, Math.min(o.layout === 'side' ? 58 : 34, o.density * 0.8)));
  let clock = 0;

  // Community centres spread over the field.
  const centres = Array.from({ length: K }, (_, k) => {
    const u = (k + 0.5) / K;
    return o.layout === 'side'
      ? [f.x0 + (f.x1 - f.x0) * (k % 2 ? 0.72 : 0.28), f.y0 + (f.y1 - f.y0) * u]
      : [f.x0 + (f.x1 - f.x0) * u, f.y0 + (f.y1 - f.y0) * (k % 2 ? 0.66 : 0.34)];
  });

  // Nodes: dart-throwing for an even, organic spread.
  const nodes: Node[] = [];
  const minD = Math.sqrt(((f.x1 - f.x0) * (f.y1 - f.y0)) / n) * 0.62;
  for (let tries = 0; nodes.length < n && tries < n * 60; tries++) {
    const x = f.x0 + rand() * (f.x1 - f.x0);
    const y = f.y0 + rand() * (f.y1 - f.y0);
    if (nodes.some((m) => (m.hx - x) ** 2 + (m.hy - y) ** 2 < minD * minD)) continue;
    let truth = 0;
    let bd = Infinity;
    centres.forEach(([cx, cy], k) => {
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bd) [bd, truth] = [d, k];
    });
    nodes.push({ id: nodes.length, x, y, vx: 0, vy: 0, hx: x, hy: y, truth, label: -1, learnedAt: -1, appearAt: 40 + rand() * 520, alpha: 0 });
  }

  // Edges: nearest neighbours, plus a few longer links that will turn out to be wrong.
  const edges: Edge[] = [];
  const has = (a: number, b: number) => edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  for (const m of nodes) {
    const near = nodes
      .filter((q) => q !== m)
      .map((q) => ({ q, d: (q.hx - m.hx) ** 2 + (q.hy - m.hy) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    near.slice(0, rand() < 0.5 ? 2 : 3).forEach(({ q }) => !has(m.id, q.id) && edges.push({ a: m.id, b: q.id, state: 'open', changedAt: 0 }));
  }

  const signals: Signal[] = [];
  const neighbours = (id: number) => edges.map((e, i) => ({ e, i })).filter(({ e }) => (e.a === id || e.b === id) && e.state !== 'cut');

  function learn(node: Node, label: number) {
    node.label = label;
    node.learnedAt = clock;
    for (const { e, i } of neighbours(node.id)) {
      const to = e.a === node.id ? e.b : e.a;
      if (nodes[to].label === -1) signals.push({ edge: i, from: node.id, to, label, t: -(rand() * 140) });
    }
  }

  // Informed seeds: the node nearest each community centre.
  const seedAt = 600;
  const seeds = centres.map(([cx, cy]) => nodes.reduce((b, m) => ((m.hx - cx) ** 2 + (m.hy - cy) ** 2 < (b.hx - cx) ** 2 + (b.hy - cy) ** 2 ? m : b)));
  let seeded = false;

  const centroid = (k: number) => {
    const ms = nodes.filter((m) => m.label === k);
    return ms.length ? [ms.reduce((s, m) => s + m.hx, 0) / ms.length, ms.reduce((s, m) => s + m.hy, 0) / ms.length] : centres[k];
  };

  const step = (dt: number) => {
    clock += dt;
    if (!seeded && clock >= seedAt) {
      seeded = true;
      seeds.forEach((s) => learn(s, s.truth));
    }
    for (let i = signals.length - 1; i >= 0; i--) {
      const s = signals[i];
      s.t += dt;
      if (s.t < HOP) continue;
      signals.splice(i, 1);
      const e = edges[s.edge];
      const to = nodes[s.to];
      // Feedback is consistent with what the receiver observes → adopt; otherwise cut the link.
      if (s.label === to.truth) {
        e.state = 'kept';
        e.changedAt = clock;
        if (to.label === -1) learn(to, s.label);
      } else if (e.state !== 'cut') {
        e.state = 'cut';
        e.changedAt = clock;
      }
    }
    const time = clock / 1000;
    for (const m of nodes) {
      if (clock >= m.appearAt) m.alpha = Math.min(1, m.alpha + dt / 400);
      // Learned nodes drift slightly towards their community: the structure reorganises.
      let tx = m.hx;
      let ty = m.hy;
      if (m.label >= 0) {
        const [cx, cy] = centroid(m.label);
        const k = 0.16 * easeInOut((clock - m.learnedAt) / 1200);
        tx += (cx - m.hx) * k;
        ty += (cy - m.hy) * k;
      }
      spring(m, tx + Math.sin(time * 0.3 + m.id) * unit * 0.25, ty + Math.cos(time * 0.27 + m.id) * unit * 0.25, dt, 0.0011);
    }
  };

  const finish = () => {
    seeded = true;
    signals.length = 0;
    for (const m of nodes) {
      m.label = m.truth;
      m.learnedAt = -5000;
      m.alpha = 1;
    }
    for (const e of edges) {
      e.state = nodes[e.a].truth === nodes[e.b].truth ? 'kept' : 'cut';
      e.changedAt = -5000;
    }
    clock = Math.max(clock, introMs);
    for (const m of nodes) {
      const [cx, cy] = centroid(m.label);
      m.x = m.hx + (cx - m.hx) * 0.16;
      m.y = m.hy + (cy - m.hy) * 0.16;
      m.vx = m.vy = 0;
    }
  };

  const churn = () => {
    // A node forgets and relearns from a neighbour; an old wrong link is occasionally re-tested.
    const learned = nodes.filter((m) => m.label >= 0);
    const m = learned[Math.floor(rand() * learned.length)];
    if (!m) return;
    m.label = -1;
    const nb = neighbours(m.id).find(({ e }) => nodes[e.a === m.id ? e.b : e.a].label >= 0);
    if (nb) {
      const from = nb.e.a === m.id ? nb.e.b : nb.e.a;
      signals.push({ edge: nb.i, from, to: m.id, label: nodes[from].label, t: -500 });
    } else m.label = m.truth;
    if (rand() < 0.5) {
      const cut = edges.map((e, i) => ({ e, i })).filter(({ e }) => e.state === 'cut');
      const pick = cut[Math.floor(rand() * cut.length)];
      if (pick && nodes[pick.e.a].label >= 0) {
        pick.e.state = 'open';
        signals.push({ edge: pick.i, from: pick.e.a, to: pick.e.b, label: nodes[pick.e.a].label, t: -900 });
      }
    }
  };

  const colourOf = (m: Node) => (m.label >= 0 ? PALETTE[m.label % PALETTE.length] : INK);

  const draw: ReturnType<SceneFactory>['draw'] = (p, hot) => {
    for (let k = 0; k < K; k++) {
      const members = nodes.filter((m) => m.label === k);
      if (members.length < 2) continue;
      const cx = members.reduce((s, m) => s + m.x, 0) / members.length;
      const cy = members.reduce((s, m) => s + m.y, 0) / members.length;
      p.halo(cx, cy, unit * (2.2 + Math.sqrt(members.length) * 1.3), PALETTE[k], k === hot ? 0.13 : 0.06);
    }
    for (const e of edges) {
      const a = nodes[e.a];
      const b = nodes[e.b];
      const vis = Math.min(a.alpha, b.alpha);
      if (!vis) continue;
      const since = clock - e.changedAt;
      if (e.state === 'open') p.line(a.x, a.y, b.x, b.y, INK, 0.13 * vis, 1, [2, 4]);
      else if (e.state === 'kept') {
        const c = PALETTE[a.label >= 0 ? a.label % PALETTE.length : 4];
        const fresh = Math.max(0, 1 - since / 800);
        p.line(a.x, a.y, b.x, b.y, c, vis * ((a.label === hot ? 0.5 : 0.28) + fresh * 0.45), 1 + fresh * 0.6);
      } else if (since < 900) p.line(a.x, a.y, b.x, b.y, INK, 0.3 * (1 - since / 900) * vis, 1, [1, 3]);
    }
    for (const s of signals) {
      if (s.t < 0) continue;
      const a = nodes[s.from];
      const b = nodes[s.to];
      const k = easeInOut(s.t / HOP);
      const c = PALETTE[s.label % PALETTE.length];
      const x = a.x + (b.x - a.x) * k;
      const y = a.y + (b.y - a.y) * k;
      p.line(a.x + (b.x - a.x) * Math.max(0, k - 0.25), a.y + (b.y - a.y) * Math.max(0, k - 0.25), x, y, c, 0.75, 1.4);
      p.dot(x, y, 1.9, c, 1);
    }
    for (const m of nodes) {
      if (!m.alpha) continue;
      if (m.label >= 0) ping(p, m.x, m.y, clock - m.learnedAt, unit, colourOf(m));
      p.dot(m.x, m.y, m.label === hot && m.label >= 0 ? 2.9 : 2.3, colourOf(m), m.alpha * (m.label >= 0 ? 0.95 : 0.45));
    }
  };

  return {
    step,
    finish,
    churn,
    draw,
    hoverables: (): Hoverable[] => nodes.filter((m) => m.label >= 0).map((m) => ({ x: m.x, y: m.y, group: m.label, alpha: m.alpha })),
    introMs,
    get clock() {
      return clock;
    },
  };
};
