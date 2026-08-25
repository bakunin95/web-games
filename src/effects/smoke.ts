import type { BaseEffectParams, DrawFn, EffectModule } from '../core/types';
import { fbm2, mulberry32, withAlpha } from './noise';

export interface SmokeParams extends BaseEffectParams {
  instanceId: string;
  x: number;
  y: number;
  seed: number;
  color: string;
  colorLit: string;
  size: number;
  spread: number;
  rise: number;
  density: number;
  turbulence: number;
}

interface Puff {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  seed: number;
}

const pools = new Map<string, Puff[]>();

function ensurePool(params: SmokeParams): Puff[] {
  let pool = pools.get(params.instanceId);
  if (!pool) {
    pool = [];
    pools.set(params.instanceId, pool);
  }
  const target = Math.floor(28 + params.density * 70 * params.intensity);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < target) {
    pool.push(spawnPuff(rand, params));
  }
  if (pool.length > target) pool.length = target;
  return pool;
}

function spawnPuff(rand: () => number, params: SmokeParams): Puff {
  return {
    x: (rand() - 0.5) * 24 * params.spread,
    y: (rand() - 0.5) * 8,
    life: rand() * 0.3,
    maxLife: 2.2 + rand() * 3.5,
    vx: (rand() - 0.5) * 18 * params.spread,
    vy: -(12 + rand() * 22) * params.rise,
    size: 14 + rand() * 30,
    spin: (rand() - 0.5) * 0.6,
    seed: rand() * 1000,
  };
}

/**
 * Soft volumetric smoke: expanding puffs, fbm curl, lit edges vs dark cores.
 */
export const drawSmoke: DrawFn<SmokeParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const pool = ensurePool(params);
  const dt = scene.dt || 1 / 60;
  const rand = mulberry32((params.seed ^ 0x9e3779b9) | 0);
  const wind = scene.wind.x;

  // Draw dark body first, then subtle lit rims
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  // Back-to-front by size/age roughly — larger/older first
  const sorted = [...pool].sort((a, b) => b.size - a.size);

  for (const p of sorted) {
    if (!scene.paused) {
      p.life += dt;
      const n1 = fbm2(p.x * 0.03 + p.seed, t * 0.55 + p.y * 0.02, 3, params.seed);
      const n2 = fbm2(p.y * 0.03, t * 0.4 + p.seed, 3, params.seed + 19);
      p.vx += (n1 * 35 * params.turbulence + wind * 28) * dt;
      p.vy += (-8 * params.rise + n2 * 12 * params.turbulence) * dt;
      // mild damping so it doesn't rocket
      p.vx *= 1 - 0.35 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += (10 + params.size * 8) * dt;
      p.spin += n1 * 0.4 * dt;

      if (p.life >= p.maxLife) {
        Object.assign(p, spawnPuff(rand, params));
      }
    }

    const k = p.life / p.maxLife;
    // Fade in then out
    const envelope = k < 0.12 ? k / 0.12 : k > 0.55 ? (1 - k) / 0.45 : 1;
    const alpha = envelope * 0.22 * params.intensity * (0.7 + params.density * 0.5);
    if (alpha <= 0.01) continue;

    const px = params.x + p.x;
    const py = params.y + p.y;
    const rx = p.size * params.size * (0.9 + Math.sin(p.spin) * 0.08);
    const ry = p.size * params.size * (0.75 + Math.cos(p.spin * 0.8) * 0.1);

    // Dark soft core
    const body = ctx.createRadialGradient(px, py, 0, px, py, Math.max(rx, ry));
    body.addColorStop(0, withAlpha(params.color, alpha * 1.15));
    body.addColorStop(0.45, withAlpha(params.color, alpha * 0.7));
    body.addColorStop(0.8, withAlpha(params.color, alpha * 0.2));
    body.addColorStop(1, withAlpha(params.color, 0));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(px, py, rx, ry, p.spin * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Lit rim (screen-ish via lighter composite briefly)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lit = ctx.createRadialGradient(px - rx * 0.2, py - ry * 0.25, 0, px, py, Math.max(rx, ry));
    lit.addColorStop(0, withAlpha(params.colorLit, alpha * 0.35));
    lit.addColorStop(0.5, withAlpha(params.colorLit, alpha * 0.08));
    lit.addColorStop(1, withAlpha(params.colorLit, 0));
    ctx.fillStyle = lit;
    ctx.beginPath();
    ctx.ellipse(px, py, rx, ry, p.spin * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
};

export function disposeSmokeInstance(instanceId: string): void {
  pools.delete(instanceId);
}

export const smokeEffect: EffectModule<SmokeParams> = {
  id: 'smoke',
  name: 'Smoke',
  description: 'Soft volumetric smoke plume with turbulence and lit edges.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 0.95,
    instanceId: 'smoke-default',
    x: 1100,
    y: 780,
    seed: 2,
    color: '#3d4452',
    colorLit: '#8b95a8',
    size: 1,
    spread: 1,
    rise: 0.9,
    density: 0.75,
    turbulence: 0.8,
  },
  draw: drawSmoke,
};
