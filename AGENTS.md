# web-games

VFX Playground — atmospheric Canvas 2D effects with live parameter tweaking. See `README.md` for run instructions, effect API, and license policy.

## Cursor Cloud specific instructions

### Services
- **VFX Playground (Vite)** — only app in this repo. Start with `pnpm dev` (binds `0.0.0.0:5173`). Production check: `pnpm build` then `pnpm preview` on port `4173`.

### Commands
- Install: `pnpm install` (lockfile: `pnpm-lock.yaml`)
- Typecheck: `pnpm typecheck`
- Build: `pnpm build`
- There is no separate lint script yet; `pnpm typecheck` / `pnpm build` are the compile gates.
- Standard scripts and effect authoring notes live in `README.md` — prefer that over duplicating here.

### Gotchas
- Dual canvas + CSS overlay: `#world-canvas` (world FX), `#overlay-canvas` (screen FX), `#css-overlay` (DOM atmosphere). Effect modules under `src/effects/` must stay UI-free.
- **Create VFX:** header button `#create-vfx-btn` (and the panel "Create VFX" folder) spawns randomized Fire / Smoke / Sparks / Water instances into `runtimes`. Templates are `CREATABLE_EFFECTS` in `src/effects/index.ts`.
- Camera: drag to pan, scroll to zoom on `#stage`. Tweakpane sits in `#panel` and should not steal canvas drags (pointer handler ignores `.tp-dfwv`).
- After dependency changes, restart `pnpm dev` if HMR misses a new package.
