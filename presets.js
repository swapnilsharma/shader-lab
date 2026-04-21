// ================================================================
// SHADER LAB — Presets manifest
// ================================================================
// Actual preset definitions live in /presets/<name>.js and mutate
// the global PRESETS object. This file just declares the namespace,
// the canonical display order, and the welcome-modal picker.

const PRESETS = {};

// Full ordered roster — used by the "Preset gallery…" modal + the
// Scene → Presets submenu.
const PRESET_ORDER = [
  'aurora', 'silk', 'plasma', 'ember', 'holo', 'cosmos',
  'glitch', 'sunrise', 'minimal', 'watercolour', 'vhs', 'crt'
];

// Welcome modal shows 7 randomly chosen presets (re-shuffled each open).
function pickModalPresets() {
  const all = PRESET_ORDER.slice();
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, 7);
}

let MODAL_PRESETS = pickModalPresets();
