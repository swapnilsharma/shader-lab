/* CAROUSEL: removed for launch, restore post-launch when distinct shaders exist.
   This file is not loaded by index.html in the launch build — the <script>
   tag that imported it has been commented out. Code preserved verbatim below. */

// =============================================================
// Frakt landing — Carousel section
//
// Stepped horizontal carousel with pointer drag. Glide from card
// to card with a hold-pause between auto-transitions; user can
// grab and drag at any time to manually move around. Loops
// infinitely via circular DOM rearrangement (no duplicates).
//
// DOM ordering invariant: the active card always sits at
// ACTIVE_DOM_INDEX (middle of the rail). After every step or
// drag-snap, the DOM is rotated so cards exist on BOTH sides of
// the active card — necessary for backward drag.
//
// Each card hosts its own live shader (own WebGL context).
// Visibility scheduling caps concurrent renders.
// =============================================================

(function () {
  'use strict';

  // ── Tunables ────────────────────────────────────────────────
  const PRESETS_DIR = '/assets/presets/';
  const CONCURRENT_CAP_DESKTOP = 4;
  const CONCURRENT_CAP_MOBILE = 1;
  const TRANSITION_MS = 700;
  const STAY_MS = 3200;
  const MOBILE_BREAKPOINT_PX = 768;
  const SHOCK_PULSE_MS = 200;
  const CARD_GAP = 24;
  const TOTAL_CARDS = 8;
  // Active card sits at this DOM index — symmetric arrangement so backward
  // navigation (prev arrow) always finds a card to its left.
  const ACTIVE_DOM_INDEX = 4;

  // ── Engine bridge ───────────────────────────────────────────
  let _VERT = null;
  function engineReady() {
    const need = ['initNoiseTex', 'buildFragFromLayers', 'setUniformsForLayers', 'mkShader'];
    const missing = need.filter(k => typeof window[k] !== 'function');
    if (missing.length) {
      console.error('[carousel] engine missing:', missing);
      return false;
    }
    try { /* eslint-disable-next-line no-undef */ _VERT = VERT; } catch (e) { return false; }
    return typeof _VERT === 'string';
  }

  function sceneToLayers(scene, idBase) {
    const CONTENT_TYPES = new Set(['solid','gradient','linear-gradient','radial-gradient','noise-field','mesh-gradient','image','wave','rectangle','circle']);
    return scene.layers.map((l, i) => {
      const layer = {
        id: idBase * 100 + i + 1,
        type: l.type,
        name: l.name || l.type,
        visible: l.visible !== false,
        opacity: l.opacity != null ? l.opacity : 1.0,
        blendMode: l.blendMode || 'normal',
        speed: typeof l.speed === 'number' ? l.speed : 1.0,
        timeOffset: typeof l.timeOffset === 'number' ? l.timeOffset : 0.0,
        paused: !!l.paused,
        properties: JSON.parse(JSON.stringify(l.properties || {})),
      };
      if (CONTENT_TYPES.has(layer.type)) layer.effects = [];
      return layer;
    });
  }

  function dominantColors(scene) {
    const grad = (scene.layers || []).find(l => l.type === 'gradient');
    const stops = grad && Array.isArray(grad.properties && grad.properties.stops) ? grad.properties.stops : null;
    if (stops && stops.length >= 2) {
      return [stops[0].color, stops[Math.floor(stops.length / 2)].color, stops[stops.length - 1].color];
    }
    return ['#ff5754', '#ff7c00', '#ff70c6'];
  }

  // ── Per-card shader renderer ────────────────────────────────
  function createCardRenderer(canvas, scene, idBase) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: false });
    if (!gl) {
      installGradientFallback(canvas, scene);
      return null;
    }

    const layers = sceneToLayers(scene, idBase);
    const noiseTex = window.initNoiseTex(gl);
    const frameState = { w: 1, h: 1, bg: (scene.canvas && scene.canvas.background) || '#000000' };

    const fsrc = window.buildFragFromLayers(layers, frameState);
    const vs = window.mkShader(gl, gl.VERTEX_SHADER, _VERT);
    const fs = window.mkShader(gl, gl.FRAGMENT_SHADER, fsrc);
    if (!vs || !fs) {
      installGradientFallback(canvas, scene);
      return null;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[carousel] link failed:', gl.getProgramInfoLog(prog));
      installGradientFallback(canvas, scene);
      return null;
    }
    gl.useProgram(prog);

    const uNoise = gl.getUniformLocation(prog, 'uNoise');
    if (uNoise) gl.uniform1i(uNoise, 1);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const aLoc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(aLoc);
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      frameState.w = canvas.width;
      frameState.h = canvas.height;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    const t0 = performance.now();
    let rafId = 0;
    let running = false;

    function renderOne() {
      resize();
      const t = (performance.now() - t0) / 1000;
      window.setUniformsForLayers(gl, prog, layers, frameState, t, noiseTex, null, false, 1.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function frame() {
      if (!running) return;
      renderOne();
      rafId = requestAnimationFrame(frame);
    }

    renderOne();

    if (reduceMotion) {
      return { play() { renderOne(); }, pause() {}, scene };
    }

    return {
      play() {
        if (running) return;
        running = true;
        rafId = requestAnimationFrame(frame);
      },
      pause() {
        running = false;
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      },
      scene,
    };
  }

  function installGradientFallback(canvas, scene) {
    const cs = dominantColors(scene);
    const parent = canvas.parentElement;
    if (parent) {
      parent.style.background = `linear-gradient(135deg, ${cs[0]} 0%, ${cs[1]} 50%, ${cs[2]} 100%)`;
    }
    canvas.style.display = 'none';
  }

  // ── Card registry + visibility scheduler ────────────────────
  const cards = []; // { el, canvas, presetFile, index, scene, renderer }

  async function loadCardScene(presetFile) {
    const url = PRESETS_DIR + encodeURIComponent(presetFile);
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('preset HTTP ' + res.status);
    return res.json();
  }

  async function setupCard(cardEl) {
    const canvas = cardEl.querySelector('canvas[data-shader]');
    const presetFile = cardEl.dataset.preset;
    const cardIndex = parseInt(cardEl.dataset.cardIndex, 10);
    if (!canvas || !presetFile) return null;

    let scene;
    try {
      scene = await loadCardScene(presetFile);
    } catch (e) {
      console.warn('[carousel] failed to load', presetFile, e);
      return null;
    }

    const renderer = createCardRenderer(canvas, scene, cardIndex + 1);
    const card = { el: cardEl, canvas, presetFile, index: cardIndex, scene, renderer };
    cards.push(card);
    return card;
  }

  function reschedule() {
    if (!cards.length) return;
    const cap = isMobile() ? CONCURRENT_CAP_MOBILE : CONCURRENT_CAP_DESKTOP;
    // The rail is now contained in a column (post-Session-4 refactor), so
    // "centered" means centered in the RAIL, not in the viewport.
    const rail = getRailEl();
    const railRect = rail ? rail.getBoundingClientRect() : { left: 0, right: window.innerWidth, width: window.innerWidth };
    const railCenterX = railRect.left + railRect.width / 2;
    const candidates = cards
      .filter(c => c.renderer)
      .map(c => {
        const r = c.el.getBoundingClientRect();
        // Visibility check: card overlaps the visible portion of the rail
        const visLeft = Math.max(railRect.left, 0);
        const visRight = Math.min(railRect.right, window.innerWidth);
        const onScreen = r.right > visLeft && r.left < visRight;
        const centerX = r.left + r.width / 2;
        return { card: c, dist: Math.abs(centerX - railCenterX), onScreen };
      })
      .filter(x => x.onScreen)
      .sort((a, b) => a.dist - b.dist);
    const playSet = new Set(candidates.slice(0, cap).map(v => v.card));
    cards.forEach(c => {
      if (!c.renderer) return;
      if (playSet.has(c)) c.renderer.play();
      else c.renderer.pause();
    });
  }

  // ── State ───────────────────────────────────────────────────
  let activeIdx = 0;
  let translateX = 0;
  let isHoverPaused = false;
  let stayTimer = null;
  let isAnimating = false;

  function isMobile() { return window.innerWidth < MOBILE_BREAKPOINT_PX; }
  function getTrackEl() { return document.getElementById('cs-track'); }
  function getRailEl()  { return document.getElementById('cs-rail');  }

  function findCardEl(idx) {
    return document.querySelector(`#cs-track .cc[data-card-index="${idx}"]`);
  }

  function txToCenter(cardEl) {
    // Center the card within the RAIL (post-Session-4 the rail is column-
    // contained, so it's not viewport-wide). Both the card's offsetLeft and
    // the rail's clientWidth are in the same coordinate space (the track).
    const rail = getRailEl();
    const railWidth = rail ? rail.clientWidth : window.innerWidth;
    const cardCenter = cardEl.offsetLeft + cardEl.offsetWidth / 2;
    return Math.round(railWidth / 2 - cardCenter);
  }

  function applyTranslate(animated) {
    const track = getTrackEl();
    if (!track) return;
    track.style.transition = animated
      ? `transform ${TRANSITION_MS}ms cubic-bezier(0.5, 0, 0.2, 1)`
      : 'none';
    track.style.transform = `translate3d(${translateX}px, 0, 0)`;
  }

  // ── DOM rotation: keep active card at ACTIVE_DOM_INDEX ──────
  // Moves cards around so the visual position of the active card is
  // unchanged but the active card lands at the canonical DOM index.
  function rebalanceToActiveAtMiddle() {
    const track = getTrackEl();
    if (!track) return;
    const activeCard = findCardEl(activeIdx);
    if (!activeCard) return;

    let safety = TOTAL_CARDS * 2;
    while (safety-- > 0) {
      const children = track.children;
      const idx = [...children].indexOf(activeCard);
      if (idx === ACTIVE_DOM_INDEX || idx === -1) break;

      if (idx > ACTIVE_DOM_INDEX) {
        // Active is too far right — move first card to end
        const first = children[0];
        const w = first.offsetWidth + CARD_GAP;
        track.appendChild(first);
        translateX += w; // remaining cards shifted left, so tx must increase
      } else {
        // Active is too far left — move last card to front
        const last = children[children.length - 1];
        const w = last.offsetWidth + CARD_GAP;
        track.insertBefore(last, children[0]);
        translateX -= w; // remaining cards shifted right, so tx must decrease
      }
    }
    applyTranslate(false);
  }

  // ── Stepped motion ──────────────────────────────────────────
  function clearStayTimer() {
    if (stayTimer) { clearTimeout(stayTimer); stayTimer = null; }
  }

  function scheduleStay() {
    clearStayTimer();
    if (isHoverPaused || isAnimating || document.hidden) return;
    stayTimer = setTimeout(stepForward, STAY_MS);
  }

  function stepForward() {
    if (isAnimating) return;
    goToCard((activeIdx + 1) % TOTAL_CARDS, true);
  }

  function stepBackward() {
    if (isAnimating) return;
    goToCard((activeIdx + TOTAL_CARDS - 1) % TOTAL_CARDS, true);
  }

  function goToCard(idx, animated) {
    const target = findCardEl(idx);
    if (!target) return;

    activeIdx = idx;
    translateX = txToCenter(target);
    isAnimating = animated === true;
    applyTranslate(isAnimating);
    updateActiveDot();
    reschedule();

    if (isAnimating) {
      setTimeout(() => {
        isAnimating = false;
        rebalanceToActiveAtMiddle();
        // Recompute translateX exactly post-rebalance and re-sync
        const t = findCardEl(activeIdx);
        if (t) {
          const exact = txToCenter(t);
          if (Math.abs(exact - translateX) > 0.5) {
            translateX = exact;
            applyTranslate(false);
          }
        }
        reschedule();
        scheduleStay();
      }, TRANSITION_MS);
    } else {
      rebalanceToActiveAtMiddle();
      scheduleStay();
    }
  }

  // ── Pagination dots ─────────────────────────────────────────
  function buildPaginationDots() {
    const dotsEl = document.getElementById('cs-dots');
    if (!dotsEl) return;
    dotsEl.innerHTML = '';
    for (let i = 0; i < TOTAL_CARDS; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cs-dot';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-label', `Go to card ${i + 1}`);
      btn.dataset.dotIndex = String(i);
      btn.addEventListener('click', () => {
        clearStayTimer();
        if (isMobile()) {
          const rail = getRailEl();
          const cardEl = findCardEl(i);
          if (rail && cardEl) {
            const railRect = rail.getBoundingClientRect();
            const cardRect = cardEl.getBoundingClientRect();
            const offset = (cardRect.left - railRect.left) + cardRect.width / 2 - railRect.width / 2;
            rail.scrollBy({ left: offset, behavior: 'smooth' });
          }
        } else {
          goToCard(i, true);
        }
      });
      dotsEl.appendChild(btn);
    }
    updateActiveDot();
  }

  function updateActiveDot() {
    const idx = isMobile() ? currentCenteredIndexMobile() : activeIdx;
    document.querySelectorAll('.cs-dot').forEach((d, i) => d.classList.toggle('is-active', i === idx));
  }

  // ── Hover pause ─────────────────────────────────────────────
  function wireHoverPause() {
    const rail = getRailEl();
    if (!rail) return;
    rail.addEventListener('mouseenter', () => {
      isHoverPaused = true;
      clearStayTimer();
    });
    rail.addEventListener('mouseleave', () => {
      isHoverPaused = false;
      if (!isAnimating) scheduleStay();
    });
  }

  // ── Prev / Next arrow buttons ───────────────────────────────
  function wireArrows() {
    const prev = document.getElementById('cs-arrow-prev');
    const next = document.getElementById('cs-arrow-next');
    if (prev) {
      prev.addEventListener('click', () => {
        clearStayTimer();
        stepBackward();
      });
    }
    if (next) {
      next.addEventListener('click', () => {
        clearStayTimer();
        stepForward();
      });
    }
  }

  // ── Mobile scroll sync ──────────────────────────────────────
  function currentCenteredIndexMobile() {
    const rail = getRailEl();
    if (!rail) return 0;
    const railRect = rail.getBoundingClientRect();
    const railCenterX = railRect.left + railRect.width / 2;
    const cardEls = document.querySelectorAll('.cc');
    let bestIdx = 0;
    let bestDist = Infinity;
    cardEls.forEach((el) => {
      const r = el.getBoundingClientRect();
      const c = r.left + r.width / 2;
      const d = Math.abs(c - railCenterX);
      const cardIdx = parseInt(el.dataset.cardIndex, 10);
      if (!Number.isNaN(cardIdx) && d < bestDist) { bestDist = d; bestIdx = cardIdx; }
    });
    return bestIdx;
  }

  function wireMobileScroll() {
    const rail = getRailEl();
    if (!rail) return;
    let scheduled = false;
    rail.addEventListener('scroll', () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        updateActiveDot();
        reschedule();
      });
    }, { passive: true });
  }

  // ── Card 8 (Shockwave) + Card 4 (mobile tap) ────────────────
  function wireShockwave() {
    const cardEl = document.querySelector('.cc--shockwave');
    if (!cardEl) return;
    const stage = cardEl.querySelector('.shock-stage');
    const btn = cardEl.querySelector('.shock-btn');
    if (!stage || !btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      stage.classList.add('is-pulsing');
      setTimeout(() => stage.classList.remove('is-pulsing'), SHOCK_PULSE_MS);
    });
  }

  function wireMobileHoverCard() {
    const cardEl = document.querySelector('.cc--hover-fill');
    if (!cardEl) return;
    cardEl.addEventListener('click', () => {
      if (!isMobile()) return;
      cardEl.classList.toggle('is-active');
    });
  }

  // ── Boot ────────────────────────────────────────────────────
  async function boot() {
    if (!engineReady()) return;

    const cardEls = [...document.querySelectorAll('#cs-track .cc')];
    if (!cardEls.length) return;

    await Promise.all(cardEls.map(setupCard));

    buildPaginationDots();
    wireArrows();
    wireHoverPause();
    wireShockwave();
    wireMobileHoverCard();

    if (!isMobile()) {
      requestAnimationFrame(() => {
        // Center card 0 first (using its initial offsetLeft = 0), then rotate
        // the DOM so card 0 sits at ACTIVE_DOM_INDEX.
        goToCard(0, false);
      });
    } else {
      wireMobileScroll();
      requestAnimationFrame(() => {
        updateActiveDot();
        reschedule();
      });
    }

    // Resize
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!isMobile()) {
          const t = findCardEl(activeIdx);
          if (t) {
            translateX = txToCenter(t);
            applyTranslate(false);
          }
        }
        updateActiveDot();
        reschedule();
      }, 150);
    });

    // Pause cadence when tab is hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearStayTimer();
      } else if (!isMobile() && !isHoverPaused && !isAnimating) {
        scheduleStay();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
