# Frakt File Format & Layer Definitions

This document describes the `.frakt` file format — what a preset/scene file
looks like, what goes in it, and exactly which properties each layer type
supports.

A `.frakt` file is plain JSON. If it parses as JSON and satisfies the minimal
schema below, Frakt will load it.

> **Range column.** Where a property is exposed in the right-panel UI, the
> "Range" column shows the slider min/max/step (taken from `getPropertyZones()`
> in `engine.js`). The shader itself is not range-clamped beyond these unless
> explicitly noted; pushing values past the slider range from a hand-authored
> file usually still renders, just outside the curated zone.

---

## 1. Top-level shape

```json
{
  "version": "2",
  "name": "my-scene",
  "createdAt": "2026-04-22T10:00:00.000Z",
  "canvas":   { "width": 1080, "height": 1080, "background": "#111111" },
  "layers":   [ /* layer objects — see §4 */ ]
}
```

| Field       | Type   | Required | Notes                                                                                                                                        |
| ----------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`   | string | **yes**  | Must be present and non-null. Save writes `"2"`. Load only checks `version != null` — any version string parses, but only `"2"` is current.  |
| `name`      | string | no       | Display name. Becomes the active filename when loaded.                                                                                       |
| `createdAt` | string | no       | ISO timestamp written by Save. Ignored on load.                                                                                              |
| `canvas`    | object | no       | Canvas dimensions + background. If absent, current canvas state is kept.                                                                     |
| `layers`    | array  | **yes**  | Must be an array. Unknown `type` values are silently dropped; see §3 for the whitelist.                                                      |

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
solid, gradient, linear-gradient, radial-gradient, noise-field,
mesh-gradient, image, rectangle, circle,
wave, liquid,
noise-warp, flow-warp, polar-remap, ripple, pixelate,
chromatic-aberration, vignette, grain,
color-grade, posterize, scanlines, duotone, bloom, n-tone, glow
```

Categories (used internally; see `renderer.js:73-79`):

| Category | Types                                                                                             | Description                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Content  | `solid` `gradient` `linear-gradient` `radial-gradient` `noise-field` `mesh-gradient` `image` `wave` `rectangle` `circle` | Produce pixels — draw something. Match `CONTENT_TYPES`.                                              |
| UV-prep  | `noise-warp` `pixelate` `ripple` `polar-remap` `flow-warp`                                        | Warp the UV coordinate fed to layers **below** them in the stack. Match `UV_PREP_TYPES`.             |
| Color    | `chromatic-aberration` `vignette` `grain` `color-grade` `posterize` `scanlines` `duotone` `bloom` `n-tone` `glow` `liquid` | Transform `col` for layers **below** them in the stack. `liquid` is a fullscreen color overlay now (mixed by opacity over current `col`). |

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
  "speed":      1.0,
  "timeOffset": 0.0,
  "paused":     false,
  "properties": { /* type-specific — see §6 */ }
}
```

| Field        | Type    | Default                                       | Notes                                                                                                                                    |
| ------------ | ------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `type`       | string  | required                                      | One of the whitelisted types (§3).                                                                                                       |
| `name`       | string  | per-type                                      | Display label. Defaults to a human-readable name (e.g. `"Mesh Gradient"`).                                                               |
| `visible`    | boolean | `true`                                        | Hidden layers are skipped during render.                                                                                                 |
| `opacity`    | number  | `1.0`                                         | 0..1. Maps to the `u_op_<id>` uniform — drives the final `mix()` between the layer and what's below it.                                  |
| `blendMode`  | string  | `"normal"`                                    | See §5 for the options.                                                                                                                  |
| `speed`      | number  | per-type (see below)                          | Time multiplier for this layer. Slider range −5..5. The shader receives `u_lyr_<id>_tmul = paused ? 0 : speed`.                          |
| `timeOffset` | number  | `0.0`                                         | Adds a constant phase offset to the layer's time. Slider range −10..10.                                                                  |
| `paused`     | boolean | `false`                                       | Freezes the layer's time (its `tmul` becomes 0).                                                                                         |
| `properties` | object  | `{}`                                          | All type-specific parameters go here. Missing keys fall back to the per-type defaults in `defaultProperties()` (`engine.js:107`).        |

`speed` defaults (from `defaultLayerSpeed()` in `engine.js:171`):

| Type                            | Default |
| ------------------------------- | ------- |
| `mesh-gradient`, `liquid`       | `0.3`   |
| `wave`                          | `0.6`   |
| everything else                 | `1.0`   |

Only types that actually sample `uTime` show the Animation zone in the UI
(see `LAYER_TYPES_WITH_ANIMATION` in `engine.js:162`):
`gradient`, `mesh-gradient`, `wave`, `liquid`, `noise-warp`, `flow-warp`,
`ripple`, `grain`, `scanlines`. For all other types, `speed`/`timeOffset`/
`paused` are still serialized but have no visible effect.

> **Legacy migration — animation moved off `properties`.** Earlier files
> stored animation rate as `properties.speed` (gradient, mesh-gradient,
> liquid) or `properties.spd` (wave, ripple). On load, those values are
> moved onto the layer-level `speed` field and the property is deleted
> (see `createLayer()` in `engine.js:300`). When such a file also has an
> outer `speed` field, the legacy property wins.

> `id` and `effects` are runtime-only fields. **Attached effects** (a list
> of grain/color-grade/vignette/posterize/scanlines/noise-warp effects bound
> to a content layer) are a live editing concept; they are **not** serialized
> by `saveFraktFile()`. Copy-pasting effects between layers works in-session
> only.

---

## 5. Blend modes

`blendMode` values accepted (see `glslBlend()` in `renderer.js:47`):

| Value          | GLSL formula (per channel, `bg` = below, `fg` = this layer)        |
| -------------- | ------------------------------------------------------------------ |
| `normal`       | `fg` (overwrite — default)                                         |
| `multiply`     | `bg * fg`                                                          |
| `screen`       | `1 - (1 - bg) * (1 - fg)`                                          |
| `overlay`      | Standard overlay: `bg < 0.5 ? 2*bg*fg : 1 - 2*(1-bg)*(1-fg)`       |
| `soft-light`   | Pegtop soft-light                                                  |
| `color-dodge`  | `bg / (1 - fg)`                                                    |
| `color-burn`   | `1 - (1 - bg) / fg`                                                |
| `difference`   | `abs(bg - fg)`                                                     |
| `add`          | `clamp(bg + fg, 0, 1)`                                             |
| `lighten`      | `max(bg, fg)`                                                      |
| `darken`       | `min(bg, fg)`                                                      |

Any unknown value is treated as `normal`.

---

## 6. Layer types & properties

Every entry below lists every property the engine reads, its type, its
default (when absent from the `.frakt` file), and what it controls. Defaults
come from `defaultProperties()` in `engine.js:107`; UI ranges come from
`getPropertyZones()` in `engine.js:1383`; uniform setup lives in
`setUniformsForLayers()` in `renderer.js:865`.

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

Animated multi-stop wave gradient. Up to **6 stops**.

| Property    | Type               | Default                                                                        | Range          | Notes                                                          |
| ----------- | ------------------ | ------------------------------------------------------------------------------ | -------------- | -------------------------------------------------------------- |
| `seed`      | number             | `42`                                                                           | 0..999, step 1 | Random seed.                                                   |
| `freqX`     | number             | `0.9`                                                                          | 0.1..5.0       | Horizontal wave frequency.                                     |
| `freqY`     | number             | `6.0`                                                                          | 0.1..10.0      | Vertical wave frequency.                                       |
| `angle`     | number             | `105`                                                                          | 0..360         | Degrees. Wave direction.                                       |
| `amplitude` | number             | `2.1`                                                                          | 0.5..5.0       | Wave amplitude.                                                |
| `softness`  | number             | `0.74`                                                                         | 0.1..2.0       | Edge softness between stops.                                   |
| `blend`     | number             | `0.54`                                                                         | 0..1           | Blend weight into the gradient lookup.                         |
| `scale`     | number             | `1.0`                                                                          | 0.1..4.0       | UV scale around center. `>1.0` zooms in.                       |
| `stops`     | array of `{color}` | `[{color:"#FF0055"}, {color:"#0088FF"}, {color:"#FFCC00"}, {color:"#AA44FF"}]` | 2–6 items      | Stops are evenly spaced; legacy `position` is dropped.         |

> **Legacy migration:** `color0`/`color1`/`color2`/`color3` → `stops`. Old
> per-properties `speed` is lifted to layer-level `speed`.

---

### 6.3 `linear-gradient`  *(content)*

Straight angled gradient. Up to **6 stops**.

| Property | Type               | Default                                            | Range    | Notes                                  |
| -------- | ------------------ | -------------------------------------------------- | -------- | -------------------------------------- |
| `angle`  | number             | `90`                                               | 0..360   | Degrees. Direction of the gradient.    |
| `blend`  | number             | `0.5`                                              | 0..1     | Smoothness between stops.              |
| `scale`  | number             | `1.0`                                              | 0.1..4.0 | UV scale around center.                |
| `stops`  | array of `{color}` | `[{color:"#1e2558"}, {color:"#a580e0"}]`           | 2–6      | Evenly spaced.                         |

---

### 6.4 `radial-gradient`  *(content)*

Circular gradient from a center point. Up to **6 stops**.

| Property | Type               | Default                                            | Range     | Notes                                  |
| -------- | ------------------ | -------------------------------------------------- | --------- | -------------------------------------- |
| `cx`     | number             | `0.5`                                              | 0..1      | Center X (UV).                         |
| `cy`     | number             | `0.5`                                              | 0..1      | Center Y (UV).                         |
| `radius` | number             | `0.5`                                              | 0.05..2.0 | Radial extent.                         |
| `blend`  | number             | `0.5`                                              | 0..1      | Smoothness.                            |
| `scale`  | number             | `1.0`                                              | 0.1..4.0  | UV scale.                              |
| `stops`  | array of `{color}` | `[{color:"#FFCC00"}, {color:"#1e2558"}]`           | 2–6       |                                        |

---

### 6.5 `noise-field`  *(content)*

Coloured noise field (value/perlin/worley). Up to **6 colors**.

| Property    | Type          | Default                                  | Range          | Notes                                 |
| ----------- | ------------- | ---------------------------------------- | -------------- | ------------------------------------- |
| `seed`      | number        | `0`                                      | 0..999         |                                       |
| `scale`     | number        | `4.0`                                    | 0.1..16.0      | Noise scale.                          |
| `contrast`  | number        | `1.0`                                    | 0..3.0         | Output contrast.                      |
| `oct`       | number        | `4`                                      | 1..8           | fBm octaves.                          |
| `noiseType` | string        | `"value"`                                | enum           | `"value"` \| `"perlin"` \| `"worley"` |
| `colors`    | array[string] | `["#1e2558","#4f3aa8","#a580e0"]`        | 2–6 hex        |                                       |

---

### 6.6 `mesh-gradient`  *(content)*

Turbulent mesh gradient (multi-octave domain-warped noise). Up to **16 colors**.

| Property     | Type          | Default                                               | Range            | Notes                                                                                     |
| ------------ | ------------- | ----------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| `seed`       | number        | `12`                                                  | 0..999           |                                                                                           |
| `scale`      | number        | `0.42`                                                | 0.1..2.0         | Lower = bigger blobs.                                                                     |
| `scaleX`     | number        | `1.0`                                                 | 0.1..4.0         | Anisotropic X scale.                                                                      |
| `scaleY`     | number        | `1.0`                                                 | 0.1..4.0         | Anisotropic Y scale.                                                                      |
| `noiseType`  | string        | `"value"`                                             | enum             | `"value"` \| `"perlin"` \| `"worley"`                                                     |
| `turbAmp`    | number        | `0.15` (UI default suggests 0.6)                      | 0.1..2.0         | Turbulence amplitude.                                                                     |
| `turbFreq`   | number        | `0.1`                                                 | 0.01..0.5        | Turbulence frequency.                                                                     |
| `turbIter`   | number        | `7`                                                   | 3..12            | Turbulence iterations (int-valued float).                                                 |
| `waveFreq`   | number        | `3.8`                                                 | 1.0..10.0        | Internal wave frequency.                                                                  |
| `distBias`   | number        | `0.0`                                                 | (no UI)          | Biases the noise distribution.                                                            |
| `exposure`   | number        | `1.1`                                                 | 0.5..2.0         | Post-exposure multiplier.                                                                 |
| `contrast`   | number        | `1.1`                                                 | 0.5..2.0         | Post-contrast.                                                                            |
| `saturation` | number        | `1.0`                                                 | 0..2.0           | Post-saturation.                                                                          |
| `colors`     | array[string] | `["#1e2558","#2f3088","#4f3aa8","#7050c8","#a580e0"]` | 2–16 hex         | Excess is truncated; short arrays pad by repeating the last.                              |

> **Legacy migration:** `color0..color4` → `colors`. Old `speed` → layer-level.

---

### 6.7 `image`  *(content)*

Draws the user-uploaded image (sampled through `uImage`).

| Property | Type   | Default               | Range      | Notes                                                            |
| -------- | ------ | --------------------- | ---------- | ---------------------------------------------------------------- |
| `x`      | number | `0`                   | −2000..2000 | X offset in pixels (canvas coords, center-relative).             |
| `y`      | number | `0`                   | −2000..2000 | Y offset in pixels.                                              |
| `w`      | number | current canvas width  | 1..4000    | Destination width in pixels. Min 1.                              |
| `h`      | number | current canvas height | 1..4000    | Destination height in pixels. Min 1.                             |
| `fit`    | string | `"cover"`             | enum       | `"cover"`, `"contain"`, `"stretch"`. Aspect-fit behavior.        |

Note: the image pixel data itself is **not** embedded in the `.frakt` file —
the loader only restores the geometry. The user uploads the image separately.

---

### 6.8 `wave`  *(content)*

Soft-edged horizontal wave line(s) drawn as colored band(s).

| Property  | Type   | Default     | Range          | Notes                                                                |
| --------- | ------ | ----------- | -------------- | -------------------------------------------------------------------- |
| `color`   | string | `"#6B7FE8"` | —              | Line color.                                                          |
| `freq`    | number | `4.0`       | 0.5..20        | Cycles across the UV.                                                |
| `amp`     | number | `0.15`      | 0..0.7         | Vertical amplitude (0..1 of height).                                 |
| `pos`     | number | `0.5`       | 0.02..0.98     | Vertical position (0..1).                                            |
| `edge`    | number | `0.06`      | 0.003..0.9     | Edge softness (line thickness falloff).                              |
| `angle`   | number | `0`         | −360..360      | Degrees. Rotates the line.                                           |
| `bands`   | number | `1`         | 1..8           | Number of parallel wave lines. Min clamped to 1.                     |
| `bandGap` | number | `0.2`       | 0..1           | Spacing between bands.                                               |

> **Legacy migration:** `spd` → layer-level `speed`.

---

### 6.9 `rectangle`  *(content)*

A rounded rectangle with optional gradient fill, stroke, and drop-shadow.

| Property        | Type               | Default                                 | Range        | Notes                                                                  |
| --------------- | ------------------ | --------------------------------------- | ------------ | ---------------------------------------------------------------------- |
| `x`             | number             | `0`                                     | −1000..1000  | Center X offset (px, canvas-center-relative).                          |
| `y`             | number             | `0`                                     | −1000..1000  | Center Y offset.                                                       |
| `w`             | number             | `300`                                   | 1..2000      | Width in px. Min 1.                                                    |
| `h`             | number             | `200`                                   | 1..2000      | Height in px. Min 1.                                                   |
| `radius`        | number             | `0`                                     | 0..500       | Corner radius (px). Clamped to `min(w,h)/2`.                           |
| `blur`          | number             | `0`                                     | 0..200       | Edge blur radius.                                                      |
| `rotation`      | number             | `0`                                     | −180..180    | Degrees.                                                               |
| `scale`         | number             | `1.0`                                   | 0.1..4.0     | Uniform scale around center.                                           |
| `fillMode`      | string             | `"solid"`                               | enum         | `"solid"` → use `color`. `"gradient"` → use `stops` (vertical).        |
| `color`         | string             | `"#E8E8E8"`                             | —            | Solid fill.                                                            |
| `stops`         | array of `{color}` | `[{color:"#FF0055"},{color:"#0088FF"}]` | 2–6 stops    | Vertical gradient fill.                                                |
| `strokeColor`   | string             | `"#000000"`                             | —            | Stroke color.                                                          |
| `strokeWidth`   | number             | `0`                                     | 0..80        | Stroke width (px). 0 disables.                                         |
| `strokeOpacity` | number             | `1.0`                                   | 0..1         | Stroke alpha.                                                          |
| `shadowColor`   | string             | `"#000000"`                             | —            | Drop-shadow color.                                                     |
| `shadowBlur`    | number             | `0`                                     | 0..200       | Drop-shadow blur. 0 disables (clamped to 0.5 internally).              |
| `shadowX`       | number             | `0`                                     | −200..200    | Drop-shadow X offset (px).                                             |
| `shadowY`       | number             | `0`                                     | −200..200    | Drop-shadow Y offset (px). Sign flipped at uniform setup.              |
| `shadowOpacity` | number             | `0.5`                                   | 0..1         | Drop-shadow alpha.                                                     |

---

### 6.10 `circle`  *(content)*

An ellipse (circle if `w === h`) with optional gradient fill, stroke, and shadow.

Identical to `rectangle` **minus** `radius` (a circle has no corner radius);
defaults `w=240`, `h=240`. All other properties match rectangle's including
`stroke*` and `shadow*` blocks.

---

### 6.11 `liquid`  *(color — fullscreen overlay)*

Fluid-like flowing mesh gradient with **5 fixed colors**. As of v2 it's
treated as a color-effect overlay (not a content layer) — it samples the
current `col` only via opacity mixing.

| Property     | Type          | Default                                                  | Range     | Notes                                       |
| ------------ | ------------- | -------------------------------------------------------- | --------- | ------------------------------------------- |
| `seed`       | number        | `12`                                                     | 0..999    |                                             |
| `scale`      | number        | `0.42`                                                   | 0.1..2.0  |                                             |
| `turbAmp`    | number        | `0.6`                                                    | 0.1..2.0  | Turbulence amplitude.                       |
| `turbFreq`   | number        | `0.1`                                                    | 0.01..0.5 |                                             |
| `turbIter`   | number        | `7`                                                      | 3..12     |                                             |
| `waveFreq`   | number        | `3.8`                                                    | 1.0..10.0 |                                             |
| `distBias`   | number        | `0.0`                                                    | (no UI)   |                                             |
| `exposure`   | number        | `1.1`                                                    | 0.5..2.0  |                                             |
| `contrast`   | number        | `1.1`                                                    | (no UI)   |                                             |
| `saturation` | number        | `1.0`                                                    | 0..2.0    |                                             |
| `colors`     | array[string] | `["#00001A","#2962FF","#40BCFF","#FFB8B5","#FFC14F"]`    | exactly 5 | Truncated/padded to 5.                      |

> **Legacy migration:** `color0..color4` → `colors[5]`. Old `speed` → layer-level.

---

### 6.12 `noise-warp`  *(UV-prep)*

Distorts the UV coordinate for every layer below it using fBm noise.

| Property     | Type   | Default | Range     | Notes                                  |
| ------------ | ------ | ------- | --------- | -------------------------------------- |
| `str`        | number | `0.5`   | 0..2.0    | Distortion strength.                   |
| `scale`      | number | `2.0`   | 0.3..8.0  | Noise scale (higher = finer detail).   |
| `scaleX`     | number | `1.0`   | 0.1..4.0  | Anisotropic X scale.                   |
| `scaleY`     | number | `1.0`   | 0.1..4.0  | Anisotropic Y scale.                   |
| `wspd`       | number | `0.12`  | 0..1.0    | Warp drift speed over time.            |
| `oct`        | number | `4`     | 1..8      | fBm octaves.                           |
| `iterations` | number | `1`     | 1..4      | Warp iteration count. Min 1.           |
| `angle`      | number | `90`    | 0..360    | Drift direction in degrees.            |
| `noiseType`  | string | `"value"` | enum    | `"value"` \| `"perlin"` \| `"worley"`  |

---

### 6.13 `pixelate`  *(UV-prep)*

Quantizes the UV coordinate to a grid — classic pixel-art effect.

| Property | Type   | Default | Range  | Notes                                    |
| -------- | ------ | ------- | ------ | ---------------------------------------- |
| `size`   | number | `4`     | 1..64  | Pixel block size (px). Min clamped to 1. |

---

### 6.14 `ripple`  *(UV-prep)*

Radial sine ripple centered on a point in the UV plane. Affects layers
below it.

| Property | Type   | Default | Range       | Notes                                          |
| -------- | ------ | ------- | ----------- | ---------------------------------------------- |
| `cx`     | number | `0.5`   | 0..1        | Center X in UV (0..1).                         |
| `cy`     | number | `0.5`   | 0..1        | Center Y in UV.                                |
| `freq`   | number | `10.0`  | 1.0..40.0   | Ripple frequency.                              |
| `amp`    | number | `0.03`  | 0..0.2      | Ripple amplitude.                              |
| `decay`  | number | `2.0`   | 0..8.0      | Exponential falloff with distance from center. |

> **Legacy migration:** `spd` → layer-level `speed`.

---

### 6.15 `polar-remap`  *(UV-prep)*

Remaps UVs through polar coordinates with twist + radial zoom.

| Property | Type   | Default | Range       | Notes                                  |
| -------- | ------ | ------- | ----------- | -------------------------------------- |
| `cx`     | number | `0.5`   | 0..1        | Center X (UV).                         |
| `cy`     | number | `0.5`   | 0..1        | Center Y (UV).                         |
| `twist`  | number | `0`     | −6.28..6.28 | Angular twist with radius (~radians).  |
| `zoom`   | number | `1.0`   | 0.1..4.0    | Radial zoom.                           |

---

### 6.16 `flow-warp`  *(UV-prep)*

Directional noise-driven advection — like a flowing river through the UV.

| Property    | Type   | Default   | Range    | Notes                                  |
| ----------- | ------ | --------- | -------- | -------------------------------------- |
| `str`       | number | `0.3`     | 0..2.0   | Distortion strength.                   |
| `scale`     | number | `3.0`     | 0.3..8.0 | Noise scale.                           |
| `wspd`      | number | `0.5`     | 0..3.0   | Flow speed.                            |
| `angle`     | number | `0`       | 0..360   | Flow direction in degrees.             |
| `noiseType` | string | `"value"` | enum     | `"value"` \| `"perlin"` \| `"worley"`  |

---

### 6.17 `chromatic-aberration`  *(color, but CA also shifts UVs of content below)*

Offsets RGB channels along an axis. Applied to **content layers below** it.

| Property | Type   | Default | Range      | Notes                                |
| -------- | ------ | ------- | ---------- | ------------------------------------ |
| `spread` | number | `0.006` | 0..0.03    | Channel offset magnitude (UV space). |
| `angle`  | number | `0`     | 0..360     | Degrees. Offset direction.           |

---

### 6.18 `vignette`  *(color)*

Dark radial fade at the frame edges.

| Property | Type   | Default | Range     | Notes                               |
| -------- | ------ | ------- | --------- | ----------------------------------- |
| `str`    | number | `0.6`   | 0..2.0    | Darkening strength at full falloff. |
| `soft`   | number | `0.4`   | 0.05..1.5 | Softness of the falloff boundary.   |

---

### 6.19 `grain`  *(color)*

Film grain noise overlay, optionally animated and streaked.

| Property   | Type   | Default | Range  | Notes                                             |
| ---------- | ------ | ------- | ------ | ------------------------------------------------- |
| `amount`   | number | `0.08`  | 0..0.5 | Grain intensity.                                  |
| `size`     | number | `1.0`   | 0.5..6 | Grain pixel scale.                                |
| `animated` | number | `1`     | 0/1    | `0` = static, `1` = time-varying.                 |
| `streak`   | number | `0`     | 0/1    | `0` = isotropic, `1` = directional streaks.       |
| `sangle`   | number | `90`    | 0..360 | Streak angle in degrees (used when `streak = 1`). |
| `slen`     | number | `6`     | 1..20  | Streak length (used when `streak = 1`).           |

---

### 6.20 `color-grade`  *(color)*

HSL + contrast + brightness + temperature/tint adjustments.

| Property      | Type   | Default | Range     | Notes                                                                          |
| ------------- | ------ | ------- | --------- | ------------------------------------------------------------------------------ |
| `contrast`    | number | `1.0`   | 0..2.0    | `>1` increases contrast.                                                       |
| `sat`         | number | `1.0`   | 0..2.0    | Saturation (0 = grayscale).                                                    |
| `bright`      | number | `0.0`   | −0.5..0.5 | Additive brightness shift.                                                     |
| `hue`         | number | `0`     | 0..360    | Hue rotation in degrees.                                                       |
| `temperature` | number | `0`     | −1..1     | Warm/cool shift (`+r`/`−b` scaled by 0.15).                                    |
| `tint`        | number | `0`     | −1..1     | Green/magenta shift (`+g` scaled by 0.15).                                     |

---

### 6.21 `posterize`  *(color)*

Quantize luminance into `bands` levels and remap through a 4-color palette.

| Property | Type          | Default                                            | Range      | Notes                                                                         |
| -------- | ------------- | -------------------------------------------------- | ---------- | ----------------------------------------------------------------------------- |
| `bands`  | number        | `5`                                                | 2..16      | Number of luminance bands.                                                    |
| `mix`    | number        | `1.0`                                              | 0..1       | Blend between original and posterized.                                        |
| `colors` | array[string] | `["#82C67C","#336B51","#257847","#0F4140"]`        | exactly 4  | `[darkA, darkB, brightA, brightB]`. Pads/truncates to 4.                      |

> **Legacy migration:** `c1`/`c2`/`c3`/`c4` → `colors[4]`.

---

### 6.22 `scanlines`  *(color)*

Horizontal CRT-style scanline darkening, optional scroll.

| Property    | Type   | Default | Range    | Notes                                  |
| ----------- | ------ | ------- | -------- | -------------------------------------- |
| `count`     | number | `120`   | 20..600  | Number of scanlines over the frame.    |
| `dark`      | number | `0.4`   | 0..1     | Darkening amount at each line.         |
| `soft`      | number | `0.3`   | 0..1     | Line softness.                         |
| `scroll`    | number | `0`     | 0/1      | `0` = static, `1` = scrolling.         |
| `scrollspd` | number | `0.3`   | 0..2.0   | Scroll speed (used when `scroll = 1`). |

---

### 6.23 `duotone`  *(color)*

Maps luminance into a shadow/light two-color ramp.

| Property | Type          | Default                       | Range     | Notes                                    |
| -------- | ------------- | ----------------------------- | --------- | ---------------------------------------- |
| `colors` | array[string] | `["#000000","#ffffff"]`       | exactly 2 | `[shadow, light]`. Truncated/padded to 2. |
| `blend`  | number        | `1.0`                         | 0..1      | Mix between original and duotone.        |

> **Legacy migration:** `shadow`/`light` → `colors[2]`.

---

### 6.24 `bloom`  *(color)*

Soft luminance bloom — brightens above-threshold pixels.

| Property    | Type   | Default | Range     | Notes             |
| ----------- | ------ | ------- | --------- | ----------------- |
| `threshold` | number | `0.7`   | 0..1      | Luminance cutoff. |
| `strength`  | number | `0.5`   | 0..3.0    | Bloom intensity.  |
| `radius`    | number | `1.0`   | 0.25..4.0 | Bloom spread.     |

---

### 6.25 `n-tone`  *(color)*

Multi-tone luminance posterization. Up to **8 colors** mapped to bands.

| Property | Type          | Default                                                | Range     | Notes                                  |
| -------- | ------------- | ------------------------------------------------------ | --------- | -------------------------------------- |
| `bands`  | number        | `4`                                                    | 1..8      | Number of luminance bands.             |
| `mix`    | number        | `1.0`                                                  | 0..1      | Blend between original and N-tone.     |
| `colors` | array[string] | `["#0F1226","#3A2C6E","#A87BD9","#FFE7CF"]`            | 2–8 hex   | Sampled by band index (0 → first).     |

---

### 6.26 `glow`  *(color)*

Tinted soft glow — a single-color additive bloom.

| Property    | Type   | Default     | Range    | Notes                                 |
| ----------- | ------ | ----------- | -------- | ------------------------------------- |
| `threshold` | number | `0.7`       | 0..1     | Luminance cutoff.                     |
| `strength`  | number | `0.8`       | 0..3.0   | Glow intensity.                       |
| `radius`    | number | `0.5`       | 0.05..2.0| Falloff (controls smoothstep window). |
| `color`     | string | `"#FFD58A"` | —        | Tint color of the glow.               |

---

## 7. Stacking semantics

- Layers render **bottom → top**. In the JSON array, index 0 is on top.
- **UV-prep layers** (`noise-warp`, `pixelate`, `ripple`, `polar-remap`,
  `flow-warp`) and **chromatic-aberration** affect only the content layers
  **below** them in the stack. They don't produce pixels themselves.
- **Color effects** (`grain`, `vignette`, `color-grade`, `posterize`,
  `scanlines`, `duotone`, `bloom`, `n-tone`, `glow`, `liquid`) transform `col`
  at the point they appear in the walk, so they affect everything composited
  up to that point.
- Multiple UV-prep or CA layers stack additively.

## 8. Minimal examples

### Solid background + mesh gradient

```json
{
  "version": "2",
  "name": "aurora",
  "canvas": { "background": "#020816" },
  "layers": [
    {
      "type": "color-grade", "name": "Color Grade",
      "speed": 1.0, "timeOffset": 0, "paused": false,
      "properties": {
        "contrast": 1.05, "sat": 1.15, "bright": 0.0, "hue": 0,
        "temperature": 0, "tint": 0
      }
    },
    {
      "type": "mesh-gradient", "name": "Mesh Gradient",
      "speed": 1.36, "timeOffset": 0, "paused": false,
      "properties": {
        "seed": 42, "scale": 0.35,
        "scaleX": 1.0, "scaleY": 1.0, "noiseType": "value",
        "turbAmp": 0.22, "turbFreq": 0.22, "turbIter": 3,
        "waveFreq": 1.6, "distBias": 0.0,
        "exposure": 1.05, "contrast": 1.0, "saturation": 1.1,
        "colors": ["#020816", "#0F4C6B", "#1FC8A8", "#26E07A", "#7B2FFF", "#020816"]
      }
    }
  ]
}
```

### VHS-style composite

```json
{
  "version": "2",
  "name": "vhs",
  "canvas": { "background": "#0D0812" },
  "layers": [
    { "type": "scanlines", "speed": 1.0, "properties": {
      "count": 220, "dark": 0.3, "soft": 0.22, "scroll": 0, "scrollspd": 0.3
    }},
    { "type": "chromatic-aberration", "properties": {
      "spread": 0.008, "angle": 0
    }},
    { "type": "grain", "speed": 1.0, "properties": {
      "amount": 0.12, "size": 1.0, "animated": 1, "streak": 1, "sangle": 90, "slen": 6
    }},
    { "type": "vignette", "properties": {
      "str": 0.6, "soft": 0.4
    }},
    { "type": "mesh-gradient", "speed": 0.05, "properties": {
      "seed": 64, "scale": 0.38,
      "scaleX": 1.0, "scaleY": 1.0, "noiseType": "value",
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

| Concern                        | File          | Function / block                                                                    |
| ------------------------------ | ------------- | ----------------------------------------------------------------------------------- |
| Load `.frakt`                  | `engine.js`   | `onFraktUpload()` (4354) + `KNOWN_LAYER_TYPES` (4299)                               |
| Save `.frakt`                  | `engine.js`   | `saveFraktFile()` (4305) — writes `version: "2"`                                    |
| Load bundled preset            | `engine.js`   | `loadPreset()` / `loadAllPresets()` (reads `/presets/*.frakt`)                      |
| Per-type default properties    | `engine.js`   | `defaultProperties(type)` (107)                                                     |
| Per-type default layer speed   | `engine.js`   | `defaultLayerSpeed(type)` (171)                                                     |
| Animation-supporting types     | `engine.js`   | `LAYER_TYPES_WITH_ANIMATION` (162)                                                  |
| UI ranges (slider min/max)     | `engine.js`   | `getPropertyZones(l)` (1383)                                                        |
| Per-content attached effects   | `engine.js`   | `PER_LAYER_EFFECT_TYPES` (352) — runtime-only, not serialized                       |
| Layer type classification      | `renderer.js` | `CONTENT_TYPES`, `CONTENT_TYPES_WITH_FN`, `UV_PREP_TYPES` (73-75)                   |
| Uniform setup per layer        | `renderer.js` | `setUniformsForLayers()` (865)                                                      |
| Uniform declarations in shader | `renderer.js` | `glslUniformDecls()` (397)                                                          |
| Effect inline GLSL bodies      | `renderer.js` | `glslEffectInline()` (638)                                                          |
| Blend mode formulas            | `renderer.js` | `glslBlend()` (47)                                                                  |
| Legacy property migrations     | `engine.js`   | `migrateGradientProps`, `migrateMeshGradientProps`, `migrateLiquidProps`, `migrateDuotoneProps`, `migratePosterizeProps`, `migrateNoiseFieldProps`, `migrateNToneProps`, `migrateStopsProps`, plus speed/spd lift inside `createLayer()` |
