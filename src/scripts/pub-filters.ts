// Publication filters: type × year × free-text search, faceted counts, URL state,
// animated reflow (View Transitions where available), polite status announcements.
// The page is complete without this script; it only adds filtering.

const form = document.querySelector<HTMLFormElement>('[data-filters]');
const items = [...document.querySelectorAll<HTMLElement>('.results [data-pub]')];
const status = document.querySelector<HTMLElement>('[data-status]');
const clearBtns = document.querySelectorAll<HTMLButtonElement>('[data-clear]');
const empty = document.querySelector<HTMLElement>('[data-empty]');
const q = document.querySelector<HTMLInputElement>('[data-q]');
const pill = document.querySelector<HTMLElement>('[data-to-filters]');
const pillN = document.querySelector<HTMLElement>('[data-active-n]');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

type Facet = 'type' | 'year';
const state = { type: new Set<string>(), year: new Set<string>(), q: '' };
const LABEL: Record<string, string> = {};
document.querySelectorAll<HTMLButtonElement>('[data-facet="type"] .fchip').forEach((b) => {
  LABEL[b.dataset.value!] = b.textContent!.replace(/\d+/g, '').trim();
});

const meta = items.map((el) => ({
  el,
  types: el.dataset.types!.split(' '),
  year: el.dataset.year!,
  text: el.dataset.search ?? '',
}));

function matches(m: (typeof meta)[number], skip?: Facet) {
  if (skip !== 'type' && state.type.size && !m.types.some((t) => state.type.has(t))) return false;
  if (skip !== 'year' && state.year.size && !state.year.has(m.year)) return false;
  if (state.q) {
    for (const token of state.q.split(/\s+/)) if (!m.text.includes(token)) return false;
  }
  return true;
}

const activeCount = () => state.type.size + state.year.size + (state.q ? 1 : 0);

function render({ animate = false } = {}) {
  const apply = () => {
    let shown = 0;
    for (const m of meta) {
      const ok = matches(m);
      m.el.hidden = !ok;
      if (ok) shown++;
    }
    // Hide empty year blocks and groups.
    document.querySelectorAll<HTMLElement>('[data-year-group]').forEach((g) => {
      g.hidden = !g.querySelector('[data-pub]:not([hidden])');
    });
    document.querySelectorAll<HTMLElement>('[data-group]').forEach((g) => {
      g.hidden = !g.querySelector('[data-pub]:not([hidden])');
    });
    if (empty) empty.hidden = shown > 0;

    // Faceted counts: how many results each chip would give with the other filters kept.
    for (const facet of ['type', 'year'] as Facet[]) {
      document.querySelectorAll<HTMLButtonElement>(`[data-facet="${facet}"] .fchip`).forEach((chip) => {
        const v = chip.dataset.value!;
        const n = meta.filter((m) => matches(m, facet) && (facet === 'type' ? m.types.includes(v) : m.year === v)).length;
        chip.querySelector('[data-count]')!.textContent = String(n);
        chip.toggleAttribute('data-zero', n === 0);
        chip.setAttribute('aria-pressed', String(state[facet].has(v)));
      });
    }

    const parts = [
      ...[...state.type].map((t) => LABEL[t]),
      ...[...state.year].sort().reverse(),
      ...(state.q ? [`“${state.q}”`] : []),
    ];
    if (status) {
      status.innerHTML = parts.length
        ? `Showing <b>${shown}</b> of ${meta.length} · ${parts.map(escapeHtml).join(', ')}`
        : `Showing all ${meta.length} papers`;
    }
    const n = activeCount();
    clearBtns.forEach((b) => {
      if (b.closest('[data-empty]')) return;
      b.hidden = n === 0;
    });
    if (pillN) pillN.textContent = n ? String(n) : '';
  };

  if (animate && document.startViewTransition && !reduceMotion.matches) {
    // Name the visible cards so they glide to their new positions.
    meta.forEach((m, i) => (m.el.style.viewTransitionName = m.el.hidden ? '' : `card-${i}`));
    const t = document.startViewTransition(apply);
    t.finished.finally(() => meta.forEach((m) => (m.el.style.viewTransitionName = '')));
  } else apply();
  syncUrl();
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

// ------------------------------------------------------------------ URL <-> state
function syncUrl() {
  const params = new URLSearchParams();
  if (state.type.size) params.set('type', [...state.type].join(','));
  if (state.year.size) params.set('year', [...state.year].join(','));
  if (state.q) params.set('q', state.q);
  const qs = params.toString();
  history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
}
function readUrl() {
  const params = new URLSearchParams(location.search);
  const valid = (facet: Facet) =>
    new Set([...document.querySelectorAll<HTMLButtonElement>(`[data-facet="${facet}"] .fchip`)].map((b) => b.dataset.value!));
  for (const facet of ['type', 'year'] as Facet[]) {
    const ok = valid(facet);
    params
      .get(facet)
      ?.split(',')
      .filter((v) => ok.has(v))
      .forEach((v) => state[facet].add(v));
  }
  state.q = (params.get('q') ?? '').trim().toLowerCase();
  if (q) q.value = params.get('q') ?? '';
}

// ------------------------------------------------------------------ events
form?.addEventListener('click', (e) => {
  const chip = (e.target as Element).closest<HTMLButtonElement>('.fchip');
  if (!chip) return;
  const facet = chip.closest<HTMLElement>('[data-facet]')!.dataset.facet as Facet;
  const v = chip.dataset.value!;
  if (state[facet].has(v)) state[facet].delete(v);
  else state[facet].add(v);
  render({ animate: true });
});

let typing = 0;
q?.addEventListener('input', () => {
  clearTimeout(typing);
  typing = window.setTimeout(() => {
    state.q = q.value.trim().toLowerCase();
    render();
  }, 90);
});
q?.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && q.value) {
    e.stopPropagation();
    q.value = '';
    state.q = '';
    render();
  }
});

clearBtns.forEach((b) =>
  b.addEventListener('click', () => {
    state.type.clear();
    state.year.clear();
    state.q = '';
    if (q) q.value = '';
    render({ animate: true });
    q?.focus({ preventScroll: true });
  }),
);

// "/" focuses search, like many documentation sites.
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target as HTMLElement;
  if (t.closest('input, textarea, [contenteditable]')) return;
  e.preventDefault();
  // Focus on the next frame so the "/" itself is not typed into the field.
  requestAnimationFrame(() => q?.focus());
});

// Phones: a floating "Filters" pill once the filters have scrolled away.
if (pill && form) {
  pill.addEventListener('click', (e) => {
    e.preventDefault();
    form.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => q?.focus({ preventScroll: true }), reduceMotion.matches ? 0 : 450);
  });
  new IntersectionObserver(([entry]) => {
    pill.hidden = entry.isIntersecting || entry.boundingClientRect.top > 0;
  }).observe(form);
}

readUrl();
render();

// A deep link to a paper (#id) should land on it even if filters would hide it.
if (location.hash) {
  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target?.hasAttribute('data-pub') && target.hidden) {
    state.type.clear();
    state.year.clear();
    state.q = '';
    render();
    target.scrollIntoView();
  }
}
