// ================================================================
// SHADER LAB — Engine
// ================================================================

// --- State ---
const canvas = document.getElementById('glcanvas');
const gl = canvas.getContext('webgl');
let effects = [], eid = 0, prog = null, needsRecompile = true;
let bgR = 0.04, bgG = 0.04, bgB = 0.07;
let playing = true, timeOffset = 0, pausedAt = 0;
let selectedEffectId = null;
let frameCount = 0, lastFpsTime = performance.now(), currentFps = 60;

// --- Effect Definitions ---
const WAVE_COLS = [[0.42,0.50,0.91],[0.91,0.48,0.42],[0.42,0.91,0.76],[0.91,0.82,0.42],[0.80,0.42,0.91]];
const WAVE_POS = [0.25, 0.42, 0.58, 0.75, 0.35];

const DEFS = {
  wave: { label: 'Wave', badge: 'sine band', controls: [
    { k:'color', t:'color', l:'colour' },
    { k:'freq', t:'range', l:'frequency', min:0.5, max:20, step:0.1, def:4 },
    { k:'amp', t:'range', l:'amplitude', min:0, max:0.4, step:0.005, def:0.15 },
    { k:'spd', t:'range', l:'speed', min:-3, max:3, step:0.05, def:0.6 },
    { k:'pos', t:'range', l:'position', min:0.02, max:0.98, step:0.01, def:0.5 },
    { k:'edge', t:'range', l:'softness', min:0.003, max:0.18, step:0.003, def:0.06 },
    { k:'angle', t:'range', l:'direction °', min:0, max:360, step:1, def:0 },
  ]},
  warp: { label: 'Noise Warp', badge: 'fBm domain warp', controls: [
    { k:'str', t:'range', l:'strength', min:0, max:2, step:0.01, def:0.5 },
    { k:'scale', t:'range', l:'scale', min:0.3, max:8, step:0.1, def:2.0 },
    { k:'wspd', t:'range', l:'drift speed', min:0, max:1, step:0.01, def:0.12 },
    { k:'oct', t:'range', l:'octaves', min:1, max:6, step:1, def:4 },
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
    { k:'spread', t:'range', l:'spread', min:0, max:0.025, step:0.0005, def:0.006 },
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
  timeOffset = performance.now();
  pausedAt = performance.now();
  if (!playing) {
    playing = true;
    const btn = document.getElementById('btn-play');
    btn.classList.add('active');
    btn.innerHTML = '<svg viewBox="0 0 14 14"><polygon points="3,1 12,7 3,13" stroke="currentColor" fill="none"/></svg>';
  }
}

// --- Effect Management ---
function addFx(type, data, on) {
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
  effects.push({ id, type, on: on !== undefined ? on : true, data: d, open: true });
  selectedEffectId = id;
  renderUI();
  needsRecompile = true;
}

function removeFx(id) {
  effects = effects.filter(e => e.id !== id);
  if (selectedEffectId === id) selectedEffectId = effects.length ? effects[effects.length-1].id : null;
  renderUI(); needsRecompile = true;
}

function toggleFx(id, btn) {
  const e = effects.find(e => e.id === id); if (!e) return;
  e.on = !e.on; btn.classList.toggle('on', e.on); needsRecompile = true;
}

function selectEffect(id) {
  selectedEffectId = id;
  renderUI();
}

function clearAll() {
  effects = []; eid = 0; selectedEffectId = null;
  setBg('#0a0a12'); renderUI(); needsRecompile = true;
}

// --- UI Rendering ---
function renderUI() {
  renderEffectStack();
  renderPropsPanel();
  updateStatus();
}

function renderEffectStack() {
  const el = document.getElementById('effect-stack');
  el.innerHTML = '';
  effects.forEach(e => {
    const def = DEFS[e.type];
    const card = document.createElement('div');
    card.className = 'effect-card' + (e.id === selectedEffectId ? ' selected' : '');
    const dotColor = e.type === 'wave' ? (e.data.color || '#aaa') : '';
    const dotHtml = dotColor ? `<div class="effect-dot" style="background:${dotColor}"></div>` : '';
    card.innerHTML = `<div class="effect-head" onclick="selectEffect(${e.id})">
      ${dotHtml}<span class="effect-name">${def.label}</span>
      <span class="effect-badge">${def.badge}</span>
      <button class="effect-toggle ${e.on?'on':''}" onclick="event.stopPropagation();toggleFx(${e.id},this)"></button>
      <button class="effect-remove" onclick="event.stopPropagation();removeFx(${e.id})" title="Remove">✕</button>
    </div>`;
    el.appendChild(card);
  });
}

function renderPropsPanel() {
  const panel = document.getElementById('props-panel');
  const e = effects.find(e => e.id === selectedEffectId);
  if (!e) {
    panel.innerHTML = '<div style="color:var(--text-muted);font-size:10px;padding:8px 0;">Select an effect to edit properties</div>';
    return;
  }
  const def = DEFS[e.type];
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
  const v = e.data[c.k];
  const vid = `vv-${e.id}-${c.k}`;
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
  document.getElementById('status-effects').textContent = effects.length + ' effect' + (effects.length !== 1 ? 's' : '');
}

// --- Add Buttons ---
function renderAddGrid() {
  const grid = document.getElementById('add-grid');
  grid.innerHTML = Object.keys(DEFS).map(k =>
    `<button class="add-btn" onclick="addFx('${k}')">${DEFS[k].label}</button>`
  ).join('');
}

// --- Preset Buttons ---
function renderPresets() {
  const grid = document.getElementById('preset-grid');
  const presets = ['watercolour','crt','waterfall','minimal'];
  grid.innerHTML = presets.map(p =>
    `<button class="preset-btn" onclick="loadPreset('${p}')">${p.charAt(0).toUpperCase()+p.slice(1)}</button>`
  ).join('') + `<button class="preset-btn preset-btn--danger" onclick="clearAll()">Clear</button>`;
}

// --- Command Palette ---
function openPalette() {
  const overlay = document.getElementById('cmd-overlay');
  overlay.classList.add('open');
  const input = document.getElementById('cmd-input');
  input.value = '';
  filterPalette('');
  input.focus();
}

function closePalette() {
  document.getElementById('cmd-overlay').classList.remove('open');
}

function filterPalette(query) {
  const list = document.getElementById('cmd-list');
  const q = query.toLowerCase();
  const items = Object.entries(DEFS).filter(([k, v]) =>
    !q || v.label.toLowerCase().includes(q) || v.badge.toLowerCase().includes(q)
  );
  if (items.length === 0) {
    list.innerHTML = '<div class="cmd-empty">No matching effects</div>';
    return;
  }
  list.innerHTML = items.map(([k, v]) =>
    `<div class="cmd-item" onclick="addFx('${k}');closePalette()">
      <span class="cmd-item-name">${v.label}</span>
      <span class="cmd-item-badge">${v.badge}</span>
    </div>`
  ).join('');
}

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    const overlay = document.getElementById('cmd-overlay');
    if (overlay.classList.contains('open')) closePalette();
    else openPalette();
  }
  if (e.key === 'Escape') closePalette();
  // Arrow navigation in palette
  if (document.getElementById('cmd-overlay').classList.contains('open') && e.key === 'Enter') {
    const active = document.querySelector('.cmd-item.active') || document.querySelector('.cmd-item');
    if (active) active.click();
  }
});

// --- Copy for Shadertoy ---
function copyCode() {
  const src = buildFrag(true);
  navigator.clipboard.writeText(src).then(() => {
    const b = document.getElementById('btn-copy');
    const orig = b.innerHTML;
    b.innerHTML = '<svg viewBox="0 0 14 14"><polyline points="3,7 6,10 11,4" stroke-width="1.5"/></svg> Copied!';
    setTimeout(() => { b.innerHTML = orig; }, 2000);
  });
}

// --- Presets (ported from v6) ---
function loadPreset(name) {
  effects = []; eid = 0; selectedEffectId = null;
  if (name === 'watercolour') {
    setBg('#0a0a12');
    addFx('warp', {str:0.6,scale:2.2,wspd:0.1,oct:4}, true);
    addFx('wave', {color:'#6B7FE8',colorr:0.42,colorg:0.50,colorb:0.91,r:0.42,g:0.50,b:0.91,freq:3,amp:0.18,spd:0.5,pos:0.28,edge:0.07,angle:0}, true);
    addFx('wave', {color:'#E87B6B',colorr:0.91,colorg:0.48,colorb:0.42,r:0.91,g:0.48,b:0.42,freq:5,amp:0.14,spd:0.75,pos:0.5,edge:0.06,angle:0}, true);
    addFx('wave', {color:'#6BE8C2',colorr:0.42,colorg:0.91,colorb:0.76,r:0.42,g:0.91,b:0.76,freq:7,amp:0.10,spd:1.0,pos:0.72,edge:0.05,angle:0}, true);
    addFx('grain', {amount:0.05,size:1.2,anim:1,streak:0,sangle:90,slen:6}, true);
    addFx('vignette', {str:0.5,soft:0.4}, true);
  } else if (name === 'crt') {
    setBg('#010a02');
    addFx('barrel', {str:0.25,zoom:0.92}, true);
    addFx('wave', {color:'#22ff88',colorr:0.13,colorg:1.0,colorb:0.53,r:0.13,g:1.0,b:0.53,freq:2,amp:0.08,spd:0.3,pos:0.5,edge:0.04,angle:0}, true);
    addFx('wave', {color:'#44ffaa',colorr:0.27,colorg:1.0,colorb:0.67,r:0.27,g:1.0,b:0.67,freq:4,amp:0.06,spd:0.5,pos:0.35,edge:0.035,angle:0}, true);
    addFx('scanlines', {count:180,dark:0.55,soft:0.2,scroll:0,scrollspd:0.3}, true);
    addFx('grain', {amount:0.06,size:0.8,anim:1,streak:0,sangle:90,slen:6}, true);
    addFx('chroma', {spread:0.004,angle:0}, true);
    addFx('vignette', {str:1.0,soft:0.3}, true);
    addFx('colorgrade', {contrast:1.2,sat:0.7,bright:-0.05,hue:0}, true);
  } else if (name === 'waterfall') {
    setBg('#040d08');
    addFx('pixelate', {size:4}, true);
    addFx('warp', {str:0.8,scale:1.5,wspd:0.4,oct:3}, true);
    addFx('wave', {color:'#82C67C',colorr:0.510,colorg:0.776,colorb:0.486,r:0.510,g:0.776,b:0.486,freq:2,amp:0.22,spd:1.2,pos:0.3,edge:0.09,angle:0}, true);
    addFx('wave', {color:'#336B51',colorr:0.200,colorg:0.604,colorb:0.318,r:0.200,g:0.604,b:0.318,freq:3,amp:0.18,spd:1.5,pos:0.5,edge:0.08,angle:0}, true);
    addFx('wave', {color:'#257847',colorr:0.145,colorg:0.490,colorb:0.278,r:0.145,g:0.490,b:0.278,freq:4,amp:0.14,spd:1.8,pos:0.68,edge:0.07,angle:0}, true);
    addFx('posterize', {bands:5,mix:0.9,c1:'#82C67C',c1r:0.510,c1g:0.776,c1b:0.486,c2:'#336B51',c2r:0.200,c2g:0.604,c2b:0.318,c3:'#257847',c3r:0.145,c3g:0.490,c3b:0.278,c4:'#0F4140',c4r:0.059,c4g:0.255,c4b:0.251}, true);
    addFx('dirgradient', {topstr:0.45,botstr:1.0,power:8}, true);
    addFx('vignette', {str:0.4,soft:0.5}, true);
  } else if (name === 'minimal') {
    setBg('#f5f5f0');
    addFx('wave', {color:'#4455cc',colorr:0.27,colorg:0.33,colorb:0.80,r:0.27,g:0.33,b:0.80,freq:2,amp:0.12,spd:0.3,pos:0.5,edge:0.12,angle:0}, true);
    addFx('vignette', {str:0.3,soft:0.8}, true);
  }
  if (effects.length) selectedEffectId = effects[0].id;
  renderUI(); needsRecompile = true;
}

// --- Randomized Default ---
function loadRandom() {
  effects = []; eid = 0;
  const bgs = ['#0a0a12','#0d0815','#0a100e','#100a0a','#08080f'];
  setBg(bgs[Math.floor(Math.random() * bgs.length)]);

  // Always add 1-3 waves with random colors
  const waveCount = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < waveCount; i++) {
    const hue = Math.random() * 360;
    const r = Math.random() * 0.5 + 0.3;
    const g = Math.random() * 0.5 + 0.3;
    const b = Math.random() * 0.5 + 0.3;
    const hex = rgbToHex(r, g, b);
    addFx('wave', {
      color: hex, colorr: r, colorg: g, colorb: b, r, g, b,
      freq: 2 + Math.random() * 6,
      amp: 0.08 + Math.random() * 0.15,
      spd: 0.2 + Math.random() * 0.8,
      pos: 0.2 + Math.random() * 0.6,
      edge: 0.03 + Math.random() * 0.08,
      angle: Math.random() < 0.3 ? Math.floor(Math.random() * 360) : 0,
    }, true);
  }

  // 50% chance add warp
  if (Math.random() > 0.5) {
    addFx('warp', { str: 0.2 + Math.random() * 0.6, scale: 1 + Math.random() * 3, wspd: 0.05 + Math.random() * 0.2, oct: 2 + Math.floor(Math.random() * 3) }, true);
  }

  // 40% chance add grain
  if (Math.random() > 0.6) {
    addFx('grain', { amount: 0.03 + Math.random() * 0.06, size: 0.8 + Math.random() * 1.5, anim: 1, streak: 0, sangle: 90, slen: 6 }, true);
  }

  // 60% chance add vignette
  if (Math.random() > 0.4) {
    addFx('vignette', { str: 0.3 + Math.random() * 0.5, soft: 0.3 + Math.random() * 0.4 }, true);
  }

  if (effects.length) selectedEffectId = effects[0].id;
  renderUI(); needsRecompile = true;
}

// ================================================================
// GLSL Shader Builder (ported from v6)
// ================================================================
function buildFrag(forST) {
  const waves = effects.filter(e => e.on && e.type === 'wave');
  const warps = effects.filter(e => e.on && e.type === 'warp');
  const grains = effects.filter(e => e.on && e.type === 'grain');
  const chromas = effects.filter(e => e.on && e.type === 'chroma');
  const scans = effects.filter(e => e.on && e.type === 'scanlines');
  const barrels = effects.filter(e => e.on && e.type === 'barrel');
  const vignettes = effects.filter(e => e.on && e.type === 'vignette');
  const grades = effects.filter(e => e.on && e.type === 'colorgrade');
  const pixels = effects.filter(e => e.on && e.type === 'pixelate');
  const posts = effects.filter(e => e.on && e.type === 'posterize');
  const dirgrads = effects.filter(e => e.on && e.type === 'dirgradient');

  const uT = forST ? 'iTime' : 'u_t';
  const uR = forST ? 'iResolution.xy' : 'u_res';
  const fc = forST ? 'fragCoord' : 'gl_FragCoord.xy';

  function fv(e, k) {
    if (forST) return parseFloat(e.data[k]).toFixed(6);
    const umap = {
      wave:{freq:`wf${e.id}`,amp:`wa${e.id}`,spd:`ws${e.id}`,pos:`wp${e.id}`,edge:`we${e.id}`,angle:`wang${e.id}`},
      warp:{str:`wp_str${e.id}`,scale:`wp_sc${e.id}`,wspd:`wp_sp${e.id}`,oct:`wp_oc${e.id}`},
      grain:{amount:`gr_am${e.id}`,size:`gr_sz${e.id}`,anim:`gr_an${e.id}`,streak:`gr_st${e.id}`,sangle:`gr_sa${e.id}`,slen:`gr_sl${e.id}`},
      chroma:{spread:`ch_sp${e.id}`,angle:`ch_an${e.id}`},
      scanlines:{count:`sl_cn${e.id}`,dark:`sl_dk${e.id}`,soft:`sl_sf${e.id}`,scroll:`sl_sc${e.id}`,scrollspd:`sl_ss${e.id}`},
      barrel:{str:`br_st${e.id}`,zoom:`br_zm${e.id}`},
      vignette:{str:`vi_st${e.id}`,soft:`vi_so${e.id}`},
      colorgrade:{contrast:`cg_co${e.id}`,sat:`cg_sa${e.id}`,bright:`cg_br${e.id}`,hue:`cg_hu${e.id}`},
      pixelate:{size:`px_sz${e.id}`},
      posterize:{bands:`po_bn${e.id}`,mix:`po_mx${e.id}`},
      dirgradient:{topstr:`dg_ts${e.id}`,botstr:`dg_bs${e.id}`,power:`dg_pw${e.id}`},
    };
    return umap[e.type]?.[k] || parseFloat(e.data[k]).toFixed(6);
  }
  function fwavecol(e) {
    if (forST) return `vec3(${e.data.r.toFixed(4)},${e.data.g.toFixed(4)},${e.data.b.toFixed(4)})`;
    return `wc${e.id}`;
  }
  function fpcol(e, k) {
    if (forST) return `vec3(${parseFloat(e.data[k+'r']).toFixed(4)},${parseFloat(e.data[k+'g']).toFixed(4)},${parseFloat(e.data[k+'b']).toFixed(4)})`;
    return `u_${k}${e.id}`;
  }

  const bgVec = forST ? `vec3(${bgR.toFixed(4)},${bgG.toFixed(4)},${bgB.toFixed(4)})` : 'u_bg';

  let u = 'precision mediump float;\n';
  if (!forST) {
    u += `uniform vec2 u_res;\nuniform float u_t;\nuniform vec3 u_bg;\n`;
    waves.forEach(e => { u += `uniform float wf${e.id},wa${e.id},ws${e.id},wp${e.id},we${e.id},wang${e.id};uniform vec3 wc${e.id};\n`; });
    warps.forEach(e => { u += `uniform float wp_str${e.id},wp_sc${e.id},wp_sp${e.id},wp_oc${e.id};\n`; });
    grains.forEach(e => { u += `uniform float gr_am${e.id},gr_sz${e.id},gr_an${e.id},gr_st${e.id},gr_sa${e.id},gr_sl${e.id};\n`; });
    chromas.forEach(e => { u += `uniform float ch_sp${e.id},ch_an${e.id};\n`; });
    scans.forEach(e => { u += `uniform float sl_cn${e.id},sl_dk${e.id},sl_sf${e.id},sl_sc${e.id},sl_ss${e.id};\n`; });
    barrels.forEach(e => { u += `uniform float br_st${e.id},br_zm${e.id};\n`; });
    vignettes.forEach(e => { u += `uniform float vi_st${e.id},vi_so${e.id};\n`; });
    grades.forEach(e => { u += `uniform float cg_co${e.id},cg_sa${e.id},cg_br${e.id},cg_hu${e.id};\n`; });
    pixels.forEach(e => { u += `uniform float px_sz${e.id};\n`; });
    posts.forEach(e => { u += `uniform float po_bn${e.id},po_mx${e.id};uniform vec3 u_c1${e.id},u_c2${e.id},u_c3${e.id},u_c4${e.id};\n`; });
    dirgrads.forEach(e => { u += `uniform float dg_ts${e.id},dg_bs${e.id},dg_pw${e.id};\n`; });
  }

  let s = u + `
float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p),u2=f*f*(3.0-2.0*f);return mix(mix(hash2(i),hash2(i+vec2(1,0)),u2.x),mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)),u2.x),u2.y);}
float fbm(vec2 p,float oct){float v=0.0,a=0.5;for(int i=0;i<6;i++){if(float(i)>=oct)break;v+=vnoise(p)*a;p*=2.0;a*=0.5;}return v;}
vec2 rot2(vec2 p,float a){float c=cos(a),s2=sin(a);return vec2(p.x*c-p.y*s2,p.x*s2+p.y*c);}
`;

  if (forST) s += `void mainImage(out vec4 fragColor,in vec2 fragCoord){\n`;
  else s += `void main(){\n`;

  s += `  vec2 uv=${fc}/${uR};\n  float t=${uT};\n  vec2 rawuv=uv;\n`;

  barrels.forEach(e => {
    s += `  {vec2 bc=uv*2.0-1.0;float r2=dot(bc,bc);bc*=1.0+${fv(e,'str')}*r2;uv=(bc*${fv(e,'zoom')})*0.5+0.5;}\n`;
  });
  pixels.forEach(e => {
    s += `  {vec2 res=${uR};uv=floor(uv*(res/${fv(e,'size')}))/(res/${fv(e,'size')});}\n`;
  });

  if (warps.length) {
    const w = warps[0];
    s += `  vec2 wuv=uv+${fv(w,'str')}*vec2(fbm(uv*${fv(w,'scale')}+vec2(0.0,t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5,fbm(uv*${fv(w,'scale')}+vec2(5.2,1.3+t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5);\n`;
  } else {
    s += `  vec2 wuv=uv;\n`;
  }

  s += `  vec3 col=${bgVec};\n`;

  const hasChroma = chromas.length > 0;
  if (hasChroma) {
    const ch = chromas[0];
    s += `  vec2 chD=vec2(cos(${fv(ch,'angle')}*0.01745),sin(${fv(ch,'angle')}*0.01745));\n`;
    s += `  vec2 uvR=uv+chD*${fv(ch,'spread')},uvB=uv-chD*${fv(ch,'spread')};\n`;
    if (warps.length) {
      const w = warps[0];
      s += `  vec2 wuvR=uvR+${fv(w,'str')}*vec2(fbm(uvR*${fv(w,'scale')}+vec2(0.0,t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5,fbm(uvR*${fv(w,'scale')}+vec2(5.2,1.3+t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5);\n`;
      s += `  vec2 wuvB=uvB+${fv(w,'str')}*vec2(fbm(uvB*${fv(w,'scale')}+vec2(0.0,t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5,fbm(uvB*${fv(w,'scale')}+vec2(5.2,1.3+t*${fv(w,'wspd')}),${fv(w,'oct')})-0.5);\n`;
    } else {
      s += `  vec2 wuvR=uvR,wuvB=uvB;\n`;
    }
  }

  waves.forEach(w => {
    const freq=fv(w,'freq'),amp=fv(w,'amp'),spd=fv(w,'spd'),pos=fv(w,'pos'),edge=fv(w,'edge'),ang=fv(w,'angle');
    const col=fwavecol(w);
    s += `  {\n    vec2 ruv=rot2(wuv-0.5,${ang}*0.01745)+0.5;\n`;
    s += `    float wave=sin(ruv.x*${freq}*6.2832+t*${spd})*${amp};\n`;
    s += `    float m=smoothstep(${edge},0.0,abs(ruv.y-(${pos}+wave))-${edge}*0.3);\n`;
    if (hasChroma) {
      s += `    vec2 ruvR=rot2(wuvR-0.5,${ang}*0.01745)+0.5;\n`;
      s += `    vec2 ruvB=rot2(wuvB-0.5,${ang}*0.01745)+0.5;\n`;
      s += `    float mR=smoothstep(${edge},0.0,abs(ruvR.y-(${pos}+sin(ruvR.x*${freq}*6.2832+t*${spd})*${amp}))-${edge}*0.3);\n`;
      s += `    float mB=smoothstep(${edge},0.0,abs(ruvB.y-(${pos}+sin(ruvB.x*${freq}*6.2832+t*${spd})*${amp}))-${edge}*0.3);\n`;
      s += `    col+=vec3(${col}.r*mR,${col}.g*m,${col}.b*mB);\n`;
    } else {
      s += `    col+=${col}*m;\n`;
    }
    s += `    col=clamp(col,0.0,1.0);\n  }\n`;
  });

  posts.forEach(e => {
    s += `  {\n    float lum=dot(col,vec3(0.299,0.587,0.114));\n`;
    s += `    float band=floor(lum*${fv(e,'bands')})/${fv(e,'bands')};\n`;
    s += `    vec3 dark=mix(${fpcol(e,'c1')},${fpcol(e,'c2')},rawuv.y);\n`;
    s += `    vec3 bright=mix(${fpcol(e,'c3')},${fpcol(e,'c4')},rawuv.y);\n`;
    s += `    vec3 pcol=mix(dark,bright,band);\n`;
    s += `    col=mix(col,pcol,${fv(e,'mix')});col=clamp(col,0.0,1.0);\n  }\n`;
  });

  scans.forEach(e => {
    s += `  {float slY=rawuv.y;if(${fv(e,'scroll')}>0.5)slY=fract(rawuv.y+t*${fv(e,'scrollspd')});float sl=smoothstep(${fv(e,'soft')},1.0,abs(sin(slY*${fv(e,'count')}*3.14159)));col*=1.0-sl*${fv(e,'dark')};}\n`;
  });

  grains.forEach(e => {
    s += `  {vec2 gp=${fc}/${fv(e,'size')};\n`;
    s += `   vec2 go=vec2(0.0);if(${fv(e,'anim')}>0.5)go+=vec2(floor(t*24.0)*7.3,floor(t*24.0)*3.7);\n`;
    s += `   if(${fv(e,'streak')}>0.5){vec2 sd=vec2(cos(${fv(e,'sangle')}*0.01745),sin(${fv(e,'sangle')}*0.01745));float soff=dot(gp,vec2(-sd.y,sd.x));gp=vec2(dot(gp,sd)+fract(soff)*${fv(e,'slen')},soff);}\n`;
    s += `   float n=hash2(gp+go);col+=vec3((n-0.5)*${fv(e,'amount')});col=clamp(col,0.0,1.0);}\n`;
  });

  dirgrads.forEach(e => {
    s += `  {float iy=1.0-rawuv.y;col-=${fv(e,'topstr')}*pow(rawuv.y,${fv(e,'power')});col+=pow(iy,${fv(e,'power')})*${fv(e,'botstr')}*0.3;col=clamp(col,0.0,1.0);}\n`;
  });

  vignettes.forEach(e => {
    s += `  {vec2 vc=rawuv*2.0-1.0;col*=1.0-smoothstep(1.0-${fv(e,'soft')},1.0+${fv(e,'soft')},length(vc)*${fv(e,'str')});}\n`;
  });

  grades.forEach(e => {
    s += `  {col=clamp(col+${fv(e,'bright')},0.0,1.0);col=(col-0.5)*${fv(e,'contrast')}+0.5;float lum=dot(col,vec3(0.299,0.587,0.114));col=mix(vec3(lum),col,${fv(e,'sat')});\n`;
    s += `   float ha=${fv(e,'hue')}*0.01745;vec3 k=vec3(0.57735);float c2=cos(ha);col=col*c2+cross(k,col)*sin(ha)+k*dot(k,col)*(1.0-c2);col=clamp(col,0.0,1.0);}\n`;
  });

  if (forST) s += `  fragColor=vec4(col,1.0);\n}\n`;
  else s += `  gl_FragColor=vec4(col,1.0);\n}\n`;
  return s;
}

// ================================================================
// WebGL Rendering
// ================================================================
const errEl = document.getElementById('status-error');
const statusDot = document.getElementById('status-dot');

function mkShader(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    errEl.textContent = gl.getShaderInfoLog(s);
    statusDot.className = 'statusbar-dot statusbar-dot--error';
    document.getElementById('status-text').textContent = 'Error';
    return null;
  }
  return s;
}

const vert = `attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}`;
const vbuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);

function compile() {
  const fsrc = buildFrag(false);
  const vs = mkShader(gl.VERTEX_SHADER, vert);
  const fs = mkShader(gl.FRAGMENT_SHADER, fsrc);
  if (!vs || !fs) return;
  const p = gl.createProgram(); gl.attachShader(p,vs); gl.attachShader(p,fs); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    errEl.textContent = 'Link error: ' + gl.getProgramInfoLog(p);
    statusDot.className = 'statusbar-dot statusbar-dot--error';
    return;
  }
  errEl.textContent = '';
  statusDot.className = 'statusbar-dot statusbar-dot--live';
  document.getElementById('status-text').textContent = 'Live';
  if (prog) gl.deleteProgram(prog);
  prog = p; gl.useProgram(prog);
  const pl = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(pl); gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
}

function ul(n) { return gl.getUniformLocation(prog, n); }

function setU(t) {
  gl.uniform2f(ul('u_res'), canvas.width, canvas.height);
  gl.uniform1f(ul('u_t'), t);
  gl.uniform3f(ul('u_bg'), bgR, bgG, bgB);
  effects.filter(e => e.on).forEach(e => {
    const d = e.data;
    if (e.type==='wave'){gl.uniform1f(ul(`wf${e.id}`),d.freq);gl.uniform1f(ul(`wa${e.id}`),d.amp);gl.uniform1f(ul(`ws${e.id}`),d.spd);gl.uniform1f(ul(`wp${e.id}`),d.pos);gl.uniform1f(ul(`we${e.id}`),d.edge);gl.uniform1f(ul(`wang${e.id}`),d.angle);gl.uniform3f(ul(`wc${e.id}`),d.r,d.g,d.b);}
    if (e.type==='warp'){gl.uniform1f(ul(`wp_str${e.id}`),d.str);gl.uniform1f(ul(`wp_sc${e.id}`),d.scale);gl.uniform1f(ul(`wp_sp${e.id}`),d.wspd);gl.uniform1f(ul(`wp_oc${e.id}`),d.oct);}
    if (e.type==='grain'){gl.uniform1f(ul(`gr_am${e.id}`),d.amount);gl.uniform1f(ul(`gr_sz${e.id}`),d.size);gl.uniform1f(ul(`gr_an${e.id}`),d.anim);gl.uniform1f(ul(`gr_st${e.id}`),d.streak);gl.uniform1f(ul(`gr_sa${e.id}`),d.sangle);gl.uniform1f(ul(`gr_sl${e.id}`),d.slen);}
    if (e.type==='chroma'){gl.uniform1f(ul(`ch_sp${e.id}`),d.spread);gl.uniform1f(ul(`ch_an${e.id}`),d.angle*Math.PI/180);}
    if (e.type==='scanlines'){gl.uniform1f(ul(`sl_cn${e.id}`),d.count);gl.uniform1f(ul(`sl_dk${e.id}`),d.dark);gl.uniform1f(ul(`sl_sf${e.id}`),d.soft);gl.uniform1f(ul(`sl_sc${e.id}`),d.scroll);gl.uniform1f(ul(`sl_ss${e.id}`),d.scrollspd);}
    if (e.type==='barrel'){gl.uniform1f(ul(`br_st${e.id}`),d.str);gl.uniform1f(ul(`br_zm${e.id}`),d.zoom);}
    if (e.type==='vignette'){gl.uniform1f(ul(`vi_st${e.id}`),d.str);gl.uniform1f(ul(`vi_so${e.id}`),d.soft);}
    if (e.type==='colorgrade'){gl.uniform1f(ul(`cg_co${e.id}`),d.contrast);gl.uniform1f(ul(`cg_sa${e.id}`),d.sat);gl.uniform1f(ul(`cg_br${e.id}`),d.bright);gl.uniform1f(ul(`cg_hu${e.id}`),d.hue);}
    if (e.type==='pixelate'){gl.uniform1f(ul(`px_sz${e.id}`),d.size);}
    if (e.type==='posterize'){
      gl.uniform1f(ul(`po_bn${e.id}`),d.bands);gl.uniform1f(ul(`po_mx${e.id}`),d.mix);
      gl.uniform3f(ul(`u_c1${e.id}`),d.c1r||0.51,d.c1g||0.78,d.c1b||0.49);
      gl.uniform3f(ul(`u_c2${e.id}`),d.c2r||0.20,d.c2g||0.60,d.c2b||0.32);
      gl.uniform3f(ul(`u_c3${e.id}`),d.c3r||0.15,d.c3g||0.49,d.c3b||0.28);
      gl.uniform3f(ul(`u_c4${e.id}`),d.c4r||0.06,d.c4g||0.26,d.c4b||0.25);
    }
    if (e.type==='dirgradient'){gl.uniform1f(ul(`dg_ts${e.id}`),d.topstr);gl.uniform1f(ul(`dg_bs${e.id}`),d.botstr);gl.uniform1f(ul(`dg_pw${e.id}`),d.power);}
  });
}

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  gl.viewport(0, 0, canvas.width, canvas.height);
  document.getElementById('out-res').textContent = `${canvas.width} × ${canvas.height}`;
}

resize();
window.addEventListener('resize', resize);

const t0 = performance.now();
timeOffset = t0;

function frame() {
  const now = performance.now();
  const t = playing ? (now - timeOffset) / 1000 : (pausedAt - timeOffset) / 1000;

  // FPS counter
  frameCount++;
  if (now - lastFpsTime >= 500) {
    currentFps = Math.round(frameCount / ((now - lastFpsTime) / 1000));
    document.getElementById('stat-fps').textContent = currentFps + ' fps';
    frameCount = 0; lastFpsTime = now;
  }

  // Time display
  const totalSec = Math.max(0, t);
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(1);
  document.getElementById('time-display').textContent = `${min}:${sec.padStart(4,'0')}`;

  if (needsRecompile) { needsRecompile = false; compile(); }
  if (prog) { setU(t); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
  requestAnimationFrame(frame);
}

// --- Init ---
renderAddGrid();
renderPresets();
loadRandom();
frame();
