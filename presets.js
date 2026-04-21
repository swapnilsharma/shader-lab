// ================================================================
// SHADER LAB — Preset scenes (bundled)
// ================================================================
// Preset scenes are shipped inline as JS objects so the app boots
// with zero network dependencies (works from file:// or any server).
// Each entry uses the EXACT same schema as a user-saved .frakt file:
//   { bg, layers: [{ type, name, opacity?, blendMode?, properties }] }
//
// The canonical human-readable copies live in /presets/*.frakt —
// they mirror the data below one-for-one. If you edit a preset,
// update both places so downloadable samples stay in sync.

const PRESETS = {
  aurora: {
    bg: '#020816',
    layers: [
      { type: 'color-grade', name: 'Color Grade', properties: {
        contrast: 1.05, sat: 1.15, bright: 0.0, hue: 0
      }},
      { type: 'mesh-gradient', name: 'Mesh Gradient', properties: {
        seed: 42, speed: 0.12, scale: 0.35,
        turbAmp: 0.22, turbFreq: 0.22, turbIter: 3,
        waveFreq: 1.6, distBias: 0.0,
        exposure: 1.05, contrast: 1.0, saturation: 1.1,
        colors: ['#020816', '#0F4C6B', '#1FC8A8', '#26E07A', '#7B2FFF', '#020816']
      }}
    ]
  },

  silk: {
    bg: '#1A0428',
    layers: [
      { type: 'grain', name: 'Grain', properties: {
        amount: 0.02, size: 1.0, animated: 1, streak: 0, sangle: 90, slen: 6
      }},
      { type: 'gradient', name: 'Gradient', properties: {
        seed: 22, speed: 0.08, freqX: 0.8, freqY: 2.4,
        angle: 30, scale: 1.0, amplitude: 1.8, softness: 1.05, blend: 0.55,
        stops: [
          { color: '#1A0428' },
          { color: '#4A1270' },
          { color: '#C23A9E' },
          { color: '#FFB3D0' },
          { color: '#F9E6F0' }
        ]
      }}
    ]
  },

  plasma: {
    bg: '#140033',
    layers: [
      { type: 'chromatic-aberration', name: 'Chromatic Aberration', properties: {
        spread: 0.0025, angle: 0
      }},
      { type: 'mesh-gradient', name: 'Mesh Gradient', properties: {
        seed: 85, speed: 0.22, scale: 0.48,
        turbAmp: 0.28, turbFreq: 0.18, turbIter: 4,
        waveFreq: 2.0, distBias: 0.0,
        exposure: 1.02, contrast: 1.0, saturation: 1.05,
        colors: ['#FF2EB0', '#FFD84A', '#2EE6FF', '#7B2FFF', '#FF2EB0']
      }}
    ]
  },

  ember: {
    bg: '#0A0200',
    layers: [
      { type: 'color-grade', name: 'Color Grade', properties: {
        contrast: 1.1, sat: 1.2, bright: -0.02, hue: 0
      }},
      { type: 'mesh-gradient', name: 'Mesh Gradient', properties: {
        seed: 7, speed: 0.1, scale: 0.5,
        turbAmp: 0.22, turbFreq: 0.22, turbIter: 3,
        waveFreq: 1.5, distBias: 0.25,
        exposure: 1.15, contrast: 1.02, saturation: 1.15,
        colors: ['#0A0200', '#3A0700', '#B21A00', '#FF5B00', '#FFC24A', '#FFE8B0']
      }}
    ]
  },

  holo: {
    bg: '#F0F5FF',
    layers: [
      { type: 'grain', name: 'Grain', properties: {
        amount: 0.018, size: 1.0, animated: 1, streak: 0, sangle: 90, slen: 6
      }},
      { type: 'chromatic-aberration', name: 'Chromatic Aberration', properties: {
        spread: 0.002, angle: 45
      }},
      { type: 'gradient', name: 'Gradient', properties: {
        seed: 33, speed: 0.1, freqX: 0.7, freqY: 2.6,
        angle: 25, scale: 1.0, amplitude: 1.6, softness: 1.1, blend: 0.55,
        stops: [
          { color: '#BFF0FF' },
          { color: '#E7C6FF' },
          { color: '#FFC6E2' },
          { color: '#FFE8B3' },
          { color: '#B8FFDB' },
          { color: '#BFF0FF' }
        ]
      }}
    ]
  },

  cosmos: {
    bg: '#02020A',
    layers: [
      { type: 'grain', name: 'Grain', properties: {
        amount: 0.05, size: 1.0, animated: 0, streak: 0, sangle: 90, slen: 6
      }},
      { type: 'color-grade', name: 'Color Grade', properties: {
        contrast: 1.08, sat: 1.2, bright: -0.04, hue: 0
      }},
      { type: 'mesh-gradient', name: 'Mesh Gradient', properties: {
        seed: 55, speed: 0.05, scale: 0.36,
        turbAmp: 0.22, turbFreq: 0.22, turbIter: 3,
        waveFreq: 1.5, distBias: 0.0,
        exposure: 1.02, contrast: 1.02, saturation: 1.15,
        colors: ['#02020A', '#0A1040', '#3A1480', '#6B2AB2', '#0E3B7A', '#02020A']
      }}
    ]
  },

  glitch: {
    bg: '#000000',
    layers: [
      { type: 'scanlines', name: 'Scanlines', properties: {
        count: 140, dark: 0.28, soft: 0.28, scroll: 1, scrollspd: 0.45
      }},
      { type: 'chromatic-aberration', name: 'Chromatic Aberration', properties: {
        spread: 0.018, angle: 0
      }},
      { type: 'posterize', name: 'Posterize', properties: {
        bands: 5, mix: 0.8,
        c1: '#00FFCC', c2: '#0AA680', c3: '#083F33', c4: '#000000'
      }},
      { type: 'gradient', name: 'Gradient', properties: {
        seed: 99, speed: 0.5, freqX: 2.4, freqY: 6.0,
        angle: 90, scale: 1.0, amplitude: 2.2, softness: 0.5, blend: 0.6,
        stops: [
          { color: '#000000' },
          { color: '#006E4A' },
          { color: '#00FFCC' },
          { color: '#002A1A' },
          { color: '#000000' }
        ]
      }}
    ]
  },

  sunrise: {
    bg: '#FFF2D8',
    layers: [
      { type: 'color-grade', name: 'Color Grade', properties: {
        contrast: 1.04, sat: 1.15, bright: 0.03, hue: 0
      }},
      { type: 'gradient', name: 'Gradient', properties: {
        seed: 55, speed: 0.06, freqX: 0.5, freqY: 2.4,
        angle: 8, scale: 1.0, amplitude: 1.4, softness: 1.1, blend: 0.5,
        stops: [
          { color: '#FFF5DE' },
          { color: '#FFD08A' },
          { color: '#FF8A6E' },
          { color: '#E24B8C' },
          { color: '#6B2A8A' }
        ]
      }}
    ]
  },

  minimal: {
    bg: '#0D0D10',
    layers: [
      { type: 'grain', name: 'Grain', properties: {
        amount: 0.022, size: 1.0, animated: 1, streak: 0, sangle: 90, slen: 6
      }},
      { type: 'gradient', name: 'Gradient', properties: {
        seed: 11, speed: 0.06, freqX: 0.7, freqY: 2.0,
        angle: 35, scale: 1.0, amplitude: 1.2, softness: 1.2, blend: 0.45,
        stops: [
          { color: '#0D0D10' },
          { color: '#202028' },
          { color: '#525262' },
          { color: '#A8ADB8' },
          { color: '#14141A' }
        ]
      }}
    ]
  },

  watercolour: {
    bg: '#F5F0E8',
    layers: [
      { type: 'grain', name: 'Grain', properties: {
        amount: 0.022, size: 1.0, animated: 0, streak: 0, sangle: 90, slen: 6
      }},
      { type: 'color-grade', name: 'Color Grade', properties: {
        contrast: 1.0, sat: 1.05, bright: 0.03, hue: 0
      }},
      { type: 'mesh-gradient', name: 'Mesh Gradient', properties: {
        seed: 18, speed: 0.04, scale: 0.42,
        turbAmp: 0.18, turbFreq: 0.22, turbIter: 3,
        waveFreq: 1.4, distBias: 0.0,
        exposure: 1.0, contrast: 0.94, saturation: 0.9,
        colors: ['#F5F0E8', '#FAD1DC', '#C8DDF3', '#E8D3F0', '#F8EAD6', '#F5F0E8']
      }}
    ]
  },

  vhs: {
    bg: '#0D0812',
    layers: [
      { type: 'scanlines', name: 'Scanlines', properties: {
        count: 220, dark: 0.3, soft: 0.22, scroll: 0, scrollspd: 0.3
      }},
      { type: 'chromatic-aberration', name: 'Chromatic Aberration', properties: {
        spread: 0.008, angle: 0
      }},
      { type: 'grain', name: 'Grain', properties: {
        amount: 0.12, size: 1.0, animated: 1, streak: 1, sangle: 90, slen: 6
      }},
      { type: 'vignette', name: 'Vignette', properties: {
        str: 0.6, soft: 0.4
      }},
      { type: 'mesh-gradient', name: 'Mesh Gradient', properties: {
        seed: 64, speed: 0.05, scale: 0.38,
        turbAmp: 0.22, turbFreq: 0.22, turbIter: 3,
        waveFreq: 1.6, distBias: 0.0,
        exposure: 1.02, contrast: 1.05, saturation: 1.15,
        colors: ['#120820', '#3A1450', '#8A2B6E', '#E84A9A', '#3A1450', '#0D0812']
      }}
    ]
  },

  crt: {
    bg: '#001A08',
    layers: [
      { type: 'scanlines', name: 'Scanlines', properties: {
        count: 180, dark: 0.45, soft: 0.15, scroll: 1, scrollspd: 0.25
      }},
      { type: 'vignette', name: 'Vignette', properties: {
        str: 0.75, soft: 0.5
      }},
      { type: 'color-grade', name: 'Color Grade', properties: {
        contrast: 1.05, sat: 0.7, bright: -0.04, hue: 0
      }},
      { type: 'mesh-gradient', name: 'Mesh Gradient', properties: {
        seed: 77, speed: 0.06, scale: 0.42,
        turbAmp: 0.22, turbFreq: 0.22, turbIter: 3,
        waveFreq: 1.6, distBias: 0.0,
        exposure: 1.1, contrast: 1.0, saturation: 1.05,
        colors: ['#001A08', '#003D15', '#00702A', '#00D958', '#00E88F']
      }}
    ]
  }
};

// Full ordered roster — used by the Preset Gallery modal and the
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

// Kept as an async shim so engine.js boot (`loadAllPresets().then(openModal)`)
// still works without changes. No network I/O — just re-shuffles.
async function loadAllPresets() {
  MODAL_PRESETS = pickModalPresets();
}
