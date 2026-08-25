# VFX Playground

Standalone HTML/TypeScript playground for designing atmospheric and world visual effects for HTML5 Canvas games. Live parameter tweaking, modular effect files, Canvas 2D baseline — no game engine lock-in.

## Quick start

```bash
pnpm install
pnpm dev
```

Open the URL Vite prints (default `http://localhost:5173`).

Other scripts:

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Dev server with HMR |
| `pnpm build` | Typecheck + production build |
| `pnpm preview` | Serve the production build |
| `pnpm typecheck` | TypeScript only (`tsc --noEmit`) |

## What you get

- Full-bleed dual-canvas preview (`requestAnimationFrame` clock with pause / scrub / speed)
- Mock night-city scene context: camera pan+zoom, world size, neon lights, rain/wet flag, wind, hazard zones
- Modular effects (`one file ≈ one draw function`) with a consistent API
- World-space FX and screen-space overlays (second canvas + optional CSS layer)
- Live Tweakpane UI for enable, intensity, colors, wind, time, and per-effect knobs

### Shipped demo effects

| Effect | Space | File |
| --- | --- | --- |
| Rain | world | `src/effects/rain.ts` |
| Hazard Atmosphere | world | `src/effects/hazardAtmosphere.ts` |
| Embers / Smoke | world | `src/effects/embers.ts` |
| Neon Bloom Overlay | screen | `src/effects/neonBloom.ts` |
| Fire *(creatable)* | world | `src/effects/fire.ts` |
| Smoke *(creatable)* | world | `src/effects/smoke.ts` |
| Sparks *(creatable)* | world | `src/effects/sparks.ts` |
| Water *(creatable)* | world | `src/effects/water.ts` |

### Create new VFX

Use the **+ Create VFX** button in the header (or the **Create VFX** folder in the panel):

1. Pick a type: **Fire**, **Smoke**, **Sparks**, or **Water**
2. A new instance spawns near the camera with a **randomized seed / colors / size / spread** (water also randomizes width/height/waves) so each create looks different
3. Tweak `x` / `y` (and for water: `width` / `height`), colors, intensity, etc. live — or hit **Remove**

Creatable templates live in `CREATABLE_EFFECTS` (`src/effects/index.ts`). Add a new emitter module there to show up in the menu.

Fire uses layered heat (cool → mid → hot core) + fbm turbulence + embers. Smoke uses soft expanding puffs with lit edges. Water is an elliptical body with ripples, scene-light reflections, and shore foam.


## Project layout

```
src/
  core/           # types, scene defaults, RAF loop (portable)
  effects/        # UI-free effect modules (reuse these in games)
  playground/     # mock scene, renderer, camera, Tweakpane UI
  main.ts         # boots the playground
  styles.css
index.html
```

## Effect draw API

Every effect exports an `EffectModule`:

```ts
draw(ctx, params, t, scene)
```

- `ctx` — `CanvasRenderingContext2D` (already in world space for `space: 'world'`, viewport pixels for `space: 'screen'`)
- `params` — effect knobs (`enabled`, `intensity`, plus effect-specific fields)
- `t` — seconds (supports scrub when paused)
- `scene` — mock/production scene context (camera, wind, lights, hazards, wet flag, viewport)

Effects must not import playground UI code.

## Add an effect

1. Create `src/effects/myEffect.ts` implementing `EffectModule` (copy `rain.ts` as a template).
2. Register it in `src/effects/index.ts` (`EFFECTS` array).
3. Run `pnpm dev` — the playground auto-builds Tweakpane controls from `defaultParams`.

### Export / reuse in another game

Copy the effect file (and `src/core/types.ts` if you want the shared types). Call `draw` each frame with your own `SceneContext`-compatible object. No Vite or Tweakpane required at runtime.

```ts
import { drawRain } from './effects/rain';

function frame(ctx, scene, t) {
  drawRain(ctx, rainParams, t, scene);
}
```

## License policy (commercial-safe)

Only dependencies that are free for commercial use (MIT / Apache-2.0 / BSD / ISC or equivalent) are allowed.

| Package | License | Role |
| --- | --- | --- |
| [vite](https://github.com/vitejs/vite) | MIT | Dev server / bundler |
| [typescript](https://github.com/microsoft/TypeScript) | Apache-2.0 | Types / compile |
| [tweakpane](https://github.com/cocopon/tweakpane) | MIT | Live parameter UI |

Application source in this repository is intended for reuse in commercial HTML5/Canvas games. Do not add GPL/CC-BY-NC/proprietary packages.

## Controls

- **Drag** canvas — pan camera
- **Scroll** — zoom
- **Panel** — enable/disable effects, intensity, colors, wind, pause, scrub time, CSS overlay

## Non-goals (v1)

Full gameplay, level editor, asset pipelines, WebGL-only effects without a Canvas path, audio-reactive lab.
