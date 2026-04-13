# Shader Lab

A professional, browser-based GLSL shader compositing tool. No installs, no accounts, no build step — just open and create.

Shader Lab gives you a real-time canvas and a stack of composable visual effects. Dial in your look with sliders, toggle layers on and off, and copy the resulting GLSL when you're done. Everything runs locally in your browser using WebGL.

---

## What it does

- **Live canvas** — Your shader runs at full frame rate, updating instantly as you tweak controls. The canvas is the product; the UI stays out of the way.
- **Composable effects** — Stack and combine 11 built-in effects: waves, noise warp, grain, chromatic aberration, scanlines, barrel distortion, vignette, color grading, pixelation, posterization, and directional gradients.
- **Precise controls** — Every parameter has a dedicated slider with numeric readout. Adjust frequency, amplitude, speed, colour, softness, direction, and more.
- **One-click export** — Copy the generated GLSL as a self-contained Shadertoy-compatible fragment shader. Paste it straight into [Shadertoy](https://www.shadertoy.com) or any WebGL project.
- **Command palette** — Press `⌘K` to quickly search and add any effect layer.
- **Presets** — Start from built-in looks (Watercolour, CRT, Waterfall, Minimal) or a randomised default, then make it yours.

---

## Getting started

```
git clone https://github.com/your-username/shader-lab.git
cd shader-lab
open index.html
```

That's it. No `npm install`, no bundler, no dependencies. Works in any modern browser.



---

## Effects

| Effect | What it does |
|---|---|
| **Wave** | Animated sine bands with configurable colour, frequency, amplitude, speed, position, softness, and direction |
| **Noise Warp** | fBm-based domain warping with adjustable strength, scale, drift speed, and octave count |
| **Grain** | Film/paper texture with optional animation and directional streaking |
| **Chromatic Aberr.** | RGB channel splitting with spread and angle control |
| **Scanlines** | CRT-style horizontal lines with optional scrolling |
| **Barrel Distort** | Lens warp with strength and zoom |
| **Vignette** | Edge darkening with strength and softness |
| **Color Grade** | Contrast, saturation, brightness, and hue shift |
| **Pixelate** | Adjustable block size quantization |
| **Posterize** | Palette quantization with custom four-colour gradient mapping |
| **Dir. Gradient** | Top-down brightness curve with adjustable power |

Effects are applied in stack order. Each can be toggled on/off independently.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Open command palette to add effects |
| `Escape` | Close command palette |

---

## Export

Click **Copy GLSL** in the top bar. The generated shader is a complete `mainImage` function compatible with Shadertoy. All parameter values are baked into the output — no uniforms required on the receiving end.

---

## Tech

Single-page app. Vanilla HTML, CSS, and JavaScript. WebGL for rendering. No frameworks, no build tools, no external dependencies beyond Google Fonts.

---

## Browser support

Any modern browser with WebGL support — Chrome, Firefox, Safari, Edge.

---

## License

MIT
