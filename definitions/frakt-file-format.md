# Frakt File Format & Layer Definitions

This document describes the `.frakt` file format — what a preset/scene file
looks like, what goes in it, and exactly which properties each layer type
supports.

A `.frakt` file is plain JSON. If it parses as JSON and satisfies the minimal
schema below, Frakt will load it.

---

## 1. Top-level shape

```json
{
  "version": "1",
  "name": "my-scene",
  "createdAt": "2026-04-22T10:00:00.000Z",
  "canvas":   { "width": 1080, "height": 1080, "background": "#111111" },
  "layers":   [ /* layer objects — see §4 */ ]
}
```

| Field       | Type   | Required | Notes                                                                                       |
| ----------- | ------ | -------- | ------------------------------------------------------------------------------------------- |
| `version`   | string | **yes**  | Must be present and non-null. Currently `"1"`. Files with a missing `version` fail to load. |
| `name`      | string | no       | Display name. Becomes the active filename when loaded.                                      |
| `createdAt` | string | no       | ISO timestamp written by Save. Ignored on load.                                             |
| `canvas`    | object | no       | Canvas dimensions + background. If absent, current canvas state is kept.                    |
| `layers`    | array  | **yes**  | Must be an array. Unknown `type` values are silently dropped; see §3 for the whitelist.     |

Loader location: `engine.js` → `onFraktUpload()`.
Writer  location: `engine.js` → `saveFraktFile()`.

---

## 2. Canvas block

```json
"canvas": {
  "width":  1080,
  "height": 1080,
  "background": "#020816"
}
```

| Field        | Type   | Default (if field omitted)      | Notes                                                             |
| ------------ | ------ | ------------------------------- | ----------------------------------------------------------------- |
| `width`      | number | Current frame width kept as-is  | Canvas width in pixels.                                           |
| `height`     | number | Current frame height kept as-is | Canvas height in pixels.                                          |
| `background` | string | Current background kept as-is   | Hex color (`#RRGGBB` or `#RGB`). The base color before any layer. |

Presets in `/presets` commonly omit `width`/`height` and only supply
`background`, which means "use whatever the current canvas size is".

---

## 3. Layer whitelist

The loader ignores any layer whose `type` isn't in this set
(see `KNOWN_LAYER_TYPES` in `engine.js`):

```
solid, gradient, mesh-gradient, image,
rectangle, circle, wave, liquid,
noise-warp, pixelate, ripple,
chromatic-aberration, vignette, grain,
color-grade, posterize, scanlines, duotone, bloom
```

> Note: `liquid`, `duotone`, `bloom`, `ripple` are runtime-supported but not
> currently in `KNOWN_LAYER_TYPES` in the loader — they are created via the
> in-app UI and re-saved fine, but a hand-authored file that uses them may be
> silently dropped. If you're hand-writing a `.frakt` with those, verify
> against the current `KNOWN_LAYER_TYPES` list.

Categories (used internally):

| Category | Types                                                                                             | Description                                                                  |
| -------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Content  | `solid` `gradient` `mesh-gradient` `image` `wave` `rectangle` `circle` `liquid`                   | Produce pixels — draw something. `liquid` is a fullscreen content layer too. |
| UV-prep  | `noise-warp` `pixelate` `ripple`                                                                  | Warp the UV coordinate fed to layers **below** them in the stack.            |
| Color    | `chromatic-aberration` `vignette` `grain` `color-grade` `posterize` `scanlines` `duotone` `bloom` | Transform `col` for layers **below** them in the stack.                      |

Stack order: in the JSON array, **index 0 is the top layer**, last index is
the bottom. UV-prep and color layers affect everything under them — they
don't produce pixels of their own.

---

## 4. Layer object — common fields

Every layer object uses the same outer shape:

```json
{
  "type":       "mesh-gradient",
  "name":       "Mesh Gradient",
  "visible":    true,
  "opacity":    1.0,
  "blendMode":  "normal",
  "properties": { /* type-specific — see §6 */ }
}
```

| Field        | Type    | Default    | Notes                                                                                                                                    |
| ------------ | ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `type`       | string  | required   | One of the whitelisted types (§3).                                                                                                       |
| `name`       | string  | per-type   | Display label. Defaults to a human-readable name (e.g. `"Mesh Gradient"`).                                                               |
| `visible`    | boolean | `true`     | Hidden layers are skipped during render.                                                                                                 |
| `opacity`    | number  | `1.0`      | 0..1. Maps to the `u_op_<id>` uniform — drives the final `mix()` between the layer and what's below it.                                  |
| `blendMode`  | string  | `"normal"` | See §5 for the options.                                                                                                                  |
| `properties` | object  | `{}`       | All type-specific parameters go here. Missing keys fall back to the per-type defaults in `defaultProperties()` (see `engine.js:94-125`). |

Fields omitted at the layer level default to the values above. Fields
omitted inside `properties` default to the per-type values in §6.

> `id` and `effects` are runtime-only fields created by `createLayer()` and
> are not part of the on-disk `.frakt` format. Attached effects are a live
> editing concept; they are **not** serialized into the current format.

---

## 5. Blend modes

`blendMode` values accepted (see `glslBlend()` in `renderer.js`):

| Value      | GLSL formula (per channel, `bg` = below, `fg` = this layer)  |
| ---------- | ------------------------------------------------------------ |
| `normal`   | `fg` (overwrite — default)                                   |
| `multiply` | `bg * fg`                                                    |
| `screen`   | `1 - (1 - bg) * (1 - fg)`                                    |
| `overlay`  | Standard overlay: `bg < 0.5 ? 2*bg*fg : 1 - 2*(1-bg)*(1-fg)` |
| `add`      | `clamp(bg + fg, 0, 1)`                                       |
| `lighten`  | `max(bg, fg)`                                                |
| `darken`   | `min(bg, fg)`                                                |

Any unknown value is treated as `normal`.

---

## 6. Layer types & properties

Every entry below lists every property the engine reads, its type, its
default (when absent from the `.frakt` file), and what it controls. All
defaults come from `defaultProperties()` in `engine.js`; the uniform setup
lives in `setUniformsForLayers()` in `renderer.js`.

### 6.1 `solid`  *(content)*

Fill the frame with a single flat color.

| Property | Type   | Default     | Notes                  |
| -------- | ------ | ----------- | ---------------------- |
| `color`  | string | `"#3B3B6B"` | Hex color (`#RRGGBB`). |

```json
{ "type": "solid", "name": "Solid", "properties": { "color": "#3B3B6B" } }
```

---

### 6.2 `gradient`  *(content)*

Animated multi-stop wave gradient driven by `gradient-spec`. Up to **6 stops**.

| Property    | Type               | Default                                                                        | Range / Notes                                                  |
| ----------- | ------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `seed`      | number             | `42`                                                                           | Random seed. Changes the wave pattern.                         |
| `speed`     | number             | `1.0`                                                                          | Animation speed multiplier.                                    |
| `freqX`     | number             | `0.9`                                                                          | Horizontal wave frequency.                                     |
| `freqY`     | number             | `6.0`                                                                          | Vertical wave frequency.                                       |
| `angle`     | number             | `105`                                                                          | Degrees. Wave direction.                                       |
| `amplitude` | number             | `2.1`                                                                          | Wave amplitude.                                                |
| `softness`  | number             | `0.74`                                                                         | Edge softness between stops.                                   |
| `blend`     | number             | `0.54`                                                                         | Blend weight into the gradient lookup.                         |
| `scale`     | number             | `1.0`                                                                          | UV scale around center. `>1.0` zooms in.                       |
| `stops`     | array of `{color}` | `[{color:"#FF0055"}, {color:"#0088FF"}, {color:"#FFCC00"}, {color:"#AA44FF"}]` | **2–6 items.** Stops are evenly spaced; `position` is ignored. |

> **Legacy migration:** If a file was written with `color0`/`color1`/`color2`/`color3` instead of `stops`, the loader converts them into equivalent `stops` entries. Hand-written stops can still include a `position` field — it will be dropped.

---

### 6.3 `mesh-gradient`  *(content)*

Turbulent mesh gradient (multi-octave domain-warped noise). Up to **16 colors**.

| Property     | Type          | Default                                               | Notes                                                                                     |
| ------------ | ------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `seed`       | number        | `12`                                                  | Random seed.                                                                              |
| `speed`      | number        | `0.3`                                                 | Animation speed.                                                                          |
| `scale`      | number        | `0.42`                                                | Noise scale. Lower = bigger blobs.                                                        |
| `turbAmp`    | number        | `0.15`                                                | Turbulence amplitude.                                                                     |
| `turbFreq`   | number        | `0.1`                                                 | Turbulence frequency.                                                                     |
| `turbIter`   | number        | `7`                                                   | Turbulence iterations (int-valued float).                                                 |
| `waveFreq`   | number        | `3.8`                                                 | Internal wave frequency.                                                                  |
| `distBias`   | number        | `0.0`                                                 | Biases the noise distribution.                                                            |
| `exposure`   | number        | `1.1`                                                 | Post-exposure multiplier.                                                                 |
| `contrast`   | number        | `1.1`                                                 | Post-contrast.                                                                            |
| `saturation` | number        | `1.0`                                                 | Post-saturation.                                                                          |
| `colors`     | array[string] | `["#1e2558","#2f3088","#4f3aa8","#7050c8","#a580e0"]` | **2–16 hex strings.** Excess is truncated; short arrays are padded by repeating the last. |

> **Legacy migration:** Files with `color0..color4` are converted to `colors` on load.

---

### 6.4 `image`  *(content)*

Draws the user-uploaded image (sampled through `uImage`).

| Property | Type   | Default               | Notes                                                            |
| -------- | ------ | --------------------- | ---------------------------------------------------------------- |
| `x`      | number | `0`                   | X offset in pixels (canvas coords, center-relative).             |
| `y`      | number | `0`                   | Y offset in pixels.                                              |
| `w`      | number | current canvas width  | Destination width in pixels. Min 1.                              |
| `h`      | number | current canvas height | Destination height in pixels. Min 1.                             |
| `fit`    | string | `"cover"`             | One of `"cover"`, `"contain"`, `"stretch"`. Aspect-fit behavior. |

Note: the image pixel data itself is **not** embedded in the `.frakt` file —
the loader only restores the geometry. The user uploads the image separately.

---

### 6.5 `wave`  *(content)*

A soft-edged horizontal wave line drawn as a colored band.

| Property | Type   | Default     | Notes                                   |
| -------- | ------ | ----------- | --------------------------------------- |
| `color`  | string | `"#6B7FE8"` | Line color.                             |
| `freq`   | number | `4.0`       | Cycles across the UV.                   |
| `amp`    | number | `0.15`      | Vertical amplitude (0..1 of height).    |
| `spd`    | number | `0.6`       | Animation speed.                        |
| `pos`    | number | `0.5`       | Vertical position (0..1).               |
| `edge`   | number | `0.06`      | Edge softness (line thickness falloff). |
| `angle`  | number | `0`         | Degrees. Rotates the line.              |

---

### 6.6 `rectangle`  *(content)*

A rounded rectangle with optional gradient fill and blur edge.

| Property   | Type               | Default                                 | Notes                                                           |
| ---------- | ------------------ | --------------------------------------- | --------------------------------------------------------------- |
| `x`        | number             | `0`                                     | Center X offset (px, canvas-center-relative).                   |
| `y`        | number             | `0`                                     | Center Y offset.                                                |
| `w`        | number             | `300`                                   | Width in px. Min 1.                                             |
| `h`        | number             | `200`                                   | Height in px. Min 1.                                            |
| `radius`   | number             | `0`                                     | Corner radius (px). Clamped to `min(w,h)/2`.                    |
| `blur`     | number             | `0`                                     | Edge blur radius.                                               |
| `rotation` | number             | `0`                                     | Degrees.                                                        |
| `scale`    | number             | `1.0`                                   | Uniform scale around center.                                    |
| `fillMode` | string             | `"solid"`                               | `"solid"` → use `color`. `"gradient"` → use `stops` (vertical). |
| `color`    | string             | `"#E8E8E8"`                             | Solid fill.                                                     |
| `stops`    | array of `{color}` | `[{color:"#FF0055"},{color:"#0088FF"}]` | **2–6 stops.** Vertical gradient fill.                          |

---

### 6.7 `circle`  *(content)*

An ellipse (circle if `w === h`) with optional gradient fill.

Identical to `rectangle` **minus** `radius` (a circle has no corner radius):

| Property   | Type               | Default     | Notes                                 |
| ---------- | ------------------ | ----------- | ------------------------------------- |
| `x`        | number             | `0`         | Center X offset.                      |
| `y`        | number             | `0`         | Center Y offset.                      |
| `w`        | number             | `240`       | Ellipse width. Min 1.                 |
| `h`        | number             | `240`       | Ellipse height. Min 1.                |
| `blur`     | number             | `0`         | Edge blur.                            |
| `rotation` | number             | `0`         | Degrees.                              |
| `scale`    | number             | `1.0`       | Uniform scale.                        |
| `fillMode` | string             | `"solid"`   | `"solid"` or `"gradient"`.            |
| `color`    | string             | `"#E8E8E8"` | Solid fill.                           |
| `stops`    | array of `{color}` | 2 stops     | **2–6 stops** vertical gradient fill. |

---

### 6.8 `liquid`  *(content)*

Fluid-like flowing mesh gradient with 5 fixed colors (`color0..color4`).

| Property     | Type   | Default     | Notes                  |
| ------------ | ------ | ----------- | ---------------------- |
| `seed`       | number | `12`        | Random seed.           |
| `speed`      | number | `0.3`       | Animation speed.       |
| `scale`      | number | `0.42`      | Noise scale.           |
| `turbAmp`    | number | `0.6`       | Turbulence amplitude.  |
| `turbFreq`   | number | `0.1`       | Turbulence frequency.  |
| `turbIter`   | number | `7`         | Turbulence iterations. |
| `waveFreq`   | number | `3.8`       | Wave frequency.        |
| `distBias`   | number | `0.0`       | Distribution bias.     |
| `exposure`   | number | `1.1`       | Post-exposure.         |
| `contrast`   | number | `1.1`       | Post-contrast.         |
| `saturation` | number | `1.0`       | Post-saturation.       |
| `color0`     | string | `"#00001A"` | 1st stop.              |
| `color1`     | string | `"#2962FF"` | 2nd stop.              |
| `color2`     | string | `"#40BCFF"` | 3rd stop.              |
| `color3`     | string | `"#FFB8B5"` | 4th stop.              |
| `color4`     | string | `"#FFC14F"` | 5th stop.              |

---

### 6.9 `noise-warp`  *(UV-prep)*

Distorts the UV coordinate for every layer below it using fBm noise.

| Property | Type   | Default | Notes                                |
| -------- | ------ | ------- | ------------------------------------ |
| `str`    | number | `0.5`   | Distortion strength.                 |
| `scale`  | number | `2.0`   | Noise scale (higher = finer detail). |
| `wspd`   | number | `0.12`  | Warp drift speed over time.          |
| `oct`    | number | `4`     | fBm octaves (int-valued float).      |
| `angle`  | number | `90`    | Drift direction in **degrees**.      |

---

### 6.10 `pixelate`  *(UV-prep)*

Quantizes the UV coordinate to a grid — classic pixel-art effect.

| Property | Type   | Default | Notes                                    |
| -------- | ------ | ------- | ---------------------------------------- |
| `size`   | number | `4`     | Pixel block size (px). Min clamped to 1. |

---

### 6.11 `ripple`  *(UV-prep)*

Radial sine ripple centered on a point in the UV plane. Affects layers
below it.

| Property | Type   | Default | Notes                                          |
| -------- | ------ | ------- | ---------------------------------------------- |
| `cx`     | number | `0.5`   | Center X in UV (0..1).                         |
| `cy`     | number | `0.5`   | Center Y in UV.                                |
| `freq`   | number | `10.0`  | Ripple frequency.                              |
| `amp`    | number | `0.03`  | Ripple amplitude.                              |
| `spd`    | number | `1.0`   | Time speed.                                    |
| `decay`  | number | `2.0`   | Exponential falloff with distance from center. |

---

### 6.12 `chromatic-aberration`  *(color, but CA also shifts UVs of content below)*

Offsets RGB channels along an axis. Applied to **content layers below** it.

| Property | Type   | Default | Notes                                |
| -------- | ------ | ------- | ------------------------------------ |
| `spread` | number | `0.006` | Channel offset magnitude (UV space). |
| `angle`  | number | `0`     | Degrees. Offset direction.           |

---

### 6.13 `vignette`  *(color)*

Dark radial fade at the frame edges.

| Property | Type   | Default | Notes                               |
| -------- | ------ | ------- | ----------------------------------- |
| `str`    | number | `0.6`   | Darkening strength at full falloff. |
| `soft`   | number | `0.4`   | Softness of the falloff boundary.   |

---

### 6.14 `grain`  *(color)*

Film grain noise overlay, optionally animated and streaked.

| Property   | Type   | Default | Notes                                             |
| ---------- | ------ | ------- | ------------------------------------------------- |
| `amount`   | number | `0.08`  | Grain intensity.                                  |
| `size`     | number | `1.0`   | Grain pixel scale.                                |
| `animated` | number | `1`     | `0` = static, `1` = time-varying.                 |
| `streak`   | number | `0`     | `0` = isotropic, `1` = directional streaks.       |
| `sangle`   | number | `90`    | Streak angle in degrees (used when `streak = 1`). |
| `slen`     | number | `6`     | Streak length (used when `streak = 1`).           |

---

### 6.15 `color-grade`  *(color)*

HSL + contrast + brightness adjustments.

| Property   | Type   | Default | Notes                                 |
| ---------- | ------ | ------- | ------------------------------------- |
| `contrast` | number | `1.0`   | `>1` increases contrast.              |
| `sat`      | number | `1.0`   | Saturation (0 = grayscale).           |
| `bright`   | number | `0.0`   | Additive brightness shift (-1..1).    |
| `hue`      | number | `0`     | Hue rotation in **degrees** (0..360). |

---

### 6.16 `posterize`  *(color)*

Quantize luminance into `bands` levels and remap through a 4-point palette.

| Property | Type   | Default     | Notes                                         |
| -------- | ------ | ----------- | --------------------------------------------- |
| `bands`  | number | `5`         | Number of luminance bands.                    |
| `mix`    | number | `1.0`       | Blend between original and posterized (0..1). |
| `c1`     | string | `"#82C67C"` | Dark-zone near tone.                          |
| `c2`     | string | `"#336B51"` | Dark-zone far tone (mixed by `rawuv.y`).      |
| `c3`     | string | `"#257847"` | Bright-zone near tone.                        |
| `c4`     | string | `"#0F4140"` | Bright-zone far tone.                         |

---

### 6.17 `scanlines`  *(color)*

Horizontal CRT-style scanline darkening, optional scroll.

| Property    | Type   | Default | Notes                                  |
| ----------- | ------ | ------- | -------------------------------------- |
| `count`     | number | `120`   | Number of scanlines over the frame.    |
| `dark`      | number | `0.4`   | Darkening amount at each line.         |
| `soft`      | number | `0.3`   | Line softness.                         |
| `scroll`    | number | `0`     | `0` = static, `1` = scrolling.         |
| `scrollspd` | number | `0.3`   | Scroll speed (used when `scroll = 1`). |

---

### 6.18 `duotone`  *(color)*

Maps luminance into a shadow/light two-color ramp.

| Property | Type   | Default     | Notes                                    |
| -------- | ------ | ----------- | ---------------------------------------- |
| `shadow` | string | `"#000000"` | Color at luminance 0.                    |
| `light`  | string | `"#ffffff"` | Color at luminance 1.                    |
| `blend`  | number | `1.0`       | Mix between original and duotone (0..1). |

---

### 6.19 `bloom`  *(color)*

Soft luminance bloom — brightens above-threshold pixels.

| Property    | Type   | Default | Notes             |
| ----------- | ------ | ------- | ----------------- |
| `threshold` | number | `0.7`   | Luminance cutoff. |
| `strength`  | number | `0.5`   | Bloom intensity.  |
| `radius`    | number | `1.0`   | Bloom spread.     |

---

## 7. Stacking semantics

- Layers render **bottom → top**. In the JSON array, index 0 is on top.
- **UV-prep layers** (`noise-warp`, `pixelate`, `ripple`) and
  **chromatic-aberration** affect only the content layers **below** them
  in the stack. They don't produce pixels themselves.
- **Color effects** (`grain`, `vignette`, `color-grade`, `posterize`,
  `scanlines`, `duotone`, `bloom`) transform `col` at the point they
  appear in the walk, so they affect everything composited up to that
  point.
- Multiple UV-prep or CA layers stack additively.

## 8. Minimal examples

### Solid background + mesh gradient

```json
{
  "version": "1",
  "name": "aurora",
  "canvas": { "background": "#020816" },
  "layers": [
    { "type": "color-grade", "name": "Color Grade", "properties": {
      "contrast": 1.05, "sat": 1.15, "bright": 0.0, "hue": 0
    }},
    { "type": "mesh-gradient", "name": "Mesh Gradient", "properties": {
      "seed": 42, "speed": 1.36, "scale": 0.35,
      "turbAmp": 0.22, "turbFreq": 0.22, "turbIter": 3,
      "waveFreq": 1.6, "distBias": 0.0,
      "exposure": 1.05, "contrast": 1.0, "saturation": 1.1,
      "colors": ["#020816", "#0F4C6B", "#1FC8A8", "#26E07A", "#7B2FFF", "#020816"]
    }}
  ]
}
```

### VHS-style composite

```json
{
  "version": "1",
  "name": "vhs",
  "canvas": { "background": "#0D0812" },
  "layers": [
    { "type": "scanlines", "properties": {
      "count": 220, "dark": 0.3, "soft": 0.22, "scroll": 0, "scrollspd": 0.3
    }},
    { "type": "chromatic-aberration", "properties": {
      "spread": 0.008, "angle": 0
    }},
    { "type": "grain", "properties": {
      "amount": 0.12, "size": 1.0, "animated": 1, "streak": 1, "sangle": 90, "slen": 6
    }},
    { "type": "vignette", "properties": {
      "str": 0.6, "soft": 0.4
    }},
    { "type": "mesh-gradient", "properties": {
      "seed": 64, "speed": 0.05, "scale": 0.38,
      "turbAmp": 0.22, "turbFreq": 0.22, "turbIter": 3,
      "waveFreq": 1.6, "distBias": 0.0,
      "exposure": 1.02, "contrast": 1.05, "saturation": 1.15,
      "colors": ["#120820", "#3A1450", "#8A2B6E", "#E84A9A", "#3A1450", "#0D0812"]
    }}
  ]
}
```

---

## 9. Source-of-truth pointers

When this doc and the code disagree, the code wins. The relevant functions:

| Concern                        | File          | Function / block                                          |
| ------------------------------ | ------------- | --------------------------------------------------------- |
| Load `.frakt`                  | `engine.js`   | `onFraktUpload()` + `KNOWN_LAYER_TYPES`                   |
| Save `.frakt`                  | `engine.js`   | `saveFraktFile()`                                         |
| Load bundled preset            | `engine.js`   | `loadPreset()` (reads from `PRESETS[name]`)               |
| Per-type default properties    | `engine.js`   | `defaultProperties(type)`                                 |
| Layer type classification      | `renderer.js` | `CONTENT_TYPES`, `CONTENT_TYPES_WITH_FN`, `UV_PREP_TYPES` |
| Uniform setup per layer        | `renderer.js` | `setUniformsForLayers()`                                  |
| Uniform declarations in shader | `renderer.js` | `glslUniformDecls()`                                      |
| Blend mode formulas            | `renderer.js` | `glslBlend()`                                             |
| Legacy property migrations     | `engine.js`   | `migrateGradientProps()`, `migrateMeshGradientProps()`    |
