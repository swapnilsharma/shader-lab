// =============================================================
// Frakt landing — hero (Session 1)
//
// Loads the Mango Pulp preset (an existing engine .frakt file) and renders
// it on the visible hero canvas using a private WebGL context. Rendering
// uses the engine's shader builder + uniform setter from /lib/renderer.js
// (loaded in index.html). Three sliders (Twist / Blend / Seed) mutate
// layer properties in real time; the next frame picks up the new values
// via setUniformsForLayers, no recompile required.
//
// Boot order: index.html loads /lib/renderer.js first (which initializes
// the hidden #glcanvas WebGL context that the engine grabs at top level).
// Then this file runs, sets up its OWN canvas + context for the hero,
// and never touches the engine's globals.
// =============================================================

(function () {
  'use strict';

  const PRESET_URL = '/assets/presets/Mango Pulp.frakt';
  const SLIDER_ENTER_DURATION = 200;

  // ── Engine bridge ───────────────────────────────────────────
  // /lib/renderer.js is loaded as a non-module script. Top-level `function`
  // declarations there become properties of `window`; top-level `const`
  // (like VERT) do NOT, but are reachable as bare identifiers across script
  // tags via the shared script lexical environment. Hence the mixed access.
  let _VERT = null;
  function requireEngine() {
    const missing = ['initNoiseTex','buildFragFromLayers','setUniformsForLayers','mkShader']
      .filter(k => typeof window[k] !== 'function');
    if (missing.length) {
      console.error('[landing] engine globals missing:', missing);
      return false;
    }
    try {
      // VERT is a const in renderer.js — not on window, but reachable by name.
      // eslint-disable-next-line no-undef
      _VERT = VERT;
    } catch (e) {
      console.error('[landing] VERT not reachable:', e);
      return false;
    }
    if (typeof _VERT !== 'string') {
      console.error('[landing] VERT not a string');
      return false;
    }
    return true;
  }

  // ── DOM refs ────────────────────────────────────────────────
  const $shader   = document.getElementById('hero-shader');
  const $card     = document.getElementById('hero-card');
  const $controls = document.getElementById('controls');
  const $mobileSlot = document.getElementById('controls-mobile-slot');

  // Twist drives polar-remap.twist; Blend and Seed drive the gradient layer.
  // Ranges/steps come from the editor's parameter definitions; initial values
  // match the Mango Pulp preset.
  const sliders = {
    twist: { input: document.getElementById('slider-twist'), value: document.getElementById('value-twist'), decimals: 2 },
    blend: { input: document.getElementById('slider-blend'), value: document.getElementById('value-blend'), decimals: 2 },
    seed:  { input: document.getElementById('slider-seed'),  value: document.getElementById('value-seed'),  decimals: 0 },
  };

  // ── Build the Mango Pulp scene as engine-shaped layer objects ──
  // The engine's createLayer() lives in engine.js (which we don't load on
  // landing). We construct the same shape directly from the .frakt JSON,
  // assigning stable ids so the shader uniforms are addressable.
  function sceneToLayers(scene) {
    const CONTENT_TYPES = new Set(['solid','gradient','linear-gradient','radial-gradient','noise-field','mesh-gradient','image','wave','rectangle','circle']);
    return scene.layers.map((l, i) => {
      const layer = {
        id: i + 1,
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

  // Mango Pulp layers:
  //   layers[0] polar-remap → twist
  //   layers[2] gradient    → blend, seed
  function findLayer(layers, type) {
    return layers.find(l => l.type === type) || null;
  }

  // ── Renderer ────────────────────────────────────────────────
  function createHeroRenderer(canvas, layers, bg) {
    const gl = canvas.getContext('webgl', { antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
    if (!gl) {
      console.error('[landing] WebGL not available');
      return null;
    }

    const noiseTex = window.initNoiseTex(gl);
    const frameState = { w: 1, h: 1, bg: bg || '#000000' };

    const fsrc = window.buildFragFromLayers(layers, frameState);
    const vs   = window.mkShader(gl, gl.VERTEX_SHADER, _VERT);
    const fs   = window.mkShader(gl, gl.FRAGMENT_SHADER, fsrc);
    if (!vs || !fs) {
      console.error('[landing] shader compile failed');
      return null;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[landing] link failed:', gl.getProgramInfoLog(prog));
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
      const w = Math.max(1, Math.round(canvas.clientWidth  * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      frameState.w = canvas.width;
      frameState.h = canvas.height;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();

    const t0 = performance.now();
    let rafId = 0;
    let running = true;

    function frame(now) {
      if (!running) return;
      resize();
      const t = (now - t0) / 1000;
      window.setUniformsForLayers(gl, prog, layers, frameState, t, noiseTex, null, false, 1.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    return {
      stop() {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
      },
    };
  }

  // ── Slider wiring ───────────────────────────────────────────
  function formatValue(num, decimals) {
    return Number(num).toFixed(decimals);
  }

  function updateSliderFill(input) {
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    const val = parseFloat(input.value);
    const fill = max === min ? 0 : (val - min) / (max - min);
    input.style.setProperty('--fill', String(fill));
  }

  function wireSliders(layers) {
    const polar = findLayer(layers, 'polar-remap');
    const grad  = findLayer(layers, 'gradient');

    function bind(slider, applyFn) {
      const handler = () => {
        const raw = parseFloat(slider.input.value);
        const next = slider.decimals === 0 ? Math.round(raw) : raw;
        applyFn(next);
        slider.value.textContent = formatValue(next, slider.decimals);
        updateSliderFill(slider.input);
      };
      slider.input.addEventListener('input', handler);
      // Sync initial state — pushes the slider's initial value into the
      // scene so the rendered shader matches the displayed value.
      handler();
    }

    if (polar) {
      bind(sliders.twist, v => { polar.properties.twist = v; });
    }
    if (grad) {
      bind(sliders.blend, v => { grad.properties.blend = v; });
      bind(sliders.seed,  v => { grad.properties.seed  = v; });
    }
  }

  // ── Mobile relocation: move .controls into the inline slot on mobile ──
  function applyResponsiveLayout() {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
      if ($controls.parentElement !== $mobileSlot) {
        $mobileSlot.appendChild($controls);
      }
    } else {
      if ($controls.parentElement !== $card) {
        $card.appendChild($controls);
      }
    }
  }

  // ── "See how it works" modal ───────────────────────────────
  function wireWatchModal() {
    const $modal = document.getElementById('modal-watch');
    const $cta = document.getElementById('cta-secondary');
    const $close = document.getElementById('modal-close');
    const $backdrop = document.getElementById('modal-backdrop');

    function open() { $modal.removeAttribute('hidden'); }
    function close() { $modal.setAttribute('hidden', ''); }

    $cta.addEventListener('click', open);
    $close.addEventListener('click', close);
    $backdrop.addEventListener('click', close);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$modal.hasAttribute('hidden')) close();
    });
  }

  // ── Mobile primary CTA: "Email me a link" stub ─────────────
  function wireEmailCTA() {
    const $toggle  = document.getElementById('cta-email-toggle');
    const $form    = document.getElementById('cta-email-form');
    const $input   = document.getElementById('cta-email-input');
    const $confirm = document.getElementById('cta-email-confirm');

    $toggle.addEventListener('click', () => {
      $toggle.setAttribute('hidden', '');
      $form.classList.add('is-open');
      setTimeout(() => $input.focus(), 0);
    });

    $form.addEventListener('submit', e => {
      e.preventDefault();
      const email = ($input.value || '').trim();
      if (!email || !email.includes('@')) {
        $input.focus();
        return;
      }
      // v1 stub: no real send. Real email flow is a future task.
      $form.classList.remove('is-open');
      $form.style.display = 'none';
      $confirm.removeAttribute('hidden');
    });
  }

  // ── Boot ────────────────────────────────────────────────────
  async function boot() {
    if (!requireEngine()) return;

    let scene;
    try {
      const res = await fetch(PRESET_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      scene = await res.json();
    } catch (err) {
      console.error('[landing] failed to load Mango Pulp preset:', err);
      return;
    }

    const layers = sceneToLayers(scene);
    const bg = (scene.canvas && scene.canvas.background) || '#000000';

    applyResponsiveLayout();
    window.addEventListener('resize', applyResponsiveLayout);

    const renderer = createHeroRenderer($shader, layers, bg);
    if (!renderer) return;

    wireSliders(layers);
    wireWatchModal();
    wireEmailCTA();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
