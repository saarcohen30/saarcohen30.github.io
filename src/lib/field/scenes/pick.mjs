// Hero scene choice. These two functions are inlined verbatim into the home page's <head> (so the
// choice is made before first paint) and tested in scripts/test-hero.mjs.

/**
 * Which hero scene to show: the one named in ?scene= if it is valid, otherwise an independent,
 * uniformly random choice on every load (repeats are allowed; nothing is remembered).
 */
export function pickHeroScene(ids, param, random) {
  var forced = ids.indexOf(String(param || '').toLowerCase());
  if (forced >= 0) return { index: forced, forced: true };
  return { index: Math.min(ids.length - 1, Math.floor(random() * ids.length)), forced: false };
}

/**
 * Runs in <head>: pick the scene; decide whether this visit gets the entrance (a first visit, or
 * 12 h since the entrance last played; ?intro=1 with ?scene=; never with reduced motion).
 */
export function heroHead(ids, replayMs) {
  var d = document.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var q = new URLSearchParams(location.search);
  var pick = pickHeroScene(ids, q.get('scene'), Math.random);
  if (pick.forced) {
    if (q.get('intro') === '1' && !reduce) d.classList.add('intro');
  } else if (!reduce) {
    try {
      localStorage.removeItem('scene'); // left over from the old fixed rotation
      var seen = +localStorage.getItem('intro-seen') || 0;
      if (Date.now() - seen > replayMs) {
        d.classList.add('intro');
        localStorage.setItem('intro-seen', String(Date.now()));
      }
    } catch (e) {
      d.classList.add('intro'); // storage unavailable: the entrance is short and skippable
    }
  }
  d.dataset.scene = String(pick.index);
}
