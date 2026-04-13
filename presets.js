// ================================================================
// SHADER LAB — Preset Definitions
// ================================================================
// Each preset: { bg: '#hex', layers: [{ type, data }] }
// Wave data needs: color, freq, amp, spd, pos, edge, angle
// Color Grade: contrast/sat/bright are OFFSETS from 1.0/1.0/0.0 base

function waveD(color, freq, amp, spd, pos, edge, angle) {
  const [r,g,b] = hexToRgb(color);
  return { type:'wave', data:{ color, colorr:r, colorg:g, colorb:b, r, g, b, freq, amp, spd, pos, edge, angle:angle||0 }};
}
function warpD(str, scale, wspd, oct) {
  return { type:'warp', data:{ str, scale, wspd, oct:oct||4 }};
}
function grainD(amount, anim, streak, sangle, slen) {
  return { type:'grain', data:{ amount, size:1.0, anim:anim?1:0, streak:streak?1:0, sangle:sangle||90, slen:slen||6 }};
}
function vigD(str, soft) {
  return { type:'vignette', data:{ str, soft }};
}
function gradeD(contrast, sat, bright, hue) {
  return { type:'colorgrade', data:{ contrast:1.0+(contrast||0), sat:1.0+(sat||0), bright:bright||0, hue:hue||0 }};
}
function scanD(count, dark, soft, scroll, scrollspd) {
  return { type:'scanlines', data:{ count, dark, soft, scroll:scroll?1:0, scrollspd:scrollspd||0.3 }};
}
function barrelD(str, zoom) {
  return { type:'barrel', data:{ str, zoom }};
}
function chromaD(spread, angle) {
  return { type:'chroma', data:{ spread, angle:angle||0 }};
}
function pixelD(size) {
  return { type:'pixelate', data:{ size }};
}
function dirgradD(topstr, botstr, power) {
  return { type:'dirgradient', data:{ topstr, botstr, power }};
}

const PRESETS = {
  watercolour: {
    bg: '#F5F0E8',
    layers: [
      warpD(0.6, 1.8, 0.12, 5),
      waveD('#E8A0D0', 1.2, 0.35, 0.08, 0.45, 0.7, 0),
      waveD('#A0C8F0', 0.8, 0.28, -0.06, 0.55, 0.8, 0),
      vigD(0.3, 0.8),
      gradeD(0.05, 0.15, 0.05),
    ]
  },
  crt: {
    bg: '#000308',
    layers: [
      dirgradD(0.3, 0.5, 2.2),
      waveD('#00FF88', 18.0, 0.012, 0.6, 0.5, 0.05, 90),
      scanD(180, 0.55, 0.15, true, 0.3),
      barrelD(0.18, 1.06),
      chromaD(0.006, 0),
      vigD(0.7, 0.4),
      gradeD(0, -0.3, -0.1),
    ]
  },
  waterfall: {
    bg: '#020818',
    layers: [
      waveD('#0066FF', 3.5, 0.55, -0.9, 0.5, 0.15, 90),
      waveD('#00CCFF', 7.0, 0.25, -1.4, 0.5, 0.08, 88),
      warpD(0.25, 2.0, 0.3, 4),
      chromaD(0.004, 90),
      gradeD(0.2, 0.3, 0),
    ]
  },
  minimal: {
    bg: '#080808',
    layers: [
      waveD('#FFFFFF', 12.0, 0.018, 0.15, 0.5, 0.03, 35),
      waveD('#FFFFFF', 7.0, 0.008, -0.08, 0.5, 0.02, 35),
      vigD(0.6, 0.5),
    ]
  },
  aurora: {
    bg: '#020D08',
    layers: [
      warpD(0.9, 0.8, 0.06, 6),
      waveD('#00FFB3', 1.4, 0.6, 0.07, 0.45, 0.55, 12),
      waveD('#7B2FFF', 0.9, 0.45, 0.04, 0.55, 0.65, -8),
      waveD('#00CFFF', 2.1, 0.3, 0.11, 0.5, 0.5, 5),
      vigD(0.5, 0.6),
      gradeD(0.15, 0.4, -0.05),
    ]
  },
  ember: {
    bg: '#0A0200',
    layers: [
      warpD(1.2, 1.2, 0.18, 5),
      waveD('#FF4400', 2.2, 0.5, 0.22, 0.45, 0.3, 4),
      waveD('#FFAA00', 3.8, 0.35, 0.3, 0.55, 0.2, -3),
      waveD('#FF0055', 1.4, 0.28, 0.14, 0.5, 0.45, 8),
      grainD(0.06, true),
      gradeD(0.3, 0.5, -0.1),
    ]
  },
  holo: {
    bg: '#F0F5FF',
    layers: [
      warpD(0.45, 1.4, 0.09, 4),
      waveD('#A0F0FF', 2.8, 0.42, 0.08, 0.45, 0.55, 20),
      waveD('#FFB0F0', 1.9, 0.38, -0.06, 0.55, 0.6, -15),
      waveD('#B8FFD0', 3.5, 0.28, 0.12, 0.5, 0.5, 10),
      chromaD(0.003, 45),
      gradeD(-0.05, 0.25, 0.08),
    ]
  },
  vhs: {
    bg: '#0D0812',
    layers: [
      grainD(0.18, true, true, 90, 6),
      waveD('#FF00CC', 0.6, 0.04, 0.35, 0.5, 0.02, 90),
      scanD(240, 0.35, 0.2, false),
      chromaD(0.012, 0),
      barrelD(0.06, 1.02),
      gradeD(0.1, -0.15, -0.05),
    ]
  },
  plasma: {
    bg: '#05000F',
    layers: [
      warpD(1.4, 0.9, 0.2, 6),
      waveD('#FF00FF', 3.2, 0.55, 0.18, 0.45, 0.25, 15),
      waveD('#00FFFF', 2.1, 0.48, -0.14, 0.55, 0.3, -10),
      waveD('#FFFF00', 4.5, 0.3, 0.25, 0.5, 0.2, 5),
      gradeD(0.35, 0.6, 0),
    ]
  },
  silk: {
    bg: '#08001A',
    layers: [
      warpD(0.35, 2.2, 0.05, 3),
      waveD('#9B30FF', 2.0, 0.5, 0.06, 0.42, 0.45, 25),
      waveD('#FF3090', 1.4, 0.42, -0.04, 0.58, 0.5, -20),
      waveD('#30B0FF', 3.0, 0.25, 0.09, 0.5, 0.4, 10),
      gradeD(0.2, 0.4, -0.08),
    ]
  },
  glitch: {
    bg: '#000000',
    layers: [
      warpD(2.0, 3.5, 0.4, 2),
      waveD('#00FFCC', 14.0, 0.06, 0.8, 0.5, 0.02, 90),
      chromaD(0.022, 0),
      pixelD(6),
      scanD(150, 0.2, 0.3, true, 0.5),
      gradeD(0.4, 0.2, 0),
    ]
  },
  cosmos: {
    bg: '#00000A',
    layers: [
      warpD(0.5, 0.4, 0.015, 6),
      waveD('#1A00FF', 0.7, 0.35, 0.02, 0.45, 0.7, 30),
      waveD('#8800FF', 0.4, 0.28, 0.015, 0.55, 0.8, -20),
      grainD(0.22, true),
      vigD(0.8, 0.3),
      gradeD(0.25, 0.5, -0.15),
    ]
  },
  sunrise: {
    bg: '#FFF5E0',
    layers: [
      dirgradD(0.2, 0.8, 1.8),
      waveD('#FF6600', 1.0, 0.5, 0.05, 0.5, 0.7, 0),
      waveD('#FF0080', 0.6, 0.35, 0.03, 0.55, 0.8, 5),
      waveD('#FFE000', 1.8, 0.3, 0.08, 0.45, 0.65, -5),
      warpD(0.2, 2.0, 0.04, 3),
      gradeD(0.1, 0.3, 0.06),
    ]
  },
};
