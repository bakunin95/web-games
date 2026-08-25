import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial } from '../core/material';
import { createDefaultMaterial } from '../core/material';
import { fbm2, mulberry32, withAlpha, lerpColor } from './noise';

export interface FireParams extends PlacedEffectParams {
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
  layer: 0 | 1 | 2 | 3;
  lean: number;
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

  // Dense overlapping tongues → long-exposure luminous mass
  const flameTarget = Math.floor(55 + params.intensity * 110 * params.size);
  const rand = mulberry32(params.seed | 0);
  while (state.flames.length < flameTarget) {
    const r = rand();
    const layer = (r < 0.28 ? 0 : r < 0.55 ? 1 : r < 0.82 ? 2 : 3) as 0 | 1 | 2 | 3;
    state.flames.push({
      ox: (rand() - 0.5) * 2,
      life: rand(),
      maxLife: 0.4 + rand() * 0.75,
      phase: rand() * Math.PI * 2,
      size: 5 + rand() * 18,
      layer,
      lean: (rand() - 0.5) * 0.8,
    });
  }
  if (state.flames.length > flameTarget) state.flames.length = flameTarget;

  const emberTarget = Math.floor(params.embers * 36 * params.intensity);
  while (state.embers.length < emberTarget) {
    state.embers.push(spawnEmber(rand, params));
  }
  if (state.embers.length > emberTarget) state.embers.length = emberTarget;

  return state;
}

function spawnEmber(rand: () => number, params: FireParams): Ember {
  return {
    x: (rand() - 0.5) * 22 * params.spread,
    y: -rand() * 12,
    vx: (rand() - 0.5) * 50,
    vy: -(50 + rand() * 100) * params.rise,
    life: 0,
    maxLife: 0.9 + rand() * 1.8,
    size: 0.8 + rand() * 2.4,
  };
}

export const drawFire: DrawFn<FireParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const colorHot = mat.emissive;
  const colorMid = mat.baseColor;
  const colorCool = lerpColor(mat.baseColor, '#4a0a00', 0.35);
  const colorDeep = lerpColor(mat.baseColor, '#1a0200', 0.55);
  const state = ensureState(params);
  const dt = scene.dt || 1 / 60;
  const rand = mulberry32((params.seed + 42) | 0);
  const wind = scene.wind.x;
  const ei = mat.emissiveIntensity;
  const flicker =
    0.88 +
    0.12 * Math.sin(t * 11.3) +
    0.06 * fbm2(t * 2.1, params.seed * 0.01, 2, params.seed);
  const I = params.intensity * flicker;

  ctx.save();
  applyMaterial(ctx, mat);

  // Broad warm ground spill (campfire illuminates dirt/rock)
  const spillR = 78 * params.size * params.spread;
  const spill = ctx.createRadialGradient(params.x, params.y + 10, 2, params.x, params.y + 10, spillR);
  spill.addColorStop(0, withAlpha(colorMid, 0.55 * I * ei));
  spill.addColorStop(0.35, withAlpha(colorCool, 0.22 * I));
  spill.addColorStop(0.7, withAlpha(colorDeep, 0.08 * I));
  spill.addColorStop(1, withAlpha(colorDeep, 0));
  ctx.fillStyle = spill;
  ctx.beginPath();
  ctx.ellipse(params.x, params.y + 12, spillR, spillR * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  // Soft volumetric haze column above the fire (subtle smoke glow)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const hazeH = 95 * params.size * params.rise;
  const haze = ctx.createLinearGradient(params.x, params.y, params.x + wind * 40, params.y - hazeH);
  haze.addColorStop(0, withAlpha(colorHot, 0.18 * I * ei));
  haze.addColorStop(0.35, withAlpha(colorMid, 0.08 * I));
  haze.addColorStop(1, withAlpha(colorCool, 0));
  ctx.fillStyle = haze;
  ctx.beginPath();
  ctx.ellipse(params.x + wind * 18, params.y - hazeH * 0.45, 28 * params.size * params.spread, hazeH * 0.55, wind * 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Ember bed / log glow at base
  const bed = ctx.createRadialGradient(params.x, params.y + 4, 0, params.x, params.y + 4, 22 * params.size);
  bed.addColorStop(0, withAlpha('#fff8e0', 0.7 * I * ei));
  bed.addColorStop(0.4, withAlpha(colorHot, 0.55 * I * ei));
  bed.addColorStop(0.75, withAlpha(colorMid, 0.25 * I));
  bed.addColorStop(1, withAlpha(colorDeep, 0));
  ctx.fillStyle = bed;
  ctx.beginPath();
  ctx.ellipse(params.x, params.y + 5, 26 * params.size * params.spread, 10 * params.size, 0, 0, Math.PI * 2);
  ctx.fill();

  const ordered = [...state.flames].sort((a, b) => a.layer - b.layer);

  for (const f of ordered) {
    if (!scene.paused) {
      f.life += dt;
      if (f.life >= f.maxLife) {
        f.life = 0;
        f.maxLife = 0.35 + rand() * 0.7;
        f.ox = (rand() - 0.5) * 2;
        f.phase = rand() * Math.PI * 2;
        f.size = 5 + rand() * 18;
        f.lean = (rand() - 0.5) * 0.8;
        const r = rand();
        f.layer = (r < 0.28 ? 0 : r < 0.55 ? 1 : r < 0.82 ? 2 : 3) as 0 | 1 | 2 | 3;
      }
    }

    const p = f.life / f.maxLife;
    const age = 1 - p;
    // Compact campfire: modest rise, dense base
    const riseMul = (0.42 + params.rise * 0.7) * (1.2 - f.layer * 0.08);
    const height = (22 + f.size * 2.6) * params.size * riseMul;
    const turb =
      fbm2(f.ox * 3.5 + f.phase, t * (2.2 + params.turbulence) + f.phase, 4, params.seed) *
      params.turbulence *
      18 *
      params.spread;
    const sway =
      Math.sin(t * 4.1 + f.phase) * 5 * params.spread +
      wind * (14 + p * 36) +
      turb +
      f.lean * 10 * p;

    const pinch = 1 - p * 0.55;
    const px = params.x + f.ox * 18 * params.spread * (0.55 + p * 0.6) * pinch + sway * p;
    const py = params.y - p * height;

    const layerAlpha =
      f.layer === 0 ? 0.16 : f.layer === 1 ? 0.28 : f.layer === 2 ? 0.42 : 0.62;
    const alpha = age * layerAlpha * I * ei;
    const radius =
      f.size *
      params.size *
      (f.layer === 0 ? 1.7 : f.layer === 1 ? 1.25 : f.layer === 2 ? 0.9 : 0.55) *
      (0.65 + age * 0.55) *
      (1 + p * 0.2) *
      pinch;

    const color =
      f.layer === 3 ? colorHot : f.layer === 2 ? colorMid : f.layer === 1 ? colorCool : colorDeep;
    const coreHex = f.layer >= 3 ? '#ffffff' : f.layer === 2 ? '#fff6c8' : color;

    const g = ctx.createRadialGradient(px, py, 0, px, py, radius);
    g.addColorStop(0, withAlpha(coreHex, alpha));
    g.addColorStop(0.2, withAlpha(f.layer >= 2 ? colorHot : color, alpha * 0.9));
    g.addColorStop(0.55, withAlpha(color, alpha * 0.45));
    g.addColorStop(0.82, withAlpha(colorCool, alpha * 0.18));
    g.addColorStop(1, withAlpha(colorDeep, 0));
    ctx.fillStyle = g;
    // Tall soft ellipses that stack into a luminous mass
    const stretch = 1.35 + p * 0.55;
    ctx.beginPath();
    ctx.ellipse(px, py, radius * 0.55 * pinch, radius * stretch, sway * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }

  // Blown-out white/yellow core (campfire signature)
  const coreR = 22 * params.size;
  const core = ctx.createRadialGradient(params.x, params.y - 6, 0, params.x, params.y - 6, coreR);
  core.addColorStop(0, withAlpha('#ffffff', 0.95 * I * ei));
  core.addColorStop(0.18, withAlpha('#fff8d6', 0.85 * I * ei));
  core.addColorStop(0.4, withAlpha(colorHot, 0.65 * I * ei));
  core.addColorStop(0.7, withAlpha(colorMid, 0.28 * I));
  core.addColorStop(1, withAlpha(colorMid, 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(params.x, params.y - 4, coreR * 0.72, coreR * 1.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rising sparks / embers
  for (const e of state.embers) {
    if (!scene.paused) {
      e.life += dt;
      const n = fbm2(e.x * 0.05, t * 1.6 + e.y * 0.02, 2, params.seed + 7);
      e.vx += (n * 70 + wind * 30) * dt;
      e.vy -= 30 * params.rise * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.life >= e.maxLife || e.y < -180) Object.assign(e, spawnEmber(rand, params));
    }
    const ep = e.life / e.maxLife;
    const a = (1 - ep) * 0.95 * I * params.embers * ei;
    if (a <= 0.02) continue;
    const glow = ctx.createRadialGradient(
      params.x + e.x,
      params.y + e.y,
      0,
      params.x + e.x,
      params.y + e.y,
      e.size * 3,
    );
    glow.addColorStop(0, withAlpha(ep < 0.35 ? '#ffffff' : colorHot, a));
    glow.addColorStop(0.4, withAlpha(colorMid, a * 0.5));
    glow.addColorStop(1, withAlpha(colorMid, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(params.x + e.x, params.y + e.y, e.size * 3 * (1 - ep * 0.4), 0, Math.PI * 2);
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
  description: 'Campfire-style luminous mass: blown-out core, soft tongues, ground spill.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'fire-default',
    x: 900,
    y: 790,
    seed: 1,
    size: 1.15,
    spread: 0.95,
    rise: 0.85,
    turbulence: 0.9,
    embers: 0.75,
    material: createDefaultMaterial({
      name: 'Fire / Magma',
      baseColor: '#ff3b10',
      emissive: '#fff1c1',
      emissiveIntensity: 1.35,
      blend: 'additive',
      roughness: 0.35,
      metalness: 0.1,
    }),
  },
  draw: drawFire,
};
