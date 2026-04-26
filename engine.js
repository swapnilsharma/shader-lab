// ================================================================
// SHADER LAB — Engine v3
// State management, layer CRUD, UI rendering, modal, playback
// ================================================================

// ── State ──────────────────────────────────────────────────────
let layers = [];           // Array<LayerObject>, index 0 = topmost in panel
let layerIdCounter = 0;
let selectedLayerId = 'frame';
let frameState = { bg: '#000000', w: 800, h: 600, radius: 0, aspect: null };
// Frame radius is stored as a percentage (0-50). 50% = maximum rounding.
function frameRadiusPx() {
  return (frameState.radius / 100) * Math.min(frameState.w, frameState.h);
}
let fileName = 'untitled';
let playing = true;
let timeOffset = performance.now();
let pausedAt = performance.now();
let needsRecompile = true;

// Image state
let baseImageTex = null;
let baseImageElement = null;
let hasBaseImage = false;
let imageAspectRatio = 1.0;
let baseImageName = '';

// Drag state
let dragSrcId = null;

// ── History (Undo / Redo) ──────────────────────────────────────
let history = [];
let historyIdx = -1;
const HISTORY_MAX = 20;

function syncUndoButtons() {
  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;
  const u = document.getElementById('btn-undo');
  const r = document.getElementById('btn-redo');
  if (u) u.disabled = !canUndo;
  if (r) r.disabled = !canRedo;
  const mu = document.getElementById('menu-edit-undo');
  const mr = document.getElementById('menu-edit-redo');
  if (mu) mu.classList.toggle('tb-menu-item--disabled', !canUndo);
  if (mr) mr.classList.toggle('tb-menu-item--disabled', !canRedo);
}

function snapshot() {
  const state = {
    layers: JSON.parse(JSON.stringify(layers)),
    bg: frameState.bg,
    sel: selectedLayerId
  };
  history = history.slice(0, historyIdx + 1);
  history.push(state);
  if (history.length > HISTORY_MAX) history.shift();
  historyIdx = history.length - 1;
  syncUndoButtons();
}

function restoreSnapshot(state) {
  layers = JSON.parse(JSON.stringify(state.layers));
  frameState.bg = state.bg;
  layerIdCounter = layers.reduce((m, l) => Math.max(m, l.id), 0);
  selectedLayerId = layers.find(l => l.id === state.sel) ? state.sel : (layers[0]?.id || null);
  renderUI();
  needsRecompile = true;
}

function undo() {
  if (historyIdx <= 0) return;
  historyIdx--;
  restoreSnapshot(history[historyIdx]);
  syncUndoButtons();
}

function redo() {
  if (historyIdx >= history.length - 1) return;
  historyIdx++;
  restoreSnapshot(history[historyIdx]);
  syncUndoButtons();
}

// ── Helpers ────────────────────────────────────────────────────
function hexToRgb(h) {
  h = (h || '#000000').replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x+x).join('');
  // 8-char #RRGGBBAA: alpha is stripped here so spreads into vec3 uniforms stay safe
  return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255];
}
function hexToRgba(h) {
  h = (h || '#000000ff').replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x+x).join('') + 'ff';
  if (h.length === 6) h = h + 'ff';
  if (h.length !== 8) h = '000000ff';
  return [
    parseInt(h.slice(0,2),16)/255,
    parseInt(h.slice(2,4),16)/255,
    parseInt(h.slice(4,6),16)/255,
    parseInt(h.slice(6,8),16)/255,
  ];
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
    case 'gradient':     return {
      seed: 42, freqX: 0.9, freqY: 6.0, angle: 105,
      amplitude: 2.1, softness: 0.74, blend: 0.54, scale: 1.0,
      stops: [
        { color: '#FF0055' },
        { color: '#0088FF' },
        { color: '#FFCC00' },
        { color: '#AA44FF' }
      ]
    };
    case 'linear-gradient': return {
      angle: 90, blend: 0.5, scale: 1.0,
      stops: [ { color: '#1e2558' }, { color: '#a580e0' } ]
    };
    case 'radial-gradient': return {
      cx: 0.5, cy: 0.5, radius: 0.5, blend: 0.5, scale: 1.0,
      stops: [ { color: '#FFCC00' }, { color: '#1e2558' } ]
    };
    case 'noise-field': return {
      seed: 0, scale: 4.0, contrast: 1.0, oct: 4, noiseType: 'value',
      colors: [ '#1e2558', '#4f3aa8', '#a580e0' ]
    };
    case 'mesh-gradient':return { seed: 12, scale: 0.42, scaleX: 1.0, scaleY: 1.0, noiseType: 'value', turbAmp: 0.15, turbFreq: 0.1, turbIter: 7, waveFreq: 3.8, distBias: 0.0, exposure: 1.1, contrast: 1.1, saturation: 1.0, colors: ['#1e2558', '#2f3088', '#4f3aa8', '#7050c8', '#a580e0'] };
    case 'image':        return { x: 0, y: 0, w: frameState.w, h: frameState.h, fit: 'cover' };
    case 'noise-warp':   return { str: 0.5, scale: 2.0, scaleX: 1.0, scaleY: 1.0, wspd: 0.12, oct: 4, iterations: 1, angle: 90, noiseType: 'value' };
    case 'wave':         return { color: '#6B7FE8', freq: 4.0, amp: 0.15, pos: 0.5, edge: 0.06, angle: 0, bands: 1, bandGap: 0.2 };
    case 'rectangle':    return { x: 0, y: 0, w: 300, h: 200, radius: 0, blur: 0, rotation: 0, scale: 1.0, fillMode: 'solid', color: '#E8E8E8', stops: [{color:'#FF0055'},{color:'#0088FF'}], strokeColor: '#000000', strokeWidth: 0, strokeOpacity: 1.0, shadowColor: '#000000', shadowBlur: 0, shadowX: 0, shadowY: 0, shadowOpacity: 0 };
    case 'circle':       return { x: 0, y: 0, w: 240, h: 240, blur: 0, rotation: 0, scale: 1.0, fillMode: 'solid', color: '#E8E8E8', stops: [{color:'#FF0055'},{color:'#0088FF'}], strokeColor: '#000000', strokeWidth: 0, strokeOpacity: 1.0, shadowColor: '#000000', shadowBlur: 0, shadowX: 0, shadowY: 0, shadowOpacity: 0 };
    case 'grain':        return { amount: 0.08, size: 1.0, animated: 1, streak: 0, sangle: 90, slen: 6 };
    case 'chromatic-aberration': return { spread: 0.006, angle: 0 };
    case 'vignette':     return { str: 0.6, soft: 0.4 };
    case 'color-grade':  return { contrast: 1.0, sat: 1.0, bright: 0.0, hue: 0, temperature: 0, tint: 0 };
    case 'posterize':    return { bands: 5, mix: 1.0, colors: ['#82C67C', '#336B51', '#257847', '#0F4140'] };
    case 'pixelate':     return { size: 4 };
    case 'scanlines':    return { count: 120, dark: 0.4, soft: 0.3, scroll: 0, scrollspd: 0.3 };
    case 'duotone':      return { colors: ['#000000', '#ffffff'], blend: 1.0 };
    case 'bloom':        return { threshold: 0.7, strength: 0.5, radius: 1.0 };
    case 'ripple':       return { cx: 0.5, cy: 0.5, freq: 10.0, amp: 0.03, decay: 2.0 };
    case 'n-tone':       return { bands: 4, mix: 1.0, colors: ['#0F1226', '#3A2C6E', '#A87BD9', '#FFE7CF'] };
    case 'glow':         return { threshold: 0.7, strength: 0.8, radius: 0.5, color: '#FFD58A' };
    case 'polar-remap':  return { cx: 0.5, cy: 0.5, twist: 0, zoom: 1.0 };
    case 'flow-warp':    return { str: 0.3, scale: 3.0, wspd: 0.5, angle: 0, noiseType: 'value' };
    default:             return {};
  }
}

const CONTENT_TYPES_ENGINE = new Set(['solid','gradient','linear-gradient','radial-gradient','noise-field','mesh-gradient','image','wave','rectangle','circle']);
function isContentLayer(type) { return CONTENT_TYPES_ENGINE.has(type); }

// Layer types whose shader actually samples uTime. Only these surface the
// Animation zone (speed / time offset / paused) in the right panel.
const LAYER_TYPES_WITH_ANIMATION = new Set([
  'gradient', 'mesh-gradient', 'wave',
  'noise-warp', 'flow-warp', 'ripple',
  'grain', 'scanlines'
]);
function layerSupportsAnimation(type) { return LAYER_TYPES_WITH_ANIMATION.has(type); }

// Per-type default for layer-level speed. Picked so a freshly created layer
// animates at the same effective rate the old per-properties speed used to.
function defaultLayerSpeed(type) {
  switch (type) {
    case 'mesh-gradient': return 0.3;
    case 'wave':          return 0.6;
    default:              return 1.0;
  }
}

function layerIcon(type) {
  if (isContentLayer(type)) return '◼';
  return '◈';
}

function defaultLayerName(type) {
  const NAMES = { solid:'Solid', gradient:'Gradient', 'linear-gradient':'Linear Gradient', 'radial-gradient':'Radial Gradient', 'noise-field':'Noise Field', 'mesh-gradient':'Mesh Gradient', image:'Image', 'noise-warp':'Noise Warp', wave:'Wave', rectangle:'Rectangle', circle:'Circle', grain:'Grain', 'chromatic-aberration':'Chromatic Aberration', vignette:'Vignette', 'color-grade':'Color Grade', posterize:'Posterize', pixelate:'Pixelate', scanlines:'Scanlines', duotone:'Duotone', bloom:'Bloom', ripple:'Ripple', 'n-tone':'N-Tone', glow:'Glow', 'polar-remap':'Polar Remap', 'flow-warp':'Flow Warp' };
  return NAMES[type] || type;
}

function migrateMeshGradientProps(props, override) {
  // Legacy color0..color4 → colors[]
  const hasColorsArr = Array.isArray(props.colors) && props.colors.length >= 2;
  const hasLegacy = override && (override.color0 || override.color1 || override.color2 || override.color3 || override.color4);
  if (!hasColorsArr && hasLegacy) {
    const raw = [override.color0, override.color1, override.color2, override.color3, override.color4].filter(c => typeof c === 'string');
    if (raw.length >= 2) props.colors = raw;
  }
  delete props.color0; delete props.color1; delete props.color2; delete props.color3; delete props.color4;
  if (!Array.isArray(props.colors) || props.colors.length < 2) {
    props.colors = ['#1e2558', '#2f3088', '#4f3aa8', '#7050c8', '#a580e0'];
  }
  // Clamp
  props.colors = props.colors.slice(0, 16);
}

// Legacy duotone {shadow, light} → colors[2]
function migrateDuotoneProps(props, override) {
  const overrideHasArr = override && Array.isArray(override.colors) && override.colors.length >= 2;
  const hasLegacy = override && (override.shadow || override.light);
  if (!overrideHasArr && hasLegacy) {
    props.colors = [override.shadow || '#000000', override.light || '#ffffff'];
  }
  delete props.shadow; delete props.light;
  if (!Array.isArray(props.colors) || props.colors.length < 2) {
    props.colors = ['#000000', '#ffffff'];
  }
  props.colors = props.colors.slice(0, 2);
}

// Legacy posterize {c1,c2,c3,c4} → colors[4]
function migratePosterizeProps(props, override) {
  const overrideHasArr = override && Array.isArray(override.colors) && override.colors.length >= 4;
  const hasLegacy = override && (override.c1 || override.c2 || override.c3 || override.c4);
  if (!overrideHasArr && hasLegacy) {
    props.colors = [
      override.c1 || '#82C67C',
      override.c2 || '#336B51',
      override.c3 || '#257847',
      override.c4 || '#0F4140',
    ];
  }
  delete props.c1; delete props.c2; delete props.c3; delete props.c4;
  if (!Array.isArray(props.colors) || props.colors.length < 4) {
    props.colors = ['#82C67C', '#336B51', '#257847', '#0F4140'];
  }
  props.colors = props.colors.slice(0, 4);
}

function migrateStopsProps(props) {
  if (!Array.isArray(props.stops) || props.stops.length < 2) {
    props.stops = [{ color: '#FF0055' }, { color: '#0088FF' }];
  }
  props.stops = props.stops.slice(0, 6).map(s => ({ color: (s && s.color) || '#ffffff' }));
}

function migrateNoiseFieldProps(props) {
  if (!Array.isArray(props.colors) || props.colors.length < 2) {
    props.colors = ['#1e2558', '#4f3aa8', '#a580e0'];
  }
  props.colors = props.colors.slice(0, 6);
}

function migrateNToneProps(props) {
  if (!Array.isArray(props.colors) || props.colors.length < 2) {
    props.colors = ['#0F1226', '#3A2C6E', '#A87BD9', '#FFE7CF'];
  }
  props.colors = props.colors.slice(0, 8);
}

function migrateGradientProps(props, override) {
  // Legacy color0..color3 → stops
  const hasOldColors = override && (override.color0 || override.color1 || override.color2 || override.color3);
  const hasStops = override && Array.isArray(override.stops);
  if (!hasStops && hasOldColors) {
    const raw = [override.color0, override.color1, override.color2, override.color3].filter(c => typeof c === 'string');
    if (raw.length >= 2) props.stops = raw.map(c => ({ color: c }));
  }
  delete props.color0; delete props.color1; delete props.color2; delete props.color3;
  if (!Array.isArray(props.stops) || props.stops.length < 2) {
    props.stops = [{ color: '#FF0055' }, { color: '#0088FF' }];
  }
  // Stops are now position-less (evenly distributed). Drop any legacy position field.
  props.stops = props.stops
    .slice(0, 6)
    .map(s => ({ color: (s && s.color) || '#ffffff' }));
  if (props.scale == null) props.scale = 1.0;
}

// ── Layer CRUD ─────────────────────────────────────────────────
function createLayer(type, propsOverride) {
  const props = Object.assign({}, defaultProperties(type), propsOverride || {});
  if (type === 'gradient') migrateGradientProps(props, propsOverride);
  if (type === 'linear-gradient' || type === 'radial-gradient') migrateStopsProps(props);
  if (type === 'noise-field') migrateNoiseFieldProps(props);
  if (type === 'mesh-gradient') migrateMeshGradientProps(props, propsOverride);
  if (type === 'duotone') migrateDuotoneProps(props, propsOverride);
  if (type === 'posterize') migratePosterizeProps(props, propsOverride);
  if (type === 'n-tone') migrateNToneProps(props);

  // Speed deduplication migration: legacy `properties.speed` (gradient,
  // mesh-gradient) and `properties.spd` (wave, ripple) were the
  // canonical animation rate. Move them onto layer.speed and drop from props.
  let layerSpeed = defaultLayerSpeed(type);
  if (props.speed != null && (type === 'gradient' || type === 'mesh-gradient')) {
    layerSpeed = props.speed;
    delete props.speed;
  }
  if (props.spd != null && (type === 'wave' || type === 'ripple')) {
    layerSpeed = props.spd;
    delete props.spd;
  }

  const layer = {
    id: ++layerIdCounter,
    type,
    name: defaultLayerName(type),
    visible: true,
    opacity: 1.0,
    blendMode: 'normal',
    speed: layerSpeed,
    timeOffset: 0.0,
    paused: false,
    properties: props
  };
  if (isContentLayer(type)) layer.effects = [];
  return layer;
}

// Ensure layer has v2 animation fields (speed/timeOffset/paused). Applied to
// loaded presets and imported .frakt files so legacy data picks up defaults.
function ensureV2Fields(layer) {
  if (!layer) return layer;
  if (typeof layer.speed !== 'number') layer.speed = 1.0;
  if (typeof layer.timeOffset !== 'number') layer.timeOffset = 0.0;
  if (typeof layer.paused !== 'boolean') layer.paused = false;
  if (Array.isArray(layer.effects)) layer.effects.forEach(ensureV2Fields);
  return layer;
}

// ── Per-layer Effects (attached to content layers) ─────────────
const PER_LAYER_EFFECT_TYPES = ['grain','color-grade','vignette','posterize','scanlines','noise-warp'];
let selectedAttachedEffect = {}; // layerId → attachedEffectId (for expanded inline props)
let effectsClipboard = null;     // array of attached effects (deep-copied)

function copyEffects(layerId) {
  const l = layers.find(x => x.id === layerId); if (!l) return;
  const src = l.effects || [];
  effectsClipboard = src.map(ae => ({
    type: ae.type,
    name: ae.name,
    visible: ae.visible !== false,
    opacity: ae.opacity != null ? ae.opacity : 1.0,
    properties: JSON.parse(JSON.stringify(ae.properties || {}))
  }));
  showToast(`Copied ${effectsClipboard.length} effect${effectsClipboard.length===1?'':'s'}`);
}

function pasteEffects(layerId) {
  const l = layers.find(x => x.id === layerId); if (!l) return;
  if (!effectsClipboard || !effectsClipboard.length) { showToast('No effects to paste'); return; }
  if (!isContentLayer(l.type)) { showToast('Effects can only paste onto content layers'); return; }
  l.effects = l.effects || [];
  effectsClipboard.forEach(src => {
    l.effects.unshift({
      id: ++layerIdCounter,
      type: src.type,
      name: src.name,
      visible: src.visible,
      opacity: src.opacity,
      properties: JSON.parse(JSON.stringify(src.properties))
    });
  });
  needsRecompile = true;
  renderRightPanel();
  snapshot();
  showToast(`Pasted ${effectsClipboard.length} effect${effectsClipboard.length===1?'':'s'}`);
}

function addAttachedEffect(layerId, type) {
  const l = layers.find(x => x.id === layerId); if (!l) return;
  l.effects = l.effects || [];
  const ae = {
    id: ++layerIdCounter,
    type,
    name: defaultLayerName(type),
    visible: true,
    opacity: 1.0,
    speed: 1.0,
    timeOffset: 0.0,
    paused: false,
    properties: Object.assign({}, defaultProperties(type))
  };
  l.effects.unshift(ae);
  selectedAttachedEffect[layerId] = ae.id;
  needsRecompile = true;
  renderRightPanel();
  closeEffectPopover();
  snapshot();
}

function removeAttachedEffect(layerId, aeId) {
  const l = layers.find(x => x.id === layerId); if (!l || !l.effects) return;
  l.effects = l.effects.filter(e => e.id !== aeId);
  if (selectedAttachedEffect[layerId] === aeId) delete selectedAttachedEffect[layerId];
  needsRecompile = true;
  renderRightPanel();
  snapshot();
}

function toggleAttachedEffectVisible(layerId, aeId) {
  const l = layers.find(x => x.id === layerId); if (!l || !l.effects) return;
  const ae = l.effects.find(e => e.id === aeId); if (!ae) return;
  ae.visible = !ae.visible;
  needsRecompile = true;
  renderRightPanel();
  snapshot();
}

function selectAttachedEffect(layerId, aeId) {
  selectedAttachedEffect[layerId] = selectedAttachedEffect[layerId] === aeId ? null : aeId;
  renderRightPanel();
}

function addLayer(type) {
  const layer = createLayer(type);
  layers.unshift(layer); // add at top
  selectedLayerId = layer.id;
  renderUI(); needsRecompile = true;
  snapshot();
}

function removeLayer(id) {
  layers = layers.filter(l => l.id !== id);
  if (selectedLayerId === id) selectedLayerId = layers.length ? layers[0].id : null;
  renderUI(); needsRecompile = true;
  snapshot();
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
  if (Array.isArray(orig.effects)) {
    copy.effects = orig.effects.map(ae => ({ ...ae, id: ++layerIdCounter, properties: JSON.parse(JSON.stringify(ae.properties || {})) }));
  }
  layers.splice(idx, 0, copy);
  selectedLayerId = copy.id;
  renderUI(); needsRecompile = true;
  snapshot();
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
  const finish = () => {
    const newName = inp.value.trim() || l.name;
    if (newName !== l.name) { l.name = newName; snapshot(); }
    renderLeftPanel();
  };
  inp.addEventListener('blur', finish);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') inp.blur(); });
}

function moveLayerToTop(id) {
  const idx = layers.findIndex(l => l.id === id); if (idx <= 0) return;
  layers.unshift(layers.splice(idx, 1)[0]);
  renderUI(); needsRecompile = true;
  snapshot();
}

function moveLayerToBottom(id) {
  const idx = layers.findIndex(l => l.id === id); if (idx < 0 || idx === layers.length-1) return;
  layers.push(layers.splice(idx, 1)[0]);
  renderUI(); needsRecompile = true;
  snapshot();
}

function toggleLayerVisibility(id) {
  const l = layers.find(l => l.id === id); if (!l) return;
  l.visible = !l.visible;
  renderLeftPanel(); needsRecompile = true;
  snapshot();
}

function selectLayer(id) {
  selectedLayerId = id;
  selectedStopIdx = 0;
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

// Update layer-level animation fields (speed, timeOffset, paused). Also
// supports attached effects — pass the attached effect's id as `id`.
function updateLayerAnim(id, key, value) {
  let target = layers.find(l => l.id === id);
  if (!target) {
    for (const lyr of layers) {
      if (Array.isArray(lyr.effects)) {
        const ae = lyr.effects.find(e => e.id === id);
        if (ae) { target = ae; break; }
      }
    }
  }
  if (!target) return;
  if (key === 'paused') target.paused = !!value;
  else target[key] = parseFloat(value);
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
  snapshot();
}

// ── Frame ──────────────────────────────────────────────────────
function applyFrame() {
  canvas.width = frameState.w; canvas.height = frameState.h;
  canvas.style.width = ''; canvas.style.height = '';
  canvas.style.maxWidth = '100%'; canvas.style.maxHeight = '100%';
  canvas.style.borderRadius = frameRadiusPx() + 'px';
  gl.viewport(0, 0, frameState.w, frameState.h);
  document.getElementById('status-dims').textContent = `${frameState.w} × ${frameState.h}`;
  needsRecompile = true;
}

function onFrameWChange(v) {
  frameState.w = Math.max(100, Math.min(7680, parseInt(v)||800));
  document.getElementById('frame-w-inp').value = frameState.w;
  frameState.aspect = null;
  applyFrame();
  if (selectedLayerId === 'frame') updateAspectButtons();
}
function onFrameHChange(v) {
  frameState.h = Math.max(100, Math.min(4320, parseInt(v)||600));
  document.getElementById('frame-h-inp').value = frameState.h;
  frameState.aspect = null;
  applyFrame();
  if (selectedLayerId === 'frame') updateAspectButtons();
}
function setFrameSize(w, h) {
  frameState.w = w; frameState.h = h; frameState.aspect = null; applyFrame();
  if (selectedLayerId === 'frame') renderRightPanel();
}
// Applies an aspect ratio preset. Keeps the larger dimension = current frame width
// (so 1:1 from a 1920×1080 frame produces 1920×1920, 9:16 produces 1920×3413, etc.).
function setFrameAspect(key, rw, rh) {
  const base = frameState.w;
  let nw, nh;
  if (rw >= rh) { nw = base; nh = Math.round(base * rh / rw); }
  else          { nh = base; nw = Math.round(base * rw / rh); }
  nw = Math.max(100, Math.min(7680, nw));
  nh = Math.max(100, Math.min(4320, nh));
  frameState.w = nw; frameState.h = nh; frameState.aspect = key;
  applyFrame();
  if (selectedLayerId === 'frame') renderRightPanel();
}
function updateAspectButtons() {
  document.querySelectorAll('.frame-ar-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.ar === frameState.aspect);
  });
}
function onFrameRadius(v) {
  const n = parseInt(v); frameState.radius = Math.max(0, Math.min(50, isFinite(n)?n:0));
  canvas.style.borderRadius = frameRadiusPx() + 'px';
  const el = document.getElementById('frame-radius-val');
  if (el) el.textContent = frameState.radius + '%';
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
  const gl = document.getElementById('btn-play-glyph');
  if (playing) {
    timeOffset += performance.now() - pausedAt;
    if (btn) btn.classList.add('active');
    if (gl) gl.textContent = '⏸';
  } else {
    pausedAt = performance.now();
    if (btn) btn.classList.remove('active');
    if (gl) gl.textContent = '▶';
  }
}
function restartTime() {
  timeOffset = performance.now(); pausedAt = performance.now();
  if (!playing) {
    playing = true;
    const btn = document.getElementById('btn-play');
    const gl = document.getElementById('btn-play-glyph');
    if (btn) btn.classList.add('active');
    if (gl) gl.textContent = '⏸';
  }
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
    baseImageElement = img;
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

// ── Name Dialog ────────────────────────────────────────────────
let nameResolve = null;
function showNameDialog({ title = 'Save as', defaultName = 'untitled', ext = '.frakt', okLabel = 'Save' } = {}) {
  return new Promise(resolve => {
    nameResolve = resolve;
    document.getElementById('name-title').textContent = title;
    document.getElementById('name-ext').textContent = ext;
    document.getElementById('name-ok').textContent = okLabel;
    const inp = document.getElementById('name-input');
    inp.value = defaultName;
    document.getElementById('name-overlay').classList.remove('hidden');
    setTimeout(() => { inp.focus(); inp.select(); }, 0);
  });
}
function closeNameDialog(result) {
  document.getElementById('name-overlay').classList.add('hidden');
  if (nameResolve) { nameResolve(result); nameResolve = null; }
}
document.getElementById('name-ok').addEventListener('click', () => {
  const v = document.getElementById('name-input').value.trim();
  closeNameDialog(v || null);
});
document.getElementById('name-cancel').addEventListener('click', () => closeNameDialog(null));
document.getElementById('name-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('name-overlay')) closeNameDialog(null);
});
document.getElementById('name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const v = e.target.value.trim();
    closeNameDialog(v || null);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeNameDialog(null);
  }
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
    if (action === 'rename')       renameLayer(id);
    if (action === 'duplicate')    duplicateLayer(id);
    if (action === 'copy-effects') copyEffects(id);
    if (action === 'paste-effects')pasteEffects(id);
    if (action === 'delete')       removeLayerConfirm(id);
    if (action === 'move-top')     moveLayerToTop(id);
    if (action === 'move-bottom')  moveLayerToBottom(id);
  });
});
document.addEventListener('click', () => closeCtxMenu());

// ── Layer/Effects Top-bar Menu Wiring ──────────────────────────
// Wire items in #menu-layers to add layers
(function wireLayersMenu() {
  const menu = document.getElementById('menu-layers');
  if (!menu) return;
  menu.querySelectorAll('[data-act="add-layer"]').forEach(item => {
    item.addEventListener('click', () => {
      const type = item.dataset.type;
      if (type) addLayer(type);
      closeAllTopbarMenus();
    });
  });
})();

// Wire items in #menu-effects to add an effect layer to the top of the main layer stack
// (identical to how effects were added before Round 6 split the Insert menu in two).
(function wireEffectsMenu() {
  const menu = document.getElementById('menu-effects');
  if (!menu) return;
  menu.querySelectorAll('[data-act="add-effect"]').forEach(item => {
    item.addEventListener('click', () => {
      const type = item.dataset.type;
      if (!type) return;
      addLayer(type);
      closeAllTopbarMenus();
    });
  });
})();

// Wire help menu actions
(function wireHelpMenu() {
  const menu = document.getElementById('menu-help');
  if (!menu) return;
  menu.querySelectorAll('[data-act]').forEach(item => {
    item.addEventListener('click', () => {
      const act = item.dataset.act;
      closeAllTopbarMenus();
      if (act === 'help-shortcuts') openHelpModal('help-shortcuts-overlay');
      else if (act === 'help-whatsnew') openHelpModal('help-whatsnew-overlay');
      else if (act === 'help-about') openHelpModal('help-about-overlay');
      else if (act === 'help-bug') openHelpModal('help-bug-overlay');
    });
  });
  // Close buttons on modals
  document.querySelectorAll('.help-close[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.close;
      const ov = document.getElementById(id);
      if (ov) ov.classList.add('hidden');
    });
  });
  // Click overlay backdrop to dismiss
  document.querySelectorAll('.help-overlay').forEach(ov => {
    ov.addEventListener('click', (e) => {
      if (e.target === ov) ov.classList.add('hidden');
    });
  });
  // Copy-email buttons inside help modals (Report-a-bug + About > Get in touch)
  document.querySelectorAll('.contact-copy-btn[data-copy-email]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const email = btn.dataset.copyEmail;
      if (!email) return;
      const mark = () => {
        const orig = btn.textContent;
        btn.classList.add('copied');
        btn.textContent = 'Copied';
        setTimeout(() => { btn.classList.remove('copied'); btn.textContent = orig; }, 1400);
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(email);
          mark();
          return;
        }
      } catch (_) { /* fall through */ }
      // Fallback: hidden textarea + execCommand
      try {
        const ta = document.createElement('textarea');
        ta.value = email;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        mark();
      } catch (_) {
        if (typeof showToast === 'function') showToast('Copy failed — select and copy manually', true);
      }
    });
  });
})();

function openHelpModal(id) {
  // Close any other help modal first
  document.querySelectorAll('.help-overlay').forEach(ov => ov.classList.add('hidden'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

// Lifecycle for Effects-dropdown thumbs: start animations when menu opens,
// stop when it closes. Hook into toggleMenu().
function onEffectsMenuOpened() {
  const m = document.getElementById('menu-effects');
  if (!m) return;
  startPopoverThumbs(m);
}
function onEffectsMenuClosed() {
  stopAllThumbRenderers();
}

// ── Attached Effect Popover (per-layer) ────────────────────────
const effectPopover = document.getElementById('effect-popover');
let effectPopoverLayerId = null;
function openEffectPopover(anchorEl, layerId) {
  const r = anchorEl.getBoundingClientRect();
  effectPopover.style.left = (r.right - 240) + 'px';
  effectPopover.style.top  = (r.bottom + 4) + 'px';
  effectPopover.classList.remove('hidden');
  effectPopoverLayerId = layerId;
  startPopoverThumbs(effectPopover);
  clampPopoverToViewport(effectPopover, r);
}

// Clamp a popover so it stays fully within the viewport. If there isn't
// enough room below the anchor, anchor above instead. If it still
// overflows (very tall popover, small viewport), the element's own
// max-height + overflow-y styles take care of scrolling.
function clampPopoverToViewport(popEl, anchorRect) {
  const margin = 8;
  const vw = window.innerWidth, vh = window.innerHeight;
  // Temporarily reset any max-height override we set so we can measure natural height
  popEl.style.maxHeight = '';
  const pr = popEl.getBoundingClientRect();

  // Horizontal clamp
  let left = pr.left;
  if (left + pr.width > vw - margin) left = vw - pr.width - margin;
  if (left < margin) left = margin;
  popEl.style.left = left + 'px';

  // Vertical clamp: prefer below anchor, fall back to above, finally clamp height.
  const spaceBelow = vh - anchorRect.bottom - margin;
  const spaceAbove = anchorRect.top - margin;
  let top;
  if (pr.height <= spaceBelow) {
    top = anchorRect.bottom + 4;
  } else if (pr.height <= spaceAbove) {
    top = anchorRect.top - pr.height - 4;
  } else {
    // Doesn't fit either side; pick the bigger and let overflow-y scroll handle it.
    if (spaceBelow >= spaceAbove) {
      top = anchorRect.bottom + 4;
      popEl.style.maxHeight = (spaceBelow - 4) + 'px';
    } else {
      top = margin;
      popEl.style.maxHeight = (spaceAbove - 4) + 'px';
    }
  }
  popEl.style.top = top + 'px';
}
function closeEffectPopover() {
  effectPopover.classList.add('hidden');
  effectPopoverLayerId = null;
  stopAllThumbRenderers();
}
effectPopover.querySelectorAll('.pop-item').forEach(item => {
  item.addEventListener('click', () => {
    if (effectPopoverLayerId != null) addAttachedEffect(effectPopoverLayerId, item.dataset.aeType);
  });
});
document.addEventListener('click', e => {
  if (!e.target.closest('#effect-popover') && !e.target.closest('.btn-add-effect')) closeEffectPopover();
});

// ── Add-layer popover (next to LAYERS title) ──────────────────
// One popover that covers every layer + effect type. Mirrors the
// topbar Layers and Effects menus, but in a single panel anchored
// to the "+" button so users don't have to drift back to the topbar.
const addLayerPopover = document.getElementById('add-layer-popover');
function openAddLayerPopover(anchorEl) {
  if (!addLayerPopover) return;
  closeMenus(null);
  closeEffectPopover();
  const r = anchorEl.getBoundingClientRect();
  // Anchor below the button, left-aligned to it
  addLayerPopover.style.left = r.left + 'px';
  addLayerPopover.style.top  = (r.bottom + 4) + 'px';
  addLayerPopover.classList.remove('hidden');
  startPopoverThumbs(addLayerPopover);
  clampPopoverToViewport(addLayerPopover, r);
}
function closeAddLayerPopover() {
  if (!addLayerPopover || addLayerPopover.classList.contains('hidden')) return;
  addLayerPopover.classList.add('hidden');
  stopAllThumbRenderers();
}
if (addLayerPopover) {
  addLayerPopover.querySelectorAll('.pop-item').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      const t = item.dataset.alType;
      if (t) addLayer(t);
      closeAddLayerPopover();
    });
  });
}
{
  const _alBtn = document.getElementById('btn-add-layer');
  if (_alBtn) {
    _alBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (addLayerPopover && !addLayerPopover.classList.contains('hidden')) {
        closeAddLayerPopover();
      } else {
        openAddLayerPopover(_alBtn);
      }
    });
  }
}
document.addEventListener('click', e => {
  if (!e.target.closest('#add-layer-popover') && !e.target.closest('#btn-add-layer')) closeAddLayerPopover();
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
  snapshot();
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
    row.className = 'layer-row' + (l.id === selectedLayerId ? ' selected' : '') + (l.visible ? '' : ' layer-hidden');
    row.setAttribute('data-lid', l.id);
    row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', e => onDragStart(e, l.id));
    row.addEventListener('dragend',   e => onDragEnd(e, l.id));
    row.addEventListener('dragover',  e => onDragOver(e, l.id));
    row.addEventListener('drop',      e => onDrop(e, l.id));
    row.addEventListener('click', () => selectLayer(l.id));
    row.addEventListener('contextmenu', e => { selectLayer(l.id); openCtxMenu(e, l.id); });

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
  if (fr) fr.classList.toggle('selected', selectedLayerId === 'frame');
}

// ── Right Panel ────────────────────────────────────────────────
function renderRightPanel() {
  // Any open iro popover belongs to the previous render — drop it.
  closeIroPopover();
  const panel = document.getElementById('panel-right');
  if (selectedLayerId === 'frame') {
    panel.innerHTML = renderFrameZone();
    wireFrameZone();
    attachIroPopovers(panel);
    return;
  }
  const l = layers.find(l => l.id === selectedLayerId);
  if (!l) { panel.innerHTML = `<div style="padding:20px 12px;color:var(--text-secondary);font-size:10px;">Select a layer to edit</div>`; return; }

  const icon = isContentLayer(l.type) ? '◼' : '◈';
  const typeName = l.type.replace(/-/g, ' ');
  let html = `<div class="rp-header">
    <span class="rp-header-icon">${icon}</span>
    <div class="rp-header-text">
      <span class="rp-header-name" id="rp-header-name" title="Click to rename">${l.name}</span>
      <span class="rp-header-type">${typeName}</span>
    </div>
  </div>`;
  if (isContentLayer(l.type)) html += renderTransformZone(l);
  html += renderPropertyZones(l);
  if (layerSupportsAnimation(l.type)) html += renderAnimationZone(l);
  if (isContentLayer(l.type)) html += renderEffectsZone(l);
  panel.innerHTML = html;
  wirePropertiesZone(l);
  wireRpHeaderName(l);
  if (isContentLayer(l.type)) wireEffectsZone(l);
  attachIroPopovers(panel);
}

function wireRpHeaderName(l) {
  const span = document.getElementById('rp-header-name');
  if (!span) return;
  span.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.className = 'rp-header-name-input';
    inp.value = l.name;
    span.replaceWith(inp);
    inp.focus(); inp.select();
    const commit = () => {
      const v = inp.value.trim() || l.name;
      if (v !== l.name) { l.name = v; snapshot(); }
      renderLeftPanel(); renderRightPanel();
    };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') inp.blur();
      if (e.key === 'Escape') { inp.value = l.name; inp.blur(); }
    });
  });
}

function renderUI() {
  renderLeftPanel();
  renderRightPanel();
  updateShapeOutline();
}

// ── Shape canvas interaction ───────────────────────────────────
function getSelectedShape() {
  const l = layers.find(l => l.id === selectedLayerId);
  if (!l || (l.type !== 'rectangle' && l.type !== 'circle' && l.type !== 'image')) return null;
  if (l.visible === false) return null;
  return l;
}

function updateShapeOutline() {
  const out = document.getElementById('shape-outline');
  const canvasEl = document.getElementById('glcanvas');
  if (!out || !canvasEl) return;
  const l = getSelectedShape();
  if (!l) { out.classList.add('hidden'); canvasEl.classList.remove('shape-target'); return; }
  const rect = canvasEl.getBoundingClientRect();
  const area = document.getElementById('canvas-area').getBoundingClientRect();
  if (rect.width <= 0 || canvasEl.width <= 0) { out.classList.add('hidden'); return; }
  const scale = rect.width / canvasEl.width;
  const cx = (rect.left - area.left) + rect.width / 2;
  const cy = (rect.top  - area.top)  + rect.height / 2;
  const p = l.properties;
  const isImage = l.type === 'image';
  const sclF = isImage ? 1.0 : (p.scale != null ? p.scale : 1.0);
  const defW = isImage ? frameState.w : 200;
  const defH = isImage ? frameState.h : 200;
  const w = (p.w || defW) * scale * sclF;
  const h = (p.h || defH) * scale * sclF;
  const left = cx + (p.x || 0) * scale - w / 2;
  const top  = cy - (p.y || 0) * scale - h / 2;
  // shader rotation is CCW (y-up); CSS rotate is CW (y-down) → negate
  const rotCss = isImage ? 0 : -(p.rotation || 0);
  out.style.left = left + 'px';
  out.style.top  = top + 'px';
  out.style.width = w + 'px';
  out.style.height = h + 'px';
  out.style.transform = `rotate(${rotCss}deg)`;
  out.style.borderRadius = l.type === 'circle' ? '50%' : (isImage ? '0px' : (((p.radius || 0) * scale * sclF) + 'px'));
  out.classList.remove('hidden');
  canvasEl.classList.add('shape-target');
}

window.addEventListener('resize', () => updateShapeOutline());

(function wireShapeDrag() {
  const canvasEl = document.getElementById('glcanvas');
  if (!canvasEl) return;
  let drag = null;

  const pxFromMouse = (e) => {
    const rect = canvasEl.getBoundingClientRect();
    const sx = canvasEl.width / Math.max(1, rect.width);
    const sy = canvasEl.height / Math.max(1, rect.height);
    const mx = (e.clientX - rect.left) * sx - canvasEl.width / 2;
    const my = (e.clientY - rect.top)  * sy - canvasEl.height / 2;
    return { mx, my };
  };
  // Screen coords (y-down, px-in-canvas-space, relative to shape center)
  // Rotate by +rot (shader CCW rad) to undo the visual rotation → local shape coords (still y-down).
  const toLocal = (dx, dy, rotRadShader) => {
    // CSS rotation applied = -rotRadShader (screen CW). Undo: rotate screen vec by +rotRadShader (CCW in y-down = CW math)
    // Using y-down CW math for CCW-visual: point = R(-rotRadShader) * screen_vec
    const a = rotRadShader; // rad
    const c = Math.cos(a), s = Math.sin(a);
    // In y-down frame with CSS rotate(-rot)deg applied, world->local undoes by rotate(+rot)deg CW = y-down CW matrix
    return { x: c*dx + s*dy, y: -s*dx + c*dy };
  };
  const hitTest = (l, mx, my) => {
    const p = l.properties;
    const dx = mx - (p.x || 0);
    const dy = my + (p.y || 0); // screen-down vector from shape center
    const isImage = l.type === 'image';
    const scl = isImage ? 1 : Math.max(0.01, p.scale != null ? p.scale : 1);
    const rot = isImage ? 0 : (p.rotation || 0) * Math.PI / 180;
    const lp = toLocal(dx, dy, rot);
    const defW = isImage ? frameState.w : 1;
    const defH = isImage ? frameState.h : 1;
    const hw = Math.max(0.5, (p.w || defW) / 2) * scl;
    const hh = Math.max(0.5, (p.h || defH) / 2) * scl;
    if (l.type === 'rectangle' || l.type === 'image') return Math.abs(lp.x) <= hw && Math.abs(lp.y) <= hh;
    if (l.type === 'circle')    return (lp.x*lp.x)/(hw*hw) + (lp.y*lp.y)/(hh*hh) <= 1;
    return false;
  };

  const liveSyncSlider = (layerId, key, value) => {
    const sl = document.getElementById(`s-${layerId}-${key}`);
    const v  = document.getElementById(`v-${layerId}-${key}`);
    if (sl) {
      sl.value = value;
      sl.style.setProperty('--fill', sliderFill(sl.value, sl.min, sl.max));
    }
    if (v)  v.textContent = typeof value === 'number' && !Number.isInteger(value) ? (Math.round(value*100)/100) : String(Math.round(value));
  };

  // ── Handle interactions (resize + rotate) ──
  const outEl = document.getElementById('shape-outline');
  if (outEl) {
    outEl.addEventListener('mousedown', (e) => {
      const h = e.target.closest('.sh-handle, .sh-handle--rot');
      if (!h) return;
      const l = getSelectedShape();
      if (!l) return;
      const kind = h.dataset.h;
      e.preventDefault();
      e.stopPropagation();
      const p = l.properties;
      const { mx, my } = pxFromMouse(e);
      drag = {
        l,
        mode: kind === 'rot' ? 'rotate' : 'resize',
        handle: kind,
        startMx: mx, startMy: my,
        startW: p.w || 200,
        startH: p.h || 200,
        startX: p.x || 0,
        startY: p.y || 0,
        startScale: p.scale != null ? p.scale : 1,
        startRot: p.rotation || 0
      };
      canvasEl.classList.add('shape-dragging');
    });
  }

  canvasEl.addEventListener('mousedown', (e) => {
    const l = getSelectedShape();
    if (!l) return;
    const { mx, my } = pxFromMouse(e);
    if (!hitTest(l, mx, my)) return;
    e.preventDefault();
    drag = { l, mode: 'move', startMx: mx, startMy: my, startX: l.properties.x || 0, startY: l.properties.y || 0 };
    canvasEl.classList.add('shape-dragging');
  });

  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const { mx, my } = pxFromMouse(e);
    const p = drag.l.properties;

    if (drag.mode === 'move') {
      p.x = Math.round(drag.startX + (mx - drag.startMx));
      p.y = Math.round(drag.startY - (my - drag.startMy));
      liveSyncSlider(drag.l.id, 'x', p.x);
      liveSyncSlider(drag.l.id, 'y', p.y);
    } else if (drag.mode === 'rotate') {
      // screen-down vec from shape center, at start and now
      const cxS = drag.startX, cyS = -drag.startY;       // center in screen-down coords
      const a0 = Math.atan2(drag.startMy - cyS, drag.startMx - cxS);
      const a1 = Math.atan2(my - cyS, mx - cxS);
      const dScreenCW = a1 - a0;                          // radians, CW positive on screen
      // shader rotation is CCW → subtract
      const newRotDeg = drag.startRot - dScreenCW * 180 / Math.PI;
      p.rotation = Math.round(((newRotDeg + 540) % 360) - 180);
      liveSyncSlider(drag.l.id, 'rotation', p.rotation);
    } else if (drag.mode === 'resize') {
      // Transform mouse delta into shape-local (un-rotated) axes.
      const rot = drag.startRot * Math.PI / 180;
      const dxScreen = mx - drag.startMx;
      const dyScreen = my - drag.startMy;
      const loc = toLocal(dxScreen, dyScreen, rot);  // local y is still screen-down
      const scl = Math.max(0.01, drag.startScale);
      const h = drag.handle;
      const sgnX = h.includes('r') ? 1 : (h.includes('l') ? -1 : 0);
      const sgnY = h.includes('b') ? 1 : (h.includes('t') ? -1 : 0);

      let newW = drag.startW, newH = drag.startH;
      if (sgnX !== 0) newW = Math.max(2, drag.startW + 2 * sgnX * loc.x / scl);
      if (sgnY !== 0) newH = Math.max(2, drag.startH + 2 * sgnY * loc.y / scl);

      p.w = Math.round(newW);
      p.h = Math.round(newH);
      liveSyncSlider(drag.l.id, 'w', p.w);
      liveSyncSlider(drag.l.id, 'h', p.h);
    }
    needsRecompile = false; // pure uniform update
    updateShapeOutline();
  });

  window.addEventListener('mouseup', () => {
    if (!drag) return;
    drag = null;
    canvasEl.classList.remove('shape-dragging');
    snapshot();
  });
})();

// ── Transform Zone ─────────────────────────────────────────────
// Opacity + blend for every content layer, plus spatial controls (x/y/w/h,
// rotation/scale/radius) for shapes and image layers.
function renderTransformZone(l) {
  const p = l.properties || {};
  const id = l.id;
  let rows = `
    <div class="ctrl-row">
      <span class="ctrl-label">Opacity</span>
      <input type="range" class="ctrl-slider" id="rp-opacity" min="0" max="1" step="0.01" value="${l.opacity}" style="--fill:${sliderFill(l.opacity,0,1)}">
      <span class="ctrl-value" id="rp-opacity-v">${Math.round(l.opacity*100)}%</span>
    </div>
    <div class="ctrl-row">
      <span class="ctrl-label">Blend</span>
      <select class="blend-select" id="rp-blend">
        ${['normal','multiply','screen','overlay','soft-light','color-dodge','color-burn','difference','add','lighten','darken'].map(m => `<option value="${m}"${l.blendMode===m?' selected':''}>${m}</option>`).join('')}
      </select>
    </div>`;
  if (l.type === 'rectangle' || l.type === 'circle') {
    rows += renderSlider(id,'x','X',p.x!=null?p.x:0,-1000,1000,1)
         +  renderSlider(id,'y','Y',p.y!=null?p.y:0,-1000,1000,1)
         +  renderSlider(id,'w','Width',p.w||200,1,2000,1)
         +  renderSlider(id,'h','Height',p.h||200,1,2000,1)
         +  (l.type === 'rectangle' ? renderSlider(id,'radius','Radius',p.radius||0,0,500,1) : '')
         +  renderSlider(id,'rotation','Rotation °',p.rotation||0,-180,180,1)
         +  renderSlider(id,'scale','Scale',p.scale!=null?p.scale:1.0,0.1,4.0,0.01);
  } else if (l.type === 'image') {
    const fw = p.w != null ? p.w : frameState.w;
    const fh = p.h != null ? p.h : frameState.h;
    rows += renderSlider(id,'x','X',p.x!=null?p.x:0,-2000,2000,1)
         +  renderSlider(id,'y','Y',p.y!=null?p.y:0,-2000,2000,1)
         +  renderSlider(id,'w','Width',fw,1,4000,1)
         +  renderSlider(id,'h','Height',fh,1,4000,1);
  }
  return `<div class="rp-zone"><div class="rp-zone-label">Transform</div>${rows}</div>`;
}

// ── Property Zones (Appearance / Effect / Detail / Anisotropy) ─
// Every layer type splits its non-Transform, non-Animation controls into up to
// four buckets. Empty buckets render nothing.
function renderZone(label, html) {
  if (!html || !String(html).trim()) return '';
  return `<div class="rp-zone"><div class="rp-zone-label">${label}</div>${html}</div>`;
}
function renderPropertyZones(l) {
  const z = getPropertyZones(l) || {};
  return [
    renderZone('Appearance', z.appearance),
    renderZone('Effect',     z.effect),
    renderZone('Detail',     z.detail),
    renderZone('Anisotropy', z.anisotropy),
    renderZone('Stroke',     z.stroke),
    renderZone('Shadow',     z.shadow),
  ].join('');
}

// Animation zone — layer-level speed/timeOffset/paused. Appears for every
// layer so users can slow/offset/pause any layer independently.
function renderAnimationZone(l) {
  const id = l.id;
  const speed = (typeof l.speed === 'number') ? l.speed : 1.0;
  const toff  = (typeof l.timeOffset === 'number') ? l.timeOffset : 0.0;
  const paused = !!l.paused;
  const sFill = sliderFill(speed, -5, 5);
  const oFill = sliderFill(toff, -10, 10);
  return `<div class="rp-zone"><div class="rp-zone-label">Animation</div>
    <div class="ctrl-row">
      <span class="ctrl-label">Speed</span>
      <input type="range" class="ctrl-slider anim-slider" id="anim-spd-${id}" min="-5" max="5" step="0.01" value="${speed}" data-lid="${id}" data-anim="speed" data-vid="anim-spd-v-${id}" style="--fill:${sFill}">
      <span class="ctrl-value" id="anim-spd-v-${id}">${fmt(speed, 0.01)}</span>
    </div>
    <div class="ctrl-row">
      <span class="ctrl-label">Time Offset</span>
      <input type="range" class="ctrl-slider anim-slider" id="anim-off-${id}" min="-10" max="10" step="0.01" value="${toff}" data-lid="${id}" data-anim="timeOffset" data-vid="anim-off-v-${id}" style="--fill:${oFill}">
      <span class="ctrl-value" id="anim-off-v-${id}">${fmt(toff, 0.01)}</span>
    </div>
    <div class="ctrl-row">
      <span class="ctrl-label">Playback</span>
      <div class="toggle-wrap anim-paused-toggle" id="anim-pau-${id}" data-lid="${id}">
        <button class="toggle-opt${!paused?' active':''}" data-pau="0">Playing</button>
        <button class="toggle-opt${paused?' active':''}" data-pau="1">Paused</button>
      </div>
    </div>
  </div>`;
}

// Declarative zone mapping for each layer type. Empty zones are pruned in
// renderZone. Transform/Animation are rendered separately; spatial controls
// for shapes/image live in Transform, not here.
function getPropertyZones(l) {
  const p = l.properties || {};
  const id = l.id;
  const S = (key, label, val, min, max, step) => renderSlider(id, key, label, val, min, max, step);

  switch (l.type) {
    case 'solid':
      return { appearance: renderColorRow(id, 'color', p.color || '#888', 'Color') };

    case 'gradient':
      return {
        appearance: renderGradientPalettes(l) + renderStopsStrip(l),
        effect: [
          S('amplitude', 'Amplitude', p.amplitude || 2.1, 0.5, 5.0, 0.05),
          S('softness',  'Softness',  p.softness  || 0.74, 0.1, 2.0, 0.01),
          S('blend',     'Blend',     p.blend     || 0.54, 0.0, 1.0, 0.01),
        ].join(''),
        detail: [
          S('seed',  'Seed',  p.seed  || 42,  0,   999, 1),
          S('freqX', 'Freq X', p.freqX || 0.9, 0.1, 5.0, 0.1),
          S('freqY', 'Freq Y', p.freqY || 6.0, 0.1, 10.0, 0.1),
          S('scale', 'Scale', p.scale != null ? p.scale : 1.0, 0.1, 4.0, 0.01),
        ].join(''),
        anisotropy: S('angle', 'Angle', p.angle || 0, 0, 360, 1),
      };

    case 'linear-gradient':
      return {
        appearance: renderStopsStrip(l),
        effect: S('blend', 'Smoothness', p.blend != null ? p.blend : 0.5, 0, 1, 0.01),
        detail: S('scale', 'Scale', p.scale != null ? p.scale : 1.0, 0.1, 4.0, 0.01),
        anisotropy: S('angle', 'Angle', p.angle != null ? p.angle : 90, 0, 360, 1),
      };

    case 'radial-gradient':
      return {
        appearance: renderStopsStrip(l),
        effect: [
          S('blend',  'Smoothness', p.blend  != null ? p.blend  : 0.5, 0, 1, 0.01),
          S('radius', 'Radius',     p.radius != null ? p.radius : 0.5, 0.05, 2.0, 0.01),
        ].join(''),
        detail: [
          S('cx', 'Center X', p.cx != null ? p.cx : 0.5, 0, 1, 0.01),
          S('cy', 'Center Y', p.cy != null ? p.cy : 0.5, 0, 1, 0.01),
          S('scale', 'Scale', p.scale != null ? p.scale : 1.0, 0.1, 4.0, 0.01),
        ].join(''),
      };

    case 'noise-field': {
      const nfCols = Array.isArray(p.colors) && p.colors.length >= 2 ? p.colors : ['#1e2558','#4f3aa8','#a580e0'];
      const nfRows = nfCols.map((c, i) => renderColorsIdxRow(id, i, c, '')).join('');
      return {
        appearance: `<div class="ctrl-row" style="font-size:9px;color:var(--text-secondary);letter-spacing:0.06em;">COLORS ${nfCols.length}/6</div>${nfRows}`,
        effect: [
          S('contrast', 'Contrast', p.contrast || 1.0, 0.0, 3.0, 0.01),
          renderSelect(id, 'noiseType', 'Noise', p.noiseType || 'value', ['value','perlin','worley']),
        ].join(''),
        detail: [
          S('seed',  'Seed',    p.seed  != null ? p.seed : 0,    0,   999,  1),
          S('scale', 'Scale',   p.scale != null ? p.scale : 4.0, 0.1, 16.0, 0.1),
          S('oct',   'Octaves', p.oct   || 4, 1, 8, 1),
        ].join(''),
      };
    }

    case 'mesh-gradient': {
      const cols = Array.isArray(p.colors) && p.colors.length >= 2 ? p.colors : ['#1e2558','#2f3088','#4f3aa8','#7050c8','#a580e0'];
      const rowsHTML = cols.map((c, i) => {
        const sid = `mg-sw-${id}-${i}`;
        const hid = `mg-hex-${id}-${i}`;
        const cid = `mg-cp-${id}-${i}`;
        const up  = (c || '#ffffff').toUpperCase();
        return `<div class="ctrl-color-row mg-color-row" data-lid="${id}" data-idx="${i}">
          <div class="swatch" id="${sid}" style="background:${c}" onclick="document.getElementById('${cid}').click()"></div>
          <input type="text" class="swatch-hex swatch-hex-input mg-color-hex" id="${hid}" value="${up}" spellcheck="false" maxlength="7" data-lid="${id}" data-idx="${i}">
          <input type="color" class="color-input-hidden mg-color-cp" id="${cid}" value="${c}" data-lid="${id}" data-idx="${i}">
          <button class="mg-color-del" data-lid="${id}" data-idx="${i}" title="Remove color" tabindex="-1">×</button>
        </div>`;
      }).join('');
      return {
        appearance: [
          `<div class="mg-preview-wrap"><canvas class="mg-preview-canvas" id="mg-preview-${id}" data-lid="${id}" width="240" height="160"></canvas></div>`,
          `<div class="mg-points-zone">
            <div class="mg-points-header">
              <span class="mg-points-label">Colors</span>
              <span class="mg-points-count" id="mg-cnt-${id}">${cols.length} points</span>
            </div>
            <div class="mg-colors-list" data-lid="${id}">${rowsHTML}</div>
            ${cols.length < 16 ? `<button class="mg-color-add" data-lid="${id}">+ Add color</button>` : ''}
          </div>`,
        ].join(''),
        effect: [
          S('turbAmp',    'Turbulence', p.turbAmp    || 0.6, 0.1,  2.0,  0.01),
          S('turbFreq',   'Turb Freq',  p.turbFreq   || 0.1, 0.01, 0.5,  0.005),
          S('turbIter',   'Turb Iter',  p.turbIter   || 7,   3,    12,   1),
          S('waveFreq',   'Wave Freq',  p.waveFreq   || 3.8, 1.0,  10.0, 0.1),
          S('exposure',   'Exposure',   p.exposure   || 1.1, 0.5,  2.0,  0.01),
          S('contrast',   'Contrast',   p.contrast   || 1.1, 0.5,  2.0,  0.01),
          S('saturation', 'Saturation', p.saturation || 1.0, 0.0,  2.0,  0.01),
        ].join(''),
        detail: [
          S('seed',  'Seed',  p.seed  || 12,   0,    999, 1),
          S('scale', 'Scale', p.scale || 0.42, 0.1,  2.0, 0.01),
          renderSelect(id, 'noiseType', 'Noise', p.noiseType || 'value', ['value','perlin','worley']),
        ].join(''),
        anisotropy: [
          S('scaleX', 'Scale X', p.scaleX != null ? p.scaleX : 1.0, 0.1, 4.0, 0.01),
          S('scaleY', 'Scale Y', p.scaleY != null ? p.scaleY : 1.0, 0.1, 4.0, 0.01),
        ].join(''),
      };
    }

    case 'image': {
      const fit = p.fit || 'cover';
      return {
        appearance: [
          `<div class="img-drop-zone" onclick="document.getElementById('img-input').click()">
            <div class="img-drop-icon">↑</div>
            <div class="img-drop-text">${hasBaseImage ? baseImageName : 'click or drop image'}</div>
          </div>`,
          `<div class="ctrl-row fill-mode-row">
            <span class="ctrl-label">Fit</span>
            <div class="toggle-wrap img-fit-toggle" data-lid="${id}">
              <button class="toggle-opt${fit==='cover'?' active':''}" data-fit="cover">Cover</button>
              <button class="toggle-opt${fit==='contain'?' active':''}" data-fit="contain">Fit</button>
              <button class="toggle-opt${fit==='stretch'?' active':''}" data-fit="stretch">Stretch</button>
            </div>
          </div>`,
        ].join(''),
      };
    }

    case 'noise-warp':
      return {
        effect: S('str', 'Strength', p.str || 0.5, 0, 2.0, 0.01),
        detail: [
          S('scale',      'Scale',       p.scale || 2.0,  0.3, 8.0, 0.1),
          S('wspd',       'Drift Speed', p.wspd  || 0.12, 0,   1.0, 0.01),
          S('oct',        'Octaves',     p.oct   || 4,    1,   8,   1),
          S('iterations', 'Iterations',  p.iterations || 1, 1,  4,   1),
          renderSelect(id, 'noiseType', 'Noise', p.noiseType || 'value', ['value','perlin','worley']),
        ].join(''),
        anisotropy: [
          S('angle',  'Direction °', p.angle != null ? p.angle : 90, 0, 360, 1),
          S('scaleX', 'Scale X',     p.scaleX != null ? p.scaleX : 1.0, 0.1, 4.0, 0.01),
          S('scaleY', 'Scale Y',     p.scaleY != null ? p.scaleY : 1.0, 0.1, 4.0, 0.01),
        ].join(''),
      };

    case 'wave':
      return {
        appearance: renderColorRow(id, 'color', p.color || '#6B7FE8', 'Color'),
        effect: S('amp', 'Amplitude', p.amp || 0.15, 0, 0.7, 0.005),
        detail: [
          S('freq',    'Frequency', p.freq    || 4.0,  0.5,   20,   0.1),
          S('pos',     'Position',  p.pos     || 0.5,  0.02,  0.98, 0.01),
          S('edge',    'Softness',  p.edge    || 0.06, 0.003, 0.9,  0.003),
          S('bands',   'Bands',     p.bands   || 1,    1,     8,    1),
          S('bandGap', 'Band Gap',  p.bandGap != null ? p.bandGap : 0.2, 0, 1, 0.01),
        ].join(''),
        anisotropy: S('angle', 'Angle °', p.angle || 0, -360, 360, 1),
      };

    case 'rectangle':
    case 'circle': {
      const fillMode = p.fillMode === 'gradient' ? 'gradient' : 'solid';
      const fillContent = fillMode === 'gradient'
        ? renderStopsStrip(l)
        : renderColorRow(id, 'color', p.color || '#E8E8E8', 'Color');
      return {
        appearance: [
          `<div class="ctrl-row fill-mode-row">
            <span class="ctrl-label">Fill</span>
            <div class="toggle-wrap fill-mode-toggle" data-lid="${id}">
              <button class="toggle-opt${fillMode==='solid'?' active':''}" data-fillmode="solid">Solid</button>
              <button class="toggle-opt${fillMode==='gradient'?' active':''}" data-fillmode="gradient">Gradient</button>
            </div>
          </div>`,
          `<div class="shape-fill">${fillContent}</div>`,
        ].join(''),
        effect: S('blur', 'Blur', p.blur || 0, 0, 200, 1),
        stroke: [
          renderColorRow(id, 'strokeColor', p.strokeColor || '#000000', 'Color'),
          S('strokeWidth',   'Width',   p.strokeWidth   != null ? p.strokeWidth   : 0,   0, 80,  0.5),
          S('strokeOpacity', 'Opacity', p.strokeOpacity != null ? p.strokeOpacity : 1.0, 0, 1.0, 0.01),
        ].join(''),
        shadow: [
          renderColorRow(id, 'shadowColor', p.shadowColor || '#000000', 'Color'),
          S('shadowBlur',    'Blur',    p.shadowBlur    != null ? p.shadowBlur    : 0,   0,    200,  1),
          S('shadowX',       'Offset X', p.shadowX      != null ? p.shadowX       : 0,  -200,  200,  1),
          S('shadowY',       'Offset Y', p.shadowY      != null ? p.shadowY       : 0,  -200,  200,  1),
          S('shadowOpacity', 'Opacity', p.shadowOpacity != null ? p.shadowOpacity : 0.5, 0,    1.0,  0.01),
        ].join(''),
      };
    }

    case 'grain':
      return {
        effect: S('amount', 'Amount', p.amount || 0.08, 0, 0.5, 0.005),
        detail: [
          S('size', 'Size', p.size || 1.0, 0.5, 6, 0.1),
          renderToggle(id, 'animated', 'Animated', p.animated || 0),
          renderToggle(id, 'streak',   'Streaked', p.streak   || 0),
          S('slen', 'Streak Length', p.slen || 6, 1, 20, 0.5),
        ].join(''),
        anisotropy: S('sangle', 'Streak Angle', p.sangle || 90, 0, 360, 1),
      };

    case 'chromatic-aberration':
      return {
        effect: S('spread', 'Spread', p.spread || 0.006, 0, 0.03, 0.0005),
        anisotropy: S('angle', 'Angle °', p.angle || 0, 0, 360, 1),
      };

    case 'vignette':
      return {
        effect: S('str',  'Strength', p.str  || 0.6, 0,    2.0, 0.01),
        detail: S('soft', 'Softness', p.soft || 0.4, 0.05, 1.5, 0.01),
      };

    case 'color-grade':
      return {
        effect: [
          S('contrast',    'Contrast',    p.contrast    || 1.0, 0,    2.0, 0.01),
          S('sat',         'Saturation',  p.sat         || 1.0, 0,    2.0, 0.01),
          S('bright',      'Brightness',  p.bright      || 0.0, -0.5, 0.5, 0.01),
          S('temperature', 'Temperature', p.temperature || 0,   -1,   1,   0.01),
          S('tint',        'Tint',        p.tint        || 0,   -1,   1,   0.01),
        ].join(''),
        anisotropy: S('hue', 'Hue Shift °', p.hue || 0, 0, 360, 1),
      };

    case 'posterize': {
      const pc = Array.isArray(p.colors) ? p.colors : [];
      return {
        appearance: [
          renderColorsIdxRow(id, 0, pc[0] || '#82C67C', 'Dark A'),
          renderColorsIdxRow(id, 1, pc[1] || '#336B51', 'Dark B'),
          renderColorsIdxRow(id, 2, pc[2] || '#257847', 'Bright A'),
          renderColorsIdxRow(id, 3, pc[3] || '#0F4140', 'Bright B'),
        ].join(''),
        effect: [
          S('bands', 'Bands', p.bands || 5,   2, 16,  1),
          S('mix',   'Mix',   p.mix   || 1.0, 0, 1.0, 0.01),
        ].join(''),
      };
    }

    case 'pixelate':
      return { effect: S('size', 'Block Size', p.size || 4, 1, 64, 1) };

    case 'scanlines':
      return {
        effect: [
          S('count', 'Line Count', p.count || 120, 20, 600, 5),
          S('dark',  'Darkness',   p.dark  || 0.4, 0,  1.0, 0.01),
          S('soft',  'Softness',   p.soft  || 0.3, 0,  1.0, 0.01),
        ].join(''),
        detail: [
          renderToggle(id, 'scroll', 'Scrolling', p.scroll || 0),
          S('scrollspd', 'Scroll Speed', p.scrollspd || 0.3, 0, 2.0, 0.05),
        ].join(''),
      };

    case 'duotone':
      return {
        appearance: renderDuotoneStrip(l),
        effect: S('blend', 'Blend', p.blend != null ? p.blend : 1.0, 0, 1.0, 0.01),
      };

    case 'bloom':
      return {
        effect: [
          S('threshold', 'Threshold', p.threshold != null ? p.threshold : 0.7, 0,    1.0, 0.01),
          S('strength',  'Strength',  p.strength  != null ? p.strength  : 0.5, 0,    3.0, 0.01),
          S('radius',    'Radius',    p.radius    != null ? p.radius    : 1.0, 0.25, 4.0, 0.05),
        ].join(''),
      };

    case 'ripple':
      return {
        effect: [
          S('freq',  'Frequency', p.freq  != null ? p.freq  : 10.0, 1.0, 40.0, 0.5),
          S('amp',   'Amplitude', p.amp   != null ? p.amp   : 0.03, 0,   0.2,  0.001),
          S('decay', 'Decay',     p.decay != null ? p.decay : 2.0,  0,   8.0,  0.1),
        ].join(''),
        detail: [
          S('cx',  'Center X', p.cx  != null ? p.cx  : 0.5, 0,  1.0, 0.01),
          S('cy',  'Center Y', p.cy  != null ? p.cy  : 0.5, 0,  1.0, 0.01),
        ].join(''),
      };

    case 'n-tone': {
      const ntCols = Array.isArray(p.colors) && p.colors.length >= 2 ? p.colors : ['#0F1226','#3A2C6E','#A87BD9','#FFE7CF'];
      const ntRows = ntCols.map((c, i) => renderColorsIdxRow(id, i, c, '')).join('');
      return {
        appearance: `<div class="ctrl-row" style="font-size:9px;color:var(--text-secondary);letter-spacing:0.06em;">COLORS ${ntCols.length}/8</div>${ntRows}`,
        effect: [
          S('bands', 'Bands', p.bands || 4,   1, 8,   1),
          S('mix',   'Mix',   p.mix   || 1.0, 0, 1.0, 0.01),
        ].join(''),
      };
    }

    case 'glow':
      return {
        appearance: renderColorRow(id, 'color', p.color || '#FFD58A', 'Tint'),
        effect: [
          S('threshold', 'Threshold', p.threshold != null ? p.threshold : 0.7, 0,    1.0, 0.01),
          S('strength',  'Strength',  p.strength  != null ? p.strength  : 0.8, 0,    3.0, 0.01),
          S('radius',    'Falloff',   p.radius    != null ? p.radius    : 0.5, 0.05, 2.0, 0.01),
        ].join(''),
      };

    case 'polar-remap':
      return {
        effect: [
          S('twist', 'Twist',  p.twist != null ? p.twist : 0,   -6.28, 6.28, 0.01),
          S('zoom',  'Zoom',   p.zoom  != null ? p.zoom  : 1.0,  0.1,  4.0,  0.01),
        ].join(''),
        detail: [
          S('cx', 'Center X', p.cx != null ? p.cx : 0.5, 0, 1, 0.01),
          S('cy', 'Center Y', p.cy != null ? p.cy : 0.5, 0, 1, 0.01),
        ].join(''),
      };

    case 'flow-warp':
      return {
        effect: S('str', 'Strength', p.str != null ? p.str : 0.3, 0, 2.0, 0.01),
        detail: [
          S('scale', 'Scale', p.scale != null ? p.scale : 3.0,  0.3, 8.0, 0.1),
          S('wspd',  'Speed', p.wspd  != null ? p.wspd  : 0.5,  0,   3.0, 0.01),
          renderSelect(id, 'noiseType', 'Noise', p.noiseType || 'value', ['value','perlin','worley']),
        ].join(''),
        anisotropy: S('angle', 'Direction °', p.angle != null ? p.angle : 0, 0, 360, 1),
      };

    default: return {};
  }
}

// ── Per-layer Effects Zone ─────────────────────────────────────
function renderEffectsZone(l) {
  const effects = l.effects || [];
  const expandedId = selectedAttachedEffect[l.id];
  const rows = effects.map(ae => {
    const expanded = ae.id === expandedId;
    const eyeCls = ae.visible ? '' : ' invisible';
    const inner = expanded ? `<div class="ae-props">${renderTypeControlsForAttached(l.id, ae)}</div>` : '';
    return `<div class="ae-row${expanded?' expanded':''}" data-ae-id="${ae.id}">
      <div class="ae-head" data-lid="${l.id}" data-ae-id="${ae.id}">
        <span class="ae-eye${eyeCls}" data-act="toggle" data-lid="${l.id}" data-ae-id="${ae.id}">${ae.visible?'●':'○'}</span>
        <span class="ae-name">${ae.name}</span>
        <span class="ae-x" data-act="del" data-lid="${l.id}" data-ae-id="${ae.id}">×</span>
      </div>
      ${inner}
    </div>`;
  }).join('');
  return `<div class="rp-zone ae-zone">
    <div class="rp-zone-label ae-zone-head">
      <span>Attached effects</span>
      <button class="btn-add-effect" data-lid="${l.id}" title="Insert effect">+</button>
    </div>
    <div class="ae-list">${rows || '<div class="ae-empty">No effects</div>'}</div>
  </div>`;
}

// Render a slider/toggle bound to an attached effect (no data-lid → main wiring skips it)
function aeSlider(aeId, key, label, val, min, max, step) {
  const vid = `v-ae${aeId}-${key}`;
  const sid = `s-ae${aeId}-${key}`;
  return `<div class="ctrl-row">
    <span class="ctrl-label">${label}</span>
    <input type="range" class="ctrl-slider ae-slider" id="${sid}" min="${min}" max="${max}" step="${step}" value="${val}" data-aeid="${aeId}" data-key="${key}" data-vid="${vid}" style="--fill:${sliderFill(val,min,max)}">
    <span class="ctrl-value" id="${vid}">${fmt(val,step)}</span>
  </div>`;
}
function aeToggle(aeId, key, label, val) {
  const tid = `tg-ae${aeId}-${key}`;
  return `<div class="ctrl-row">
    <span class="ctrl-label">${label}</span>
    <div class="toggle-wrap ae-toggle" id="${tid}" data-aeid="${aeId}" data-key="${key}">
      <button class="toggle-opt${val?'':' active'}" data-val="0">Off</button>
      <button class="toggle-opt${val?' active':''}" data-val="1">On</button>
    </div>
  </div>`;
}

// Render type controls for an attached effect (ae-prefixed ids, no data-lid)
function renderTypeControlsForAttached(layerId, ae) {
  const p = ae.properties || {};
  const id = ae.id;
  switch(ae.type) {
    case 'grain':
      return [
        aeSlider(id,'amount','Amount',p.amount!=null?p.amount:0.08,0,0.5,0.005),
        aeSlider(id,'size','Size',p.size||1.0,0.5,6,0.1),
        aeToggle(id,'animated','Animated',p.animated||0),
      ].join('');
    case 'color-grade':
      return [
        aeSlider(id,'contrast','Contrast',p.contrast!=null?p.contrast:1.0,0,2.0,0.01),
        aeSlider(id,'sat','Saturation',p.sat!=null?p.sat:1.0,0,2.0,0.01),
        aeSlider(id,'bright','Brightness',p.bright||0.0,-0.5,0.5,0.01),
        aeSlider(id,'hue','Hue Shift °',p.hue||0,0,360,1),
      ].join('');
    case 'vignette':
      return [
        aeSlider(id,'str','Strength',p.str!=null?p.str:0.6,0,2.0,0.01),
        aeSlider(id,'soft','Softness',p.soft!=null?p.soft:0.4,0.05,1.5,0.01),
      ].join('');
    case 'posterize':
      return [
        aeSlider(id,'bands','Bands',p.bands||5,2,16,1),
        aeSlider(id,'mix','Mix',p.mix!=null?p.mix:1.0,0,1.0,0.01),
      ].join('');
    case 'scanlines':
      return [
        aeSlider(id,'count','Line Count',p.count||120,20,600,5),
        aeSlider(id,'dark','Darkness',p.dark!=null?p.dark:0.4,0,1.0,0.01),
        aeSlider(id,'soft','Softness',p.soft!=null?p.soft:0.3,0,1.0,0.01),
      ].join('');
    case 'noise-warp':
      return [
        aeSlider(id,'str','Strength',p.str!=null?p.str:0.5,0,2.0,0.01),
        aeSlider(id,'scale','Scale',p.scale!=null?p.scale:2.0,0.1,8.0,0.1),
        aeSlider(id,'wspd','Speed',p.wspd!=null?p.wspd:0.12,0,1.0,0.01),
        aeSlider(id,'oct','Octaves',p.oct||4,1,8,1),
        aeSlider(id,'angle','Direction °',p.angle!=null?p.angle:90,0,360,1),
      ].join('');
    default:
      return '';
  }
}

function wireEffectsZone(l) {
  const zone = document.querySelector('.ae-zone');
  if (!zone) return;
  // Add button
  const addBtn = zone.querySelector('.btn-add-effect');
  if (addBtn) addBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (effectPopoverLayerId === l.id && !effectPopover.classList.contains('hidden')) {
      closeEffectPopover();
    } else {
      openEffectPopover(addBtn, l.id);
    }
  });
  // Head click → expand
  zone.querySelectorAll('.ae-head').forEach(h => {
    h.addEventListener('click', e => {
      const tgt = e.target;
      const act = tgt.dataset.act;
      const aeId = parseInt(h.dataset.aeId, 10);
      if (act === 'toggle') { e.stopPropagation(); toggleAttachedEffectVisible(l.id, aeId); return; }
      if (act === 'del')    { e.stopPropagation(); removeAttachedEffect(l.id, aeId); return; }
      selectAttachedEffect(l.id, aeId);
    });
  });
  // Wire attached-effect sliders
  zone.querySelectorAll('.ae-slider').forEach(sl => {
    const aeId = parseInt(sl.dataset.aeid, 10);
    const key = sl.dataset.key;
    const ae = (l.effects || []).find(e => e.id === aeId);
    if (!ae) return;
    sl.addEventListener('input', () => {
      ae.properties[key] = parseFloat(sl.value);
      const v = document.getElementById(sl.dataset.vid);
      if (v) v.textContent = fmt(sl.value, sl.step);
      sl.style.setProperty('--fill', sliderFill(sl.value, sl.min, sl.max));
      needsRecompile = true;
    });
    sl.addEventListener('change', () => snapshot());
  });
  // Wire attached-effect toggles
  zone.querySelectorAll('.ae-toggle').forEach(wrap => {
    const aeId = parseInt(wrap.dataset.aeid, 10);
    const key = wrap.dataset.key;
    const ae = (l.effects || []).find(e => e.id === aeId);
    if (!ae) return;
    const [offBtn, onBtn] = wrap.querySelectorAll('.toggle-opt');
    [offBtn, onBtn].forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.val);
        ae.properties[key] = val;
        offBtn.classList.toggle('active', val === 0);
        onBtn.classList.toggle('active',  val === 1);
        needsRecompile = true;
        snapshot();
      });
    });
  });
}

// ── Frame Zone ─────────────────────────────────────────────────
function renderFrameZone() {
  const fs = frameState;
  const ARS = [['1:1',1,1],['16:9',16,9],['9:16',9,16],['4:3',4,3],['3:4',3,4]];
  const arBtns = ARS.map(([label,w,h]) =>
    `<button class="frame-ar-btn${fs.aspect===label?' active':''}" data-ar="${label}" onclick="setFrameAspect('${label}',${w},${h})">${label}</button>`
  ).join('');
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
    <div class="frame-ar-label">PRESETS</div>
    <div class="frame-ar-row">${arBtns}</div>
    <div class="frame-size-chips">
      ${[['720×720','720,720'],['1200×630','1200,630'],['1080×1920','1080,1920'],['1920×1080','1920,1080']].map(([l,v]) =>
        `<button class="frame-chip" onclick="setFrameSize(${v})">${l}</button>`).join('')}
    </div>
    <div class="ctrl-row" style="margin-top:10px;">
      <span class="ctrl-label">Radius</span>
      <input type="range" class="ctrl-slider" id="frame-radius-sl" min="0" max="50" step="1" value="${fs.radius}" style="--fill:${sliderFill(fs.radius,0,50)}" oninput="onFrameRadius(this.value);this.style.setProperty('--fill',(this.value-this.min)/((this.max-this.min)||1))">
      <span class="ctrl-value" id="frame-radius-val">${fs.radius}%</span>
    </div>
  </div>
  <div class="rp-zone">
    <div class="rp-zone-label">Background</div>
    <div class="ctrl-color-row">
      <div class="swatch" id="bg-swatch" style="background:${fs.bg}" onclick="document.getElementById('bg-cp').click()"></div>
      <input type="text" class="swatch-hex swatch-hex-input" id="bg-hex" value="${fs.bg.toUpperCase()}" spellcheck="false" maxlength="7">
      <input type="color" class="color-input-hidden" id="bg-cp" value="${fs.bg}" oninput="onBgColor(this.value);document.getElementById('bg-swatch').style.background=this.value;var h=document.getElementById('bg-hex');if(h&&document.activeElement!==h)h.value=this.value.toUpperCase();" onchange="snapshot();">
    </div>
  </div>`;
}

function wireFrameZone() {
  const wi = document.getElementById('frame-w-inp');
  const hi = document.getElementById('frame-h-inp');
  if (wi) wi.addEventListener('change', () => onFrameWChange(wi.value));
  if (hi) hi.addEventListener('change', () => onFrameHChange(hi.value));
  const bh = document.getElementById('bg-hex');
  if (bh) {
    const commit = () => {
      const norm = normalizeHex(bh.value);
      if (!norm) { bh.value = (frameState.bg || '#000000').toUpperCase(); return; }
      onBgColor(norm);
      bh.value = norm.toUpperCase();
      const sw = document.getElementById('bg-swatch');
      if (sw) sw.style.background = norm;
      const cp = document.getElementById('bg-cp');
      if (cp) cp.value = norm;
      snapshot();
    };
    bh.addEventListener('blur', commit);
    bh.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); bh.blur(); }
      if (e.key === 'Escape') { bh.value = (frameState.bg || '#000000').toUpperCase(); bh.blur(); }
    });
  }
}

// ── Gradient Stops State ───────────────────────────────────────
let selectedStopIdx = 0;
let stopSelectionActive = false;

document.addEventListener('mousedown', e => {
  if (!e.target.closest('[data-stops-lid]')) stopSelectionActive = false;
}, true);

function interpolateStopColor(stops, t) {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  t = Math.max(0, Math.min(1, t));
  if (t <= sorted[0].position) return sorted[0].color;
  if (t >= sorted[sorted.length-1].position) return sorted[sorted.length-1].color;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i+1];
    if (t >= a.position && t <= b.position) {
      const mu = (t - a.position) / Math.max(b.position - a.position, 0.00001);
      const [ar,ag,ab] = hexToRgb(a.color);
      const [br,bg,bb] = hexToRgb(b.color);
      return rgbToHex(ar+(br-ar)*mu, ag+(bg-ag)*mu, ab+(bb-ab)*mu);
    }
  }
  return sorted[0].color;
}

function cssGradientFromStops(stops) {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const parts = sorted.map(s => `${s.color} ${(s.position*100).toFixed(2)}%`);
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

function evenStopsForCss(stops) {
  const n = Math.max(1, stops.length - 1);
  return stops.map((s, i) => ({ position: i / n, color: s.color }));
}

function renderGradientPalettes(l) {
  const id = l.id;
  const circles = GRADIENT_PALETTES.map((pal, i) => {
    const bg = `linear-gradient(135deg, ${pal.stops.join(', ')})`;
    return `<button class="grad-palette" data-palette-idx="${i}" style="background:${bg};" title="${pal.name}"></button>`;
  }).join('');
  return `<div class="grad-palettes-row" data-palettes-lid="${id}">${circles}</div>`;
}

function renderDuotoneStrip(l) {
  const id = l.id;
  const cols = Array.isArray(l.properties.colors) && l.properties.colors.length >= 2
    ? l.properties.colors
    : ['#000000', '#ffffff'];
  const shadow = (cols[0] || '#000000').toUpperCase();
  const light  = (cols[1] || '#ffffff').toUpperCase();
  const bgCss  = `linear-gradient(to right, ${shadow}, ${light})`;
  return `<div class="duotone-block" data-duotone-lid="${id}">
    <div class="duotone-strip" style="background:${bgCss};">
      <canvas class="duotone-hist" id="duotone-hist-${id}" width="200" height="28"></canvas>
    </div>
    <div class="duotone-swatches">
      <div class="ctrl-color-row duotone-swatch-row">
        <div class="swatch" id="cd-${id}-0" style="background:${shadow}" onclick="document.getElementById('cp-${id}-0').click()"></div>
        <input type="text" class="swatch-hex swatch-hex-input layer-colors-hex" id="ch-${id}-0" value="${shadow}" spellcheck="false" maxlength="7" data-lid="${id}" data-colors-idx="0" data-did="cd-${id}-0" data-cid="cp-${id}-0">
        <input type="color" class="color-input-hidden layer-colors-cp" id="cp-${id}-0" value="${shadow}" data-lid="${id}" data-colors-idx="0" data-did="cd-${id}-0" data-hid="ch-${id}-0">
      </div>
      <div class="ctrl-color-row duotone-swatch-row duotone-swatch-row--right">
        <input type="text" class="swatch-hex swatch-hex-input layer-colors-hex" id="ch-${id}-1" value="${light}" spellcheck="false" maxlength="7" data-lid="${id}" data-colors-idx="1" data-did="cd-${id}-1" data-cid="cp-${id}-1">
        <div class="swatch" id="cd-${id}-1" style="background:${light}" onclick="document.getElementById('cp-${id}-1').click()"></div>
        <input type="color" class="color-input-hidden layer-colors-cp" id="cp-${id}-1" value="${light}" data-lid="${id}" data-colors-idx="1" data-did="cd-${id}-1" data-hid="ch-${id}-1">
      </div>
    </div>
  </div>`;
}

function renderStopsStrip(l) {
  const id = l.id;
  const stops = l.properties.stops || [];
  const canAdd = stops.length < 6;
  const canRemove = stops.length > 2;
  const bgCss = cssGradientFromStops(evenStopsForCss(stops));
  const rows = stops.map((s, i) => {
    const hex = (s.color || '#ffffff').toUpperCase();
    return `<div class="stop-row" data-stop-idx="${i}" draggable="true">
      <span class="stop-drag" title="Drag to reorder">⋮⋮</span>
      <div class="stop-sw" data-stop-sw="${i}" style="background:${hex}" title="Click to change color"></div>
      <input type="text" class="stop-hex" data-stop-hex="${i}" value="${hex}" spellcheck="false" maxlength="7">
      <button class="stop-x" data-stop-rm="${i}" ${canRemove ? '' : 'disabled'} title="${canRemove ? 'Remove stop' : 'Need at least 2 stops'}">×</button>
      <input type="color" class="color-input-hidden" data-stop-cp="${i}" value="${hex}">
    </div>`;
  }).join('');
  return `<div class="stops-block" data-stops-lid="${id}">
    <div class="rp-zone-sublabel" style="font-size:9px;color:var(--text-secondary);margin-bottom:6px;letter-spacing:0.06em;">COLOR STOPS <span style="opacity:0.7">${stops.length}/6</span></div>
    <div class="stops-preview" style="background:${bgCss};"></div>
    <div class="stops-list" id="stops-list-${id}">${rows}</div>
    <button class="stops-add" id="stops-add-${id}" ${canAdd ? '' : 'disabled'} title="${canAdd ? 'Insert stop' : 'Maximum 6 stops'}">+ Insert stop</button>
  </div>`;
}

// ── Control Renderers ──────────────────────────────────────────
// Normalized 0..1 fill used by the CSS gradient "fill left of thumb"
// treatment. Clamped so out-of-range values don't overflow the track.
function sliderFill(val, min, max) {
  const span = (parseFloat(max) - parseFloat(min)) || 1;
  return Math.max(0, Math.min(1, (parseFloat(val) - parseFloat(min)) / span));
}
function renderSlider(layerId, key, label, val, min, max, step) {
  const vid = `v-${layerId}-${key}`;
  const sid = `s-${layerId}-${key}`;
  const fill = sliderFill(val, min, max);
  return `<div class="ctrl-row">
    <span class="ctrl-label">${label}</span>
    <input type="range" class="ctrl-slider" id="${sid}" min="${min}" max="${max}" step="${step}" value="${val}" data-lid="${layerId}" data-key="${key}" data-vid="${vid}" style="--fill:${fill}">
    <span class="ctrl-value" id="${vid}">${fmt(val,step)}</span>
  </div>`;
}

function renderColorRow(layerId, key, hex, label) {
  const cid = `cp-${layerId}-${key}`;
  const did = `cd-${layerId}-${key}`;
  const hid = `ch-${layerId}-${key}`;
  const up = (hex || '#ffffff').toUpperCase();
  return `<div class="ctrl-color-row">
    <div class="swatch" id="${did}" style="background:${hex}" onclick="document.getElementById('${cid}').click()"></div>
    <input type="text" class="swatch-hex swatch-hex-input" id="${hid}" value="${up}" spellcheck="false" maxlength="7" data-lid="${layerId}" data-key="${key}" data-did="${did}" data-cid="${cid}">
    <input type="color" class="color-input-hidden" id="${cid}" value="${hex}" data-lid="${layerId}" data-key="${key}" data-did="${did}" data-hid="${hid}">
  </div>`;
}

function renderColorsIdxRow(layerId, idx, hex, label) {
  const cid = `cp-${layerId}-${idx}`;
  const did = `cd-${layerId}-${idx}`;
  const hid = `ch-${layerId}-${idx}`;
  const up = (hex || '#ffffff').toUpperCase();
  return `<div class="ctrl-color-row">
    <div class="swatch" id="${did}" style="background:${hex}" onclick="document.getElementById('${cid}').click()"></div>
    <input type="text" class="swatch-hex swatch-hex-input layer-colors-hex" id="${hid}" value="${up}" spellcheck="false" maxlength="7" data-lid="${layerId}" data-colors-idx="${idx}" data-did="${did}" data-cid="${cid}">
    <input type="color" class="color-input-hidden layer-colors-cp" id="${cid}" value="${hex}" data-lid="${layerId}" data-colors-idx="${idx}" data-did="${did}" data-hid="${hid}">
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

function renderSelect(layerId, key, label, val, options) {
  const sid = `sel-${layerId}-${key}`;
  const opts = options.map(o => `<option value="${o}"${val === o ? ' selected' : ''}>${o}</option>`).join('');
  return `<div class="ctrl-row">
    <span class="ctrl-label">${label}</span>
    <select class="blend-select layer-select" id="${sid}" data-lid="${layerId}" data-key="${key}">${opts}</select>
  </div>`;
}

function wireStopsStrip(l) {
  if (l.type !== 'gradient' && l.type !== 'rectangle' && l.type !== 'circle' && l.type !== 'linear-gradient' && l.type !== 'radial-gradient') return;
  const id = l.id;
  const list = document.getElementById(`stops-list-${id}`);
  const addBtn = document.getElementById(`stops-add-${id}`);
  if (!list) return;

  const refresh = () => { needsRecompile = true; renderRightPanel(); };

  // Add
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const stops = l.properties.stops;
      if (stops.length >= 6) return;
      const last = stops[stops.length - 1]?.color || '#ffffff';
      stops.push({ color: last });
      snapshot();
      refresh();
    });
  }

  list.querySelectorAll('.stop-row').forEach(row => {
    const idx = parseInt(row.dataset.stopIdx);

    // Right-click remove
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (l.properties.stops.length <= 2) return;
      l.properties.stops.splice(idx, 1);
      snapshot();
      refresh();
    });

    // Swatch click → open color picker
    const sw = row.querySelector(`[data-stop-sw="${idx}"]`);
    const cp = row.querySelector(`[data-stop-cp="${idx}"]`);
    if (sw && cp) {
      sw.addEventListener('click', () => cp.click());
      cp.addEventListener('input', () => {
        l.properties.stops[idx].color = cp.value;
        sw.style.background = cp.value;
        const hexIn = row.querySelector(`[data-stop-hex="${idx}"]`);
        if (hexIn && document.activeElement !== hexIn) hexIn.value = cp.value.toUpperCase();
        const preview = document.querySelector(`[data-stops-lid="${id}"] .stops-preview`);
        if (preview) preview.style.background = cssGradientFromStops(evenStopsForCss(l.properties.stops));
        needsRecompile = true;
      });
      cp.addEventListener('change', () => snapshot());
    }

    // Hex input
    const hexIn = row.querySelector(`[data-stop-hex="${idx}"]`);
    if (hexIn) {
      const commitHex = () => {
        const raw = hexIn.value.trim();
        const norm = normalizeHex(raw);
        if (!norm) { hexIn.value = (l.properties.stops[idx].color || '#ffffff').toUpperCase(); return; }
        l.properties.stops[idx].color = norm;
        hexIn.value = norm.toUpperCase();
        if (sw) sw.style.background = norm;
        if (cp) cp.value = norm;
        const preview = document.querySelector(`[data-stops-lid="${id}"] .stops-preview`);
        if (preview) preview.style.background = cssGradientFromStops(evenStopsForCss(l.properties.stops));
        needsRecompile = true;
        snapshot();
      };
      hexIn.addEventListener('blur', commitHex);
      hexIn.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); hexIn.blur(); }
        if (e.key === 'Escape') { hexIn.value = (l.properties.stops[idx].color || '#ffffff').toUpperCase(); hexIn.blur(); }
      });
    }

    // × button remove
    const rm = row.querySelector(`[data-stop-rm="${idx}"]`);
    if (rm) {
      rm.addEventListener('click', () => {
        if (l.properties.stops.length <= 2) return;
        l.properties.stops.splice(idx, 1);
        snapshot();
        refresh();
      });
    }

    // Drag to reorder (native HTML5 DnD)
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const from = parseInt(e.dataTransfer.getData('text/plain'));
      if (isNaN(from) || from === idx) return;
      const stops = l.properties.stops;
      const [moved] = stops.splice(from, 1);
      stops.splice(idx, 0, moved);
      snapshot();
      refresh();
    });
  });
}

// ── Duotone strip: live-update gradient + optional histogram ───
function wireDuotoneStrip(l) {
  if (l.type !== 'duotone') return;
  const id = l.id;
  const block = document.querySelector(`[data-duotone-lid="${id}"]`);
  if (!block) return;
  const strip = block.querySelector('.duotone-strip');
  const shadowCp = document.getElementById(`cp-${id}-0`);
  const lightCp  = document.getElementById(`cp-${id}-1`);
  const syncStrip = () => {
    const cols = Array.isArray(l.properties.colors) ? l.properties.colors : [];
    const sh = (shadowCp?.value || cols[0] || '#000000').toUpperCase();
    const lt = (lightCp?.value  || cols[1] || '#ffffff').toUpperCase();
    if (strip) strip.style.background = `linear-gradient(to right, ${sh}, ${lt})`;
  };
  ['0','1'].forEach(k => {
    const cp = document.getElementById(`cp-${id}-${k}`);
    const hx = document.getElementById(`ch-${id}-${k}`);
    if (cp) cp.addEventListener('input', syncStrip);
    if (hx) hx.addEventListener('blur',  syncStrip);
  });
  drawDuotoneHistogram(id);
}

function drawDuotoneHistogram(layerId) {
  const canvas = document.getElementById(`duotone-hist-${layerId}`);
  if (!canvas) return;
  const src = document.getElementById('gl-canvas') || document.querySelector('canvas');
  if (!src) return;
  try {
    // Sample a scaled-down snapshot via an offscreen 2D canvas
    const W = 160, H = 90;
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const octx = off.getContext('2d');
    octx.drawImage(src, 0, 0, W, H);
    const data = octx.getImageData(0, 0, W, H).data;
    const bins = new Array(64).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
      const b = Math.min(63, Math.floor(lum / 4));
      bins[b]++;
    }
    const maxBin = Math.max(...bins) || 1;
    const ctx = canvas.getContext('2d');
    const cw = canvas.width, ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    const bw = cw / bins.length;
    for (let i = 0; i < bins.length; i++) {
      const h = (bins[i] / maxBin) * ch;
      ctx.fillRect(i * bw, ch - h, bw - 0.5, h);
    }
  } catch (e) { /* readback may fail for tainted canvas — silently skip */ }
}

// ── Gradient palettes (8 preset stop lists) ────────────────────
const GRADIENT_PALETTES = [
  { name: 'Sunset',  stops: ['#FFB347','#FF6B6B','#C06C84','#6C5B7B'] },
  { name: 'Ocean',   stops: ['#0F2027','#203A43','#2C5364','#4DD0E1'] },
  { name: 'Aurora',  stops: ['#020D08','#00FFB3','#7B2FFF','#00CFFF'] },
  { name: 'Ember',   stops: ['#1A0500','#FF4400','#FFAA00','#FF0055'] },
  { name: 'Mint',    stops: ['#0E3B30','#2CE4A7','#A8F0C6','#F5FFF8'] },
  { name: 'Dusk',    stops: ['#1F1B3A','#4B3F72','#CC527A','#F4B1C5'] },
  { name: 'Mono',    stops: ['#0A0A0A','#3D3D3D','#9A9A9A','#F2F2F2'] },
  { name: 'Rose',    stops: ['#2B0A1E','#8B1E3F','#E74C8F','#FFD6E8'] }
];

function wireGradientPalettes(l) {
  if (l.type !== 'gradient') return;
  const row = document.querySelector(`[data-palettes-lid="${l.id}"]`);
  if (!row) return;
  row.querySelectorAll('.grad-palette').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.paletteIdx);
      const palette = GRADIENT_PALETTES[idx];
      if (!palette) return;
      l.properties.stops = palette.stops.map(c => ({ color: c }));
      needsRecompile = true;
      snapshot();
      renderRightPanel();
    });
  });
}

function normalizeHex(raw) {
  let s = (raw || '').trim();
  if (!s) return null;
  if (s[0] !== '#') s = '#' + s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1], g = s[2], b = s[3];
    return ('#' + r + r + g + g + b + b).toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  // 8-char #RRGGBBAA — preserve alpha byte
  if (/^#[0-9a-fA-F]{8}$/.test(s)) return s.toLowerCase();
  return null;
}

// ── iro.js colour popover ─────────────────────────────────────
// A single floating popover shared across all colour pickers (Solid,
// Gradient stops, Mesh points, Shape fill, Duotone shadow/light,
// Frame background). We keep the existing hidden <input type="color">
// elements as model state: the popover drives them via dispatched
// `input`/`change` events, so every existing wiring site continues
// to work unchanged.
let _iroCurrent = null;
function closeIroPopover() {
  if (!_iroCurrent) return;
  const { wrap, cleanup, hidden } = _iroCurrent;
  _iroCurrent = null;
  try { cleanup && cleanup(); } catch (e) {}
  if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
  if (hidden) hidden.dispatchEvent(new Event('change', { bubbles: true }));
}

function openIroPopover(hidden, anchor) {
  if (typeof iro === 'undefined') {
    // iro.js failed to load — fall back to a harmless no-op so the
    // swatch still appears clickable. The hidden input's value stays
    // whatever it was. We log once for visibility.
    if (!window._iroWarned) { console.warn('[frakt] iro.js not available'); window._iroWarned = true; }
    return;
  }
  closeIroPopover();
  const wrap = document.createElement('div');
  wrap.className = 'iro-popover';
  wrap.addEventListener('mousedown', e => e.stopPropagation());
  document.body.appendChild(wrap);

  const wheelHost = document.createElement('div');
  wheelHost.className = 'iro-wheel-host';
  wrap.appendChild(wheelHost);

  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'iro-popover-hex';
  hexInput.spellcheck = false;
  hexInput.maxLength = 7;
  const startHex = normalizeHex(hidden.value) || '#ffffff';
  hexInput.value = startHex.toUpperCase();
  wrap.appendChild(hexInput);

  const picker = new iro.ColorPicker(wheelHost, {
    width: 160,
    color: startHex,
    layout: [
      { component: iro.ui.Wheel },
      { component: iro.ui.Slider, options: { sliderType: 'value' } }
    ]
  });

  picker.on('color:change', color => {
    const hex = color.hexString;
    hidden.value = hex;
    hidden.dispatchEvent(new Event('input', { bubbles: true }));
    if (document.activeElement !== hexInput) hexInput.value = hex.toUpperCase();
  });

  hexInput.addEventListener('input', () => {
    const norm = normalizeHex(hexInput.value);
    if (norm) { try { picker.color.hexString = norm; } catch (e) {} }
  });
  hexInput.addEventListener('blur', () => {
    const norm = normalizeHex(hexInput.value);
    hexInput.value = (norm || hidden.value || '#ffffff').toUpperCase();
  });
  hexInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); hexInput.blur(); closeIroPopover(); }
    if (e.key === 'Escape') { e.preventDefault(); closeIroPopover(); }
  });

  // Position the popover near the anchor (or hidden input if no anchor)
  const rect = (anchor || hidden).getBoundingClientRect();
  const POP_W = 208; // 184 content + 12*2 padding + 2 border
  const POP_H_EST = 260;
  let left = rect.left;
  if (left + POP_W > window.innerWidth - 8) left = window.innerWidth - POP_W - 8;
  if (left < 8) left = 8;
  let top = rect.bottom + 6;
  if (top + POP_H_EST > window.innerHeight - 8) {
    const above = rect.top - POP_H_EST - 6;
    top = above > 8 ? above : Math.max(8, window.innerHeight - POP_H_EST - 8);
  }
  wrap.style.left = left + 'px';
  wrap.style.top  = top  + 'px';

  const onDocMouse = e => { if (!wrap.contains(e.target)) closeIroPopover(); };
  const onKey = e => { if (e.key === 'Escape') closeIroPopover(); };
  // Delay attach so the opening click doesn't immediately close us
  setTimeout(() => {
    document.addEventListener('mousedown', onDocMouse, true);
    document.addEventListener('keydown', onKey);
  }, 0);

  const cleanup = () => {
    document.removeEventListener('mousedown', onDocMouse, true);
    document.removeEventListener('keydown', onKey);
  };
  _iroCurrent = { wrap, cleanup, hidden };
}

// Monkey-patch .click() on every hidden colour input so any existing
// trigger (swatch onclick, programmatic .click()) routes to iro.
function attachIroPopovers(root) {
  const scope = root || document;
  scope.querySelectorAll('input[type="color"].color-input-hidden').forEach(cp => {
    if (cp._iroAttached) return;
    cp._iroAttached = true;
    cp.click = function () {
      const row = cp.closest('.ctrl-color-row, .stop-row, .duotone-swatch-row, .mg-color-row');
      let anchor = null;
      if (row) anchor = row.querySelector('.swatch, .stop-sw');
      // Frame background swatch lives outside a .ctrl-color-row in some layouts
      if (!anchor && cp.id === 'bg-cp') anchor = document.getElementById('bg-swatch');
      openIroPopover(cp, anchor);
    };
  });
  // Stops use a .stop-sw that directly calls cp.click() via a JS handler
  // (wireStopsStrip). That path also goes through our patched .click, so
  // no extra wiring needed.
}

// ── Inline value-edit helper (slider value → input on click) ─────
// Tab / Shift-Tab inside the input commits and jumps to the next /
// previous slider value in the right panel — so users can chain
// fine-tune edits without ever leaving the keyboard.
let _pendingCtrlValueTab = null;
function beginCtrlValueEdit(sl, vEl, vid, commitFn) {
  const prevText = vEl.textContent;
  const w = vEl.offsetWidth;
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'ctrl-value-input';
  inp.value = prevText;
  if (w) inp.style.width = w + 'px';
  vEl.replaceWith(inp);
  inp.focus(); inp.select();
  let committed = false;
  const commit = () => {
    if (committed) return; committed = true;
    const raw = parseFloat(inp.value);
    const clamped = isNaN(raw) ? parseFloat(sl.value) : Math.min(parseFloat(sl.max), Math.max(parseFloat(sl.min), raw));
    commitFn(clamped);
    snapshot();
    renderRightPanel();
    if (_pendingCtrlValueTab) {
      const tab = _pendingCtrlValueTab;
      _pendingCtrlValueTab = null;
      advanceCtrlValueFocus(tab.layerId, tab.fromVid, tab.dir);
    }
  };
  const cancel = () => {
    if (committed) return; committed = true;
    const span = document.createElement('span');
    span.id = vid; span.className = 'ctrl-value'; span.textContent = prevText;
    inp.replaceWith(span);
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); return; }
    if (e.key === 'Escape') { committed = true; cancel(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const lid = parseInt(sl.dataset.lid, 10);
      _pendingCtrlValueTab = { layerId: lid, fromVid: vid, dir: e.shiftKey ? -1 : 1 };
      inp.blur();
    }
  });
}

// After a slider value has been committed and the right panel re-rendered,
// find the next (or previous) slider in document order and put it into
// inline-edit mode by clicking its value span. Includes both property
// sliders (data-key) and animation sliders (data-anim) on the same layer.
function advanceCtrlValueFocus(layerId, fromVid, dir) {
  const panel = document.getElementById('panel-right');
  if (!panel) return;
  const sliders = Array.from(panel.querySelectorAll('.ctrl-slider[data-lid][data-vid]'))
    .filter(s => parseInt(s.dataset.lid, 10) === layerId);
  const idx = sliders.findIndex(s => s.dataset.vid === fromVid);
  if (idx < 0) return;
  const target = sliders[idx + dir];
  if (!target) return;
  const span = document.getElementById(target.dataset.vid);
  if (span) span.click();
}

function wirePropertiesZone(l) {
  const panel = document.getElementById('panel-right');
  wireStopsStrip(l);
  wireGradientPalettes(l);
  wireDuotoneStrip(l);

  // Wire Animation zone sliders (speed, timeOffset)
  panel.querySelectorAll('.ctrl-slider.anim-slider[data-lid]').forEach(sl => {
    const key = sl.dataset.anim;
    const vid = sl.dataset.vid;
    sl.addEventListener('input', () => {
      updateLayerAnim(l.id, key, sl.value);
      const vEl = document.getElementById(vid);
      if (vEl) vEl.textContent = fmt(sl.value, sl.step);
      sl.style.setProperty('--fill', sliderFill(sl.value, sl.min, sl.max));
    });
    sl.addEventListener('change', () => snapshot());
    const vEl = document.getElementById(vid);
    if (vEl) vEl.addEventListener('click', () => beginCtrlValueEdit(sl, vEl, vid, v => updateLayerAnim(l.id, key, v)));
  });
  // Wire Animation paused toggle
  panel.querySelectorAll('.anim-paused-toggle[data-lid]').forEach(wrap => {
    const [offBtn, onBtn] = wrap.querySelectorAll('.toggle-opt');
    [offBtn, onBtn].forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.pau);
        updateLayerAnim(l.id, 'paused', val === 1);
        offBtn.classList.toggle('active', val === 0);
        onBtn.classList.toggle('active',  val === 1);
        snapshot();
      });
    });
  });

  // Wire opacity slider (transform zone)
  const opSlider = document.getElementById('rp-opacity');
  const opVal    = document.getElementById('rp-opacity-v');
  if (opSlider) {
    opSlider.addEventListener('input', () => {
      updateLayerOpacity(l.id, opSlider.value);
      if (opVal) opVal.textContent = Math.round(opSlider.value*100)+'%';
      opSlider.style.setProperty('--fill', sliderFill(opSlider.value, opSlider.min, opSlider.max));
    });
    opSlider.addEventListener('change', () => snapshot());
  }

  // Wire blend select
  const blendSel = document.getElementById('rp-blend');
  if (blendSel) blendSel.addEventListener('change', () => updateLayerBlend(l.id, blendSel.value));

  // Wire range sliders — live update on input, snapshot on mouseup (change).
  // Skip anim-sliders here; they're wired above with their own commit path.
  panel.querySelectorAll('.ctrl-slider[data-lid]:not(.anim-slider)').forEach(sl => {
    const key = sl.dataset.key;
    const vid = sl.dataset.vid;
    sl.addEventListener('input', () => {
      updateLayerProp(l.id, key, parseFloat(sl.value));
      const vEl = document.getElementById(vid);
      if (vEl) vEl.textContent = fmt(sl.value, sl.step);
      sl.style.setProperty('--fill', sliderFill(sl.value, sl.min, sl.max));
    });
    sl.addEventListener('change', () => snapshot());
    // Click on value → inline edit
    const vEl = document.getElementById(vid);
    if (vEl) vEl.addEventListener('click', () => beginCtrlValueEdit(sl, vEl, vid, v => updateLayerProp(l.id, key, v)));
  });

  // Wire color inputs — live update on input, snapshot on close (change).
  // Skip inputs with data-colors-idx (those write into layer.properties.colors[])
  panel.querySelectorAll('input[type=color][data-lid]:not([data-colors-idx])').forEach(cp => {
    const key = cp.dataset.key;
    const did = cp.dataset.did;
    const hid = cp.dataset.hid;
    if (!key) return; // mg-color-cp uses data-idx only — handled elsewhere
    cp.addEventListener('input', () => {
      updateLayerProp(l.id, key, cp.value);
      const sw = document.getElementById(did);
      if (sw) sw.style.background = cp.value;
      const hx = hid ? document.getElementById(hid) : cp.closest('.ctrl-color-row')?.querySelector('.swatch-hex');
      if (hx && document.activeElement !== hx) {
        if ('value' in hx) hx.value = cp.value.toUpperCase();
        else hx.textContent = cp.value.toUpperCase();
      }
    });
    cp.addEventListener('change', () => snapshot());
  });

  // Wire hex text inputs — commit on blur/Enter (skip colors[] rows)
  panel.querySelectorAll('.swatch-hex-input[data-lid]:not([data-colors-idx])').forEach(hx => {
    const key = hx.dataset.key;
    const did = hx.dataset.did;
    const cid = hx.dataset.cid;
    if (!key) return;
    const commit = () => {
      const norm = normalizeHex(hx.value);
      if (!norm) { hx.value = (l.properties[key] || '#ffffff').toUpperCase(); return; }
      updateLayerProp(l.id, key, norm);
      hx.value = norm.toUpperCase();
      const sw = document.getElementById(did);
      if (sw) sw.style.background = norm;
      const cp = document.getElementById(cid);
      if (cp) cp.value = norm;
      snapshot();
    };
    hx.addEventListener('blur', commit);
    hx.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); hx.blur(); }
      if (e.key === 'Escape') { hx.value = (l.properties[key] || '#ffffff').toUpperCase(); hx.blur(); }
    });
    hx.addEventListener('click', e => e.stopPropagation());
  });

  // Wire layer-colors[] color inputs (duotone/posterize) — writes to
  // l.properties.colors[idx] instead of a flat key.
  panel.querySelectorAll('.layer-colors-cp[data-lid]').forEach(cp => {
    const idx = parseInt(cp.dataset.colorsIdx, 10);
    const did = cp.dataset.did;
    const hid = cp.dataset.hid;
    cp.addEventListener('input', () => {
      const arr = Array.isArray(l.properties.colors) ? l.properties.colors.slice() : [];
      arr[idx] = cp.value;
      l.properties.colors = arr;
      const sw = document.getElementById(did);
      if (sw) sw.style.background = cp.value;
      const hx = hid ? document.getElementById(hid) : null;
      if (hx && document.activeElement !== hx) hx.value = cp.value.toUpperCase();
      needsRecompile = true;
    });
    cp.addEventListener('change', () => snapshot());
  });
  panel.querySelectorAll('.layer-colors-hex[data-lid]').forEach(hx => {
    const idx = parseInt(hx.dataset.colorsIdx, 10);
    const did = hx.dataset.did;
    const cid = hx.dataset.cid;
    const commit = () => {
      const norm = normalizeHex(hx.value);
      const arr = Array.isArray(l.properties.colors) ? l.properties.colors.slice() : [];
      if (!norm) { hx.value = (arr[idx] || '#ffffff').toUpperCase(); return; }
      arr[idx] = norm;
      l.properties.colors = arr;
      hx.value = norm.toUpperCase();
      const sw = document.getElementById(did); if (sw) sw.style.background = norm;
      const cp = document.getElementById(cid); if (cp) cp.value = norm;
      needsRecompile = true;
      snapshot();
    };
    hx.addEventListener('blur', commit);
    hx.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); hx.blur(); }
      if (e.key === 'Escape') {
        const arr = Array.isArray(l.properties.colors) ? l.properties.colors : [];
        hx.value = (arr[idx] || '#ffffff').toUpperCase(); hx.blur();
      }
    });
    hx.addEventListener('click', e => e.stopPropagation());
  });

  // Wire toggles (skip ae-toggles — handled in wireEffectsZone)
  panel.querySelectorAll('.toggle-wrap[id]:not(.ae-toggle):not(.fill-mode-toggle):not(.anim-paused-toggle)').forEach(wrap => {
    const [offBtn, onBtn] = wrap.querySelectorAll('.toggle-opt');
    const key = wrap.id.replace(/^tg-\d+-/, '');
    [offBtn, onBtn].forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.val);
        updateLayerProp(l.id, key, val);
        offBtn.classList.toggle('active', val === 0);
        onBtn.classList.toggle('active',  val === 1);
        snapshot();
      });
    });
  });

  // Wire generic layer-property selects (e.g., noiseType)
  panel.querySelectorAll('select.layer-select[data-lid]').forEach(sel => {
    sel.addEventListener('change', () => {
      updateLayerProp(l.id, sel.dataset.key, sel.value);
      needsRecompile = true;
      snapshot();
    });
  });

  // Wire fill-mode toggle (shape layers)
  panel.querySelectorAll('.fill-mode-toggle').forEach(wrap => {
    wrap.querySelectorAll('[data-fillmode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.fillmode;
        if (l.properties.fillMode === mode) return;
        l.properties.fillMode = mode;
        needsRecompile = true;
        snapshot();
        renderRightPanel();
      });
    });
  });

  // Wire image-fit toggle
  panel.querySelectorAll('.img-fit-toggle').forEach(wrap => {
    wrap.querySelectorAll('[data-fit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const fit = btn.dataset.fit;
        if (l.properties.fit === fit) return;
        l.properties.fit = fit;
        wrap.querySelectorAll('[data-fit]').forEach(b => b.classList.toggle('active', b.dataset.fit === fit));
        snapshot();
      });
    });
  });

  // Wire mesh-gradient colour rows (uses the standard color picker component)
  panel.querySelectorAll('.mg-colors-list').forEach(list => {
    const lid = parseInt(list.dataset.lid);
    const layerRef = layers.find(x => x.id === lid);
    if (!layerRef) return;

    // Color picker (native) live-update
    list.querySelectorAll('input.mg-color-cp').forEach(cp => {
      const idx = parseInt(cp.dataset.idx);
      const sid = `mg-sw-${lid}-${idx}`;
      const hid = `mg-hex-${lid}-${idx}`;
      cp.addEventListener('input', () => {
        const arr = Array.isArray(layerRef.properties.colors) ? layerRef.properties.colors.slice() : [];
        arr[idx] = cp.value;
        layerRef.properties.colors = arr;
        const sw = document.getElementById(sid);
        if (sw) sw.style.background = cp.value;
        const hx = document.getElementById(hid);
        if (hx && document.activeElement !== hx) hx.value = cp.value.toUpperCase();
        needsRecompile = true;
        mgRefreshPreview(lid);
      });
      cp.addEventListener('change', () => snapshot());
    });

    // Hex text input — commit on blur / Enter
    list.querySelectorAll('input.mg-color-hex').forEach(hx => {
      const idx = parseInt(hx.dataset.idx);
      const sid = `mg-sw-${lid}-${idx}`;
      const cid = `mg-cp-${lid}-${idx}`;
      const commit = () => {
        const norm = normalizeHex(hx.value);
        const arr = Array.isArray(layerRef.properties.colors) ? layerRef.properties.colors.slice() : [];
        if (!norm) { hx.value = (arr[idx] || '#ffffff').toUpperCase(); return; }
        arr[idx] = norm;
        layerRef.properties.colors = arr;
        hx.value = norm.toUpperCase();
        const sw = document.getElementById(sid); if (sw) sw.style.background = norm;
        const cp = document.getElementById(cid); if (cp) cp.value = norm;
        needsRecompile = true;
        mgRefreshPreview(lid);
        snapshot();
      };
      hx.addEventListener('blur', commit);
      hx.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); hx.blur(); }
        if (e.key === 'Escape') {
          const arr = Array.isArray(layerRef.properties.colors) ? layerRef.properties.colors : [];
          hx.value = (arr[idx] || '#ffffff').toUpperCase(); hx.blur();
        }
      });
      hx.addEventListener('click', e => e.stopPropagation());
    });

    // Per-row delete button
    list.querySelectorAll('.mg-color-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        mgRemovePoint(lid, parseInt(btn.dataset.idx));
      });
    });
  });

  // Add-color button (sibling of the list)
  panel.querySelectorAll('.mg-color-add').forEach(btn => {
    const lid = parseInt(btn.dataset.lid);
    btn.addEventListener('click', () => mgAddPoint(lid));
  });

  // Bootstrap mesh-gradient preview for any present canvas
  panel.querySelectorAll('.mg-preview-canvas').forEach(cvs => {
    const lid = parseInt(cvs.dataset.lid);
    mgRenderPreview(lid, cvs);
  });
}

// ── Mesh gradient helpers ──────────────────────────────────────
function mgAddPoint(lid) {
  const l = layers.find(x => x.id === lid); if (!l) return;
  const arr = Array.isArray(l.properties.colors) ? l.properties.colors.slice() : [];
  if (arr.length >= 16) { showToast && showToast('Max 16 colors'); return; }
  // Default new color: midpoint (perceptual) of last two colours, else last colour, else neutral
  let next = '#888888';
  if (arr.length >= 2) next = _mgMixHex(arr[arr.length - 2], arr[arr.length - 1]);
  else if (arr.length === 1) next = arr[0];
  arr.push(next);
  l.properties.colors = arr;
  needsRecompile = true;
  renderRightPanel();
  snapshot();
}

function mgRemovePoint(lid, idx) {
  const l = layers.find(x => x.id === lid); if (!l) return;
  const arr = Array.isArray(l.properties.colors) ? l.properties.colors.slice() : [];
  if (arr.length <= 2) { showToast && showToast('Minimum 2 colors'); return; }
  if (idx < 0 || idx >= arr.length) return;
  arr.splice(idx, 1);
  l.properties.colors = arr;
  needsRecompile = true;
  renderRightPanel();
  snapshot();
}

function _mgMixHex(a, b) {
  const parse = (h) => {
    const m = /^#?([0-9a-f]{6})$/i.exec((h || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const ca = parse(a), cb = parse(b);
  if (!ca || !cb) return a || b || '#888888';
  const mix = ca.map((v, i) => Math.round((v + cb[i]) / 2));
  return '#' + mix.map(v => v.toString(16).padStart(2, '0')).join('');
}

function mgRefreshPreview(lid) {
  const cvs = document.getElementById(`mg-preview-${lid}`);
  if (cvs) mgRenderPreview(lid, cvs);
}

// Seeded PRNG for deterministic preview layout
function mgSeededRand(seed) {
  let s = seed | 0;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s & 0x7fffffff) / 2147483647;
  };
}

function mgRenderPreview(lid, cvs) {
  const l = layers.find(x => x.id === lid); if (!l) return;
  const ctx = cvs.getContext('2d'); if (!ctx) return;
  const cols = Array.isArray(l.properties.colors) && l.properties.colors.length >= 2
    ? l.properties.colors : ['#1a1a2e', '#16213e', '#0f3460', '#533483', '#e94560'];
  const W = cvs.width, H = cvs.height;
  // Base fill (last color = ambient)
  ctx.fillStyle = cols[cols.length - 1];
  ctx.fillRect(0, 0, W, H);
  // Seeded color-centers, painted as soft radial blobs
  const seed = Math.max(1, Math.floor((l.properties.seed || 12) * 7 + cols.length * 13));
  const rnd = mgSeededRand(seed);
  const points = cols.map((c, i) => ({
    c,
    x: (0.1 + 0.8 * rnd()) * W,
    y: (0.1 + 0.8 * rnd()) * H,
    r: (0.35 + 0.35 * rnd()) * Math.max(W, H)
  }));
  ctx.globalCompositeOperation = 'lighter';
  points.forEach(pt => {
    const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, pt.r);
    g.addColorStop(0, pt.c);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });
  ctx.globalCompositeOperation = 'source-over';
  // Subtle dark overlay to tame "lighter" blowout, maintaining "mesh" feel
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, W, H);
}

// ── Modal ──────────────────────────────────────────────────────
const WELCOME_GREETINGS = [
  "Shaders for the rest of us.",
  "Welcome, makers.",
  "Welcome, designers.",
  "Let's make something beautiful.",
  "Go ahead. Break the grid.",
  "Your canvas. Your rules.",
  "Make it move.",
  "Start with a vibe.",
  "Something's about to look really good.",
  "Let's do something fun.",
  "This one's for the builders.",
  "Ready when you are.",
  "What are we making today?",
  "Pick a mood. We'll do the rest.",
  "Pixels, but make it art.",
  "Not your average gradient.",
  "Make it weird. Make it yours.",
  "Code is the canvas.",
  "Beautiful things take seconds here.",
  "The GPU is ready. Are you?",
];
let _lastGreetingIdx = -1;
function pickGreeting() {
  if (WELCOME_GREETINGS.length <= 1) return WELCOME_GREETINGS[0] || '';
  let i = Math.floor(Math.random() * WELCOME_GREETINGS.length);
  if (i === _lastGreetingIdx) i = (i + 1) % WELCOME_GREETINGS.length;
  _lastGreetingIdx = i;
  return WELCOME_GREETINGS[i];
}
function refreshGreeting() {
  const el = document.getElementById('welcome-greeting');
  if (!el) return;
  el.textContent = pickGreeting();
  // Reset the CSS animation by cloning the node, so fade-up fires on every open.
  const fresh = el.cloneNode(true);
  el.parentNode.replaceChild(fresh, el);
}

function openModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  refreshGreeting();
  // Re-shuffle the welcome's random 7 on every open
  MODAL_PRESETS = pickModalPresets();
  populateGallery();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  stopAllMiniRenderers();
  // If the canvas has nothing loaded (e.g. dismissed on boot), fall back to blank
  if (!layers || layers.length === 0) {
    frameState.bg = frameState.bg || '#111111';
    history = []; historyIdx = -1;
    renderUI(); needsRecompile = true;
    snapshot();
  }
}

// ── Gallery modal (all 12 presets, no welcome chrome) ──────────
function openGallery() {
  const overlay = document.getElementById('gallery-overlay');
  overlay.classList.remove('hidden');
  populateGalleryGrid();
}

function closeGallery() {
  document.getElementById('gallery-overlay').classList.add('hidden');
  stopAllMiniRenderers();
}

function populateGalleryGrid() {
  const grid = document.getElementById('gallery-grid');
  if (!grid) return;
  grid.innerHTML = '';
  PRESET_ORDER.forEach(id => {
    const preset = PRESETS[id];
    const card = document.createElement('div');
    card.className = 'preset-card preset-card--gallery';
    // Wrap the canvas so we can absolutely-position the Remix hover
    // button over just the thumbnail (not the label below).
    const thumb = document.createElement('div');
    thumb.className = 'preset-card-thumb';
    const cvs = document.createElement('canvas');
    cvs.className = 'preset-card-canvas';
    cvs.width = 148; cvs.height = 110;
    cvs.style.width = '148px';
    cvs.style.height = '110px';
    const remix = document.createElement('div');
    remix.className = 'preset-remix-pill';
    remix.textContent = 'Remix';
    thumb.appendChild(cvs);
    thumb.appendChild(remix);
    const label = document.createElement('div');
    label.className = 'preset-card-label';
    label.textContent = (preset && preset.raw && preset.raw.name) || id;
    card.appendChild(thumb);
    card.appendChild(label);
    card.addEventListener('click', () => { closeGallery(); loadPreset(id); });
    grid.appendChild(card);
    createMiniRenderer(cvs, id);
  });
}

function populateGallery() {
  const gallery = document.getElementById('preset-gallery');
  gallery.innerHTML = '';

  // 7 preset cards
  MODAL_PRESETS.forEach(id => {
    const preset = PRESETS[id];
    const card = document.createElement('div');
    card.className = 'preset-card';
    const cvs = document.createElement('canvas');
    cvs.className = 'preset-card-canvas';
    cvs.width = 148; cvs.height = 110;
    cvs.style.width = '148px';
    cvs.style.height = '110px';
    const label = document.createElement('div');
    label.className = 'preset-card-label';
    label.textContent = (preset && preset.raw && preset.raw.name) || id;
    card.appendChild(cvs);
    card.appendChild(label);
    card.addEventListener('click', () => loadPreset(id));
    gallery.appendChild(card);
    createMiniRenderer(cvs, id);
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

// Canonical scene loader. Accepts a raw .frakt JSON object (the same shape
// produced by saveFraktFile) and replaces the current scene. Used by:
//   - opening a .frakt file (Scene → Open)
//   - selecting a preset from the gallery / welcome modal
//   - loading a shared URL scene (future)
function loadScene(data) {
  if (!data || !Array.isArray(data.layers)) return false;
  const incoming = data.layers.filter(l => l && KNOWN_LAYER_TYPES.has(l.type));

  layers = [];
  layerIdCounter = 0;
  selectedLayerId = null;

  if (data.canvas && typeof data.canvas === 'object') {
    if (typeof data.canvas.width  === 'number') frameState.w  = data.canvas.width;
    if (typeof data.canvas.height === 'number') frameState.h  = data.canvas.height;
    if (typeof data.canvas.background === 'string') frameState.bg = data.canvas.background;
  }

  incoming.forEach(l => {
    const props = l.properties || {};
    const hadLegacySpeed = (props.speed != null) || (props.spd != null);
    const layer = createLayer(l.type, props);
    if (l.name) layer.name = l.name;
    if (typeof l.visible === 'boolean') layer.visible = l.visible;
    if (typeof l.opacity === 'number') layer.opacity = l.opacity;
    if (typeof l.blendMode === 'string') layer.blendMode = l.blendMode;
    if (typeof l.speed === 'number' && !hadLegacySpeed) layer.speed = l.speed;
    if (typeof l.timeOffset === 'number') layer.timeOffset = l.timeOffset;
    if (typeof l.paused === 'boolean') layer.paused = l.paused;
    ensureV2Fields(layer);
    layers.push(layer);
  });

  if (typeof data.name === 'string' && data.name.trim()) {
    fileName = data.name.trim();
    const lbl = document.getElementById('topbar-file-label');
    if (lbl) lbl.textContent = fileName;
  }

  if (layers.length) selectedLayerId = layers[0].id;
  applyFrame();
  history = []; historyIdx = -1;
  renderUI(); needsRecompile = true;
  snapshot();
  return true;
}

function loadPreset(name) {
  const preset = PRESETS[name]; if (!preset) return;
  closeModal();
  loadScene(preset.raw);
}

function loadBlank() {
  closeModal();
  layers = []; layerIdCounter = 0; selectedLayerId = 'frame';
  frameState.bg = '#000000';
  history = []; historyIdx = -1;
  renderUI(); needsRecompile = true;
  snapshot();
}

// ── Platform + Shortcut Symbols ────────────────────────────────
const IS_MAC = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const MOD_SYM = IS_MAC ? '⌘' : 'Ctrl';
const SHORTCUTS = {
  palette:       MOD_SYM + '/',
  'layers-menu': 'N',
  'effects-menu':'E',
  capture:       'P',
  undo:          MOD_SYM + 'Z',
  redo:          MOD_SYM + '⇧Z',
  new:           MOD_SYM + 'X',
  save:          MOD_SYM + 'S',
  open:          MOD_SYM + 'O',
  export:        MOD_SYM + '⇧E',
  dup:           MOD_SYM + 'D',
  // legacy alias — kept for any remaining data-shortcut="addlayer" references
  addlayer:      'N'
};

// ── Topbar Menus (File + Edit + Layers + Effects + Export + Help) ──
const TOPBAR_MENU_IDS = ['menu-file', 'menu-edit', 'menu-layers', 'menu-effects', 'menu-export', 'menu-help'];
function anyMenuOpen() {
  return TOPBAR_MENU_IDS.some(id => {
    const m = document.getElementById(id);
    return m && !m.classList.contains('hidden');
  });
}
function closeMenus(except) {
  TOPBAR_MENU_IDS.forEach(id => {
    if (id === except) return;
    const m = document.getElementById(id);
    if (m && !m.classList.contains('hidden')) {
      m.classList.add('hidden');
      if (id === 'menu-effects') onEffectsMenuClosed();
    }
  });
}
function closeAllTopbarMenus() { closeMenus(null); }
function openMenu(name) {
  const id = 'menu-' + name;
  const m = document.getElementById(id);
  if (!m) return;
  closeMenus(id);
  if (m.classList.contains('hidden')) {
    m.classList.remove('hidden');
    if (id === 'menu-effects') onEffectsMenuOpened();
  }
}
function toggleMenu(event, name) {
  if (event) event.stopPropagation();
  const id = 'menu-' + name;
  const m = document.getElementById(id);
  if (!m) return;
  const willOpen = m.classList.contains('hidden');
  closeMenus(willOpen ? id : null);
  if (willOpen) {
    m.classList.remove('hidden');
    if (id === 'menu-effects') onEffectsMenuOpened();
  } else {
    m.classList.add('hidden');
    if (id === 'menu-effects') onEffectsMenuClosed();
  }
}
document.addEventListener('click', e => {
  if (!e.target.closest('.tb-menu-wrap')) closeMenus(null);
});

// Hover-switch: when any menu is open, hovering another trigger switches to it
document.querySelectorAll('.tb-menu-wrap[data-menu]').forEach(wrap => {
  const name = wrap.dataset.menu;
  wrap.addEventListener('mouseenter', () => {
    if (anyMenuOpen()) openMenu(name);
  });
});

// ── New Scene ──────────────────────────────────────────────────
async function newScene() {
  if (layers && layers.length > 0) {
    const ok = await showConfirm('Start a new scene?', 'Your current unsaved work will be lost.');
    if (!ok) return;
  }
  layers = [];
  selectedLayerId = 'frame';
  frameState.bg = '#000000';
  fileName = 'untitled';
  const lbl = document.getElementById('topbar-file-label');
  if (lbl) lbl.textContent = fileName;
  history = []; historyIdx = -1;
  renderUI(); needsRecompile = true;
  snapshot();
  closeMenus(null);
}

// ── Export (Round 8, revised) ──────────────────────────────────
// Three export targets. The common problem we're solving: an exported
// snapshot has to run _on its own_, without Frakt around to feed it
// uniform values every frame. So instead of exporting the shader + a
// side-channel uniform dict, we bake the uniform values directly into
// the GLSL (const/global with initializer) and ship a single file that
// just opens and plays.
//
//   - Shadertoy    → copy transformed GLSL to clipboard (uniforms inlined)
//   - Vanilla HTML → zip with a self-contained index.html + shader.glsl
//   - Three.js     → zip with a self-contained index.html + shader.glsl
//
// Both zips: the index.html works when double-clicked from disk. No
// module imports from relative URLs (file:// blocks that); all code is
// inline in a single <script> tag.

// Walk the same uniform-set logic the engine uses, but capture every
// (name, value) pair into a plain dict. Used by the uniform inliner.
function extractFraktUniforms(layersArg, frameStateArg, imgAr) {
  const uniforms = {};
  const fakeGl = {
    getUniformLocation: (_p, n) => n,
    uniform1f:  (n, v)        => { uniforms[n] = { t: 'f',   v }; },
    uniform1i:  (n, v)        => { uniforms[n] = { t: 'i',   v }; },
    uniform2f:  (n, a, b)     => { uniforms[n] = { t: '2f',  v: [a, b] }; },
    uniform3f:  (n, a, b, c)  => { uniforms[n] = { t: '3f',  v: [a, b, c] }; },
    uniform3fv: (n, arr)      => { uniforms[n] = { t: '3fv', v: Array.from(arr) }; },
    uniform1fv: (n, arr)      => { uniforms[n] = { t: '1fv', v: Array.from(arr) }; },
    activeTexture: () => {},
    bindTexture:   () => {},
    TEXTURE0: 0, TEXTURE1: 1, TEXTURE_2D: 0
  };
  setUniformsForLayers(fakeGl, null, layersArg, frameStateArg, 0, null, null, false, imgAr || 1.0);
  // u_t and u_res stay as real uniforms (the host drives them per-frame).
  delete uniforms.u_t;
  delete uniforms.u_res;
  return uniforms;
}

// Serialize the uploaded image (if any) into a PNG data URL so the
// exported bundle is self-contained.
function fraktImageDataUrl() {
  if (!hasBaseImage || !baseImageElement) return null;
  try {
    const c = document.createElement('canvas');
    c.width  = baseImageElement.naturalWidth  || baseImageElement.width  || 1;
    c.height = baseImageElement.naturalHeight || baseImageElement.height || 1;
    c.getContext('2d').drawImage(baseImageElement, 0, 0);
    return c.toDataURL('image/png');
  } catch (e) {
    console.warn('Image-to-dataURL failed:', e);
    return null;
  }
}

// Same as fraktImageDataUrl, but returns a PNG Blob so it can be packed
// into the export ZIP as a real file alongside index.html.
function fraktImageBlob() {
  if (!hasBaseImage || !baseImageElement) return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      const c = document.createElement('canvas');
      c.width  = baseImageElement.naturalWidth  || baseImageElement.width  || 1;
      c.height = baseImageElement.naturalHeight || baseImageElement.height || 1;
      c.getContext('2d').drawImage(baseImageElement, 0, 0);
      c.toBlob(b => resolve(b), 'image/png');
    } catch (e) {
      console.warn('Image-to-Blob failed:', e);
      resolve(null);
    }
  });
}

function fraktExportFileName() {
  const n = (typeof fileName !== 'undefined' && fileName && fileName.trim()) ? fileName.trim() : 'shader';
  return n.replace(/[^\w\-]+/g, '_') || 'shader';
}

async function fraktCopyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (_) { return false; }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Format a float as a GLSL float literal. Ensures there's a decimal
// point (`1` → `1.0`) so the value is parsed as `float`, not `int`.
function fglsl(n) {
  if (!isFinite(n)) return '0.0';
  let s = (+n).toFixed(6);
  // Trim trailing zeros but keep at least one digit after the dot
  s = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '.0');
  if (!/\./.test(s)) s += '.0';
  return s;
}

// ── Uniform inliner ─────────────────────────────────────────────
// Replaces `uniform <type> <name>[<n>]?;` declarations with concrete
// values baked from the extracted uniforms dict. Returns the modified
// shader plus an array of init statements that must run once inside
// main() (or mainImage), for non-scalar / array uniforms that need
// per-index assignment.
function inlineUniformsInShader(raw, uniforms) {
  // Strip host-provided uniforms — they stay as real uniforms so the
  // runtime can feed u_t/u_res per frame (and image uniforms are bound
  // when the image texture is ready).
  let body = raw;

  // Array uniform: `uniform <type> <name>[<n>];` → non-const global +
  // per-index init inside main()
  const arrayInits = [];
  body = body.replace(/^\s*uniform\s+(\w+)\s+(\w+)\s*\[\s*(\d+)\s*\]\s*;\s*$/gm, (m, type, name, size) => {
    const u = uniforms[name];
    const n = parseInt(size, 10);
    if (!u) return `${type} ${name}[${n}];`; // unknown — default-init to 0
    if (type === 'vec3' && u.t === '3fv') {
      const v = u.v;
      for (let i = 0; i < n; i++) {
        const r = v[i*3]   != null ? v[i*3]   : 0;
        const g = v[i*3+1] != null ? v[i*3+1] : 0;
        const b = v[i*3+2] != null ? v[i*3+2] : 0;
        arrayInits.push(`  ${name}[${i}] = vec3(${fglsl(r)}, ${fglsl(g)}, ${fglsl(b)});`);
      }
      return `${type} ${name}[${n}];`;
    }
    if (type === 'float' && u.t === '1fv') {
      const v = u.v;
      for (let i = 0; i < n; i++) {
        arrayInits.push(`  ${name}[${i}] = ${fglsl(v[i] != null ? v[i] : 0)};`);
      }
      return `${type} ${name}[${n}];`;
    }
    return `${type} ${name}[${n}];`;
  });

  // Scalar / vector uniforms: `uniform <type> <names>;` (possibly comma-list)
  body = body.replace(/^\s*uniform\s+(\w+)\s+([^;\n]+?);\s*$/gm, (m, type, names) => {
    const nameList = names.split(',').map(x => x.trim()).filter(Boolean);
    const out = nameList.map(name => {
      // Leave the ones we WANT to keep as uniforms alone.
      if (name === 'u_t' || name === 'u_res' ||
          name === 'uImage' || name === 'uHasImage' || name === 'uImgAr') {
        return `uniform ${type} ${name};`;
      }
      const u = uniforms[name];
      if (!u) return `${type} ${name};`; // unknown → global default 0
      if (type === 'float' && u.t === 'f') return `float ${name} = ${fglsl(u.v)};`;
      if (type === 'int'   && u.t === 'i') return `int ${name} = ${(u.v|0)};`;
      if (type === 'vec2'  && u.t === '2f') return `vec2 ${name} = vec2(${fglsl(u.v[0])}, ${fglsl(u.v[1])});`;
      if (type === 'vec3'  && u.t === '3f') return `vec3 ${name} = vec3(${fglsl(u.v[0])}, ${fglsl(u.v[1])}, ${fglsl(u.v[2])});`;
      // Fall back: declare as a zero-initialized global so the shader still links.
      return `${type} ${name};`;
    }).join('\n');
    return out;
  });

  return { body, arrayInits };
}

// ── Shadertoy transform ─────────────────────────────────────────
// Shadertoy supplies iTime / iResolution and expects mainImage(). So:
//   * strip `precision`, u_res/u_t/image uniforms
//   * stub out texture2D(uImage, ...) with a neutral colour
//   * replace all remaining uniforms with baked constant values
//   * wrap void main() into mainImage(), injecting shims for u_res,
//     u_t and gl_FragCoord, plus any array uniform init statements.
function transformShaderForShadertoy(raw, uniforms) {
  // 1. Strip declarations Shadertoy owns.
  let body = raw
    .replace(/^\s*precision[^;]+;\s*$/gm, '')
    .replace(/^\s*(?:varying|attribute)\s[^;]+;\s*$/gm, '')
    .replace(/^\s*uniform\s+vec2\s+u_res\s*;\s*$/gm, '')
    .replace(/^\s*uniform\s+float\s+u_t\s*;\s*$/gm, '')
    .replace(/^\s*uniform\s+sampler2D\s+uImage\s*;\s*$/gm, '')
    .replace(/^\s*uniform\s+float\s+uHasImage\s*;\s*$/gm, '')
    .replace(/^\s*uniform\s+float\s+uImgAr\s*;\s*$/gm, '')
    .replace(/texture2D\s*\(\s*uImage\s*,[^)]*\)/g, 'vec4(0.2,0.2,0.2,1.0)')
    .replace(/\buHasImage\b/g, '0.0')
    .replace(/\buImgAr\b/g, '1.0');

  // 2. Inline every remaining uniform with its baked value.
  const { body: inlined, arrayInits } = inlineUniformsInShader(body, uniforms);
  body = inlined;

  // 3. Wrap main() into mainImage().
  const initBlock = arrayInits.length ? arrayInits.join('\n') + '\n' : '';
  body = body.replace(/void\s+main\s*\(\s*\)\s*\{([\s\S]*)\}\s*$/m, (_, inner) => {
    return 'void mainImage( out vec4 fragColor, in vec2 fragCoord ) {\n'
      + '  vec2 u_res = iResolution.xy;\n'
      + '  float u_t  = iTime;\n'
      + '  vec2 gl_FragCoord_ = fragCoord;\n'
      + initBlock
      + inner.replace(/gl_FragCoord\b/g, 'gl_FragCoord_')
             .replace(/gl_FragColor\b/g, 'fragColor')
      + '}';
  });
  return body;
}

async function exportShadertoy() {
  closeMenus(null);
  try {
    const raw = buildFragFromLayers(layers, frameState);
    const uniforms = extractFraktUniforms(layers, frameState, imageAspectRatio);
    const out = transformShaderForShadertoy(raw, uniforms);
    const ok = await fraktCopyToClipboard(out);
    if (ok) showToast('Copied to clipboard — paste into Shadertoy');
    else    showToast('Copy failed — check clipboard permissions', true);
  } catch (e) {
    console.error('Shadertoy export failed:', e);
    showToast('Export failed — see console', true);
  }
}

// ── Standalone shader transformer (for Vanilla / Three.js) ─────
// Bakes uniforms into a shader that still expects u_t + u_res (both
// fed per frame by the host). Returns a shader source plus the array
// init statements to inject at the top of main().
function bakeShaderForStandalone(raw, uniforms) {
  const { body, arrayInits } = inlineUniformsInShader(raw, uniforms);
  if (!arrayInits.length) return body;
  // Inject array inits right inside main() { ... }
  return body.replace(/void\s+main\s*\(\s*\)\s*\{/, m => m + '\n' + arrayInits.join('\n') + '\n');
}

// ── Vanilla HTML bundle ────────────────────────────────────────
// A single-file index.html — everything (runtime + shader + uniforms)
// lives in one non-module <script> block so the page works when opened
// directly from disk (file://).
//
// The generated file is heavily commented so anyone who opens it can
// copy the shader + the 40-line WebGL runtime into their own page.
function tplVanillaIndexHtml(name, w, h, bakedShader, imageSrc, radiusPx) {
  // Image-loading snippet. Only emitted if the scene uses an image
  // layer; keeps the minimal case truly minimal.
  const imgLoad = imageSrc ? `
  // ── Optional: load the image the scene references. The shader
  // samples it as uImage, with uHasImage (0/1) and uImgAr
  // (image aspect ratio) telling it whether an image is present.
  (function loadImg(){
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function(){
      var tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      var uI = gl.getUniformLocation(prog, 'uImage');
      var uH = gl.getUniformLocation(prog, 'uHasImage');
      var uA = gl.getUniformLocation(prog, 'uImgAr');
      if (uI) gl.uniform1i(uI, 0);
      if (uH) gl.uniform1f(uH, 1);
      if (uA) gl.uniform1f(uA, img.width / img.height);
    };
    img.src = ${JSON.stringify(imageSrc)};
  })();
` : '';

  const radius = Math.max(0, Math.round(radiusPx || 0));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${name} — Frakt shader</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0d0d0d; color: #888;
         font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
         font-size: 13px; line-height: 1.6; }

  /* Canvas: native size when viewport is wide enough; scaled-to-fit when not.
     The inline width/height set by JS are overridden so CSS can scale it
     down (height auto + aspect-ratio preserves the shape). */
  .canvas-wrap { display: flex; justify-content: center; padding: 0; }
  #frakt-canvas {
    display: block;
    width: ${w}px;
    max-width: 100vw !important;
    height: auto !important;
    aspect-ratio: ${w} / ${h};
    border-radius: ${radius}px;
    background: #000;
  }

  .frakt-credit {
    position: fixed; top: 16px; right: 16px; z-index: 100;
    font-family: monospace; font-size: 11px;
    color: #aaa; text-decoration: none;
    background: #1a1a1a; border: 1px solid #2a2a2a;
    border-radius: 999px;
    padding: 6px 14px;
    letter-spacing: 0.04em;
    transition: color 0.2s, background 0.2s, border-color 0.2s;
  }
  .frakt-credit:hover { color: #fff; background: #222; border-color: #444; }

  main { max-width: 860px; margin: 48px auto 64px; padding: 0 20px; }
  .frakt-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 28px; }
  .frakt-wordmark { font-family: monospace; font-size: 15px; font-weight: bold;
                    color: #e0e0e0; letter-spacing: 0.02em; }
  .frakt-tagline  { font-family: monospace; font-size: 11px;
                    color: #444; letter-spacing: 0.02em; }

  .section-label { font-family: monospace; font-size: 11px;
                   color: #555; text-transform: uppercase; letter-spacing: 0.08em;
                   margin: 32px 0 12px; }
  .doc-text { margin: 0; color: #888; white-space: pre-wrap;
              font-family: monospace; font-size: 13px; line-height: 1.65; }
  .doc-text code { color: #aaa; }
  pre { background: #111; border: 1px solid #1e1e1e; border-radius: 4px;
        padding: 16px; margin: 0; overflow-x: auto; color: #aaa;
        font-family: monospace; font-size: 12.5px; line-height: 1.6;
        white-space: pre-wrap; }
</style>
</head>
<body>
<a href="https://frakt.app" target="_blank" rel="noopener" class="frakt-credit">Made with Frakt</a>

<div class="canvas-wrap">
  <canvas id="frakt-canvas" width="${w}" height="${h}"></canvas>
</div>

<main>
  <div class="frakt-header">
    <span class="frakt-wordmark">frakt</span>
    <span class="frakt-tagline">Shaders for the rest of us</span>
  </div>

  <div class="section-label">Your Shader</div>
  <p class="doc-text">Open this file in any browser and it runs.
No install. No build step. No dependencies.

The canvas is ${w}×${h}px. To resize, change the width
and height attributes on the &lt;canvas&gt; element and update the
CSS to match. The shader is resolution-agnostic.</p>

  <div class="section-label">Embed in your project</div>
  <pre>1. Copy the &lt;canvas id="frakt-canvas" ...&gt; element into your markup.
2. Copy everything inside the &lt;script&gt; block below into your page.
3. Adjust width / height in both the canvas attributes and the CSS
   to whatever size you want.
4. If the shader uses an image, keep the (function loadImg(){...})()
   block and update the img.src path to point to your own file.</pre>
</main>

<!--
  ============================================================
  RUNTIME — everything below is the WebGL plumbing.
  ============================================================
  Two pieces you can copy-paste independently:
    1. The FRAG string       → the fragment shader source.
    2. The IIFE that follows → ~40 lines of WebGL setup + the RAF loop.

  The runtime expects three host-driven uniforms to exist in the shader:
    u_t   (float)  — time in seconds since load
    u_res (vec2)   — canvas framebuffer size (width, height)

  Plus, if the shader uses an image:
    uImage    (sampler2D)
    uHasImage (float)  0 or 1
    uImgAr    (float)  aspect ratio (width / height)

  All other uniforms are already baked as GLSL globals — the shader
  runs without any additional setup from JavaScript.
-->
<script>
(function(){
  // ── 1. Canvas setup ────────────────────────────────────────
  var canvas = document.getElementById('frakt-canvas');
  var CSS_W = ${w}, CSS_H = ${h};                // exact size from Frakt
  var dpr   = Math.min(window.devicePixelRatio || 1, 2);

  // canvas.width/height = internal framebuffer size (crisp on retina)
  // canvas.style.width/height = CSS-pixel display size
  canvas.width  = Math.round(CSS_W * dpr);
  canvas.height = Math.round(CSS_H * dpr);
  canvas.style.width  = CSS_W + 'px';
  canvas.style.height = CSS_H + 'px';

  // ── 2. WebGL context ───────────────────────────────────────
  var gl = canvas.getContext('webgl', { antialias: true });
  if (!gl) { document.body.innerHTML += '<p style="color:#f66">WebGL not available.</p>'; return; }

  // ── 3. Shaders ────────────────────────────────────────────
  // Vertex shader: a trivial pass-through that draws a full-screen quad.
  // All the visual work happens in the fragment shader (FRAG below).
  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';

  // The fragment shader, with all scene uniforms baked in as globals.
  // Open it up — scroll past the (big) initializer block at the top
  // and you'll find a normal-looking void main() at the bottom.
  var FRAG = ${JSON.stringify(bakedShader)};

  // Compile helper. Returns null on failure and logs the GL info log
  // plus the offending source to the console.
  function mkShader(type, src){
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
      console.error('Shader compile error:\\n' + gl.getShaderInfoLog(s) + '\\n---\\n' + src);
      return null;
    }
    return s;
  }

  var vs = mkShader(gl.VERTEX_SHADER, VERT);
  var fs = mkShader(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;

  // ── 4. Link program ───────────────────────────────────────
  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)){
    console.error('Link error:', gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  // ── 5. Full-screen quad geometry ──────────────────────────
  // Four corner vertices in clip space, drawn as a TRIANGLE_STRIP.
  // The fragment shader runs once per pixel inside the quad.
  var vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  var pa = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(pa);
  gl.vertexAttribPointer(pa, 2, gl.FLOAT, false, 0, 0);

  // ── 6. Uniform locations ──────────────────────────────────
  // Everything else was inlined into the shader source, so we only
  // need handles for the two (or five, with an image) host-driven
  // uniforms.
  gl.viewport(0, 0, canvas.width, canvas.height);
  var uT = gl.getUniformLocation(prog, 'u_t');
  var uR = gl.getUniformLocation(prog, 'u_res');
  if (uR) gl.uniform2f(uR, canvas.width, canvas.height);
${imgLoad}
  // ── 7. Render loop ────────────────────────────────────────
  // Drive u_t from performance.now() and draw one full-screen quad
  // per frame. No state to manage — stateless pixel-shader style.
  var t0 = performance.now();
  function frame(){
    var t = (performance.now() - t0) / 1000;
    if (uT) gl.uniform1f(uT, t);
    if (uR) gl.uniform2f(uR, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(frame);
  }
  frame();
})();
</script>
</body>
</html>
`;
}

// ── Three.js bundle ────────────────────────────────────────────
// Single-file index.html. Three.js is imported as an ES module from a
// CDN — that's an absolute HTTPS URL so it works from file:// (unlike
// `./shader.js` imports). All logic is inline.
function tplThreeIndexHtml(name, w, h, bakedShader, imageSrc, radiusPx) {
  const imgBlock = imageSrc ? `
      const imgLoader = new THREE.TextureLoader();
      imgLoader.load(${JSON.stringify(imageSrc)}, (tex) => {
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        material.uniforms.uImage.value    = tex;
        material.uniforms.uHasImage.value = 1;
        material.uniforms.uImgAr.value    = tex.image.width / tex.image.height;
        material.needsUpdate = true;
      });
` : '';

  const radius = Math.max(0, Math.round(radiusPx || 0));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${name} — Frakt / Three.js</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0d0d0d; color: #888;
         font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
         font-size: 13px; line-height: 1.6; }

  /* Canvas: native size when viewport is wide enough, scaled-to-fit otherwise.
     Three.js renderer.setSize sets the backing buffer; CSS handles the
     responsive display sizing via aspect-ratio. */
  .canvas-wrap { display: flex; justify-content: center; padding: 0; }
  .canvas-wrap canvas {
    display: block;
    width: ${w}px;
    max-width: 100vw !important;
    height: auto !important;
    aspect-ratio: ${w} / ${h};
    border-radius: ${radius}px;
    background: #000;
  }

  .frakt-credit {
    position: fixed; top: 16px; right: 16px; z-index: 100;
    font-family: monospace; font-size: 11px;
    color: #aaa; text-decoration: none;
    background: #1a1a1a; border: 1px solid #2a2a2a;
    border-radius: 999px;
    padding: 6px 14px;
    letter-spacing: 0.04em;
    transition: color 0.2s, background 0.2s, border-color 0.2s;
  }
  .frakt-credit:hover { color: #fff; background: #222; border-color: #444; }

  main { max-width: 860px; margin: 48px auto 64px; padding: 0 20px; }
  .frakt-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 28px; }
  .frakt-wordmark { font-family: monospace; font-size: 15px; font-weight: bold;
                    color: #e0e0e0; letter-spacing: 0.02em; }
  .frakt-tagline  { font-family: monospace; font-size: 11px;
                    color: #444; letter-spacing: 0.02em; }

  .section-label { font-family: monospace; font-size: 11px;
                   color: #555; text-transform: uppercase; letter-spacing: 0.08em;
                   margin: 32px 0 12px; }
  .doc-text { margin: 0; color: #888; white-space: pre-wrap;
              font-family: monospace; font-size: 13px; line-height: 1.65; }
  pre { background: #111; border: 1px solid #1e1e1e; border-radius: 4px;
        padding: 16px; margin: 0; overflow-x: auto; color: #aaa;
        font-family: monospace; font-size: 12.5px; line-height: 1.6;
        white-space: pre-wrap; }
</style>
</head>
<body>
<a href="https://frakt.app" target="_blank" rel="noopener" class="frakt-credit">Made with Frakt</a>

<div class="canvas-wrap" id="stage"></div>

<main>
  <div class="frakt-header">
    <span class="frakt-wordmark">frakt</span>
    <span class="frakt-tagline">Shaders for the rest of us</span>
  </div>

  <div class="section-label">Your Shader</div>
  <p class="doc-text">Open this file in any browser and it runs — Three.js loads
from CDN, everything else is inline.

To use in your own Three.js project, see the integration
snippet below.</p>

  <div class="section-label">Embed in your project</div>
  <pre>import * as THREE from 'three';

const material = new THREE.ShaderMaterial({
  vertexShader,         // see &lt;script&gt; below
  fragmentShader,       // see &lt;script&gt; below — your baked shader
  uniforms: {
    u_t:   { value: 0 },
    u_res: { value: new THREE.Vector2(W, H) }
  }
});

// Drive u_t from a clock; resize uniforms when the canvas resizes.</pre>
</main>

<script type="module">
  import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

  const W = ${w}, H = ${h};
  const fragmentShader = ${JSON.stringify(bakedShader)};
  const vertexShader = \`
    void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  \`;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      u_t:        { value: 0 },
      u_res:      { value: new THREE.Vector2(W, H) },
      uImage:     { value: null },
      uHasImage:  { value: 0 },
      uImgAr:     { value: 1.0 }
    }
  });
${imgBlock}
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  document.getElementById('stage').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(mesh);

  const clock = new THREE.Clock();
  function frame() {
    material.uniforms.u_t.value = clock.getElapsedTime();
    material.uniforms.u_res.value.set(renderer.domElement.width, renderer.domElement.height);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
</script>
</body>
</html>
`;
}

// ── Single-file HTML exports ────────────────────────────────────
// One self-contained index.html per target. Shader source + baked
// uniforms are already inline, so there's no need to ship anything
// alongside it.

// If the project is still called 'untitled' when the user hits export,
// ask for a sensible name so the downloaded file doesn't end up named
// `frakt-untitled-shader.html`. Cancelling aborts the export.
async function promptSceneNameIfUntitled() {
  if (typeof fileName === 'string' && fileName.trim() && fileName.trim() !== 'untitled') {
    return fileName.trim();
  }
  const chosen = await showNameDialog({
    title:       'Name this scene',
    defaultName: 'my-shader',
    ext:         '',
    okLabel:     'Export'
  });
  if (!chosen) return null;
  const clean = chosen.trim();
  if (!clean) return null;
  fileName = clean;
  const lbl = document.getElementById('topbar-file-label');
  if (lbl) lbl.textContent = clean;
  return clean;
}

// Build a ZIP containing index.html + image.png and download it. Used
// by the Vanilla / Three.js exports whenever the scene references an
// uploaded image — keeps the HTML small and lets users swap the image
// out by replacing the file in the unzipped folder.
async function downloadExportZip(htmlText, imageBlob, zipName) {
  if (typeof JSZip === 'undefined') {
    // JSZip is loaded from a CDN in index.html; if it failed to load we
    // fall back to embedding the image as a data URL. Better than throwing.
    throw new Error('JSZip not available');
  }
  const zip = new JSZip();
  zip.file('index.html', htmlText);
  if (imageBlob) zip.file('image.png', imageBlob);
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, zipName);
}

async function exportVanillaHTML() {
  closeMenus(null);
  try {
    const chosen = await promptSceneNameIfUntitled();
    if (!chosen) return;
    const slug     = fraktExportFileName();
    const shader   = buildFragFromLayers(layers, frameState);
    const uniforms = extractFraktUniforms(layers, frameState, imageAspectRatio);
    const baked    = bakeShaderForStandalone(shader, uniforms);
    const imgBlob  = await fraktImageBlob();
    const imgSrc   = imgBlob ? 'image.png' : null;
    const html     = tplVanillaIndexHtml(chosen, frameState.w, frameState.h, baked, imgSrc, frameRadiusPx());
    if (imgBlob) {
      await downloadExportZip(html, imgBlob, `frakt-${slug}-shader.zip`);
      showToast('Vanilla HTML zip downloaded');
    } else {
      downloadBlob(new Blob([html], { type: 'text/html' }), `frakt-${slug}-shader.html`);
      showToast('Vanilla HTML downloaded');
    }
  } catch (e) {
    console.error('Vanilla export failed:', e);
    showToast('Export failed — see console', true);
  }
}

async function exportThreeJS() {
  closeMenus(null);
  try {
    const chosen = await promptSceneNameIfUntitled();
    if (!chosen) return;
    const slug     = fraktExportFileName();
    const shader   = buildFragFromLayers(layers, frameState);
    const uniforms = extractFraktUniforms(layers, frameState, imageAspectRatio);
    const baked    = bakeShaderForStandalone(shader, uniforms);
    const imgBlob  = await fraktImageBlob();
    const imgSrc   = imgBlob ? 'image.png' : null;
    const html     = tplThreeIndexHtml(chosen, frameState.w, frameState.h, baked, imgSrc, frameRadiusPx());
    if (imgBlob) {
      await downloadExportZip(html, imgBlob, `frakt-${slug}-threejs.zip`);
      showToast('Three.js HTML zip downloaded');
    } else {
      downloadBlob(new Blob([html], { type: 'text/html' }), `frakt-${slug}-threejs.html`);
      showToast('Three.js HTML downloaded');
    }
  } catch (e) {
    console.error('Three.js export failed:', e);
    showToast('Export failed — see console', true);
  }
}

// Wire Share + Avatar "Coming soon" buttons
(function wireSoonButtons() {
  const bs = document.getElementById('btn-share');
  if (bs) bs.addEventListener('click', e => { e.stopPropagation(); showToast('Coming soon'); });
  const ba = document.getElementById('btn-avatar');
  if (ba) ba.addEventListener('click', e => { e.stopPropagation(); showToast('Coming soon'); });
})();

// Brand panel popups (Share / Feature / Bug)
(function wireBrandPopups() {
  const popupIds = ['popup-share', 'popup-feature', 'popup-bug'];
  const popups = popupIds.map(id => document.getElementById(id)).filter(Boolean);
  if (!popups.length) return;

  function closeAll() {
    popups.forEach(p => p.classList.add('hidden'));
  }
  function openOnly(id) {
    closeAll();
    const p = document.getElementById(id);
    if (p) p.classList.remove('hidden');
  }

  document.querySelectorAll('.brand-link[data-popup]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const key = btn.dataset.popup;
      const id = 'popup-' + key;
      const target = document.getElementById(id);
      if (!target) return;
      if (target.classList.contains('hidden')) openOnly(id);
      else closeAll();
    });
  });

  document.addEventListener('click', e => {
    const open = popups.find(p => !p.classList.contains('hidden'));
    if (!open) return;
    if (open.contains(e.target)) return;
    if (e.target.closest('.brand-link[data-popup]')) return;
    closeAll();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && popups.some(p => !p.classList.contains('hidden'))) {
      closeAll();
    }
  });

  document.querySelectorAll('.frakt-popup .popup-copy').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      let txt = btn.dataset.copy || '';
      if (!txt && btn.dataset.copyTarget) {
        const src = document.getElementById(btn.dataset.copyTarget);
        if (src) txt = src.textContent.trim();
      }
      if (!txt) return;
      const original = btn.textContent;
      let ok = false;
      try {
        await navigator.clipboard.writeText(txt);
        ok = true;
      } catch (err) {
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { ok = document.execCommand('copy'); } catch (_) {}
        ta.remove();
      }
      btn.textContent = ok ? 'Copied ✓' : 'Copy failed';
      setTimeout(() => { btn.textContent = original; }, 2000);
    });
  });

  // "How it works" thumbnail → floating PIP popup with FLIP animation + drag
  const thumb = document.getElementById('brand-howto-thumb');
  const popup = document.getElementById('video-popup');
  const popupBody = document.getElementById('video-popup-body');
  const popupClose = document.getElementById('video-popup-close');
  const popupHeader = document.getElementById('video-popup-header');

  const IFRAME_HTML = '<iframe width="100%" height="100%" ' +
    'src="https://www.youtube.com/embed/hsEMfdci1Rw?si=pcngxLgNFb1tSB8v&autoplay=1&controls=0" ' +
    'title="YouTube video player" ' +
    'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ' +
    'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';

  let popupOpen = false;
  let animating = false;

  function transformFromTo(fromRect, toRect) {
    const sx = fromRect.width / toRect.width;
    const sy = fromRect.height / toRect.height;
    const dx = fromRect.left - toRect.left;
    const dy = fromRect.top - toRect.top;
    return 'translate(' + dx + 'px, ' + dy + 'px) scale(' + sx + ', ' + sy + ')';
  }

  function openPopup() {
    if (animating) return;
    if (popupOpen) {
      popup.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }],
        { duration: 220, easing: 'ease-out' }
      );
      return;
    }
    if (!thumb || !popup || !popupBody) return;
    animating = true;
    popupOpen = true;
    popup.style.left = '';
    popup.style.top = '';
    popup.style.bottom = '';
    popupBody.innerHTML = IFRAME_HTML;
    popup.classList.remove('hidden');
    const thumbRect = thumb.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    popup.style.transition = 'none';
    popup.style.transform = transformFromTo(thumbRect, popupRect);
    popup.style.opacity = '0';
    popup.getBoundingClientRect();
    requestAnimationFrame(() => {
      popup.style.transition = 'transform 0.32s cubic-bezier(0.2, 0.7, 0.2, 1), opacity 0.22s ease';
      popup.style.transform = '';
      popup.style.opacity = '1';
    });
    const onEnd = (e) => {
      if (e.propertyName !== 'transform') return;
      popup.removeEventListener('transitionend', onEnd);
      animating = false;
    };
    popup.addEventListener('transitionend', onEnd);
  }

  function closePopup() {
    if (!popupOpen || animating) return;
    animating = true;
    const thumbRect = thumb.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    popup.style.transition = 'transform 0.28s cubic-bezier(0.4, 0, 0.6, 1), opacity 0.24s ease';
    popup.style.transform = transformFromTo(thumbRect, popupRect);
    popup.style.opacity = '0';
    const onEnd = (e) => {
      if (e.propertyName !== 'transform') return;
      popup.removeEventListener('transitionend', onEnd);
      popup.classList.add('hidden');
      popup.style.transition = '';
      popup.style.transform = '';
      popup.style.opacity = '';
      popupBody.innerHTML = '';
      popupOpen = false;
      animating = false;
    };
    popup.addEventListener('transitionend', onEnd);
  }

  thumb?.addEventListener('click', openPopup);
  popupClose?.addEventListener('click', e => { e.stopPropagation(); closePopup(); });

  if (popupHeader && popup) {
    let dragging = false, startX = 0, startY = 0, origLeft = 0, origTop = 0;
    popupHeader.addEventListener('pointerdown', e => {
      if (e.target.closest('.video-popup-close')) return;
      if (animating) return;
      dragging = true;
      try { popupHeader.setPointerCapture(e.pointerId); } catch (_) {}
      startX = e.clientX; startY = e.clientY;
      const r = popup.getBoundingClientRect();
      origLeft = r.left; origTop = r.top;
      popup.style.left = origLeft + 'px';
      popup.style.top = origTop + 'px';
      popup.style.bottom = 'auto';
    });
    popupHeader.addEventListener('pointermove', e => {
      if (!dragging) return;
      const newLeft = origLeft + (e.clientX - startX);
      const newTop = origTop + (e.clientY - startY);
      const maxLeft = window.innerWidth - popup.offsetWidth;
      const maxTop = window.innerHeight - popup.offsetHeight;
      popup.style.left = Math.max(0, Math.min(maxLeft, newLeft)) + 'px';
      popup.style.top = Math.max(0, Math.min(maxTop, newTop)) + 'px';
    });
    const stopDrag = () => { dragging = false; };
    popupHeader.addEventListener('pointerup', stopDrag);
    popupHeader.addEventListener('pointercancel', stopDrag);
  }
})();

// Wire dropdown item clicks
(function wireMenus() {
  const mf = document.getElementById('menu-file');
  if (mf) mf.querySelectorAll('.tb-menu-item').forEach(it => {
    it.addEventListener('click', e => {
      e.stopPropagation();
      // Submenu expanders: toggle child submenu, don't act
      if (it.classList.contains('tb-menu-item--submenu')) {
        const sub = it.querySelector('.tb-submenu');
        if (sub) sub.classList.toggle('hidden');
        return;
      }
      const a = it.dataset.act;
      closeMenus(null);
      if (a === 'new')  newScene();
      if (a === 'open') openFraktFile();
      if (a === 'save') saveFraktFile();
      if (a === 'load-preset') {
        const name = it.dataset.preset;
        if (name) loadPreset(name);
      }
      if (a === 'presets-gallery') openGallery();
    });
  });
  const me = document.getElementById('menu-export');
  if (me) me.querySelectorAll('.tb-menu-item').forEach(it => {
    if (it.classList.contains('tb-menu-item--disabled')) return;
    it.addEventListener('click', e => {
      e.stopPropagation();
      const a = it.dataset.act;
      closeMenus(null);
      if (a === 'export-vanilla')   exportVanillaHTML();
      if (a === 'export-three')     exportThreeJS();
      if (a === 'export-shadertoy') exportShadertoy();
    });
  });
  const med = document.getElementById('menu-edit');
  if (med) med.querySelectorAll('.tb-menu-item').forEach(it => {
    it.addEventListener('click', e => {
      e.stopPropagation();
      if (it.classList.contains('tb-menu-item--disabled')) return;
      const a = it.dataset.act;
      closeMenus(null);
      if (a === 'undo')      undo();
      if (a === 'redo')      redo();
      if (a === 'rename')    startRenameFile();
      if (a === 'duplicate') { if (typeof selectedLayerId === 'number') duplicateLayer(selectedLayerId); }
      if (a === 'delete')    { if (typeof selectedLayerId === 'number') removeLayerConfirm(selectedLayerId); }
      if (a === 'palette')   openPalette();
    });
  });
})();

function startRenameFile() {
  const lbl = document.getElementById('topbar-file-label');
  if (lbl) lbl.click();
}

function renderShortcutHints() {
  document.querySelectorAll('[data-shortcut]').forEach(el => {
    const key = el.dataset.shortcut;
    if (SHORTCUTS[key]) el.textContent = SHORTCUTS[key];
  });
  // Titles
  const u1 = document.getElementById('btn-undo');  if (u1)  u1.title  = 'Undo (' + SHORTCUTS.undo + ')';
  const u2 = document.getElementById('btn-redo');  if (u2)  u2.title  = 'Redo (' + SHORTCUTS.redo + ')';
  const bs = document.getElementById('btn-save');  if (bs)  bs.title  = 'Save .frakt (' + SHORTCUTS.save + ')';
  const bo = document.getElementById('btn-open');  if (bo)  bo.title  = 'Open .frakt (' + SHORTCUTS.open + ')';
  const be = document.getElementById('btn-export');if (be)  be.title  = 'Export GLSL (' + SHORTCUTS.export + ')';
  const bc = document.getElementById('btn-capture'); if (bc) bc.title = 'Capture PNG (' + SHORTCUTS.capture + ')';
}

function isTypingInField() {
  const a = document.activeElement;
  if (!a) return false;
  const tag = (a.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (a.isContentEditable) return true;
  return false;
}

function closeAllOverlays() {
  let closed = false;
  const po = document.getElementById('cmd-overlay');
  if (po && !po.classList.contains('hidden')) { closePalette(); closed = true; }
  const mo = document.getElementById('modal-overlay');
  if (mo && !mo.classList.contains('hidden')) { closeModal(); closed = true; }
  const go = document.getElementById('gallery-overlay');
  if (go && !go.classList.contains('hidden')) { closeGallery(); closed = true; }
  const co = document.getElementById('confirm-overlay');
  if (co && !co.classList.contains('hidden')) { closeConfirm(false); closed = true; }
  const no = document.getElementById('name-overlay');
  if (no && !no.classList.contains('hidden')) { closeNameDialog(null); closed = true; }
  document.querySelectorAll('.help-overlay').forEach(ov => {
    if (!ov.classList.contains('hidden')) { ov.classList.add('hidden'); closed = true; }
  });
  if (!ctxMenu.classList.contains('hidden')) { closeCtxMenu(); closed = true; }
  const fcm = document.getElementById('frame-ctx-menu');
  if (fcm && !fcm.classList.contains('hidden')) { fcm.classList.add('hidden'); closed = true; }
  TOPBAR_MENU_IDS.forEach(id => {
    const m = document.getElementById(id);
    if (m && !m.classList.contains('hidden')) {
      m.classList.add('hidden');
      if (id === 'menu-effects') onEffectsMenuClosed();
      closed = true;
    }
  });
  return closed;
}

// ── Command Palette ────────────────────────────────────────────
const CMD_LAYER_TYPES = [
  ['solid','Solid'],['gradient','Gradient'],['linear-gradient','Linear Gradient'],
  ['radial-gradient','Radial Gradient'],['noise-field','Noise Field'],['mesh-gradient','Mesh Gradient'],
  ['image','Image'],['wave','Wave'],['rectangle','Rectangle'],['circle','Circle']
];
const CMD_EFFECT_TYPES = [
  ['noise-warp','Noise Warp'],['flow-warp','Flow Warp'],['polar-remap','Polar Remap'],
  ['ripple','Ripple'],['grain','Grain'],
  ['chromatic-aberration','Chromatic Aberration'],['vignette','Vignette'],
  ['color-grade','Color Grade'],['duotone','Duotone'],['n-tone','N-Tone'],['glow','Glow'],['bloom','Bloom'],
  ['posterize','Posterize'],['pixelate','Pixelate'],['scanlines','Scanlines']
];

function buildCommands() {
  const hasSel = typeof selectedLayerId === 'number';
  const cmds = [];
  // File
  cmds.push({ group: 'File',  label: 'New scene',          shortcut: SHORTCUTS.new,     keywords: 'new reset clear',         run: newScene });
  cmds.push({ group: 'File',  label: 'Open .frakt file',   shortcut: SHORTCUTS.open,    keywords: 'open load import',        run: openFraktFile });
  cmds.push({ group: 'File',  label: 'Save .frakt file',   shortcut: SHORTCUTS.save,    keywords: 'save write',              run: saveFraktFile });
  cmds.push({ group: 'File',  label: 'Rename file',                                    keywords: 'rename title name',        run: startRenameFile });
  cmds.push({ group: 'File',  label: 'Take snapshot (PNG)',shortcut: SHORTCUTS.capture, keywords: 'capture screenshot png image export', run: captureCanvasPNG });
  cmds.push({ group: 'File',  label: 'Share Frakt',                                    keywords: 'share link',               run: () => showToast('Coming soon') });
  // Edit
  cmds.push({ group: 'Edit',  label: 'Undo',               shortcut: SHORTCUTS.undo,    keywords: 'back',                    run: undo });
  cmds.push({ group: 'Edit',  label: 'Redo',               shortcut: SHORTCUTS.redo,    keywords: 'forward',                 run: redo });
  if (hasSel) {
    cmds.push({ group: 'Edit', label: 'Duplicate selected layer', shortcut: SHORTCUTS.dup, keywords: 'copy clone',            run: () => duplicateLayer(selectedLayerId) });
    cmds.push({ group: 'Edit', label: 'Delete selected layer',    shortcut: '⌫',           keywords: 'remove trash',           run: () => removeLayerConfirm(selectedLayerId) });
    cmds.push({ group: 'Edit', label: 'Move selected layer to top',                         keywords: 'front top',             run: () => moveLayerToTop(selectedLayerId) });
    cmds.push({ group: 'Edit', label: 'Move selected layer to bottom',                      keywords: 'back bottom',           run: () => moveLayerToBottom(selectedLayerId) });
  }
  // Export
  cmds.push({ group: 'Export', label: 'Download vanilla HTML',                             keywords: 'export html vanilla webgl',         run: exportVanillaHTML });
  cmds.push({ group: 'Export', label: 'Download Three.js HTML',                            keywords: 'export three html threejs',         run: exportThreeJS });
  // Insert Layer
  CMD_LAYER_TYPES.forEach(([t, n]) => cmds.push({ group: 'Insert Layer', label: n, keywords: 'add ' + t, run: () => addLayer(t) }));
  // Insert Effect
  CMD_EFFECT_TYPES.forEach(([t, n]) => cmds.push({ group: 'Insert Effect', label: n, keywords: 'add effect ' + t, run: () => addLayer(t) }));
  // View
  cmds.push({ group: 'View', label: 'Open preset gallery',                                 keywords: 'presets gallery start',    run: openModal });
  cmds.push({ group: 'View', label: 'Select Frame',                                        keywords: 'canvas background',        run: () => selectLayer('frame') });
  return cmds;
}

let _paletteCmds = [];
let _paletteFiltered = [];
let _paletteSelIdx = 0;

function openPalette() {
  closeAllOverlays();
  _paletteCmds = buildCommands();
  const ov = document.getElementById('cmd-overlay');
  const inp = document.getElementById('cmd-search');
  if (!ov || !inp) return;
  ov.classList.remove('hidden');
  inp.value = '';
  filterPalette('');
  setTimeout(() => inp.focus(), 0);
}
function closePalette() {
  const ov = document.getElementById('cmd-overlay');
  if (ov) ov.classList.add('hidden');
}
function togglePalette() {
  const ov = document.getElementById('cmd-overlay');
  if (!ov) return;
  if (ov.classList.contains('hidden')) openPalette();
  else closePalette();
}

function scorePaletteMatch(cmd, q) {
  if (!q) return 1;
  const hay = (cmd.label + ' ' + cmd.group + ' ' + (cmd.keywords || '')).toLowerCase();
  const parts = q.toLowerCase().split(/\s+/).filter(Boolean);
  let score = 0;
  for (const p of parts) {
    const idx = hay.indexOf(p);
    if (idx === -1) return 0;
    score += (idx === 0 ? 10 : (hay.split(' ').some(w => w.startsWith(p)) ? 5 : 1));
  }
  return score;
}

function filterPalette(q) {
  const scored = _paletteCmds
    .map(c => ({ c, s: scorePaletteMatch(c, q) }))
    .filter(x => x.s > 0);
  if (q) scored.sort((a, b) => b.s - a.s);
  _paletteFiltered = scored.map(x => x.c);
  _paletteSelIdx = 0;
  renderPalette();
}

function renderPalette() {
  const list = document.getElementById('cmd-list');
  if (!list) return;
  if (!_paletteFiltered.length) {
    list.innerHTML = '<div class="cmd-empty">No matching actions</div>';
    return;
  }
  let html = '';
  let lastGroup = null;
  _paletteFiltered.forEach((c, i) => {
    if (c.group !== lastGroup) {
      html += `<div class="cmd-group-label">${c.group}</div>`;
      lastGroup = c.group;
    }
    const sc = c.shortcut ? `<span class="cmd-item-sc">${c.shortcut}</span>` : '';
    const sel = i === _paletteSelIdx ? ' selected' : '';
    html += `<div class="cmd-item${sel}" data-idx="${i}"><span class="cmd-item-label">${c.label}</span>${sc}</div>`;
  });
  list.innerHTML = html;
  // Scroll selected into view
  const selEl = list.querySelector('.cmd-item.selected');
  if (selEl) selEl.scrollIntoView({ block: 'nearest' });
  // Click handlers
  list.querySelectorAll('.cmd-item').forEach(el => {
    el.addEventListener('mouseenter', () => {
      _paletteSelIdx = parseInt(el.dataset.idx, 10);
      list.querySelectorAll('.cmd-item.selected').forEach(x => x.classList.remove('selected'));
      el.classList.add('selected');
    });
    el.addEventListener('click', () => runPaletteCmd(parseInt(el.dataset.idx, 10)));
  });
}

function runPaletteCmd(idx) {
  const c = _paletteFiltered[idx];
  if (!c) return;
  closePalette();
  try { c.run(); } catch (err) { console.error('[palette] cmd failed', err); }
}

(function wirePalette() {
  const ov = document.getElementById('cmd-overlay');
  const inp = document.getElementById('cmd-search');
  if (!ov || !inp) return;
  inp.addEventListener('input', () => filterPalette(inp.value));
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (_paletteFiltered.length) {
        _paletteSelIdx = (_paletteSelIdx + 1) % _paletteFiltered.length;
        renderPalette();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (_paletteFiltered.length) {
        _paletteSelIdx = (_paletteSelIdx - 1 + _paletteFiltered.length) % _paletteFiltered.length;
        renderPalette();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runPaletteCmd(_paletteSelIdx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
    }
  });
  ov.addEventListener('click', e => { if (e.target === ov) closePalette(); });
})();

// ── Keyboard Handlers ──────────────────────────────────────────
document.addEventListener('keydown', e => {
  // Escape: close overlays/menus (always allowed, even in inputs — blur-first)
  if (e.key === 'Escape') {
    if (isTypingInField()) { document.activeElement.blur(); return; }
    closeAllOverlays();
    return;
  }
  // Confirm dialog: Enter = OK
  if ((e.key === 'Enter') && !document.getElementById('confirm-overlay').classList.contains('hidden')) {
    e.preventDefault(); closeConfirm(true); return;
  }

  const mod = e.metaKey || e.ctrlKey;

  // Cmd+Z / Cmd+Shift+Z / Cmd+Y — undo/redo (allow even if a field is focused — don't interfere with editing? Actually skip if typing)
  if (mod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) { if (isTypingInField()) return; e.preventDefault(); undo(); return; }
  if (mod && ((e.key === 'Z') || (e.key === 'z' && e.shiftKey))) { if (isTypingInField()) return; e.preventDefault(); redo(); return; }
  if (mod && e.key === 'y') { if (isTypingInField()) return; e.preventDefault(); redo(); return; }

  // Cmd+/ — Command palette
  if (mod && (e.key === '/' || e.key === '?')) {
    e.preventDefault();
    togglePalette();
    return;
  }

  // All subsequent shortcuts need no typing-in-field
  if (isTypingInField()) return;

  // Cmd+S — save .frakt
  if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveFraktFile(); return; }
  // Cmd+O — open .frakt
  if (mod && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); openFraktFile(); return; }
  // Cmd+X — new scene
  if (mod && (e.key === 'x' || e.key === 'X')) { e.preventDefault(); newScene(); return; }
  // Cmd+Shift+E — open Export dropdown
  if (mod && e.shiftKey && (e.key === 'e' || e.key === 'E')) { e.preventDefault(); toggleMenu(null, 'export'); return; }
  // Cmd+D — duplicate selected layer
  if (mod && (e.key === 'd' || e.key === 'D')) {
    if (typeof selectedLayerId === 'number') { e.preventDefault(); duplicateLayer(selectedLayerId); }
    return;
  }

  // Plain-letter shortcuts — only when no modifier is held
  if (!mod && !e.altKey && !e.shiftKey) {
    // P — Capture PNG
    if (e.key === 'p' || e.key === 'P') { e.preventDefault(); captureCanvasPNG(); return; }
    // N — open Layers dropdown
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); toggleMenu(null, 'layers'); return; }
    // E — open Effects dropdown
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); toggleMenu(null, 'effects'); return; }
  }
  // Delete / Backspace — remove selected stop (if a gradient stop is actively selected), else delete selected layer
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const l = typeof selectedLayerId === 'number' ? layers.find(ll => ll.id === selectedLayerId) : null;
    if (stopSelectionActive && l && l.type === 'gradient' &&
        l.properties.stops && l.properties.stops.length > 2 &&
        selectedStopIdx >= 0 && selectedStopIdx < l.properties.stops.length) {
      e.preventDefault();
      l.properties.stops.splice(selectedStopIdx, 1);
      selectedStopIdx = Math.min(selectedStopIdx, l.properties.stops.length - 1);
      needsRecompile = true;
      snapshot();
      renderRightPanel();
      return;
    }
    if (typeof selectedLayerId === 'number') {
      e.preventDefault();
      removeLayerConfirm(selectedLayerId);
    }
    return;
  }
});

// Close welcome modal on overlay click
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

// Close gallery modal on overlay click + close-button
(function wireGallery() {
  const go = document.getElementById('gallery-overlay');
  const gc = document.getElementById('gallery-close');
  if (go) go.addEventListener('click', e => {
    if (e.target === go) closeGallery();
  });
  if (gc) gc.addEventListener('click', closeGallery);
})();

// ── Frame Row (frozen; context menu has only Canvas Settings) ──
(function wireFrameRow() {
  const row = document.getElementById('frame-row');
  if (!row) return;
  row.addEventListener('click', () => selectLayer('frame'));
  row.addEventListener('contextmenu', e => { e.preventDefault(); openFrameCtxMenu(e); });
})();

function openFrameCtxMenu(e) {
  const m = document.getElementById('frame-ctx-menu');
  if (!m) return;
  // Position near the mouse / anchor button
  let x = 0, y = 0;
  if (e && e.clientX != null) { x = e.clientX; y = e.clientY; }
  else if (e && e.currentTarget) {
    const r = e.currentTarget.getBoundingClientRect();
    x = r.right; y = r.bottom + 4;
  }
  m.style.left = x + 'px';
  m.style.top  = y + 'px';
  m.classList.remove('hidden');
  // Clamp into viewport
  const pr = m.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  if (pr.right > vw - 8) m.style.left = (vw - pr.width - 8) + 'px';
  if (pr.bottom > vh - 8) m.style.top = (vh - pr.height - 8) + 'px';
}
(function wireFrameCtxMenu() {
  const m = document.getElementById('frame-ctx-menu');
  if (!m) return;
  m.querySelectorAll('.ctx-item').forEach(it => {
    it.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const a = it.dataset.action;
      m.classList.add('hidden');
      if (a === 'frame-settings') selectLayer('frame');
    });
  });
  document.addEventListener('click', () => m.classList.add('hidden'));
})();

// ── Editable Filename (name is editable; .frakt suffix is fixed) ─
(function wireFileName() {
  const label = document.getElementById('topbar-file-label');
  if (!label) return;
  label.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.className = 'topbar-file-input';
    inp.value = fileName;
    label.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const restore = (val) => {
      const span = document.createElement('span');
      span.id = 'topbar-file-label';
      span.className = 'topbar-file';
      span.title = 'Click to rename';
      span.textContent = val;
      inp.replaceWith(span);
      wireFileName();
    };
    const commit = () => {
      if (done) return; done = true;
      const v = inp.value.trim() || fileName;
      fileName = v;
      restore(fileName);
    };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
      if (e.key === 'Escape') {
        e.preventDefault();
        done = true;
        restore(fileName);
      }
    });
  });
})();

// ── Toast ──────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, isError) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg;
  t.classList.toggle('toast--error', !!isError);
  t.classList.remove('hidden'); t.classList.add('visible');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    t.classList.remove('visible');
    setTimeout(() => { t.classList.add('hidden'); t.classList.remove('toast--error'); }, 300);
  }, 2000);
}

// ── Save / Open .frakt ─────────────────────────────────────────
const KNOWN_LAYER_TYPES = new Set([
  'solid','gradient','linear-gradient','radial-gradient','noise-field','mesh-gradient','image','rectangle','circle',
  'noise-warp','flow-warp','polar-remap','ripple','wave','grain','chromatic-aberration',
  'vignette','color-grade','n-tone','glow','duotone','bloom','posterize','pixelate','scanlines'
]);

async function saveFraktFile() {
  const chosen = await showNameDialog({
    title: 'Save as',
    defaultName: fileName || 'untitled',
    ext: '.frakt',
    okLabel: 'Save'
  });
  if (!chosen) return;
  fileName = chosen;
  const lbl = document.getElementById('topbar-file-label');
  if (lbl) lbl.textContent = fileName;
  const data = {
    version: '2',
    name: fileName,
    createdAt: new Date().toISOString(),
    canvas: { width: frameState.w, height: frameState.h, background: frameState.bg },
    layers: layers.map(l => ({
      type: l.type,
      name: l.name,
      visible: !!l.visible,
      opacity: l.opacity,
      blendMode: l.blendMode,
      speed: l.speed,
      timeOffset: l.timeOffset,
      paused: l.paused,
      properties: JSON.parse(JSON.stringify(l.properties || {}))
    }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${fileName}.frakt`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`Saved ${fileName}.frakt`);
}

function openFraktFile() {
  const inp = document.getElementById('frakt-input');
  if (inp) { inp.value = ''; inp.click(); }
}

function onFraktUpload(input) {
  const f = input && input.files && input.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || data.version == null || !Array.isArray(data.layers)) throw new Error('schema');
      closeAllOverlays();
      if (!loadScene(data)) throw new Error('schema');
      showToast(`Opened ${fileName}.frakt`);
    } catch (err) {
      showToast('Failed to load file. Invalid .frakt format.', true);
    }
  };
  reader.onerror = () => showToast('Failed to load file. Invalid .frakt format.', true);
  reader.readAsText(f);
}

// "See all presets" link inside the welcome — jumps to the gallery.
(function wireWelcomeViewAll() {
  const btn = document.getElementById('welcome-view-all');
  if (btn) btn.addEventListener('click', e => {
    e.stopPropagation();
    closeModal();
    openGallery();
  });
})();

// ── Boot ───────────────────────────────────────────────────────
noiseTex = initNoiseTex(gl);
applyFrame();
renderShortcutHints();
requestAnimationFrame(frame);
// Presets live as .frakt JSON files; fetch them all before showing the
// welcome modal so the preview cards have scenes to render.
loadAllPresets().then(openModal);
