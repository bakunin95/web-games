import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { mulberry32, withAlpha } from './noise';

export interface FirefliesParams extends PlacedEffectParams {
  count: number;
  size: number;
  wander: number;
}

interface Bug {
  x: number;
  y: number;
  phase: number;
  speed: number;
}

const pools = new Map<string, Bug[]>();

export const drawFireflies: DrawFn<FirefliesParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const n = Math.floor(10 + params.count * 40);
  let pool = pools.get(params.instanceId) ?? [];
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 220,
      y: (rand() - 0.5) * 160,
      phase: rand() * Math.PI * 2,
      speed: 0.4 + rand() * 0.8,
    });
  }
  pool.length = n;
  pools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;

  ctx.save();
  applyMaterial(ctx, mat);
  for (const b of pool) {
    if (!scene.paused) {
      b.x += Math.sin(t * b.speed + b.phase) * 18 * params.wander * dt;
      b.y += Math.cos(t * b.speed * 0.8 + b.phase) * 14 * params.wander * dt;
    }
    const blink = 0.15 + 0.85 * Math.max(0, Math.sin(t * 3 * b.speed + b.phase));
    const px = params.x + b.x;
    const py = params.y + b.y;
    const g = ctx.createRadialGradient(px, py, 0, px, py, 6 * params.size);
    g.addColorStop(0, withAlpha(mat.emissive, blink * params.intensity * mat.emissiveIntensity));
    g.addColorStop(1, withAlpha(mat.emissive, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, 6 * params.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

export function disposeFirefliesInstance(id: string): void {
  pools.delete(id);
}

export const firefliesEffect: EffectModule<FirefliesParams> = {
  id: 'fireflies',
  name: 'Fireflies',
  description: 'Soft blinking sprites with lazy paths.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'fireflies-default',
    x: 950,
    y: 720,
    seed: 27,
    count: 0.7,
    size: 1,
    wander: 1,
    material: createDefaultMaterial({
      name: 'Glow Bug',
      baseColor: '#b8ff6a',
      emissive: '#e8ffb0',
      emissiveIntensity: 1.2,
      blend: 'additive',
    }),
  },
  draw: drawFireflies,
};
