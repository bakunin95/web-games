# web-games

## Cursor Cloud specific instructions

### Current repository state
- As of this environment setup, the repository is **empty** — it contains only `.gitignore` (and this `AGENTS.md`). There is **no application code, `package.json`, lockfile, or build config yet**.
- Because there is no project, there is currently nothing to lint, test, build, or run. Once source is added, update this section with the real commands.

### Toolchain available on the VM
- Node.js `v22`, npm `10`, pnpm `10`, and yarn `1` are preinstalled and verified working (dependency install + run confirmed for both npm and pnpm).
- `nvm` is present. The `.gitignore` targets a JS/TS web stack (Next.js/Nuxt/Vite/Turbo entries), so `pnpm` is the preferred package manager unless a lockfile dictates otherwise.

### Dependency refresh (startup update script)
- The startup update script is intentionally **guarded**: it installs dependencies only when a `package.json` exists, using the package manager that matches the present lockfile (`pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `package-lock.json` → npm; otherwise npm). This is a no-op while the repo is empty, so it stays safe until real code lands.

### When code is added later
- Add the actual dev/lint/test/build commands here (e.g. `pnpm dev`, `pnpm lint`, `pnpm test`, `pnpm build`) and confirm the guarded update script still matches the chosen package manager/lockfile.
