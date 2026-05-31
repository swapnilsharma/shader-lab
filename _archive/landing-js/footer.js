// =============================================================
// Frakt landing — Footer shader fade (Session 4)
//
// Renders a shader behind the footer content, masked with a vertical
// gradient (set in footer.css) so it fades in from transparent at the
// top to visible at the bottom. Pauses when the footer leaves the
// viewport.
//
// Preset: footer.frakt. If that file is missing or fails to load
// (it may not exist yet pre-launch), we fall back to "Mango Pulp.frakt"
// so the footer still gets a shader instead of going blank.
// =============================================================

(function () {
  'use strict';

  const PRESETS_DIR = '/assets/presets/';
  const PRIMARY_PRESET  = 'footer.frakt';
  const FALLBACK_PRESET = 'Mango Pulp.frakt';

  // ── Engine bridge (same as the rest of the landing) ─────────
  let _VERT = null;
  function engineReady() {
    const need = ['initNoiseTex', 'buildFragFromLayers', 'setUniformsForLayers', 'mkShader'];
    const missing = need.filter(k => typeof window[k] !== 'function');
    if (missing.length) {
      console.warn('[footer] engine missing:', missing);
      return false;
    }
    try { /* eslint-disable-next-line no-undef */ _VERT = VERT; } catch (e) { return false; }
    return typeof _VERT === 'string';
  }

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

  // Try the primary preset; fall back to Mango Pulp if it fails.
  async function loadSceneWithFallback() {
    try {
      const res = await fetch(PRESETS_DIR + encodeURIComponent(PRIMARY_PRESET), { cache: 'no-cache' });
      if (res.ok) return res.json();
      throw new Error('primary preset HTTP ' + res.status);
    } catch (e) {
      // Expected pre-launch: footer.frakt may not exist yet.
      console.info('[footer] primary preset unavailable, using fallback:', e.message);
    }
    const fallback = await fetch(PRESETS_DIR + encodeURIComponent(FALLBACK_PRESET), { cache: 'no-cache' });
    if (!fallback.ok) throw new Error('fallback preset HTTP ' + fallback.status);
    return fallback.json();
  }

  function createRenderer(canvas, scene) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const gl = canvas.getContext('webgl', {
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      console.warn('[footer] WebGL unavailable — leaving footer without shader');
      return null;
    }

    const layers = sceneToLayers(scene, 99); // 99 keeps us out of carousel/wtg id space
    const noiseTex = window.initNoiseTex(gl);
    const frameState = {
      w: 1, h: 1,
      bg: (scene.canvas && scene.canvas.background) || '#000000',
    };

    const fsrc = window.buildFragFromLayers(layers, frameState);
    const vs = window.mkShader(gl, gl.VERTEX_SHADER, _VERT);
    const fs = window.mkShader(gl, gl.FRAGMENT_SHADER, fsrc);
    if (!vs || !fs) {
      console.error('[footer] shader compile failed');
      return null;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[footer] link failed:', gl.getProgramInfoLog(prog));
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

    renderOne();

    if (reduceMotion) {
      return { play() { renderOne(); }, pause() {} };
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
    };
  }

  function wireVisibility(footerEl, renderer) {
    if (!renderer) return;
    if (typeof IntersectionObserver !== 'function') {
      renderer.play();
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) renderer.play();
        else renderer.pause();
      });
    }, { threshold: 0 });
    io.observe(footerEl);
  }

  async function boot() {
    if (!engineReady()) return;

    const canvas = document.getElementById('ft-shader');
    const footer = document.querySelector('.ft');
    if (!canvas || !footer) return;

    let scene;
    try {
      scene = await loadSceneWithFallback();
    } catch (e) {
      console.warn('[footer] no preset loaded, leaving canvas blank:', e);
      return;
    }

    const renderer = createRenderer(canvas, scene);
    wireVisibility(footer, renderer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
