// ================================================================
// FRAKT — Mobile Experience
// ================================================================
// Below 768px (or on a mobile user agent) the desktop editor is hidden
// and this lightweight, vertically-scrolling experience is shown instead.
// Sections: (1) auto-cycling hero shader carousel, (2) how-it-works video,
// (3) email-yourself-the-link. The editor never runs on mobile — we only
// reuse the shader mini-renderer (createMiniRenderer) for the hero.
//
// Mobile detection lives in index.html (window.fraktIsMobile) and toggles
// the .frakt-mobile class on <html>; CSS keys off that class. This module
// wires up behaviour and is re-evaluated on resize / orientation change.

// ============================================
// Presets used in the mobile hero shader carousel.
// Filenames must match files in /presets/ exactly.
// ============================================
const MOBILE_HERO_PRESETS = [
  'silk.frakt',
  'Liquid Prism.frakt',
  'Static.frakt',
  'Lux.frakt',
  'Turquoise Flow.frakt',
];

// ============================================
// How long each shader plays before auto-advancing (seconds)
// ============================================
const MOBILE_HERO_INTERVAL = 6;

(function mobileExperience() {
  const html = document.documentElement;
  const isMobile = () => (typeof window.fraktIsMobile === 'function'
    ? window.fraktIsMobile()
    : (window.innerWidth < 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)));

  const mobileEl = document.getElementById('mobile-experience');
  if (!mobileEl) return;

  // ── Hero carousel state ─────────────────────────────────────────
  let built = false;
  let presetIds = [];       // PRESETS ids resolved from MOBILE_HERO_PRESETS
  let canvases = [];        // one <canvas> per preset (stacked, cross-faded)
  let dots = [];            // dot indicators
  let renderers = [];       // createMiniRenderer handles, created on demand
  let current = 0;
  let autoTimer = 0;
  let swipeWired = false;

  // Resolve hero preset filenames -> PRESETS ids via the manifest, falling
  // back to the filename minus extension. Only keep ids that actually loaded.
  async function resolvePresetIds() {
    const fileToId = {};
    try {
      const res = await fetch('presets/index.json', { cache: 'no-cache' });
      const manifest = await res.json();
      (manifest.presets || []).forEach(p => { fileToId[p.file] = p.id; });
    } catch (e) {
      console.warn('[mobile] could not read presets manifest', e);
    }
    return MOBILE_HERO_PRESETS
      .map(f => fileToId[f] || f.replace(/\.frakt$/, ''))
      .filter(id => typeof PRESETS !== 'undefined' && PRESETS[id]);
  }

  async function ensurePresetsLoaded() {
    if (typeof PRESETS !== 'undefined' && Object.keys(PRESETS).length) return;
    if (typeof loadAllPresets === 'function') {
      try { await loadAllPresets(); } catch (e) { console.warn('[mobile] preset load failed', e); }
    }
  }

  // Position every slide relative to the current one and slide horizontally.
  // Each canvas sits at its signed offset from `current` (0 = on-screen,
  // ±1 = just off the left/right edge). Only directly-adjacent slides
  // animate; slides that wrap around (the far side) snap into place with no
  // transition so the loop never sweeps a slide across the whole viewport.
  function place(animate) {
    const n = presetIds.length;
    canvases.forEach((cv, k) => {
      const slot = (((k - current) % n) + n) % n;       // 0..n-1
      const pos = slot <= n / 2 ? slot : slot - n;       // ...-1, 0, +1...
      cv.style.transition = (animate && Math.abs(pos) <= 1) ? 'transform 0.6s ease' : 'none';
      cv.style.transform = 'translateX(' + (pos * 100) + '%)';
    });
  }

  // Show preset `i`. All renderers stay alive for the lifetime of the
  // carousel — createMiniRenderer's stop() permanently loses the canvas's
  // WebGL context (it calls WEBGL_lose_context.loseContext), so a stopped
  // canvas can never render again. With only a handful of presets, keeping
  // every context live (24fps each) is the simplest correct approach.
  function activate(i, animate) {
    if (!presetIds.length) return;
    i = ((i % presetIds.length) + presetIds.length) % presetIds.length;
    current = i;
    dots.forEach((d, k) => d.classList.toggle('active', k === i));
    place(animate !== false);
  }

  function scheduleAuto() {
    clearInterval(autoTimer);
    autoTimer = setInterval(() => activate(current + 1), MOBILE_HERO_INTERVAL * 1000);
  }

  // Manual advance (swipe / dot tap) — resets the auto-cycle timer.
  function manualGo(i) { activate(i); scheduleAuto(); }

  function stopAll() {
    renderers.forEach(r => { if (r) { try { r.stop(); } catch (e) {} } });
    renderers = [];
  }

  // Build the carousel from scratch with fresh <canvas> elements (and thus
  // fresh WebGL contexts). Safe to call again on resize: the old canvases —
  // whose contexts may have been lost via stopAll() — are discarded.
  function buildCarousel() {
    const bg = document.getElementById('mobile-hero-bg');
    const dotWrap = document.getElementById('mobile-hero-dots');
    if (!bg || !dotWrap) return;

    bg.innerHTML = '';
    dotWrap.innerHTML = '';
    canvases = [];
    dots = [];
    renderers = [];

    presetIds.forEach((id, i) => {
      const cv = document.createElement('canvas');
      cv.className = 'mobile-hero-canvas';
      bg.appendChild(cv);
      canvases.push(cv);

      const dot = document.createElement('button');
      dot.className = 'mobile-hero-dot';
      dot.type = 'button';
      dot.setAttribute('aria-label', 'Show shader ' + (i + 1));
      dot.addEventListener('click', () => manualGo(i));
      dotWrap.appendChild(dot);
      dots.push(dot);

      // Each preset gets its own live mini-renderer (own context + RAF).
      renderers.push(typeof createMiniRenderer === 'function'
        ? createMiniRenderer(cv, id)
        : null);
    });

    activate(0, false);
    scheduleAuto();
    wireSwipe();
  }

  // Resize: contexts are sized to the viewport at creation, so rebuild with
  // fresh canvases to match the new dimensions (preserving the current slide).
  function rebuildForResize() {
    const keep = current;
    stopAll();
    buildCarousel();
    activate(keep, false);
    scheduleAuto();
  }

  // Horizontal swipe on the hero advances the carousel.
  function wireSwipe() {
    if (swipeWired) return;
    swipeWired = true;
    const hero = document.querySelector('.mobile-hero');
    if (!hero) return;
    let startX = 0, startY = 0, tracking = false;
    hero.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    }, { passive: true });
    hero.addEventListener('touchend', e => {
      if (!tracking) return;
      tracking = false;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      // Horizontal-dominant swipe past the threshold only.
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        manualGo(current + (dx < 0 ? 1 : -1));
      }
    }, { passive: true });
  }

  async function buildOnce() {
    if (built) return;
    built = true;
    await ensurePresetsLoaded();
    presetIds = await resolvePresetIds();
    if (!presetIds.length) {
      console.warn('[mobile] no hero presets resolved — carousel disabled');
      return;
    }
    buildCarousel();
  }

  // ── Scroll-down button → smooth scroll to section 2 ─────────────
  const scrollBtn = document.getElementById('mobile-scroll-down');
  if (scrollBtn) {
    scrollBtn.addEventListener('click', () => {
      const s2 = document.getElementById('mobile-section-2');
      if (s2) s2.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // ── Mode toggle (mobile <-> desktop) ────────────────────────────
  function applyMode() {
    const m = isMobile();
    html.classList.toggle('frakt-mobile', m);
    if (m) {
      buildOnce();
    } else if (!window.FRAKT_DESKTOP_BOOTED) {
      // Page first loaded on mobile (editor never booted) and the viewport
      // grew to desktop — reload to bring up the real editor cleanly.
      window.location.reload();
    } else {
      // Desktop already booted underneath; just pause the hero.
      clearInterval(autoTimer);
      stopAll();
      built = false; // rebuilt fresh if we return to mobile
    }
  }

  // Debounced re-check on resize / orientation change. When staying mobile
  // and already built, rebuild with fresh canvases so the backing store
  // matches the new viewport size.
  let rzTimer = 0;
  function onResize() {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(() => {
      const stayingMobile = isMobile() && built && presetIds.length;
      applyMode();
      if (stayingMobile) rebuildForResize();
    }, 200);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  // ── Email / copy actions (referenced inline in the markup) ──────
  window.sendLink = function (event) {
    event.preventDefault();
    const email = event.target.querySelector('input').value;
    window.location.href = 'mailto:' + email +
      '?subject=Frakt link for later' +
      '&body=Hi! Here\'s the Frakt link to open on your computer: https://frakt.app';
  };

  window.copyLink = function () {
    const btn = document.querySelector('.mobile-copy-link');
    const flash = () => {
      if (!btn || btn.dataset.copying) return;
      btn.dataset.copying = '1';
      const orig = btn.textContent;
      btn.textContent = 'Copied ✓';
      setTimeout(() => { btn.textContent = orig; delete btn.dataset.copying; }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText('https://frakt.app').then(flash).catch(flash);
    } else {
      flash();
    }
  };

  // ── Init ────────────────────────────────────────────────────────
  applyMode();
})();
