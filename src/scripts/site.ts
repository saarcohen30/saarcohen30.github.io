// Site-wide progressive enhancement. Everything here is optional: without it the
// site is fully readable and navigable.

const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ------------------------------------------------------------------ theme
type Theme = 'system' | 'light' | 'dark';
const ORDER: Theme[] = ['system', 'light', 'dark'];
const LABEL: Record<Theme, string> = { system: 'system', light: 'light', dark: 'dark' };

function currentTheme(): Theme {
  const t = root.dataset.theme;
  return t === 'light' || t === 'dark' ? t : 'system';
}
function applyTheme(t: Theme) {
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
  try {
    if (t === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', t);
  } catch {}
  syncToggle();
}
function syncToggle() {
  const t = currentTheme();
  const next = ORDER[(ORDER.indexOf(t) + 1) % ORDER.length];
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((b) => {
    b.setAttribute('aria-label', `Colour theme: ${LABEL[t]}. Switch to ${LABEL[next]}.`);
    b.title = `Theme: ${LABEL[t]}`;
  });
}
document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((b) =>
  b.addEventListener('click', () => {
    const next = ORDER[(ORDER.indexOf(currentTheme()) + 1) % ORDER.length];
    const swap = () => applyTheme(next);
    // A soft cross-fade between themes where supported.
    if (document.startViewTransition && !reduceMotion.matches) document.startViewTransition(swap);
    else swap();
  }),
);
syncToggle();

// ------------------------------------------------------------------ header
const header = document.querySelector<HTMLElement>('.site-header');
if (header) {
  const onScroll = () => header.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const stage = document.querySelector('[data-stage-root]');
  if (header.hasAttribute('data-stage') && stage) {
    header.classList.add('over-stage');
    new IntersectionObserver(
      ([entry]) => header.classList.toggle('over-stage', entry.isIntersecting),
      { rootMargin: `-${header.offsetHeight}px 0px 0px 0px`, threshold: 0 },
    ).observe(stage);
  }
}

// ------------------------------------------------------------------ disclosure (Abstract / Cite)
document.addEventListener('click', (event) => {
  const btn = (event.target as Element).closest<HTMLButtonElement>('[data-toggle]');
  if (!btn) return;
  const panel = document.getElementById(btn.getAttribute('aria-controls')!);
  if (!panel) return;
  const open = btn.getAttribute('aria-expanded') !== 'true';
  // One drawer per paper at a time keeps the list calm.
  btn
    .closest('[data-pub]')
    ?.querySelectorAll<HTMLButtonElement>('[data-toggle][aria-expanded="true"]')
    .forEach((other) => {
      if (other === btn) return;
      other.setAttribute('aria-expanded', 'false');
      document.getElementById(other.getAttribute('aria-controls')!)?.setAttribute('hidden', '');
    });
  btn.setAttribute('aria-expanded', String(open));
  panel.toggleAttribute('hidden', !open);
});

// ------------------------------------------------------------------ copy to clipboard
document.addEventListener('click', async (event) => {
  const btn = (event.target as Element).closest<HTMLButtonElement>('[data-copy]');
  if (!btn) return;
  const scope = btn.closest('[data-copy-scope]') ?? btn.closest('.cite') ?? document;
  const sources = scope.querySelectorAll<HTMLElement>('[data-copy-source]');
  const source = btn.dataset.copy === 'bibtex' ? sources[1] ?? sources[0] : sources[0];
  if (!source) return;
  const label = btn.querySelector('span');
  const original = label?.textContent ?? '';
  try {
    await navigator.clipboard.writeText(source.textContent!.trim());
    if (label) label.textContent = 'Copied';
    btn.classList.add('is-done');
    announce(`${btn.dataset.copy === 'bibtex' ? 'BibTeX' : 'Citation'} copied to clipboard`);
  } catch {
    // Clipboard blocked: select the text so the visitor can copy it manually.
    const range = document.createRange();
    range.selectNodeContents(source);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
    if (label) label.textContent = 'Press ⌘/Ctrl+C';
  }
  setTimeout(() => {
    if (label) label.textContent = original;
    btn.classList.remove('is-done');
  }, 1800);
});

// ------------------------------------------------------------------ polite announcements
let live: HTMLElement | null = null;
export function announce(message: string) {
  if (!live) {
    live = document.createElement('div');
    live.className = 'visually-hidden';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    document.body.append(live);
  }
  live.textContent = '';
  requestAnimationFrame(() => (live!.textContent = message));
}
