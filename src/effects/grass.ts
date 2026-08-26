import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { getScale } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { mulberry32, withAlpha } from './noise';

export interface GrassParams extends PlacedEffectParams {
  density: number;
  spread: number;
  height: number;
  sway: number;
}

interface Blade {
  ox: number;
  h: number;
  lean: number;
  width: number;
  shade: number;
  phase: number;
}

const pools = new Map<string, Blade[]>();

function ensureBlades(id: string, seed: number, n: number, spread: number): Blade[] {
  let pool = pools.get(id);
  const rand = mulberry32(seed | 0);
  if (!pool || pool.length !== n) {
    pool = [];
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      pool.push({
        ox: (t - 0.5) * spread * 220 + (rand() - 0.5) * 18,
        h: 28 + rand() * 52,
        lean: (rand() - 0.5) * 0.55,
        width: 1.2 + rand() * 1.8,
        shade: 0.55 + rand() * 0.45,
        phase: rand() * Math.PI * 2,
      });
    }
    pools.set(id, pool);
  }
  return pool;
}

export const drawGrass: DrawFn<GrassParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const scale = getScale(params);
  const n = Math.floor(24 + params.density * 90);
  const blades = ensureBlades(params.instanceId, params.seed, n, params.spread);
  const wind = scene.wind.x * 0.85 + Math.sin(t * 1.7) * 0.12;

  ctx.save();
  applyMaterial(ctx, mat);
  ctx.translate(params.x, params.y);
  ctx.scale(scale, scale);

  for (const b of blades) {
    const sway =
      (wind * params.sway + Math.sin(t * 2.4 + b.phase) * 0.22 * params.sway) * b.h * 0.02;
    const tipX = b.ox + (b.lean + sway) * b.h * 0.55;
    const tipY = -b.h * params.height;
    const midX = b.ox + (b.lean + sway * 0.55) * b.h * 0.28;
    const midY = tipY * 0.55;

    ctx.beginPath();
    ctx.moveTo(b.ox - b.width * 0.5, 0);
    ctx.quadraticCurveTo(midX - b.width * 0.15, midY, tipX, tipY);
    ctx.quadraticCurveTo(midX + b.width * 0.15, midY, b.ox + b.width * 0.5, 0);
    ctx.closePath();
    ctx.fillStyle = withAlpha(mat.baseColor, (0.55 + 0.4 * b.shade) * params.intensity);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(b.ox, 0);
    ctx.quadraticCurveTo(midX, midY, tipX, tipY);
    ctx.strokeStyle = withAlpha(mat.emissive, 0.25 * params.intensity * b.shade);
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  ctx.restore();
};

export function disposeGrassInstance(id: string): void {
  pools.delete(id);
}

export const grassEffect: EffectModule<GrassParams> = {
  id: 'grass',
  name: 'Grass',
  description: 'Wind-swaying grass patch on the ground.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'grass-default',
    x: 1100,
    y: 920,
    seed: 41,
    density: 0.75,
    spread: 1,
    height: 1,
    sway: 1,
    scale: 1,
    material: createDefaultMaterial({
      name: 'Grass Green',
      baseColor: '#3d8f2e',
      emissive: '#a8e06a',
      emissiveIntensity: 0.35,
      opacity: 1,
      roughness: 0.85,
      metalness: 0.05,
      blend: 'normal',
    }),
  },
  draw: drawGrass,
};
