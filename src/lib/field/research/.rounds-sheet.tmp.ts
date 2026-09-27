import { d2Rounds } from './rounds';
(window as any).sheet = (w: number, h: number, dpr: number, times: number[]) => {
  const out: string[] = [];
  const c = document.createElement('canvas');
  c.width = w * dpr; c.height = h * dpr;
  const p = d2Rounds(w * dpr, h * dpr, 7);
  let t = 0;
  const x = c.getContext('2d')!;
  for (const T of times) {
    while (t < T) p.step(16, (t += 16));
    x.fillStyle = '#06070a'; x.fillRect(0, 0, c.width, c.height);
    p.render(x, t);
    out.push(c.toDataURL());
  }
  return out;
};
