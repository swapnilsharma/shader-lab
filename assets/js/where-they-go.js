// =============================================================
// Frakt landing — "Where they go" section (Session 4)
//
// Three live shader canvases sit inside hand-built HTML/CSS mockups.
// Each shader has its own WebGL context and its own RAF loop. An
// IntersectionObserver pauses a shader's loop when its mockup leaves
// the viewport and resumes when it returns — three concurrent live
// shaders is acceptable load on the page (comparable to the hero),
// but pausing off-screen ones is cheap insurance.
//
// Reduced motion: render a single frame on first visibility and stop.
//
// Engine bridge: same pattern as landing.js / carousel.js. Globals
// from /lib/renderer.js (initNoiseTex, buildFragFromLayers, mkShader,
// setUniformsForLayers, VERT) are read off `window` at boot.
// =============================================================

(function () {
  'use strict';

  const PRESETS_DIR = '/assets/presets/';

  // ── Engine bridge ───────────────────────────────────────────
  let _VERT = null;
  function engineReady() {
    const need = ['initNoiseTex', 'buildFragFromLayers', 'setUniformsForLayers', 'mkShader'];
    const missing = need.filter(k => typeof window[k] !== 'function');
    if (missing.length) {
      console.warn('[wtg] engine missing:', missing);
      return false;
    }
    try { /* eslint-disable-next-line no-undef */ _VERT = VERT; } catch (e) { return false; }
    return typeof _VERT === 'string';
  }

  // Reuse the same scene→layer transform as the rest of the landing.
  // idBase guarantees the shader's layer ids don't collide with the hero's
  // (which uses 1..N). Different ids per mockup keep uniform names disjoint.
  function sceneToLayers(scene, idBase) {
    const CONTENT_TYPES = new Set([
      'solid', 'gradient', 'linear-gradient', 'radial-gradient', 'noise-field',
      'mesh-gradient', 'image', 'wave', 'rectangle', 'circle',
    ]);
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

  // ── Per-mockup renderer ─────────────────────────────────────
  // Returns { play, pause, scene } or null on failure. play() and pause()
  // are idempotent. The render loop tracks `running` so resuming a paused
  // renderer doesn't double up RAFs.
  function createRenderer(canvas, scene, idBase) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const gl = canvas.getContext('webgl', {
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      console.warn('[wtg] WebGL unavailable — leaving mockup without shader');
      return null;
    }

    const layers = sceneToLayers(scene, idBase);
    const noiseTex = window.initNoiseTex(gl);
    const frameState = {
      w: 1, h: 1,
      bg: (scene.canvas && scene.canvas.background) || '#000000',
    };

    const fsrc = window.buildFragFromLayers(layers, frameState);
    const vs = window.mkShader(gl, gl.VERTEX_SHADER, _VERT);
    const fs = window.mkShader(gl, gl.FRAGMENT_SHADER, fsrc);
    if (!vs || !fs) {
      console.error('[wtg] shader compile failed');
      return null;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[wtg] link failed:', gl.getProgramInfoLog(prog));
      return null;
    }
    gl.useProgram(prog);

    const uNoise = gl.getUniformLocation(prog, 'uNoise');
    if (uNoise) gl.uniform1i(uNoise, 1);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
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

    // Always paint at least one frame so the mockup isn't blank before
    // the IntersectionObserver fires.
    renderOne();

    if (reduceMotion) {
      // Reduced-motion users get a single frozen frame, no loop.
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
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
      },
      scene,
    };
  }

  // ── Setup ───────────────────────────────────────────────────
  async function loadScene(file) {
    const url = PRESETS_DIR + encodeURIComponent(file);
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('preset HTTP ' + res.status);
    return res.json();
  }

  async function setupMockup(mockup, idBase) {
    // Find the WebGL canvas inside the mockup. Each mockup has exactly one
    // [data-shader-canvas] element; the parent with [data-preset] tells us
    // which .frakt file to load.
    const canvas = mockup.querySelector('[data-shader-canvas]');
    const presetHost = mockup.querySelector('[data-preset]');
    if (!canvas || !presetHost) return null;
    const preset = presetHost.dataset.preset;
    if (!preset) return null;

    let scene;
    try {
      scene = await loadScene(preset);
    } catch (e) {
      console.warn('[wtg] failed to load preset', preset, e);
      return null;
    }

    const renderer = createRenderer(canvas, scene, idBase);
    if (!renderer) return null;
    return { mockup, renderer };
  }

  function wireVisibility(items) {
    if (!items.length) return;
    if (typeof IntersectionObserver !== 'function') {
      // Old browser fallback — just play all of them.
      items.forEach(it => it.renderer.play());
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const item = items.find(it => it.mockup === entry.target);
        if (!item) return;
        if (entry.isIntersecting) item.renderer.play();
        else item.renderer.pause();
      });
    }, { threshold: 0.05 });
    items.forEach(it => io.observe(it.mockup));
  }

  // ── Boot ────────────────────────────────────────────────────
  async function boot() {
    if (!engineReady()) return;

    const mockups = [...document.querySelectorAll('.wtg-mockup')];
    if (!mockups.length) return;

    const setups = await Promise.all(
      mockups.map((m, i) => setupMockup(m, i + 1))
    );
    const items = setups.filter(Boolean);
    wireVisibility(items);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
