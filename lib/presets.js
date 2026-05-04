// ================================================================
// SHADER LAB — Preset loader
// ================================================================
// To add a new preset:
//   1. Save your scene as a .frakt file from Scene → Save
//   2. Copy the file to /presets/
//   3. Run: double-click update-presets.command in the project root
// Done. No code changes needed.
//
// At boot, loadAllPresets() fetches /presets/index.json and then each
// referenced .frakt file in parallel. Files that fail to load are
// skipped with a console warning; the gallery silently omits them.

let PRESETS = {};        // { [id]: { bg, layers, raw } }
let PRESET_ORDER = [];   // [id, id, ...] — manifest order
let MODAL_PRESETS = [];  // 7 random ids re-shuffled per welcome open

// Welcome modal shows 7 randomly chosen presets (re-shuffled each open).
function pickModalPresets() {
  const all = PRESET_ORDER.slice();
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, 7);
}

// Normalize one .frakt JSON blob into the lighter PRESETS[id] shape used
// by the mini-renderer. Keeps the original raw scene attached so the
// canonical loadScene() consumes the full .frakt format.
function frakt2preset(data) {
  const bg = (data && data.canvas && data.canvas.background) || '#111111';
  const layers = Array.isArray(data && data.layers) ? data.layers.map(l => ({
    type: l.type,
    name: l.name,
    opacity: l.opacity,
    blendMode: l.blendMode,
    properties: l.properties || {}
  })) : [];
  return { bg, layers, raw: data };
}

async function loadAllPresets() {
  let manifest;
  try {
    const res = await fetch('presets/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();
  } catch (err) {
    console.warn('[presets] Failed to load presets/index.json — gallery will be empty.', err);
    PRESETS = {};
    PRESET_ORDER = [];
    MODAL_PRESETS = [];
    return;
  }

  const entries = Array.isArray(manifest && manifest.presets) ? manifest.presets : [];
  const results = await Promise.allSettled(
    entries.map(async meta => {
      const r = await fetch(`presets/${meta.file}`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      return { meta, data };
    })
  );

  const nextPresets = {};
  const nextOrder = [];
  results.forEach((r, i) => {
    const meta = entries[i];
    if (r.status === 'fulfilled') {
      const preset = frakt2preset(r.value.data);
      // Manifest name overrides the raw file's `name` for display.
      if (meta.name) preset.raw = Object.assign({}, preset.raw, { name: meta.name });
      nextPresets[meta.id] = preset;
      nextOrder.push(meta.id);
    } else {
      console.warn(`[presets] Skipping "${meta.id}" (${meta.file}):`, r.reason);
    }
  });

  PRESETS = nextPresets;
  PRESET_ORDER = nextOrder;
  MODAL_PRESETS = pickModalPresets();
}
