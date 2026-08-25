import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { mulberry32 } from './noise';

export interface SnowParams extends PlacedEffectParams {
  density: number;
  size: number;
  depth: number;
}

interface Flake {
  x: number;
  y: number;
  z: number;
  rot: number;
  spin: number;
}

const pools = new Map<string, Flake[]>();

export const drawSnow: DrawFn<SnowParams> = (ctx, params, _t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const count = Math.floor(40 + params.density * 160 * params.intensity);
  let pool = pools.get(params.instanceId);
  if (!pool) pool = [];
  const rand = mulberry32(params.seed | 0);
  const areaW = 500 * params.size;
  const areaH = 400 * params.size;
  while (pool.length < count) {
    pool.push({
      x: (rand() - 0.5) * areaW,
      y: (rand() - 0.5) * areaH,
      z: 0.35 + rand() * 0.65,
      rot: rand() * Math.PI,
      spin: (rand() - 0.5) * 2,
    });
  }
  if (pool.length > count) pool.length = count;
  pools.set(params.instanceId, pool);

  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);

  for (const f of pool) {
    if (!scene.paused) {
      f.x += (scene.wind.x * 60 * f.z + Math.sin(f.rot) * 10) * dt;
      f.y += (35 + f.z * 55) * dt;
      f.rot += f.spin * dt;
      if (f.y > areaH * 0.55) {
        // ground settle flicker then recycle
        f.y = -areaH * 0.55;
        f.x = (rand() - 0.5) * areaW;
      }
      if (f.x < -areaW * 0.55) f.x += areaW;
      if (f.x > areaW * 0.55) f.x -= areaW;
    }
    const depthScale = 0.5 + f.z * 0.8 * params.depth;
    const r = (1.2 + f.z * 2.2) * params.size * depthScale;
    ctx.globalAlpha = (0.35 + f.z * 0.5) * params.intensity * mat.opacity;
    ctx.fillStyle = mat.emissive;
    ctx.beginPath();
    ctx.arc(params.x + f.x, params.y + f.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

export function disposeSnowInstance(id: string): void {
  pools.delete(id);
}

export const snowEffect: EffectModule<SnowParams> = {
  id: 'snow',
  name: 'Snow / Blizzard',
  description: 'Wind-driven snow with depth layers.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'snow-default',
    x: 1200,
    y: 600,
    seed: 13,
    density: 0.7,
    size: 1,
    depth: 1,
    material: createDefaultMaterial({
      name: 'Snow',
      baseColor: '#c8d8f0',
      emissive: '#f2f7ff',
      emissiveIntensity: 0.6,
      blend: 'normal',
      opacity: 0.9,
    }),
  },
  draw: drawSnow,
};
