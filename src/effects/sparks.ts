import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { mulberry32, withAlpha } from './noise';

export interface SparksParams extends PlacedEffectParams {
  size: number;
  spread: number;
  speed: number;
  count: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

const pools = new Map<string, Spark[]>();

function ensurePool(params: SparksParams): Spark[] {
  let pool = pools.get(params.instanceId);
  if (!pool) {
    pool = [];
    pools.set(params.instanceId, pool);
  }
  const target = Math.floor(20 + params.count * 90 * params.intensity);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < target) pool.push(spawn(rand, params));
  if (pool.length > target) pool.length = target;
  return pool;
}

function spawn(rand: () => number, params: SparksParams): Spark {
  const angle = -Math.PI / 2 + (rand() - 0.5) * Math.PI * 0.9 * params.spread;
  const spd = (80 + rand() * 160) * params.speed;
  return {
    x: (rand() - 0.5) * 8,
    y: (rand() - 0.5) * 4,
    vx: Math.cos(angle) * spd,
    vy: Math.sin(angle) * spd,
    life: rand() * 0.2,
    maxLife: 0.35 + rand() * 0.7,
  };
}

export const drawSparks: DrawFn<SparksParams> = (ctx, params, _t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const color = mat.emissive;
  const pool = ensurePool(params);
  const dt = scene.dt || 1 / 60;
  const rand = mulberry32((params.seed + 99) | 0);

  ctx.save();
  applyMaterial(ctx, mat);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';

  for (const s of pool) {
    if (!scene.paused) {
      s.life += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 180 * dt;
      s.vx += scene.wind.x * 40 * dt;
      if (s.life >= s.maxLife) {
        Object.assign(s, spawn(rand, params));
        s.life = 0;
      }
    }

    const p = s.life / s.maxLife;
    const alpha = (1 - p) * 0.95 * params.intensity * mat.emissiveIntensity;
    const px = params.x + s.x;
    const py = params.y + s.y;
    const len = (6 + (1 - p) * 10) * params.size;

    ctx.globalAlpha = Math.min(1, alpha * mat.opacity);
    ctx.lineWidth = (1.2 + (1 - p) * 1.8) * params.size;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - s.vx * 0.02 * len, py - s.vy * 0.02 * len);
    ctx.stroke();

    ctx.fillStyle = withAlpha(mat.baseColor, alpha);
    ctx.beginPath();
    ctx.arc(px, py, 1.2 * params.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};

export function disposeSparksInstance(instanceId: string): void {
  pools.delete(instanceId);
}

export const sparksEffect: EffectModule<SparksParams> = {
  id: 'sparks',
  name: 'Sparks',
  description: 'Spark burst emitter driven by material colors and blend.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'sparks-default',
    x: 1300,
    y: 800,
    seed: 3,
    size: 1,
    spread: 1,
    speed: 1,
    count: 0.7,
    material: createDefaultMaterial({
      name: 'Neon Sparks',
      baseColor: '#ffd36a',
      emissive: '#fff4b0',
      emissiveIntensity: 1.4,
      blend: 'additive',
      roughness: 0.2,
      metalness: 0.5,
    }),
  },
  draw: drawSparks,
};
