// Minimal — soft graphite-to-pearl gradient with the faintest grain
PRESETS.minimal = {
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
};
