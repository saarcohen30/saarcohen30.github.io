// One shared "pause animations" switch for the home page (WCAG 2.2.2: motion that starts by itself
// and lasts more than five seconds needs a way to pause it). It pauses the hero and the research
// illustrations together; the choice is remembered on this device.
const KEY = 'motion-paused';
let paused = (() => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
})();
const subs = new Set<(p: boolean) => void>();

export const motionPaused = () => paused;
export const onMotionChange = (cb: (p: boolean) => void) => subs.add(cb);

function sync() {
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-motion-toggle]')) {
    b.setAttribute('aria-pressed', String(paused));
    const label = b.querySelector('.mt-label');
    const text = paused ? 'Play animations' : 'Pause animations';
    if (label) label.textContent = text;
    else b.setAttribute('aria-label', text);
    b.title = text;
  }
}
export function setMotionPaused(p: boolean) {
  paused = p;
  try {
    localStorage.setItem(KEY, p ? '1' : '0');
  } catch {}
  sync();
  subs.forEach((f) => f(p));
}
/** Show the controls (only when there is motion to control). */
export function showMotionControls() {
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-motion-toggle]')) {
    if (b.dataset.bound) continue;
    b.dataset.bound = '1';
    b.hidden = false;
    b.addEventListener('click', () => setMotionPaused(!paused));
  }
  sync();
}
