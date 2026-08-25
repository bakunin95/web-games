import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { mulberry32, withAlpha } from './noise';

export interface SandstormParams extends PlacedEffectParams {
  width: number;
  height: number;
  density: number;
  speed: number;
}

interface Speck {
  x: number;
  y: number;
  z: number;
}

const pools = new Map<string, Speck[]>();

export const drawSandstorm: DrawFn<SandstormParams> = (ctx, params, _t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const hw = params.width * 0.5;
  const hh = params.height * 0.5;
  const n = Math.floor(80 + params.density * 220);
  let pool = pools.get(params.instanceId) ?? [];
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({ x: (rand() - 0.5) * 2, y: (rand() - 0.5) * 2, z: 0.3 + rand() * 0.7 });
  }
  pool.length = n;
  pools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;

  ctx.save();
  applyMaterial(ctx, mat);
  // Horizon wash
  const wash = ctx.createLinearGradient(params.x, params.y - hh, params.x, params.y + hh);
  wash.addColorStop(0, withAlpha(mat.baseColor, 0.05 * params.intensity));
  wash.addColorStop(0.6, withAlpha(mat.baseColor, 0.22 * params.intensity * params.density));
  wash.addColorStop(1, withAlpha(mat.baseColor, 0.08 * params.intensity));
  ctx.fillStyle = wash;
  ctx.fillRect(params.x - hw, params.y - hh, hw * 2, hh * 2);

  ctx.fillStyle = mat.emissive;
  for (const s of pool) {
    if (!scene.paused) {
      s.x += (0.4 + s.z) * params.speed * dt * (1.2 + scene.wind.x);
      if (s.x > 1) s.x -= 2;
      if (s.x < -1) s.x += 2;
    }
    const px = params.x + s.x * hw;
    const py = params.y + s.y * hh;
    ctx.globalAlpha = (0.15 + s.z * 0.35) * params.intensity;
    ctx.fillRect(px, py, 2 + s.z * 3, 1);
  }
  ctx.restore();
};

export function disposeSandstormInstance(id: string): void {
  pools.delete(id);
}

export const sandstormEffect: EffectModule<SandstormParams> = {
  id: 'sandstorm',
  name: 'Sandstorm',
  description: 'Dense particulate sheets with horizon wash.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'sandstorm-default',
    x: 1200,
    y: 750,
    seed: 16,
    width: 700,
    height: 280,
    density: 0.8,
    speed: 1,
    material: createDefaultMaterial({
      name: 'Sand',
      baseColor: '#c4a574',
      emissive: '#e8d4a8',
      emissiveIntensity: 0.35,
      blend: 'normal',
      opacity: 0.9,
    }),
  },
  draw: drawSandstorm,
};
