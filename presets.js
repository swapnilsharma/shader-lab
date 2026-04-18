// ================================================================
// SHADER LAB — Presets v3 (Layer Stack Format)
// ================================================================
// Each preset: { bg: '#hex', layers: [{ type, name, properties, opacity?, blendMode? }] }
// Layers are ordered top-to-bottom in the panel (index 0 = topmost).
// IDs are assigned at runtime by engine.js.

const PRESETS = {
  aurora: {
    bg: '#020D08',
    layers: [
      { type: 'grain',        name: 'Grain',        properties: { amount: 0.12, size: 1.0, animated: 1, streak: 0, sangle: 90, slen: 6 } },
      { type: 'color-grade',  name: 'Color Grade',  properties: { contrast: 1.15, sat: 1.4, bright: -0.05, hue: 0 } },
      { type: 'noise-warp',   name: 'Noise Warp',   properties: { str: 0.9, scale: 0.8, wspd: 0.06, oct: 6 } },
      { type: 'mesh-gradient',name: 'Mesh Gradient',properties: {
        seed: 42, speed: 0.07, scale: 0.42, turbAmp: 0.9, turbFreq: 0.1, turbIter: 7,
        waveFreq: 3.8, distBias: 0.0, exposure: 1.1, contrast: 1.1, saturation: 1.0,
        color0: '#020D08', color1: '#00FFB3', color2: '#7B2FFF', color3: '#00CFFF', color4: '#020D08'
      }}
    ]
  },

  silk: {
    bg: '#08001A',
    layers: [
      { type: 'grain',    name: 'Grain', properties: { amount: 0.06, size: 1.0, animated: 1, streak: 0, sangle: 90, slen: 6 } },
      { type: 'wave',     name: 'Wave',  properties: { color: '#FF3090', freq: 2.0, amp: 0.5, spd: 0.06, pos: 0.5, edge: 0.45, angle: 25 } },
      { type: 'gradient', name: 'Gradient', properties: {
        seed: 22, speed: 0.05, freqX: 0.9, freqY: 4.0, angle: 25, amplitude: 1.5, softness: 0.8, blend: 0.5,
        color0: '#08001A', color1: '#9B30FF', color2: '#FF3090', color3: '#30B0FF'
      }}
    ]
  },

  plasma: {
    bg: '#05000F',
    layers: [
      { type: 'chromatic-aberration', name: 'Chromatic Aberration', properties: { spread: 0.008, angle: 0 } },
      { type: 'noise-warp',   name: 'Noise Warp',   properties: { str: 1.4, scale: 0.9, wspd: 0.2, oct: 6 } },
      { type: 'liquid',       name: 'Liquid',       opacity: 0.6, properties: {
        seed: 15, speed: 0.25, scale: 0.6, turbAmp: 1.0, turbFreq: 0.1, turbIter: 5,
        waveFreq: 3.0, distBias: 0.0, exposure: 1.0, saturation: 1.2,
        color0: '#05000F', color1: '#FF00FF', color2: '#00FFFF', color3: '#FFFF00', color4: '#05000F'
      }},
      { type: 'mesh-gradient', name: 'Mesh Gradient', properties: {
        seed: 85, speed: 0.18, scale: 0.9, turbAmp: 1.4, turbFreq: 0.08, turbIter: 6,
        waveFreq: 4.0, distBias: 0.0, exposure: 1.2, contrast: 1.35, saturation: 1.6,
        color0: '#05000F', color1: '#FF00FF', color2: '#00FFFF', color3: '#FFFF00', color4: '#05000F'
      }}
    ]
  },

  ember: {
    bg: '#0A0200',
    layers: [
      { type: 'color-grade', name: 'Color Grade', properties: { contrast: 1.3, sat: 1.5, bright: -0.1, hue: 0 } },
      { type: 'noise-warp',  name: 'Noise Warp',  properties: { str: 1.2, scale: 1.2, wspd: 0.18, oct: 5 } },
      { type: 'gradient',    name: 'Gradient',    properties: {
        seed: 7, speed: 0.22, freqX: 1.2, freqY: 5.0, angle: 4, amplitude: 2.0, softness: 0.7, blend: 0.6,
        color0: '#0A0200', color1: '#FF4400', color2: '#FFAA00', color3: '#FF0055'
      }}
    ]
  },

  holo: {
    bg: '#F0F5FF',
    layers: [
      { type: 'grain',                 name: 'Grain',                 properties: { amount: 0.04, size: 1.0, animated: 1, streak: 0, sangle: 90, slen: 6 } },
      { type: 'chromatic-aberration',  name: 'Chromatic Aberration',  properties: { spread: 0.003, angle: 45 } },
      { type: 'wave',                  name: 'Wave',                  properties: { color: '#A0F0FF', freq: 2.8, amp: 0.42, spd: 0.08, pos: 0.45, edge: 0.55, angle: 20 } },
      { type: 'gradient',              name: 'Gradient',              properties: {
        seed: 33, speed: 0.09, freqX: 1.0, freqY: 3.5, angle: 15, amplitude: 1.4, softness: 0.85, blend: 0.55,
        color0: '#F0F5FF', color1: '#A0F0FF', color2: '#FFB0F0', color3: '#B8FFD0'
      }}
    ]
  },

  cosmos: {
    bg: '#00000A',
    layers: [
      { type: 'color-grade', name: 'Color Grade', properties: { contrast: 1.25, sat: 1.5, bright: -0.15, hue: 0 } },
      { type: 'vignette',    name: 'Vignette',    properties: { str: 0.8, soft: 0.3 } },
      { type: 'grain',       name: 'Grain',       properties: { amount: 0.22, size: 1.0, animated: 1, streak: 0, sangle: 90, slen: 6 } },
      { type: 'noise-warp',  name: 'Noise Warp',  properties: { str: 0.5, scale: 0.4, wspd: 0.015, oct: 6 } },
      { type: 'solid',       name: 'Solid',       properties: { color: '#00000A' } }
    ]
  },

  glitch: {
    bg: '#000000',
    layers: [
      { type: 'scanlines',             name: 'Scanlines',             properties: { count: 150, dark: 0.2, soft: 0.3, scroll: 1, scrollspd: 0.5 } },
      { type: 'chromatic-aberration',  name: 'Chromatic Aberration',  properties: { spread: 0.022, angle: 0 } },
      { type: 'posterize',             name: 'Posterize',             properties: { bands: 5, mix: 0.8, c1: '#00FFCC', c2: '#007755', c3: '#004433', c4: '#001111' } },
      { type: 'gradient',              name: 'Gradient',              properties: {
        seed: 99, speed: 0.8, freqX: 3.5, freqY: 7.0, angle: 90, amplitude: 2.5, softness: 0.4, blend: 0.6,
        color0: '#000000', color1: '#00FFCC', color2: '#004422', color3: '#000000'
      }}
    ]
  },

  sunrise: {
    bg: '#FFF5E0',
    layers: [
      { type: 'color-grade', name: 'Color Grade', properties: { contrast: 1.1, sat: 1.3, bright: 0.06, hue: 0 } },
      { type: 'wave',        name: 'Wave',        properties: { color: '#FF6600', freq: 1.0, amp: 0.5, spd: 0.05, pos: 0.5, edge: 0.7, angle: 0 } },
      { type: 'gradient',    name: 'Gradient',    properties: {
        seed: 55, speed: 0.06, freqX: 0.8, freqY: 4.0, angle: 0, amplitude: 1.4, softness: 0.9, blend: 0.5,
        color0: '#FFF5E0', color1: '#FF6600', color2: '#FF0080', color3: '#FFE000'
      }}
    ]
  },

  minimal: {
    bg: '#080808',
    layers: [
      { type: 'grain',    name: 'Grain',    properties: { amount: 0.05, size: 1.0, animated: 1, streak: 0, sangle: 90, slen: 6 } },
      { type: 'gradient', name: 'Gradient', properties: {
        seed: 11, speed: 0.12, freqX: 4.0, freqY: 3.5, angle: 35, amplitude: 0.8, softness: 1.2, blend: 0.4,
        color0: '#080808', color1: '#FFFFFF', color2: '#888888', color3: '#080808'
      }}
    ]
  },

  watercolour: {
    bg: '#F5F0E8',
    layers: [
      { type: 'color-grade', name: 'Color Grade', properties: { contrast: 1.05, sat: 1.15, bright: 0.05, hue: 0 } },
      { type: 'grain',       name: 'Grain',       properties: { amount: 0.04, size: 1.0, animated: 0, streak: 0, sangle: 90, slen: 6 } },
      { type: 'liquid',      name: 'Liquid',      opacity: 0.5, properties: {
        seed: 12, speed: 0.1, scale: 0.5, turbAmp: 0.6, turbFreq: 0.1, turbIter: 7,
        waveFreq: 3.8, distBias: 0.0, exposure: 1.0, saturation: 0.9,
        color0: '#F5F0E8', color1: '#E8A0D0', color2: '#A0C8F0', color3: '#F5F0E8', color4: '#F5F0E8'
      }},
      { type: 'image', name: 'Image', properties: { fit: 'cover' } }
    ]
  },

  vhs: {
    bg: '#0D0812',
    layers: [
      { type: 'scanlines',            name: 'Scanlines',            properties: { count: 240, dark: 0.35, soft: 0.2, scroll: 0, scrollspd: 0.3 } },
      { type: 'chromatic-aberration', name: 'Chromatic Aberration', properties: { spread: 0.012, angle: 0 } },
      { type: 'grain',                name: 'Grain',                properties: { amount: 0.18, size: 1.0, animated: 1, streak: 1, sangle: 90, slen: 6 } },
      { type: 'vignette',             name: 'Vignette',             properties: { str: 0.7, soft: 0.4 } },
      { type: 'solid',                name: 'Solid',                properties: { color: '#0D0812' } }
    ]
  },

  crt: {
    bg: '#000308',
    layers: [
      { type: 'scanlines',  name: 'Scanlines',  properties: { count: 180, dark: 0.55, soft: 0.15, scroll: 1, scrollspd: 0.3 } },
      { type: 'vignette',   name: 'Vignette',   properties: { str: 0.7, soft: 0.4 } },
      { type: 'color-grade',name: 'Color Grade',properties: { contrast: 1.0, sat: 0.7, bright: -0.1, hue: 0 } },
      { type: 'solid',      name: 'Solid',      properties: { color: '#000308' } }
    ]
  }
};

// Modal gallery presets (7 cards shown on startup)
const MODAL_PRESETS = ['aurora', 'silk', 'plasma', 'ember', 'holo', 'cosmos', 'glitch'];
