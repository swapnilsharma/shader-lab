// Silk — diagonal warm purple/pink satin with gentle sine bands
PRESETS.silk = {
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
};
