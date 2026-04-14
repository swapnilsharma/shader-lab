// ================================================================
// SHADER LAB — Engine (Core) — Phase 2
// ================================================================

const canvas = document.getElementById('glcanvas');
const gl = canvas.getContext('webgl');
let effects = [], eid = 0, prog = null, needsRecompile = true;
let bgR = 0.04, bgG = 0.04, bgB = 0.04;
let playing = true, timeOffset = 0, pausedAt = 0;
let selectedEffectId = null;
let frameCount = 0, lastFpsTime = performance.now(), currentFps = 60;
let frameW = 800, frameH = 600, frameRadius = 0;
let activePreset = null;
let dragSrcId = null;

// Phase 2 — Uniform infrastructure
let mouseX = 0.5, mouseY = 0.5;
let clickX = 0.5, clickY = 0.5;
let clickStartTime = -999000; // effectively 999s ago

// Phase 2 — Image state
let baseImageTex = null;
let hasBaseImage = false;
let baseImageName = '';
let noiseTex = null;

// Interactive effect types
const INTERACTIVE_TYPES = ['shockwave', 'glowring', 'buttonfx'];

// --- Effect Definitions ---
const WAVE_COLS = [[0.42,0.50,0.91],[0.91,0.48,0.42],[0.42,0.91,0.76],[0.91,0.82,0.42],[0.80,0.42,0.91]];
const WAVE_POS = [0.25, 0.42, 0.58, 0.75, 0.35];

const DEFS = {
  wave: { label: 'Wave', badge: 'sine band', controls: [
    { k:'color', t:'color', l:'colour' },
    { k:'freq', t:'range', l:'frequency', min:0.5, max:20, step:0.1, def:4 },
    { k:'amp', t:'range', l:'amplitude', min:0, max:0.7, step:0.005, def:0.15 },
    { k:'spd', t:'range', l:'speed', min:-3, max:3, step:0.05, def:0.6 },
    { k:'pos', t:'range', l:'position', min:0.02, max:0.98, step:0.01, def:0.5 },
    { k:'edge', t:'range', l:'softness', min:0.003, max:0.9, step:0.003, def:0.06 },
    { k:'angle', t:'range', l:'direction °', min:-360, max:360, step:1, def:0 },
  ]},
  warp: { label: 'Noise Warp', badge: 'fBm domain warp', controls: [
    { k:'str', t:'range', l:'strength', min:0, max:2, step:0.01, def:0.5 },
    { k:'scale', t:'range', l:'scale', min:0.3, max:8, step:0.1, def:2.0 },
    { k:'wspd', t:'range', l:'drift speed', min:0, max:1, step:0.01, def:0.12 },
    { k:'oct', t:'range', l:'octaves', min:1, max:8, step:1, def:4 },
  ]},
  grain: { label: 'Grain', badge: 'film texture', controls: [
    { k:'amount', t:'range', l:'amount', min:0, max:0.5, step:0.005, def:0.08 },
    { k:'size', t:'range', l:'grain size', min:0.5, max:6, step:0.1, def:1.0 },
    { k:'anim', t:'toggle', l:'animated', def:1 },
    { k:'streak', t:'toggle', l:'streaked', def:0 },
    { k:'sangle', t:'range', l:'streak angle °', min:0, max:360, step:1, def:90 },
    { k:'slen', t:'range', l:'streak length', min:1, max:20, step:0.5, def:6 },
  ]},
  chroma: { label: 'Chromatic Aberr.', badge: 'RGB split', controls: [
    { k:'spread', t:'range', l:'spread', min:0, max:0.03, step:0.0005, def:0.006 },
    { k:'angle', t:'range', l:'angle °', min:0, max:360, step:1, def:0 },
  ]},
  scanlines: { label: 'Scanlines', badge: 'CRT rows', controls: [
    { k:'count', t:'range', l:'line count', min:20, max:600, step:5, def:120 },
    { k:'dark', t:'range', l:'darkness', min:0, max:1, step:0.01, def:0.4 },
    { k:'soft', t:'range', l:'softness', min:0, max:1, step:0.01, def:0.3 },
    { k:'scroll', t:'toggle', l:'scrolling', def:0 },
    { k:'scrollspd', t:'range', l:'scroll speed', min:0, max:2, step:0.05, def:0.3 },
  ]},
  barrel: { label: 'Barrel Distort', badge: 'lens warp', controls: [
    { k:'str', t:'range', l:'strength', min:-1, max:1, step:0.01, def:0.3 },
    { k:'zoom', t:'range', l:'zoom', min:0.5, max:1.5, step:0.01, def:0.9 },
  ]},
  vignette: { label: 'Vignette', badge: 'edge darken', controls: [
    { k:'str', t:'range', l:'strength', min:0, max:2, step:0.01, def:0.6 },
    { k:'soft', t:'range', l:'softness', min:0.05, max:1.5, step:0.01, def:0.4 },
  ]},
  colorgrade: { label: 'Color Grade', badge: 'contrast · sat · hue', controls: [
    { k:'contrast', t:'range', l:'contrast', min:0, max:2, step:0.01, def:1.0 },
    { k:'sat', t:'range', l:'saturation', min:0, max:2, step:0.01, def:1.0 },
    { k:'bright', t:'range', l:'brightness', min:-0.5, max:0.5, step:0.01, def:0.0 },
    { k:'hue', t:'range', l:'hue shift °', min:0, max:360, step:1, def:0 },
  ]},
  pixelate: { label: 'Pixelate', badge: 'block pixels', controls: [
    { k:'size', t:'range', l:'block size', min:1, max:64, step:1, def:4 },
  ]},
  posterize: { label: 'Posterize', badge: 'palette quantize', controls: [
    { k:'bands', t:'range', l:'bands', min:2, max:16, step:1, def:5 },
    { k:'mix', t:'range', l:'palette mix', min:0, max:1, step:0.01, def:1.0 },
    { k:'c1', t:'color', l:'dark colour A', def:'#82C67C' },
    { k:'c2', t:'color', l:'dark colour B', def:'#336B51' },
    { k:'c3', t:'color', l:'bright colour A', def:'#257847' },
    { k:'c4', t:'color', l:'bright colour B', def:'#0F4140' },
  ]},
  dirgradient: { label: 'Dir. Gradient', badge: 'top · bottom curve', controls: [
    { k:'topstr', t:'range', l:'top darkness', min:0, max:1, step:0.01, def:0.45 },
    { k:'botstr', t:'range', l:'bottom bright', min:0, max:2, step:0.01, def:1.0 },
    { k:'power', t:'range', l:'curve power', min:1, max:16, step:0.5, def:8 },
  ]},
  // Phase 2 — Interactive
  shockwave: { label: 'Shockwave', badge: 'radial pulse', interactive: true, controls: [
    { k:'sw_speed', t:'range', l:'speed', min:0.2, max:2.0, step:0.05, def:0.65 },
    { k:'sw_width', t:'range', l:'width', min:0.01, max:0.15, step:0.005, def:0.04 },
    { k:'sw_str', t:'range', l:'strength', min:0.01, max:0.25, step:0.005, def:0.09 },
    { k:'sw_ca', t:'range', l:'chromatic aberr.', min:0.0, max:0.04, step:0.001, def:0.014 },
  ]},
  glowring: { label: 'Glow Ring', badge: 'SDF wave pulse', interactive: true, controls: [
    { k:'color', t:'color', l:'colour', def:'#4488FF' },
    { k:'gr_w', t:'range', l:'box width', min:0.05, max:0.48, step:0.01, def:0.26 },
    { k:'gr_h', t:'range', l:'box height', min:0.05, max:0.48, step:0.01, def:0.14 },
    { k:'gr_r', t:'range', l:'corner radius', min:0.0, max:0.2, step:0.005, def:0.04 },
    { k:'gr_falloff', t:'range', l:'glow falloff', min:1.0, max:20.0, step:0.5, def:7.0 },
    { k:'gr_int', t:'range', l:'glow intensity', min:0.1, max:2.0, step:0.05, def:0.8 },
    { k:'gr_spd', t:'range', l:'wave speed', min:0.1, max:2.0, step:0.05, def:0.4 },
    { k:'gr_freq', t:'range', l:'wave frequency', min:5.0, max:40.0, step:1.0, def:18.0 },
  ]},
  buttonfx: { label: 'Button FX', badge: 'rays · crack', interactive: true, controls: [
    { k:'bf_mode', t:'toggle', l:'crack mode', def:0 },
    { k:'color', t:'color', l:'colour', def:'#FFE066' },
    { k:'bf_raycount', t:'range', l:'ray count', min:4, max:24, step:1, def:12 },
    { k:'bf_rotspd', t:'range', l:'rotation speed', min:0.0, max:3.0, step:0.1, def:0.4 },
    { k:'bf_sharp', t:'range', l:'sharpness', min:1.0, max:14.0, step:0.5, def:5.0 },
    { k:'bf_inner', t:'range', l:'inner radius', min:0.0, max:0.2, step:0.005, def:0.04 },
    { k:'bf_falloff', t:'range', l:'falloff', min:1.0, max:14.0, step:0.5, def:5.5 },
    { k:'bf_int', t:'range', l:'intensity', min:0.5, max:4.0, step:0.1, def:1.8 },
    { k:'bf_decay', t:'range', l:'decay', min:1.0, max:10.0, step:0.5, def:4.5 },
    { k:'bf_crackscale', t:'range', l:'crack scale', min:2.0, max:22.0, step:0.5, def:9.0 },
    { k:'bf_crackw', t:'range', l:'crack width', min:0.01, max:0.1, step:0.005, def:0.032 },
    { k:'bf_crackspd', t:'range', l:'crack speed', min:0.2, max:2.5, step:0.05, def:0.9 },
  ]},
  // Phase 2 — Orb
  orb: { label: 'Orb', badge: 'SDF fluid sphere', controls: [
    { k:'color', t:'color', l:'main colour', def:'#6644FF' },
    { k:'orb_clow', t:'color', l:'low colour', def:'#001133' },
    { k:'orb_cmid', t:'color', l:'mid colour', def:'#0055BB' },
    { k:'orb_chi', t:'color', l:'high colour', def:'#AACCFF' },
    { k:'orb_rad', t:'range', l:'radius', min:0.10, max:0.45, step:0.01, def:0.28 },
    { k:'orb_warp', t:'range', l:'warp amount', min:0.0, max:0.8, step:0.01, def:0.36 },
  ]},
};

// --- Helpers ---
function hexToRgb(h) {
  h = h.replace('#','');
  if (h.length === 3) h = h.split('').map(x => x+x).join('');
  return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255];
}
function rgbToHex(r,g,b) {
  return '#' + [r,g,b].map(v => Math.round(v*255).toString(16).padStart(2,'0')).join('');
}
function fmt(v, step) {
  const d = (step+'').includes('.') ? ((step+'').split('.')[1]||'').length : 0;
  return parseFloat(v).toFixed(d);
}
function defData(type) {
  const d = {};
  DEFS[type].controls.forEach(c => {
    if (c.t === 'color') {
      const hex = c.def || '#6B7FE8'; d[c.k] = hex;
      const [r,g,b] = hexToRgb(hex); d[c.k+'r'] = r; d[c.k+'g'] = g; d[c.k+'b'] = b;
    } else if (c.t === 'toggle') { d[c.k] = c.def || 0; }
    else { d[c.k] = c.def; }
  });
  return d;
}

// --- Frame ---
function onFrameChange() {
  frameW = Math.max(100, Math.min(7680, parseInt(document.getElementById('frame-w').value) || 800));
  frameH = Math.max(100, Math.min(4320, parseInt(document.getElementById('frame-h').value) || 600));
  document.getElementById('frame-w').value = frameW;
  document.getElementById('frame-h').value = frameH;
  applyFrame();
}
function onFrameRadius(v) {
  frameRadius = parseInt(v) || 0;
  document.getElementById('frame-radius-val').textContent = frameRadius;
  canvas.style.borderRadius = frameRadius + 'px';
}
function setFrameSize(w, h) {
  frameW = w; frameH = h;
  document.getElementById('frame-w').value = w;
  document.getElementById('frame-h').value = h;
  applyFrame();
}
function applyFrame() {
  canvas.width = frameW; canvas.height = frameH;
  canvas.style.width = frameW + 'px'; canvas.style.height = frameH + 'px';
  canvas.style.maxWidth = '100%'; canvas.style.maxHeight = '100%';
  gl.viewport(0, 0, frameW, frameH);
  document.getElementById('out-res').textContent = `${frameW} × ${frameH}`;
  document.getElementById('status-dims').textContent = `${frameW} × ${frameH}`;
  needsRecompile = true;
}

// --- Background ---
function onBgColor(hex) {
  document.getElementById('bg-swatch').style.background = hex;
  document.getElementById('bg-hex').textContent = hex;
  const [r,g,b] = hexToRgb(hex); bgR = r; bgG = g; bgB = b;
  needsRecompile = true;
}
function setBg(hex) {
  document.getElementById('bg-swatch').style.background = hex;
  document.getElementById('bg-hex').textContent = hex;
  document.getElementById('bg-cp').value = hex;
  const [r,g,b] = hexToRgb(hex); bgR = r; bgG = g; bgB = b;
}

// --- Playback ---
function togglePlay() {
  playing = !playing;
  const btn = document.getElementById('btn-play');
  if (playing) {
    timeOffset += performance.now() - pausedAt;
    btn.classList.add('active');
    btn.innerHTML = '<svg viewBox="0 0 14 14"><polygon points="3,1 12,7 3,13" stroke="currentColor" fill="none"/></svg>';
  } else {
    pausedAt = performance.now();
    btn.classList.remove('active');
    btn.innerHTML = '<svg viewBox="0 0 14 14"><rect x="3" y="2" width="3" height="10" rx="0.5"/><rect x="8" y="2" width="3" height="10" rx="0.5"/></svg>';
  }
}
function restartTime() {
  timeOffset = performance.now(); pausedAt = performance.now();
  if (!playing) { playing = true; const btn = document.getElementById('btn-play'); btn.classList.add('active'); btn.innerHTML = '<svg viewBox="0 0 14 14"><polygon points="3,1 12,7 3,13" stroke="currentColor" fill="none"/></svg>'; }
}

// --- Effect Management ---
function addFx(type, data, on) {
  if (!DEFS[type]) return;
  const id = ++eid;
  const d = data || defData(type);
  if (type === 'wave' && !data) {
    const wc = effects.filter(e => e.type === 'wave');
    const c = WAVE_COLS[wc.length % WAVE_COLS.length];
    d.r = c[0]; d.g = c[1]; d.b = c[2]; d.color = rgbToHex(c[0], c[1], c[2]);
    d.colorr = c[0]; d.colorg = c[1]; d.colorb = c[2];
    d.pos = WAVE_POS[wc.length % WAVE_POS.length];
    d.spd = 0.4 + wc.length * 0.2; d.freq = 3 + wc.length * 1.5;
  }
  const entry = { id, type, on: on !== undefined ? on : true, data: d, blend: 'normal' };
  // Base image always at position 0
  if (effects.length && effects[0].type === '_baseimg') {
    effects.splice(1, 0, entry);
  } else {
    effects.push(entry);
  }
  selectedEffectId = id;
  renderUI(); needsRecompile = true;
}

function addFxAfter(type, data, on, afterId) {
  const id = ++eid;
  const d = data || defData(type);
  const idx = effects.findIndex(e => e.id === afterId);
  const entry = { id, type, on: on !== undefined ? on : true, data: d, blend: 'normal' };
  if (idx >= 0) effects.splice(idx + 1, 0, entry);
  else effects.push(entry);
  selectedEffectId = id;
  renderUI(); needsRecompile = true;
}

function removeFx(id) {
  const e = effects.find(e => e.id === id);
  if (e && e.type === '_baseimg') { clearBaseImage(); return; }
  effects = effects.filter(e => e.id !== id);
  if (selectedEffectId === id) selectedEffectId = effects.length ? effects[effects.length-1].id : null;
  renderUI(); needsRecompile = true;
}

function toggleFx(id, btn) {
  const e = effects.find(e => e.id === id); if (!e) return;
  e.on = !e.on; btn.classList.toggle('on', e.on); needsRecompile = true;
}

function toggleBlend(id) {
  const e = effects.find(e => e.id === id); if (!e) return;
  e.blend = e.blend === 'add' ? 'normal' : 'add';
  renderUI(); needsRecompile = true;
}

function selectEffect(id) { selectedEffectId = id; renderUI(); }

function duplicateFx(id) {
  const e = effects.find(e => e.id === id); if (!e || e.type === '_baseimg') return;
  const d = JSON.parse(JSON.stringify(e.data));
  if (e.type === 'wave' && d.r !== undefined) {
    d.r = Math.min(1, d.r + 0.12); d.g = Math.min(1, d.g + 0.08); d.b = Math.min(1, d.b - 0.05);
    d.color = rgbToHex(d.r, d.g, d.b); d.colorr = d.r; d.colorg = d.g; d.colorb = d.b;
  }
  addFxAfter(e.type, d, e.on, id);
}

function clearAll() {
  clearBaseImage();
  effects = []; eid = 0; selectedEffectId = null; activePreset = null;
  setBg('#0A0A0F'); renderUI(); needsRecompile = true;
}

// --- Image Upload ---
function onImageUpload(input) {
  if (!input.files || !input.files[0]) return;
  loadBaseImage(input.files[0]);
}

function loadBaseImage(file) {
  const img = new Image();
  img.onload = () => {
    // Upload to WebGL texture unit 0
    if (!baseImageTex) baseImageTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, baseImageTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    hasBaseImage = true;
    baseImageName = file.name.length > 24 ? file.name.slice(0, 22) + '…' : file.name;

    // Update drop zone UI
    document.getElementById('drop-zone-text').textContent = baseImageName;
    document.getElementById('drop-zone-clear').style.display = 'flex';

    // Insert base layer at position 0 if not already present
    if (!effects.find(e => e.type === '_baseimg')) {
      const id = ++eid;
      effects.unshift({ id, type: '_baseimg', on: true, data: {}, blend: 'normal' });
    }
    renderUI(); needsRecompile = true;
  };
  img.src = URL.createObjectURL(file);
}

function clearBaseImage() {
  hasBaseImage = false; baseImageName = '';
  effects = effects.filter(e => e.type !== '_baseimg');
  document.getElementById('drop-zone-text').textContent = 'drop image or click to upload';
  document.getElementById('drop-zone-clear').style.display = 'none';
  document.getElementById('img-input').value = '';
  renderUI(); needsRecompile = true;
}

// Drop zone drag events
const dropZone = document.getElementById('drop-zone');
document.querySelector('.panel-left').addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-active'); });
document.querySelector('.panel-left').addEventListener('dragleave', e => { if (!e.currentTarget.contains(e.relatedTarget)) dropZone.classList.remove('drag-active'); });
document.querySelector('.panel-left').addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-active');
  if (e.dataTransfer.files && e.dataTransfer.files[0] && e.dataTransfer.files[0].type.startsWith('image/')) {
    loadBaseImage(e.dataTransfer.files[0]);
  }
});

// --- Canvas Mouse/Click ---
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouseX = (e.clientX - rect.left) / rect.width;
  mouseY = 1.0 - (e.clientY - rect.top) / rect.height;
});

canvas.addEventListener('click', e => {
  const rect = canvas.getBoundingClientRect();
  clickX = (e.clientX - rect.left) / rect.width;
  clickY = 1.0 - (e.clientY - rect.top) / rect.height;
  clickStartTime = performance.now();
  // Reset hint fade timer
  lastClickTimeForHint = performance.now();
});

let lastClickTimeForHint = 0;

// --- Drag Reorder ---
function onDragStart(e, id) {
  dragSrcId = id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id);
  setTimeout(() => { const c = document.querySelector(`[data-eid="${id}"]`); if (c) c.classList.add('dragging'); }, 0);
}
function onDragEnd(e, id) {
  dragSrcId = null;
  document.querySelectorAll('.effect-card').forEach(c => c.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom'));
}
function onDragOver(e, id) {
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  const card = e.currentTarget, rect = card.getBoundingClientRect(), mid = rect.top + rect.height / 2;
  document.querySelectorAll('.effect-card').forEach(c => c.classList.remove('drag-over-top', 'drag-over-bottom'));
  if (e.clientY < mid) card.classList.add('drag-over-top'); else card.classList.add('drag-over-bottom');
}
function onDrop(e, targetId) {
  e.preventDefault();
  if (dragSrcId === null || dragSrcId === targetId) return;
  const srcIdx = effects.findIndex(x => x.id === dragSrcId);
  const tgtIdx = effects.findIndex(x => x.id === targetId);
  if (srcIdx < 0 || tgtIdx < 0) return;
  // Don't allow moving base image or moving before it
  if (effects[srcIdx].type === '_baseimg') return;
  const [moved] = effects.splice(srcIdx, 1);
  const card = e.currentTarget, rect = card.getBoundingClientRect(), mid = rect.top + rect.height / 2;
  let insertIdx = e.clientY < mid ? tgtIdx : tgtIdx + (srcIdx < tgtIdx ? 0 : 1);
  // Keep base image at 0
  if (effects[0] && effects[0].type === '_baseimg' && insertIdx === 0) insertIdx = 1;
  effects.splice(insertIdx, 0, moved);
  dragSrcId = null;
  renderUI(); needsRecompile = true;
}

// --- UI Rendering ---
function renderUI() {
  renderEffectStack();
  renderPropsPanel();
  updateStatus();
  updateCanvasCursor();
  renderPresets();
}

const DRAG_ICON = '<svg viewBox="0 0 10 14" fill="currentColor" stroke="none"><circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/></svg>';
const DUP_ICON = '<svg viewBox="0 0 12 12"><rect x="3.5" y="3.5" width="7" height="7" rx="1"/><path d="M8.5 3.5V2a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v5.5a1 1 0 0 0 1 1h1.5"/></svg>';

function renderEffectStack() {
  const el = document.getElementById('effect-stack');
  el.innerHTML = '';
  effects.forEach(e => {
    const isBase = e.type === '_baseimg';
    const def = isBase ? { label: baseImageName || 'base image', badge: 'base image' } : DEFS[e.type];
    if (!def) return;
    const card = document.createElement('div');
    card.className = 'effect-card' + (e.id === selectedEffectId ? ' selected' : '') + (isBase ? ' effect-card--base' : '');
    card.setAttribute('data-eid', e.id);
    if (!isBase) {
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', ev => onDragStart(ev, e.id));
      card.addEventListener('dragend', ev => onDragEnd(ev, e.id));
      card.addEventListener('dragover', ev => onDragOver(ev, e.id));
      card.addEventListener('drop', ev => onDrop(ev, e.id));
    }

    const isInteractive = DEFS[e.type] && DEFS[e.type].interactive;
    let dotHtml;
    if (isBase) {
      dotHtml = '<div class="effect-dot--base"></div>';
    } else if (isInteractive) {
      dotHtml = '<span style="font-size:9px;flex-shrink:0;opacity:0.6">⚡</span>';
    } else if (e.type === 'wave') {
      dotHtml = `<div class="effect-dot" style="background:${e.data.color || '#aaa'}"></div>`;
    } else if (e.type === 'orb') {
      dotHtml = `<div class="effect-dot" style="background:${e.data.color || '#6644FF'}"></div>`;
    } else {
      dotHtml = '';
    }

    const blendBadge = isBase ? '' : `<button class="blend-badge blend-badge--${e.blend==='add'?'add':'nrm'}" onclick="event.stopPropagation();toggleBlend(${e.id})">${e.blend==='add'?'ADD':'NRM'}</button>`;

    const actionsHtml = isBase
      ? `<button class="effect-action-btn effect-action-btn--remove" onclick="event.stopPropagation();removeFx(${e.id})" title="Remove"><svg viewBox="0 0 12 12"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg></button>`
      : `<div class="effect-actions">
          <button class="effect-action-btn" onclick="event.stopPropagation();duplicateFx(${e.id})" title="Duplicate">${DUP_ICON}</button>
          <button class="effect-action-btn effect-action-btn--remove" onclick="event.stopPropagation();removeFx(${e.id})" title="Remove"><svg viewBox="0 0 12 12"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg></button>
        </div>`;

    card.innerHTML = `<div class="effect-head" onclick="selectEffect(${e.id})">
      <div class="drag-handle" onmousedown="event.stopPropagation()">${DRAG_ICON}</div>
      ${dotHtml}<span class="effect-name">${def.label}</span>
      <span class="effect-badge">${def.badge}</span>
      ${blendBadge}
      ${actionsHtml}
      <button class="effect-toggle ${e.on?'on':''}" onclick="event.stopPropagation();toggleFx(${e.id},this)"></button>
    </div>`;
    el.appendChild(card);
  });
}

function renderPropsPanel() {
  const panel = document.getElementById('props-panel');
  const e = effects.find(e => e.id === selectedEffectId);
  if (!e || e.type === '_baseimg') {
    panel.innerHTML = '<div style="color:var(--text-muted);font-size:10px;padding:8px 0;">Select an effect to edit properties</div>';
    return;
  }
  const def = DEFS[e.type]; if (!def) return;
  let html = `<div style="margin-bottom:8px;font-size:11px;font-weight:500;color:var(--text-active)">${def.label}</div>`;
  def.controls.forEach(c => { html += renderPropControl(e, c); });
  panel.innerHTML = html;
}

function renderPropControl(e, c) {
  if (c.t === 'color') {
    const hex = e.data[c.k] || c.def || '#ffffff';
    const uid = `cp-${e.id}-${c.k}`;
    return `<div class="prop-row">
      <span class="prop-label">${c.l}</span>
      <div class="prop-swatch" style="background:${hex}" onclick="document.getElementById('${uid}').click()"></div>
      <span class="bg-hex">${hex}</span>
      <input type="color" class="prop-color-input" id="${uid}" value="${hex}" oninput="onColor(${e.id},'${c.k}',this.value)">
    </div>`;
  }
  if (c.t === 'toggle') {
    return `<div class="prop-row">
      <span class="prop-label">${c.l}</span>
      <button class="prop-toggle ${e.data[c.k]?'on':''}" onclick="onTog(${e.id},'${c.k}',this)"></button>
    </div>`;
  }
  const v = e.data[c.k]; const vid = `vv-${e.id}-${c.k}`;
  return `<div class="prop-row">
    <span class="prop-label">${c.l}</span>
    <input class="prop-slider" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${v}" oninput="onRange(${e.id},'${c.k}',this,'${vid}')">
    <span class="prop-value" id="${vid}">${fmt(v, c.step)}</span>
  </div>`;
}

function onColor(id, key, hex) {
  const e = effects.find(e => e.id === id); if (!e) return;
  e.data[key] = hex;
  const [r,g,b] = hexToRgb(hex);
  e.data[key+'r'] = r; e.data[key+'g'] = g; e.data[key+'b'] = b;
  if (key === 'color') { e.data.r = r; e.data.g = g; e.data.b = b; }
  renderUI(); needsRecompile = true;
}
function onRange(id, key, el, vid) {
  const e = effects.find(e => e.id === id); if (e) e.data[key] = parseFloat(el.value);
  document.getElementById(vid).textContent = fmt(el.value, el.step);
  needsRecompile = true;
}
function onTog(id, key, btn) {
  btn.classList.toggle('on');
  const e = effects.find(e => e.id === id);
  if (e) e.data[key] = btn.classList.contains('on') ? 1 : 0;
  needsRecompile = true;
}
function updateStatus() {
  const count = effects.filter(e => e.type !== '_baseimg').length;
  document.getElementById('status-effects').textContent = count + ' effect' + (count !== 1 ? 's' : '');
}

function updateCanvasCursor() {
  const hasInteractive = effects.some(e => INTERACTIVE_TYPES.includes(e.type) && e.on);
  const area = document.querySelector('.canvas-area');
  const hint = document.getElementById('canvas-hint');
  if (hasInteractive) {
    area.classList.add('crosshair');
    // Hint visibility based on time since last click
    const sinceClick = performance.now() - lastClickTimeForHint;
    if (sinceClick > 8000) hint.classList.add('visible');
    else if (sinceClick < 4000) hint.classList.remove('visible');
  } else {
    area.classList.remove('crosshair');
    hint.classList.remove('visible');
  }
}

// --- Add Buttons ---
function renderAddGrid() {
  const grid = document.getElementById('add-grid');
  const mainEffects = Object.keys(DEFS).filter(k => !DEFS[k].interactive && k !== 'orb');
  grid.innerHTML = mainEffects.map(k =>
    `<button class="add-btn" onclick="addFx('${k}')">${DEFS[k].label}</button>`
  ).join('') + `<button class="add-btn" onclick="addFx('orb')">Orb</button>`;

  const igrid = document.getElementById('add-grid-interactive');
  const interactiveEffects = Object.keys(DEFS).filter(k => DEFS[k].interactive);
  igrid.innerHTML = interactiveEffects.map(k =>
    `<button class="add-btn" onclick="addFx('${k}')">${DEFS[k].label}</button>`
  ).join('');
}

// --- Preset Buttons ---
function renderPresets() {
  const grid = document.getElementById('preset-grid');
  const names = Object.keys(PRESETS);
  grid.innerHTML = names.map(p =>
    `<button class="preset-btn${activePreset===p?' active':''}" onclick="loadPreset('${p}')">${p.charAt(0).toUpperCase()+p.slice(1)}</button>`
  ).join('') + `<button class="preset-btn preset-btn--danger" onclick="clearAll()">Clear</button>`;
}

// --- Command Palette ---
function openPalette() {
  document.getElementById('cmd-overlay').classList.add('open');
  const input = document.getElementById('cmd-input');
  input.value = ''; filterPalette(''); input.focus();
}
function closePalette() { document.getElementById('cmd-overlay').classList.remove('open'); }
function filterPalette(query) {
  const list = document.getElementById('cmd-list');
  const q = query.toLowerCase();
  const items = Object.entries(DEFS).filter(([k, v]) =>
    !q || v.label.toLowerCase().includes(q) || v.badge.toLowerCase().includes(q)
  );
  if (!items.length) { list.innerHTML = '<div class="cmd-empty">No matching effects</div>'; return; }
  list.innerHTML = items.map(([k, v]) =>
    `<div class="cmd-item" onclick="addFx('${k}');closePalette()">
      <span class="cmd-item-name">${v.label}</span>
      <span class="cmd-item-badge">${v.badge}</span>
    </div>`
  ).join('');
}
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); const ov = document.getElementById('cmd-overlay'); ov.classList.contains('open') ? closePalette() : openPalette(); }
  if (e.key === 'Escape') closePalette();
  if (document.getElementById('cmd-overlay').classList.contains('open') && e.key === 'Enter') { const a = document.querySelector('.cmd-item.active') || document.querySelector('.cmd-item'); if (a) a.click(); }
});

// --- Export Dropdown ---
function toggleExportMenu() { document.getElementById('export-menu').classList.toggle('open'); }
function closeExportMenu() { document.getElementById('export-menu').classList.remove('open'); }
document.addEventListener('click', e => { if (!e.target.closest('.export-wrap')) closeExportMenu(); });
function copyCode() {
  const src = buildFrag(true);
  navigator.clipboard.writeText(src).then(() => {
    const b = document.getElementById('btn-export');
    const orig = b.innerHTML; b.textContent = 'Copied!';
    setTimeout(() => { b.innerHTML = orig; }, 1500);
  });
}

// --- Preset Loader ---
function loadPreset(name) {
  const preset = PRESETS[name]; if (!preset) return;
  effects = []; eid = 0; selectedEffectId = null; activePreset = name;
  if (hasBaseImage) clearBaseImage();
  setBg(preset.bg);
  preset.layers.forEach(l => {
    const d = Object.assign({}, l.data);
    if (l.type === 'wave' && d.color) {
      const [r,g,b] = hexToRgb(d.color);
      d.r = r; d.g = g; d.b = b; d.colorr = r; d.colorg = g; d.colorb = b;
    }
    if ((l.type === 'glowring' || l.type === 'buttonfx' || l.type === 'orb') && d.color) {
      const [r,g,b] = hexToRgb(d.color);
      d.colorr = r; d.colorg = g; d.colorb = b;
    }
    addFx(l.type, d, true);
  });
  if (effects.length) selectedEffectId = effects[0].id;
  renderUI(); needsRecompile = true;
}

function loadRandom() {
  const keys = Object.keys(PRESETS);
  loadPreset(keys[Math.floor(Math.random() * keys.length)]);
}
