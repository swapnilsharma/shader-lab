// =============================================================
// Frakt landing — How it works + Export sections (Session 3)
//
// Two responsibilities:
//   1. Syntax-highlight the static Three.js + GLSL code snippet shown
//      in the Export section. The snippet is fixed (this is "evidence
//      of code", not user content) so we hand-tokenize once on boot.
//   2. Drive the Export section's logo entry stagger and perpetual
//      float via IntersectionObserver. On mobile, mirror the logo
//      data into a horizontal strip below the code block.
// =============================================================

(function () {
  'use strict';

  const MOBILE_BREAKPOINT_PX = 768;
  const STAGGER_MS = 80;
  const FLOAT_KICK_DELAY_MS = 800; // wait for entry transitions to finish
  const VIMEO_SDK_URL = 'https://player.vimeo.com/api/player.js';

  // ── Code snippet (the "exported" Three.js shader). Long enough that the
  // bottom 40% fade hides additional realistic-looking lines. ──────────
  const CODE = String.raw`import * as THREE from 'three';

// Vertex shader
const vertexShader = ${'`'}
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
${'`'};

// Fragment shader — Mango Pulp
const fragmentShader = ${'`'}
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uTwist;
  uniform float uBlend;
  uniform float uSeed;

  vec3 hash3(vec2 p) {
    vec3 q = vec3(
      dot(p, vec2(127.1, 311.7)),
      dot(p, vec2(269.5, 183.3)),
      dot(p, vec2(419.2, 371.9))
    );
    return fract(sin(q) * 43758.5453);
  }

  vec2 polarTwist(vec2 uv, float amount) {
    vec2 centered = uv - 0.5;
    float r = length(centered);
    float a = atan(centered.y, centered.x);
    a += r * amount * 3.14159;
    return vec2(cos(a), sin(a)) * r + 0.5;
  }

  void main() {
    vec2 uv = polarTwist(vUv, uTwist);
    vec3 c1 = vec3(1.0, 0.34, 0.33);
    vec3 c2 = vec3(1.0, 0.49, 0.0);
    vec3 c3 = vec3(1.0, 0.58, 0.17);
    vec3 c4 = vec3(1.0, 0.44, 0.78);
    vec3 c5 = vec3(0.67, 0.49, 1.0);

    vec2 noise = hash3(uv + uSeed).xy;
    float t = uTime * 0.5;

    vec3 color = mix(c1, c2, sin(uv.x * 3.14 + t) * 0.5 + 0.5);
    color = mix(color, c3, sin(uv.y * 3.14 + t * 0.7) * 0.5 + 0.5);
    color = mix(color, c4, length(noise - 0.5));
    color = mix(color, c5, uBlend);

    gl_FragColor = vec4(color, 1.0);
  }
${'`'};

// Three.js setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uTime:  { value: 0 },
    uTwist: { value: 1.0 },
    uBlend: { value: 0.61 },
    uSeed:  { value: 42 },
  },
});`;

  // Token sets — order matters when they appear inside the same regex pass.
  const KEYWORDS = [
    'import', 'from', 'as', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'new',
    // GLSL
    'void', 'varying', 'uniform', 'precision', 'highp', 'mediump', 'lowp',
    'float', 'int', 'bool', 'vec2', 'vec3', 'vec4', 'mat2', 'mat3', 'mat4',
  ];
  const FUNCTIONS = [
    // Custom in this snippet
    'hash3', 'polarTwist', 'main',
    // GLSL builtins
    'length', 'atan', 'dot', 'fract', 'sin', 'cos', 'mix',
  ];

  // ── Highlighter ─────────────────────────────────────────────
  // Single-pass tokenizer: walks the source, classifying each chunk into
  // comment / string / keyword / function / number / plain. Avoids the
  // "regex-replace inside spans" hazard of multi-pass approaches.
  function highlight(src) {
    const out = [];
    let i = 0;
    const N = src.length;

    function isAlpha(c) { return /[A-Za-z_$]/.test(c); }
    function isAlphaNum(c) { return /[A-Za-z0-9_$]/.test(c); }
    function isDigit(c) { return /[0-9]/.test(c); }

    function escapeHtml(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function span(cls, text) {
      return '<span class="' + cls + '">' + escapeHtml(text) + '</span>';
    }

    while (i < N) {
      const c = src[i];
      const c2 = src[i + 1];

      // Line comment
      if (c === '/' && c2 === '/') {
        const end = src.indexOf('\n', i);
        const stop = end === -1 ? N : end;
        out.push(span('tk-cm', src.slice(i, stop)));
        i = stop;
        continue;
      }

      // Single-quote string
      if (c === "'" || c === '"') {
        const quote = c;
        let j = i + 1;
        while (j < N && src[j] !== quote) {
          if (src[j] === '\\') j += 2; else j++;
        }
        const stop = Math.min(j + 1, N);
        out.push(span('tk-str', src.slice(i, stop)));
        i = stop;
        continue;
      }

      // Template literal — wrap the backticks themselves but tokenize the
      // CONTENT so embedded GLSL keywords/functions/numbers still color.
      if (c === '`') {
        out.push(span('tk-pn', '`'));
        i++;
        let buf = '';
        while (i < N && src[i] !== '`') {
          buf += src[i];
          i++;
        }
        // Recursively tokenize the buffer (GLSL or other code inside).
        out.push(highlight(buf));
        if (i < N && src[i] === '`') {
          out.push(span('tk-pn', '`'));
          i++;
        }
        continue;
      }

      // Number — int or float
      if (isDigit(c) || (c === '.' && isDigit(c2))) {
        let j = i;
        while (j < N && (isDigit(src[j]) || src[j] === '.')) j++;
        out.push(span('tk-num', src.slice(i, j)));
        i = j;
        continue;
      }

      // Identifier — could be keyword, function, or plain
      if (isAlpha(c)) {
        let j = i + 1;
        while (j < N && isAlphaNum(src[j])) j++;
        const word = src.slice(i, j);
        // Look ahead for opening paren → function call
        let k = j;
        while (k < N && (src[k] === ' ' || src[k] === '\t')) k++;
        const isCall = src[k] === '(';

        if (KEYWORDS.indexOf(word) !== -1) {
          out.push(span('tk-kw', word));
        } else if (isCall && FUNCTIONS.indexOf(word) !== -1) {
          out.push(span('tk-fn', word));
        } else {
          out.push(escapeHtml(word));
        }
        i = j;
        continue;
      }

      // Whitespace and punctuation pass through unstyled
      out.push(escapeHtml(c));
      i++;
    }

    return out.join('');
  }

  function renderCodeBlock() {
    const target = document.getElementById('ex-code-content');
    if (!target) return;
    target.innerHTML = highlight(CODE);
  }

  // ── Logo stagger fade-in + perpetual float ──────────────────
  function isMobile() { return window.innerWidth < MOBILE_BREAKPOINT_PX; }

  function buildMobileLogoStrip() {
    const strip = document.getElementById('ex-logo-strip');
    if (!strip) return;
    if (strip.children.length > 0) return; // already built
    const logos = document.querySelectorAll('.ex-stage .ex-logo .ex-pill');
    logos.forEach(pill => {
      // Clone the pill (drops the wrapper's inline rotation/positioning).
      const clone = pill.cloneNode(true);
      strip.appendChild(clone);
    });
  }

  function wireExportSectionEntry() {
    const stage = document.querySelector('.ex-stage');
    const strip = document.getElementById('ex-logo-strip');
    if (!stage) return;

    const desktopLogos = [...stage.querySelectorAll('.ex-logo')];

    let mobileEntered = false;
    let desktopEntered = false;

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;

        if (entry.target === stage && !desktopEntered) {
          desktopEntered = true;
          desktopLogos.forEach((el, i) => {
            setTimeout(() => {
              el.classList.add('is-entered');
            }, i * STAGGER_MS);
          });
          // Kick perpetual float once entries have all landed
          setTimeout(() => {
            desktopLogos.forEach(el => el.classList.add('is-floating'));
          }, desktopLogos.length * STAGGER_MS + FLOAT_KICK_DELAY_MS);
        }

        if (entry.target === strip && !mobileEntered) {
          mobileEntered = true;
          const pills = [...strip.querySelectorAll('.ex-pill')];
          pills.forEach((p, i) => {
            setTimeout(() => p.classList.add('is-entered'), i * STAGGER_MS);
          });
        }
      });
    }, { threshold: 0.15 });

    io.observe(stage);
    if (strip) io.observe(strip);
  }

  // ── Vimeo player: standard controls + pause-on-hover ────────
  // The iframe loads with Vimeo's default chrome (controls show on hover).
  // We additionally pause programmatically when the user's pointer enters
  // the video card, so they can read/inspect without distracting motion.
  // Pointer leaves → no auto-resume; user clicks play to restart.
  function loadVimeoSdk() {
    if (window.Vimeo && window.Vimeo.Player) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = VIMEO_SDK_URL;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Vimeo SDK failed to load'));
      document.head.appendChild(s);
    });
  }

  async function wireVimeoPauseOnHover() {
    const card = document.getElementById('hiw-video-card');
    const iframe = document.getElementById('hiw-video-iframe');
    if (!card || !iframe) return;

    try {
      await loadVimeoSdk();
    } catch (e) {
      // If the SDK can't load, the iframe still works with standard
      // controls — we just lose the pause-on-hover augmentation.
      console.warn('[sections] Vimeo SDK unavailable:', e);
      return;
    }

    const player = new window.Vimeo.Player(iframe);
    card.addEventListener('mouseenter', () => {
      // pause() returns a promise; ignore errors (e.g. user hasn't started yet)
      player.pause().catch(() => {});
    });
  }

  // ── Boot ────────────────────────────────────────────────────
  function boot() {
    renderCodeBlock();
    buildMobileLogoStrip();
    wireExportSectionEntry();
    wireVimeoPauseOnHover();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
