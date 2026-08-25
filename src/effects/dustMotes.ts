import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { mulberry32, withAlpha } from './noise';

export interface DustMotesParams extends PlacedEffectParams {
  count: number;
  size: number;
  drift: number;
}

interface Mote {
  x: number;
  y: number;
  phase: number;
  r: number;
}

const pools = new Map<string, Mote[]>();

export const drawDustMotes: DrawFn<DustMotesParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const n = Math.floor(20 + params.count * 80);
  let pool = pools.get(params.instanceId) ?? [];
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 200 * params.size,
      y: (rand() - 0.5) * 160 * params.size,
      phase: rand() * Math.PI * 2,
      r: 0.8 + rand() * 1.8,
    });
  }
  pool.length = n;
  pools.set(params.instanceId, pool);

  ctx.save();
  applyMaterial(ctx, mat);
  // Soft light shaft hint
  const shaft = ctx.createLinearGradient(params.x, params.y - 80 * params.size, params.x, params.y + 80 * params.size);
  shaft.addColorStop(0, withAlpha(mat.emissive, 0.08 * params.intensity * mat.emissiveIntensity));
  shaft.addColorStop(1, withAlpha(mat.emissive, 0));
  ctx.fillStyle = shaft;
  ctx.beginPath();
  ctx.moveTo(params.x - 20, params.y - 90 * params.size);
  ctx.lineTo(params.x + 20, params.y - 90 * params.size);
  ctx.lineTo(params.x + 55, params.y + 90 * params.size);
  ctx.lineTo(params.x - 55, params.y + 90 * params.size);
  ctx.closePath();
  ctx.fill();

  for (const m of pool) {
    const px = params.x + m.x + Math.sin(t * 0.4 * params.drift + m.phase) * 12;
    const py = params.y + m.y + Math.cos(t * 0.35 * params.drift + m.phase) * 10;
    const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 + m.phase));
    ctx.fillStyle = withAlpha(mat.emissive, twinkle * 0.55 * params.intensity);
    ctx.beginPath();
    ctx.arc(px, py, m.r * params.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  void scene;
};

export function disposeDustMotesInstance(id: string): void {
  pools.delete(id);
}

export const dustMotesEffect: EffectModule<DustMotesParams> = {
  id: 'dust-motes',
  name: 'Dust Motes',
  description: 'Slow floating particles in light shafts.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'dust-default',
    x: 900,
    y: 650,
    seed: 17,
    count: 0.7,
    size: 1,
    drift: 1,
    material: createDefaultMaterial({
      name: 'Dust Light',
      baseColor: '#ffe6b0',
      emissive: '#fff2d0',
      emissiveIntensity: 0.8,
      blend: 'additive',
    }),
  },
  draw: drawDustMotes,
};
