import type { BaseEffectParams, DrawFn, EffectModule } from '../core/types';
import { fbm2, mulberry32, withAlpha } from './noise';

export interface FireParams extends BaseEffectParams {
  instanceId: string;
  x: number;
  y: number;
  seed: number;
  colorHot: string;
  colorMid: string;
  colorCool: string;
  size: number;
  spread: number;
  rise: number;
  turbulence: number;
  embers: number;
}

interface Flame {
  ox: number;
  life: number;
  maxLife: number;
  phase: number;
  size: number;
  layer: 0 | 1 | 2;
}

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

interface FireState {
  flames: Flame[];
  embers: Ember[];
}

const states = new Map<string, FireState>();

function ensureState(params: FireParams): FireState {
  let state = states.get(params.instanceId);
  if (!state) {
    state = { flames: [], embers: [] };
    states.set(params.instanceId, state);
  }

  const flameTarget = Math.floor(36 + params.intensity * 90 * params.size);
  const rand = mulberry32(params.seed | 0);
  while (state.flames.length < flameTarget) {
    const layer = (rand() < 0.35 ? 0 : rand() < 0.7 ? 1 : 2) as 0 | 1 | 2;
    state.flames.push({
      ox: (rand() - 0.5) * 2,
      life: rand(),
      maxLife: 0.55 + rand() * 0.85,
      phase: rand() * Math.PI * 2,
      size: 6 + rand() * 14,
      layer,
    });
  }
  if (state.flames.length > flameTarget) state.flames.length = flameTarget;

  const emberTarget = Math.floor(params.embers * 28 * params.intensity);
  while (state.embers.length < emberTarget) {
    state.embers.push(spawnEmber(rand, params));
  }
  if (state.embers.length > emberTarget) state.embers.length = emberTarget;

  return state;
}

function spawnEmber(rand: () => number, params: FireParams): Ember {
  return {
    x: (rand() - 0.5) * 18 * params.spread,
    y: -rand() * 10,
    vx: (rand() - 0.5) * 40,
    vy: -(40 + rand() * 80) * params.rise,
    life: 0,
    maxLife: 0.8 + rand() * 1.6,
    size: 1 + rand() * 2.2,
  };
}

/**
 * Layered additive fire: cool outer envelope → mid orange → hot white core,
 * plus turbulence via fbm and rising embers.
 */
export const drawFire: DrawFn<FireParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const state = ensureState(params);
  const dt = scene.dt || 1 / 60;
  const rand = mulberry32((params.seed + 42) | 0);
  const wind = scene.wind.x;

  ctx.save();

  // Soft ground heat / light spill (drawn under flames)
  ctx.globalCompositeOperation = 'lighter';
  const spillR = 55 * params.size * params.spread;
  const spill = ctx.createRadialGradient(params.x, params.y + 6, 2, params.x, params.y + 6, spillR);
  spill.addColorStop(0, withAlpha(params.colorMid, 0.35 * params.intensity));
  spill.addColorStop(0.45, withAlpha(params.colorCool, 0.12 * params.intensity));
  spill.addColorStop(1, withAlpha(params.colorCool, 0));
  ctx.fillStyle = spill;
  ctx.beginPath();
  ctx.ellipse(params.x, params.y + 8, spillR, spillR * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sort so cool outer layers draw first, hot core last
  const ordered = [...state.flames].sort((a, b) => a.layer - b.layer);

  for (const f of ordered) {
    if (!scene.paused) {
      f.life += dt;
      if (f.life >= f.maxLife) {
        f.life = 0;
        f.maxLife = 0.5 + rand() * 0.9;
        f.ox = (rand() - 0.5) * 2;
        f.phase = rand() * Math.PI * 2;
        f.size = 5 + rand() * 16;
        f.layer = (rand() < 0.3 ? 0 : rand() < 0.65 ? 1 : 2) as 0 | 1 | 2;
      }
    }

    const p = f.life / f.maxLife;
    const age = 1 - p;

    // Vertical travel — hotter layers rise a bit less / stay denser near base
    const riseMul = (0.55 + params.rise * 0.9) * (1.15 - f.layer * 0.12);
    const height = (28 + f.size * 3.2) * params.size * riseMul;

    const turb =
      fbm2(f.ox * 3 + f.phase, t * (1.6 + params.turbulence) + f.phase, 3, params.seed) *
      params.turbulence *
      22 *
      params.spread;
    const sway =
      Math.sin(t * 3.2 + f.phase) * 6 * params.spread +
      wind * (18 + p * 40) +
      turb;

    const px = params.x + f.ox * 22 * params.spread * (0.4 + p) + sway * p;
    const py = params.y - p * height;

    // Shrink + fade; cool layer more transparent
    const layerAlpha = f.layer === 0 ? 0.22 : f.layer === 1 ? 0.38 : 0.55;
    const alpha = age * layerAlpha * params.intensity;
    const radius =
      f.size *
      params.size *
      (f.layer === 0 ? 1.55 : f.layer === 1 ? 1.15 : 0.75) *
      (0.55 + age * 0.7) *
      (1 + p * 0.35);

    const color =
      f.layer === 2 ? params.colorHot : f.layer === 1 ? params.colorMid : params.colorCool;

    // Teardrop-ish: vertical stretch via ellipse
    const g = ctx.createRadialGradient(px, py, 0, px, py, radius);
    g.addColorStop(0, withAlpha(f.layer === 2 ? '#ffffff' : color, alpha));
    g.addColorStop(0.25, withAlpha(color, alpha * 0.85));
    g.addColorStop(0.65, withAlpha(params.colorCool, alpha * 0.35));
    g.addColorStop(1, withAlpha(params.colorCool, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, py, radius * 0.72, radius * 1.15, sway * 0.01, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bright base core
  const coreR = 18 * params.size;
  const core = ctx.createRadialGradient(params.x, params.y - 4, 0, params.x, params.y - 4, coreR);
  core.addColorStop(0, withAlpha('#fff6d5', 0.85 * params.intensity));
  core.addColorStop(0.35, withAlpha(params.colorHot, 0.55 * params.intensity));
  core.addColorStop(1, withAlpha(params.colorMid, 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(params.x, params.y - 2, coreR * 0.7, coreR, 0, 0, Math.PI * 2);
  ctx.fill();

  // Embers
  for (const e of state.embers) {
    if (!scene.paused) {
      e.life += dt;
      const n = fbm2(e.x * 0.05, t * 1.4 + e.y * 0.02, 2, params.seed + 7);
      e.vx += (n * 60 + wind * 25) * dt;
      e.vy -= 25 * params.rise * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.life >= e.maxLife || e.y < -160) {
        Object.assign(e, spawnEmber(rand, params));
      }
    }
    const ep = e.life / e.maxLife;
    const a = (1 - ep) * 0.9 * params.intensity * params.embers;
    if (a <= 0.02) continue;
    ctx.fillStyle = withAlpha(ep < 0.4 ? params.colorHot : params.colorMid, a);
    ctx.beginPath();
    ctx.arc(params.x + e.x, params.y + e.y, e.size * (1 - ep * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};

export function disposeFireInstance(instanceId: string): void {
  states.delete(instanceId);
}

export const fireEffect: EffectModule<FireParams> = {
  id: 'fire',
  name: 'Fire',
  description: 'Realistic layered fire with turbulence and embers.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'fire-default',
    x: 900,
    y: 790,
    seed: 1,
    colorHot: '#fff1c1',
    colorMid: '#ff9a3c',
    colorCool: '#ff3b10',
    size: 1,
    spread: 1,
    rise: 1,
    turbulence: 0.85,
    embers: 0.7,
  },
  draw: drawFire,
};
