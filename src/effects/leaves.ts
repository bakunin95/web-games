import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { mulberry32, withAlpha } from './noise';

export interface LeavesParams extends PlacedEffectParams {
  count: number;
  size: number;
  tumble: number;
}

interface Leaf {
  x: number;
  y: number;
  rot: number;
  spin: number;
  z: number;
}

const pools = new Map<string, Leaf[]>();

export const drawLeaves: DrawFn<LeavesParams> = (ctx, params, _t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const n = Math.floor(12 + params.count * 40);
  let pool = pools.get(params.instanceId) ?? [];
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 320,
      y: (rand() - 0.5) * 220,
      rot: rand() * Math.PI * 2,
      spin: (rand() - 0.5) * 4,
      z: 0.5 + rand() * 0.5,
    });
  }
  pool.length = n;
  pools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;

  ctx.save();
  applyMaterial(ctx, mat);
  for (const L of pool) {
    if (!scene.paused) {
      L.x += (scene.wind.x * 90 + Math.sin(L.rot) * 20) * L.z * dt;
      L.y += (25 + scene.wind.y * 40 + Math.cos(L.rot) * 15) * dt;
      L.rot += L.spin * params.tumble * dt;
      if (L.y > 140) {
        L.y = -140;
        L.x = (rand() - 0.5) * 320;
      }
    }
    const px = params.x + L.x;
    const py = params.y + L.y;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(L.rot);
    ctx.fillStyle = withAlpha(mat.baseColor, 0.75 * params.intensity);
    ctx.beginPath();
    ctx.ellipse(0, 0, 5 * params.size * L.z, 2.5 * params.size * L.z, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
};

export function disposeLeavesInstance(id: string): void {
  pools.delete(id);
}

export const leavesEffect: EffectModule<LeavesParams> = {
  id: 'leaves',
  name: 'Leaves / Debris',
  description: 'Tumbling foliage driven by wind.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'leaves-default',
    x: 1100,
    y: 700,
    seed: 26,
    count: 0.7,
    size: 1,
    tumble: 1,
    material: createDefaultMaterial({
      name: 'Autumn',
      baseColor: '#c45a1a',
      emissive: '#e8a040',
      emissiveIntensity: 0.3,
      blend: 'normal',
    }),
  },
  draw: drawLeaves,
};
