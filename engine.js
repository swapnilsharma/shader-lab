// ================================================================
// SHADER LAB — Engine v3
// State management, layer CRUD, UI rendering, modal, playback
// ================================================================

// ── State ──────────────────────────────────────────────────────
let layers = [];           // Array<LayerObject>, index 0 = topmost in panel
let layerIdCounter = 0;
let selectedLayerId = null;
let frameState = { bg: '#111111', w: 800, h: 600, radius: 0 };
let playing = true;
let timeOffset = performance.now();
let pausedAt = performance.now();
let needsRecompile = true;

// Image state
let baseImageTex = null;
let hasBaseImage = false;
let imageAspectRatio = 1.0;
let baseImageName = '';

// Drag state
let dragSrcId = null;

// ── Helpers ────────────────────────────────────────────────────
function hexToRgb(h) {
  h = (h || '#000000').replace('#', '');
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

// ── Default Properties ─────────────────────────────────────────
function defaultProperties(type) {
  switch(type) {
    case 'solid':        return { color: '#3B3B6B' };
    case 'gradient':     return { seed: 42, speed: 1.0, freqX: 0.9, freqY: 6.0, angle: 105, amplitude: 2.1, softness: 0.74, blend: 0.54, color0: '#FF0055', color1: '#0088FF', color2: '#FFCC00', color3: '#AA44FF' };
    case 'mesh-gradient':return { seed: 12, speed: 0.3, scale: 0.42, turbAmp: 0.6, turbFreq: 0.1, turbIter: 7, waveFreq: 3.8, distBias: 0.0, exposure: 1.1, contrast: 1.1, saturation: 1.0, color0: '#00001A', color1: '#2962FF', color2: '#40BCFF', color3: '#FFB8B5', color4: '#FFC14F' };
    case 'image':        return { fit: 'cover' };
    case 'noise-warp':   return { str: 0.5, scale: 2.0, wspd: 0.12, oct: 4 };
    case 'wave':         return { color: '#6B7FE8', freq: 4.0, amp: 0.15, spd: 0.6, pos: 0.5, edge: 0.06, angle: 0 };
    case 'liquid':       return { seed: 12, speed: 0.3, scale: 0.42, turbAmp: 0.6, turbFreq: 0.1, turbIter: 7, waveFreq: 3.8, distBias: 0.0, exposure: 1.1, contrast: 1.1, saturation: 1.0, color0: '#00001A', color1: '#2962FF', color2: '#40BCFF', color3: '#FFB8B5', color4: '#FFC14F' };
    case 'grain':        return { amount: 0.08, size: 1.0, animated: 1, streak: 0, sangle: 90, slen: 6 };
    case 'chromatic-aberration': return { spread: 0.006, angle: 0 };
    case 'vignette':     return { str: 0.6, soft: 0.4 };
    case 'color-grade':  return { contrast: 1.0, sat: 1.0, bright: 0.0, hue: 0 };
    case 'posterize':    return { bands: 5, mix: 1.0, c1: '#82C67C', c2: '#336B51', c3: '#257847', c4: '#0F4140' };
    case 'pixelate':     return { size: 4 };
    case 'scanlines':    return { count: 120, dark: 0.4, soft: 0.3, scroll: 0, scrollspd: 0.3 };
    default:             return {};
  }
}

const CONTENT_TYPES_ENGINE = new Set(['solid','gradient','mesh-gradient','image']);
function isContentLayer(type) { return CONTENT_TYPES_ENGINE.has(type); }

function layerIcon(type) {
  if (isContentLayer(type)) return '◼';
  return '◈';
}

function defaultLayerName(type) {
  const NAMES = { solid:'Solid', gradient:'Gradient', 'mesh-gradient':'Mesh Gradient', image:'Image', 'noise-warp':'Noise Warp', wave:'Wave', liquid:'Liquid', grain:'Grain', 'chromatic-aberration':'Chromatic Aberration', vignette:'Vignette', 'color-grade':'Color Grade', posterize:'Posterize', pixelate:'Pixelate', scanlines:'Scanlines' };
  return NAMES[type] || type;
}

// ── Layer CRUD ─────────────────────────────────────────────────
function createLayer(type, propsOverride) {
  return {
    id: ++layerIdCounter,
    type,
    name: defaultLayerName(type),
    visible: true,
    opacity: 1.0,
    blendMode: 'normal',
    properties: Object.assign({}, defaultProperties(type), propsOverride || {})
  };
}

function addLayer(type) {
  const layer = createLayer(type);
  layers.unshift(layer); // add at top
  selectedLayerId = layer.id;
  renderUI(); needsRecompile = true;
  closeLayerPopover();
}

function removeLayer(id) {
  layers = layers.filter(l => l.id !== id);
  if (selectedLayerId === id) selectedLayerId = layers.length ? layers[0].id : null;
  renderUI(); needsRecompile = true;
}

async function removeLayerConfirm(id) {
  const ok = await showConfirm('Remove layer?', 'This will delete the selected layer.');
  if (ok) removeLayer(id);
}

function duplicateLayer(id) {
  const idx = layers.findIndex(l => l.id === id);
  if (idx < 0) return;
  const orig = layers[idx];
  const copy = { ...orig, id: ++layerIdCounter, name: orig.name + ' copy', properties: JSON.parse(JSON.stringify(orig.properties)) };
  layers.splice(idx, 0, copy);
  selectedLayerId = copy.id;
  renderUI(); needsRecompile = true;
}

function renameLayer(id) {
  const l = layers.find(l => l.id === id); if (!l) return;
  const row = document.querySelector(`[data-lid="${id}"] .layer-name-text`);
  if (!row) return;
  const inp = document.createElement('input');
  inp.className = 'layer-name-input';
  inp.value = l.name;
  row.replaceWith(inp);
  inp.select();
  const finish = () => { l.name = inp.value.trim() || l.name; renderLeftPanel(); };
  inp.addEventListener('blur', finish);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') inp.blur(); });
}

function moveLayerToTop(id) {
  const idx = layers.findIndex(l => l.id === id); if (idx <= 0) return;
  layers.unshift(layers.splice(idx, 1)[0]);
  renderUI(); needsRecompile = true;
}

function moveLayerToBottom(id) {
  const idx = layers.findIndex(l => l.id === id); if (idx < 0 || idx === layers.length-1) return;
  layers.push(layers.splice(idx, 1)[0]);
  renderUI(); needsRecompile = true;
}

function toggleLayerVisibility(id) {
  const l = layers.find(l => l.id === id); if (!l) return;
  l.visible = !l.visible;
  renderLeftPanel(); needsRecompile = true;
}

function selectLayer(id) {
  selectedLayerId = id;
  renderLeftPanel();
  renderRightPanel();
  const fr = document.getElementById('frame-row');
  if (fr) fr.classList.toggle('selected', id === 'frame');
}

function updateLayerProp(id, key, value) {
  const l = layers.find(l => l.id === id); if (!l) return;
  l.properties[key] = value;
  needsRecompile = true;
}

function updateLayerOpacity(id, value) {
  const l = layers.find(l => l.id === id); if (!l) return;
  l.opacity = parseFloat(value);
  needsRecompile = true;
}

function updateLayerBlend(id, value) {
  const l = layers.find(l => l.id === id); if (!l) return;
  l.blendMode = value;
  needsRecompile = true;
}

// ── Frame ──────────────────────────────────────────────────────
function applyFrame() {
  canvas.width = frameState.w; canvas.height = frameState.h;
  canvas.style.width = ''; canvas.style.height = '';
  canvas.style.maxWidth = '100%'; canvas.style.maxHeight = '100%';
  canvas.style.borderRadius = frameState.radius + 'px';
  gl.viewport(0, 0, frameState.w, frameState.h);
  document.getElementById('status-dims').textContent = `${frameState.w} × ${frameState.h}`;
  needsRecompile = true;
}

function onFrameWChange(v) {
  frameState.w = Math.max(100, Math.min(7680, parseInt(v)||800));
  document.getElementById('frame-w-inp').value = frameState.w;
  applyFrame();
}
function onFrameHChange(v) {
  frameState.h = Math.max(100, Math.min(4320, parseInt(v)||600));
  document.getElementById('frame-h-inp').value = frameState.h;
  applyFrame();
}
function setFrameSize(w, h) {
  frameState.w = w; frameState.h = h; applyFrame();
  if (selectedLayerId === 'frame') renderRightPanel();
}
function onFrameRadius(v) {
  frameState.radius = parseInt(v)||0;
  canvas.style.borderRadius = frameState.radius + 'px';
  const el = document.getElementById('frame-radius-val');
  if (el) el.textContent = frameState.radius;
}
function onBgColor(hex) {
  frameState.bg = hex;
  needsRecompile = true;
  renderRightPanel();
}

// ── Playback ───────────────────────────────────────────────────
function togglePlay() {
  playing = !playing;
  const btn = document.getElementById('btn-play');
  if (playing) {
    timeOffset += performance.now() - pausedAt;
    btn.classList.add('active');
    btn.innerHTML = `<svg viewBox="0 0 14 14" width="11" height="11"><polygon points="3,1 12,7 3,13" fill="currentColor"/></svg>`;
  } else {
    pausedAt = performance.now();
    btn.classList.remove('active');
    btn.innerHTML = `<svg viewBox="0 0 14 14" width="11" height="11"><rect x="3" y="2" width="3" height="10" rx="0.5" fill="currentColor"/><rect x="8" y="2" width="3" height="10" rx="0.5" fill="currentColor"/></svg>`;
  }
}
function restartTime() {
  timeOffset = performance.now(); pausedAt = performance.now();
  if (!playing) { playing = true; const btn = document.getElementById('btn-play'); btn.classList.add('active'); btn.innerHTML = `<svg viewBox="0 0 14 14" width="11" height="11"><polygon points="3,1 12,7 3,13" fill="currentColor"/></svg>`; }
}

// ── Image Upload ───────────────────────────────────────────────
function onImageUpload(input) {
  if (input.files && input.files[0]) loadBaseImage(input.files[0]);
}
function loadBaseImage(file) {
  const img = new Image();
  img.onload = () => {
    imageAspectRatio = img.width / img.height;
    if (!baseImageTex) baseImageTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, baseImageTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    hasBaseImage = true;
    baseImageName = file.name.length > 20 ? file.name.slice(0,18)+'…' : file.name;
    // Ensure image layer exists
    if (!layers.find(l => l.type === 'image')) { addLayer('image'); return; }
    renderRightPanel(); needsRecompile = true;
  };
  img.src = URL.createObjectURL(file);
}

// ── Confirm Dialog ─────────────────────────────────────────────
let confirmResolve = null;
function showConfirm(title, subtitle) {
  return new Promise(resolve => {
    confirmResolve = resolve;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-subtitle').textContent = subtitle;
    document.getElementById('confirm-overlay').classList.remove('hidden');
  });
}
function closeConfirm(result) {
  document.getElementById('confirm-overlay').classList.add('hidden');
  if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
}
document.getElementById('confirm-ok').addEventListener('click', () => closeConfirm(true));
document.getElementById('confirm-cancel').addEventListener('click', () => closeConfirm(false));
document.getElementById('confirm-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('confirm-overlay')) closeConfirm(false);
});

// ── Context Menu ───────────────────────────────────────────────
let ctxTargetId = null;
const ctxMenu = document.getElementById('ctx-menu');

function openCtxMenu(e, id) {
  e.stopPropagation(); e.preventDefault();
  ctxTargetId = id;
  ctxMenu.style.left = e.clientX + 'px';
  ctxMenu.style.top  = e.clientY + 'px';
  ctxMenu.classList.remove('hidden');
}
function closeCtxMenu() { ctxMenu.classList.add('hidden'); ctxTargetId = null; }

ctxMenu.querySelectorAll('.ctx-item').forEach(item => {
  item.addEventListener('click', () => {
    const action = item.dataset.action;
    const id = ctxTargetId;
    closeCtxMenu();
    if (!id) return;
    if (action === 'rename')      renameLayer(id);
    if (action === 'duplicate')   duplicateLayer(id);
    if (action === 'delete')      removeLayerConfirm(id);
    if (action === 'move-top')    moveLayerToTop(id);
    if (action === 'move-bottom') moveLayerToBottom(id);
  });
});
document.addEventListener('click', () => closeCtxMenu());

// ── Layer Popover ──────────────────────────────────────────────
const layerPopover = document.getElementById('layer-popover');
function openLayerPopover() {
  const btn = document.getElementById('btn-add-layer');
  const r = btn.getBoundingClientRect();
  layerPopover.style.left = r.left + 'px';
  layerPopover.style.top  = (r.bottom + 4) + 'px';
  layerPopover.classList.remove('hidden');
}
function closeLayerPopover() { layerPopover.classList.add('hidden'); }

document.getElementById('btn-add-layer').addEventListener('click', e => {
  e.stopPropagation();
  layerPopover.classList.contains('hidden') ? openLayerPopover() : closeLayerPopover();
});
layerPopover.querySelectorAll('.pop-item').forEach(item => {
  item.addEventListener('click', () => addLayer(item.dataset.type));
});
document.addEventListener('click', e => {
  if (!e.target.closest('#layer-popover') && !e.target.closest('#btn-add-layer')) closeLayerPopover();
});

// ── Drag Reorder ───────────────────────────────────────────────
function onDragStart(e, id) {
  dragSrcId = id; e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => { const r = document.querySelector(`[data-lid="${id}"]`); if (r) r.classList.add('dragging'); }, 0);
}
function onDragEnd(e, id) {
  dragSrcId = null;
  document.querySelectorAll('.layer-row').forEach(r => r.classList.remove('dragging','drag-over-top','drag-over-bottom'));
}
function onDragOver(e, id) {
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  const row = e.currentTarget, rect = row.getBoundingClientRect(), mid = rect.top + rect.height/2;
  document.querySelectorAll('.layer-row').forEach(r => r.classList.remove('drag-over-top','drag-over-bottom'));
  row.classList.add(e.clientY < mid ? 'drag-over-top' : 'drag-over-bottom');
}
function onDrop(e, targetId) {
  e.preventDefault();
  if (dragSrcId === null || dragSrcId === targetId) return;
  const si = layers.findIndex(l => l.id === dragSrcId);
  const ti = layers.findIndex(l => l.id === targetId);
  if (si < 0 || ti < 0) return;
  const row = e.currentTarget, rect = row.getBoundingClientRect(), mid = rect.top + rect.height/2;
  const [moved] = layers.splice(si, 1);
  let ins = e.clientY < mid ? ti : ti + (si < ti ? 0 : 1);
  ins = Math.max(0, Math.min(layers.length, ins));
  layers.splice(ins, 0, moved);
  dragSrcId = null;
  renderUI(); needsRecompile = true;
}

// ── SVG Icons ─────────────────────────────────────────────────
const SVG_EYE    = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="8" cy="8" rx="6.5" ry="4"/><circle cx="8" cy="8" r="2"/></svg>`;
const SVG_EYEOFF = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 2l12 12"/><path d="M6.5 6.6A2 2 0 0 0 9.4 9.5"/><path d="M4.2 4.3C2.8 5.2 1.8 6.7 1.5 8c.8 3.1 4 5 6.5 5 1.2 0 2.4-.4 3.3-1"/><path d="M9.9 3.2C12 4.1 13.7 5.9 14.5 8c-.4 1.4-1.2 2.6-2.3 3.5"/></svg>`;
const SVG_DRAG   = `<svg viewBox="0 0 10 14" width="10" height="14" fill="currentColor"><circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/></svg>`;
const SVG_DOTS   = `<svg viewBox="0 0 14 14" width="12" height="12" fill="currentColor"><circle cx="7" cy="2.5" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/></svg>`;

// ── Left Panel ─────────────────────────────────────────────────
function renderLeftPanel() {
  const stack = document.getElementById('layer-stack');
  stack.innerHTML = '';
  layers.forEach(l => {
    const row = document.createElement('div');
    row.className = 'layer-row' + (l.id === selectedLayerId ? ' selected' : '') + (l.visible ? '' : ' hidden');
    row.setAttribute('data-lid', l.id);
    row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', e => onDragStart(e, l.id));
    row.addEventListener('dragend',   e => onDragEnd(e, l.id));
    row.addEventListener('dragover',  e => onDragOver(e, l.id));
    row.addEventListener('drop',      e => onDrop(e, l.id));
    row.addEventListener('click', () => selectLayer(l.id));

    const visClass = l.visible ? 'on' : '';
    row.innerHTML = `
      <span class="drag-handle">${SVG_DRAG}</span>
      <span class="layer-icon ${isContentLayer(l.type) ? '' : 'layer-icon--effect'}">${layerIcon(l.type)}</span>
      <span class="layer-name-text">${l.name}</span>
      <button class="layer-vis-btn ${visClass}" title="Toggle visibility">${l.visible ? SVG_EYE : SVG_EYEOFF}</button>
      <button class="layer-ctx-btn" title="Options">${SVG_DOTS}</button>
    `;

    row.querySelector('.layer-vis-btn').addEventListener('click', e => { e.stopPropagation(); toggleLayerVisibility(l.id); });
    row.querySelector('.layer-ctx-btn').addEventListener('click', e => openCtxMenu(e, l.id));
    stack.appendChild(row);
  });

  // Frame row
  const fr = document.getElementById('frame-row');
  if (fr) fr.className = 'frame-row' + (selectedLayerId === 'frame' ? ' selected' : '');
}

// ── Right Panel ────────────────────────────────────────────────
function renderRightPanel() {
  const panel = document.getElementById('panel-right');
  if (selectedLayerId === 'frame') {
    panel.innerHTML = renderFrameZone();
    wireFrameZone();
    return;
  }
  const l = layers.find(l => l.id === selectedLayerId);
  if (!l) { panel.innerHTML = `<div style="padding:20px 12px;color:var(--text-secondary);font-size:10px;">Select a layer to edit</div>`; return; }

  let html = '';
  if (isContentLayer(l.type)) html += renderTransformZone(l);
  html += renderPropertiesZone(l);
  panel.innerHTML = html;
  wirePropertiesZone(l);
}

function renderUI() {
  renderLeftPanel();
  renderRightPanel();
}

// ── Transform Zone ─────────────────────────────────────────────
function renderTransformZone(l) {
  return `<div class="rp-zone">
    <div class="rp-zone-label">Transform</div>
    <div class="ctrl-row">
      <span class="ctrl-label">Opacity</span>
      <input type="range" class="ctrl-slider" id="rp-opacity" min="0" max="1" step="0.01" value="${l.opacity}">
      <span class="ctrl-value" id="rp-opacity-v">${Math.round(l.opacity*100)}%</span>
    </div>
    <div class="ctrl-row">
      <span class="ctrl-label">Blend</span>
      <select class="blend-select" id="rp-blend">
        ${['normal','screen','multiply','overlay','add'].map(m => `<option value="${m}"${l.blendMode===m?' selected':''}>${m}</option>`).join('')}
      </select>
    </div>
  </div>`;
}

// ── Properties Zone ────────────────────────────────────────────
function renderPropertiesZone(l) {
  let html = `<div class="rp-zone"><div class="rp-zone-label">Properties</div>`;
  html += renderTypeControls(l);
  html += `</div>`;
  return html;
}

function renderTypeControls(l) {
  const p = l.properties || {};
  const id = l.id;
  switch(l.type) {

    case 'solid':
      return renderColorRow(id,'color',p.color||'#888','Color');

    case 'gradient':
      return [
        renderSlider(id,'seed','Seed',p.seed||42,0,999,1),
        renderSlider(id,'speed','Speed',p.speed||1.0,0.05,4.0,0.05),
        renderSlider(id,'freqX','Freq X',p.freqX||0.9,0.1,5.0,0.1),
        renderSlider(id,'freqY','Freq Y',p.freqY||6.0,0.1,10.0,0.1),
        renderSlider(id,'angle','Angle',p.angle||0,0,360,1),
        renderSlider(id,'amplitude','Amplitude',p.amplitude||2.1,0.5,5.0,0.05),
        renderSlider(id,'softness','Softness',p.softness||0.74,0.1,2.0,0.01),
        renderSlider(id,'blend','Blend',p.blend||0.54,0.0,1.0,0.01),
        renderColorRow(id,'color0',p.color0||'#FF0055','Color 1'),
        renderColorRow(id,'color1',p.color1||'#0088FF','Color 2'),
        renderColorRow(id,'color2',p.color2||'#FFCC00','Color 3'),
        renderColorRow(id,'color3',p.color3||'#AA44FF','Color 4'),
      ].join('');

    case 'mesh-gradient':
      return [
        renderSlider(id,'seed','Seed',p.seed||12,0,999,1),
        renderSlider(id,'speed','Speed',p.speed||0.3,0.01,2.0,0.01),
        renderSlider(id,'scale','Scale',p.scale||0.42,0.1,2.0,0.01),
        renderSlider(id,'turbAmp','Turbulence',p.turbAmp||0.6,0.1,2.0,0.01),
        renderSlider(id,'turbFreq','Turb Freq',p.turbFreq||0.1,0.01,0.5,0.005),
        renderSlider(id,'turbIter','Turb Iter',p.turbIter||7,3,12,1),
        renderSlider(id,'waveFreq','Wave Freq',p.waveFreq||3.8,1.0,10.0,0.1),
        renderSlider(id,'exposure','Exposure',p.exposure||1.1,0.5,2.0,0.01),
        renderSlider(id,'contrast','Contrast',p.contrast||1.1,0.5,2.0,0.01),
        renderSlider(id,'saturation','Saturation',p.saturation||1.0,0.0,2.0,0.01),
        renderColorRow(id,'color0',p.color0||'#00001A','Color 1'),
        renderColorRow(id,'color1',p.color1||'#2962FF','Color 2'),
        renderColorRow(id,'color2',p.color2||'#40BCFF','Color 3'),
        renderColorRow(id,'color3',p.color3||'#FFB8B5','Color 4'),
        renderColorRow(id,'color4',p.color4||'#FFC14F','Color 5'),
      ].join('');

    case 'image':
      return `<div class="img-drop-zone" onclick="document.getElementById('img-input').click()">
        <div class="img-drop-icon">↑</div>
        <div class="img-drop-text">${hasBaseImage ? baseImageName : 'click or drop image'}</div>
      </div>`;

    case 'noise-warp':
      return [
        renderSlider(id,'str','Strength',p.str||0.5,0,2.0,0.01),
        renderSlider(id,'scale','Scale',p.scale||2.0,0.3,8.0,0.1),
        renderSlider(id,'wspd','Drift Speed',p.wspd||0.12,0,1.0,0.01),
        renderSlider(id,'oct','Octaves',p.oct||4,1,8,1),
      ].join('');

    case 'wave':
      return [
        renderColorRow(id,'color',p.color||'#6B7FE8','Color'),
        renderSlider(id,'freq','Frequency',p.freq||4.0,0.5,20,0.1),
        renderSlider(id,'amp','Amplitude',p.amp||0.15,0,0.7,0.005),
        renderSlider(id,'spd','Speed',p.spd||0.6,-3,3,0.05),
        renderSlider(id,'pos','Position',p.pos||0.5,0.02,0.98,0.01),
        renderSlider(id,'edge','Softness',p.edge||0.06,0.003,0.9,0.003),
        renderSlider(id,'angle','Angle °',p.angle||0,-360,360,1),
      ].join('');

    case 'liquid':
      return [
        renderSlider(id,'seed','Seed',p.seed||12,0,999,1),
        renderSlider(id,'speed','Speed',p.speed||0.3,0.01,2.0,0.01),
        renderSlider(id,'scale','Scale',p.scale||0.42,0.1,2.0,0.01),
        renderSlider(id,'turbAmp','Turbulence',p.turbAmp||0.6,0.1,2.0,0.01),
        renderSlider(id,'turbFreq','Turb Freq',p.turbFreq||0.1,0.01,0.5,0.005),
        renderSlider(id,'turbIter','Turb Iter',p.turbIter||7,3,12,1),
        renderSlider(id,'waveFreq','Wave Freq',p.waveFreq||3.8,1.0,10.0,0.1),
        renderSlider(id,'exposure','Exposure',p.exposure||1.1,0.5,2.0,0.01),
        renderSlider(id,'saturation','Saturation',p.saturation||1.0,0.0,2.0,0.01),
        renderColorRow(id,'color0',p.color0||'#00001A','Color 1'),
        renderColorRow(id,'color1',p.color1||'#2962FF','Color 2'),
        renderColorRow(id,'color2',p.color2||'#40BCFF','Color 3'),
        renderColorRow(id,'color3',p.color3||'#FFB8B5','Color 4'),
        renderColorRow(id,'color4',p.color4||'#FFC14F','Color 5'),
      ].join('');

    case 'grain':
      return [
        renderSlider(id,'amount','Amount',p.amount||0.08,0,0.5,0.005),
        renderSlider(id,'size','Size',p.size||1.0,0.5,6,0.1),
        renderToggle(id,'animated','Animated',p.animated||0),
        renderToggle(id,'streak','Streaked',p.streak||0),
        renderSlider(id,'sangle','Streak Angle',p.sangle||90,0,360,1),
        renderSlider(id,'slen','Streak Length',p.slen||6,1,20,0.5),
      ].join('');

    case 'chromatic-aberration':
      return [
        renderSlider(id,'spread','Spread',p.spread||0.006,0,0.03,0.0005),
        renderSlider(id,'angle','Angle °',p.angle||0,0,360,1),
      ].join('');

    case 'vignette':
      return [
        renderSlider(id,'str','Strength',p.str||0.6,0,2.0,0.01),
        renderSlider(id,'soft','Softness',p.soft||0.4,0.05,1.5,0.01),
      ].join('');

    case 'color-grade':
      return [
        renderSlider(id,'contrast','Contrast',p.contrast||1.0,0,2.0,0.01),
        renderSlider(id,'sat','Saturation',p.sat||1.0,0,2.0,0.01),
        renderSlider(id,'bright','Brightness',p.bright||0.0,-0.5,0.5,0.01),
        renderSlider(id,'hue','Hue Shift °',p.hue||0,0,360,1),
      ].join('');

    case 'posterize':
      return [
        renderSlider(id,'bands','Bands',p.bands||5,2,16,1),
        renderSlider(id,'mix','Mix',p.mix||1.0,0,1.0,0.01),
        renderColorRow(id,'c1',p.c1||'#82C67C','Dark A'),
        renderColorRow(id,'c2',p.c2||'#336B51','Dark B'),
        renderColorRow(id,'c3',p.c3||'#257847','Bright A'),
        renderColorRow(id,'c4',p.c4||'#0F4140','Bright B'),
      ].join('');

    case 'pixelate':
      return renderSlider(id,'size','Block Size',p.size||4,1,64,1);

    case 'scanlines':
      return [
        renderSlider(id,'count','Line Count',p.count||120,20,600,5),
        renderSlider(id,'dark','Darkness',p.dark||0.4,0,1.0,0.01),
        renderSlider(id,'soft','Softness',p.soft||0.3,0,1.0,0.01),
        renderToggle(id,'scroll','Scrolling',p.scroll||0),
        renderSlider(id,'scrollspd','Scroll Speed',p.scrollspd||0.3,0,2.0,0.05),
      ].join('');

    default: return `<div style="color:var(--text-secondary);font-size:10px;">No properties</div>`;
  }
}

// ── Frame Zone ─────────────────────────────────────────────────
function renderFrameZone() {
  const fs = frameState;
  return `<div class="rp-zone">
    <div class="rp-zone-label">Dimensions</div>
    <div class="frame-dims-row">
      <span class="frame-dim-label">W</span>
      <input class="frame-dim-input" id="frame-w-inp" type="number" value="${fs.w}" min="100" max="7680">
      <span class="frame-px">px</span>
      <span class="frame-dim-label">H</span>
      <input class="frame-dim-input" id="frame-h-inp" type="number" value="${fs.h}" min="100" max="4320">
      <span class="frame-px">px</span>
    </div>
    <div class="frame-size-chips">
      ${[['720×720','720,720'],['1200×630','1200,630'],['1080×1920','1080,1920'],['1920×1080','1920,1080']].map(([l,v]) =>
        `<button class="frame-chip" onclick="setFrameSize(${v})">${l}</button>`).join('')}
    </div>
    <div class="ctrl-row" style="margin-top:10px;">
      <span class="ctrl-label">Radius</span>
      <input type="range" class="ctrl-slider" id="frame-radius-sl" min="0" max="120" step="1" value="${fs.radius}" oninput="onFrameRadius(this.value)">
      <span class="ctrl-value" id="frame-radius-val">${fs.radius}</span>
    </div>
  </div>
  <div class="rp-zone">
    <div class="rp-zone-label">Background</div>
    <div class="ctrl-color-row">
      <div class="swatch" id="bg-swatch" style="background:${fs.bg}" onclick="document.getElementById('bg-cp').click()"></div>
      <span class="swatch-hex">${fs.bg}</span>
      <input type="color" class="color-input-hidden" id="bg-cp" value="${fs.bg}" oninput="onBgColor(this.value);document.getElementById('bg-swatch').style.background=this.value;document.querySelector('#panel-right .swatch-hex').textContent=this.value;">
    </div>
  </div>`;
}

function wireFrameZone() {
  const wi = document.getElementById('frame-w-inp');
  const hi = document.getElementById('frame-h-inp');
  if (wi) wi.addEventListener('change', () => onFrameWChange(wi.value));
  if (hi) hi.addEventListener('change', () => onFrameHChange(hi.value));
}

// ── Control Renderers ──────────────────────────────────────────
function renderSlider(layerId, key, label, val, min, max, step) {
  const vid = `v-${layerId}-${key}`;
  const sid = `s-${layerId}-${key}`;
  return `<div class="ctrl-row">
    <span class="ctrl-label">${label}</span>
    <input type="range" class="ctrl-slider" id="${sid}" min="${min}" max="${max}" step="${step}" value="${val}" data-lid="${layerId}" data-key="${key}" data-vid="${vid}">
    <span class="ctrl-value" id="${vid}">${fmt(val,step)}</span>
  </div>`;
}

function renderColorRow(layerId, key, hex, label) {
  const cid = `cp-${layerId}-${key}`;
  const did = `cd-${layerId}-${key}`;
  return `<div class="ctrl-color-row">
    <div class="swatch" id="${did}" style="background:${hex}" onclick="document.getElementById('${cid}').click()"></div>
    <span class="swatch-hex">${hex}</span>
    <input type="color" class="color-input-hidden" id="${cid}" value="${hex}" data-lid="${layerId}" data-key="${key}" data-did="${did}">
  </div>`;
}

function renderToggle(layerId, key, label, val) {
  const tid = `tg-${layerId}-${key}`;
  return `<div class="ctrl-row">
    <span class="ctrl-label">${label}</span>
    <div class="toggle-wrap" id="${tid}">
      <button class="toggle-opt${val?'':' active'}" data-val="0">Off</button>
      <button class="toggle-opt${val?' active':''}" data-val="1">On</button>
    </div>
  </div>`;
}

function wirePropertiesZone(l) {
  const panel = document.getElementById('panel-right');

  // Wire opacity slider (transform zone)
  const opSlider = document.getElementById('rp-opacity');
  const opVal    = document.getElementById('rp-opacity-v');
  if (opSlider) {
    opSlider.addEventListener('input', () => {
      updateLayerOpacity(l.id, opSlider.value);
      if (opVal) opVal.textContent = Math.round(opSlider.value*100)+'%';
    });
  }

  // Wire blend select
  const blendSel = document.getElementById('rp-blend');
  if (blendSel) blendSel.addEventListener('change', () => updateLayerBlend(l.id, blendSel.value));

  // Wire range sliders
  panel.querySelectorAll('.ctrl-slider[data-lid]').forEach(sl => {
    const key = sl.dataset.key;
    const vid = sl.dataset.vid;
    sl.addEventListener('input', () => {
      updateLayerProp(l.id, key, parseFloat(sl.value));
      const vEl = document.getElementById(vid);
      if (vEl) vEl.textContent = fmt(sl.value, sl.step);
    });
  });

  // Wire color inputs
  panel.querySelectorAll('input[type=color][data-lid]').forEach(cp => {
    const key = cp.dataset.key;
    const did = cp.dataset.did;
    cp.addEventListener('input', () => {
      updateLayerProp(l.id, key, cp.value);
      const sw = document.getElementById(did);
      if (sw) sw.style.background = cp.value;
      const hex = cp.closest('.ctrl-color-row')?.querySelector('.swatch-hex');
      if (hex) hex.textContent = cp.value;
    });
  });

  // Wire toggles
  panel.querySelectorAll('.toggle-wrap[id]').forEach(wrap => {
    const [offBtn, onBtn] = wrap.querySelectorAll('.toggle-opt');
    const key = wrap.id.replace(/^tg-\d+-/, '');
    [offBtn, onBtn].forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.val);
        updateLayerProp(l.id, key, val);
        offBtn.classList.toggle('active', val === 0);
        onBtn.classList.toggle('active',  val === 1);
      });
    });
  });
}

// ── Modal ──────────────────────────────────────────────────────
function openModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  populateGallery();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  stopAllMiniRenderers();
}

function populateGallery() {
  const gallery = document.getElementById('preset-gallery');
  gallery.innerHTML = '';

  // 7 preset cards
  MODAL_PRESETS.forEach(name => {
    const card = document.createElement('div');
    card.className = 'preset-card';
    const cvs = document.createElement('canvas');
    cvs.className = 'preset-card-canvas';
    cvs.width = 160; cvs.height = 120;
    const label = document.createElement('div');
    label.className = 'preset-card-label';
    label.textContent = name;
    card.appendChild(cvs);
    card.appendChild(label);
    card.addEventListener('click', () => loadPreset(name));
    gallery.appendChild(card);
    createMiniRenderer(cvs, name);
  });

  // Blank card
  const blank = document.createElement('div');
  blank.className = 'preset-card';
  const blankCvs = document.createElement('div');
  blankCvs.className = 'blank-card-canvas';
  blankCvs.innerHTML = `<span class="blank-card-plus">+</span>`;
  const blankLabel = document.createElement('div');
  blankLabel.className = 'preset-card-label';
  blankLabel.textContent = 'blank';
  blank.appendChild(blankCvs);
  blank.appendChild(blankLabel);
  blank.addEventListener('click', loadBlank);
  gallery.appendChild(blank);
}

function loadPreset(name) {
  const preset = PRESETS[name]; if (!preset) return;
  closeModal();
  layers = [];
  layerIdCounter = 0;
  selectedLayerId = null;
  frameState.bg = preset.bg;
  preset.layers.forEach(l => {
    const layer = createLayer(l.type, l.properties || {});
    if (l.name) layer.name = l.name;
    if (l.opacity !== undefined) layer.opacity = l.opacity;
    if (l.blendMode) layer.blendMode = l.blendMode;
    layers.push(layer);
  });
  if (layers.length) selectedLayerId = layers[0].id;
  renderUI(); needsRecompile = true;
}

function loadBlank() {
  closeModal();
  layers = []; layerIdCounter = 0; selectedLayerId = null;
  frameState.bg = '#111111';
  renderUI(); needsRecompile = true;
}

// ── Keyboard Handlers ──────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!document.getElementById('modal-overlay').classList.contains('hidden')) { closeModal(); return; }
    if (!document.getElementById('confirm-overlay').classList.contains('hidden')) { closeConfirm(false); return; }
    if (!layerPopover.classList.contains('hidden')) { closeLayerPopover(); return; }
    if (!ctxMenu.classList.contains('hidden')) { closeCtxMenu(); return; }
  }
  if ((e.key === 'Enter') && !document.getElementById('confirm-overlay').classList.contains('hidden')) { e.preventDefault(); closeConfirm(true); }
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { /* undo stub */ }
});

// Close modal on overlay click
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

// ── Frame Row ──────────────────────────────────────────────────
document.getElementById('frame-row').addEventListener('click', () => selectLayer('frame'));

// ── Boot ───────────────────────────────────────────────────────
noiseTex = initNoiseTex(gl);
applyFrame();
openModal();
requestAnimationFrame(frame);
