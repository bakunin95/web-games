import type { BaseEffectParams, DrawFn, EffectModule } from '../core/types';

export interface SmokeParams extends BaseEffectParams {
  instanceId: string;
  x: number;
  y: number;
  seed: number;
  color: string;
  size: number;
  spread: number;
  rise: number;
  density: number;
}

interface Puff {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  vx: number;
  size: number;
}

const pools = new Map<string, Puff[]>();

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ensurePool(params: SmokeParams): Puff[] {
  let pool = pools.get(params.instanceId);
  if (!pool) {
    pool = [];
    pools.set(params.instanceId, pool);
  }
  const target = Math.floor(18 + params.density * 55 * params.intensity);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < target) {
    pool.push({
      x: 0,
      y: 0,
      life: rand(),
      maxLife: 1.2 + rand() * 2.2,
      vx: (rand() - 0.5) * 20,
      size: 10 + rand() * 28,
    });
  }
  if (pool.length > target) pool.length = target;
  return pool;
}

export const drawSmoke: DrawFn<SmokeParams> = (ctx, params, _t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const pool = ensurePool(params);
  const dt = scene.dt || 1 / 60;
  const rand = mulberry32((params.seed ^ 0x9e3779b9) | 0);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  for (const p of pool) {
    if (!scene.paused) {
      p.life += dt;
      p.x += (p.vx + scene.wind.x * 70) * dt;
      p.y -= (18 + params.rise * 35) * dt;
      p.vx += scene.wind.x * 10 * dt + (rand() - 0.5) * 25 * dt;
      p.size += 8 * dt * params.size;
      if (p.life >= p.maxLife) {
        p.life = 0;
        p.maxLife = 1.1 + rand() * 2.4;
        p.x = (rand() - 0.5) * 30 * params.spread;
        p.y = (rand() - 0.5) * 10;
        p.vx = (rand() - 0.5) * 25 * params.spread;
        p.size = 8 + rand() * 22 * params.size;
      }
    }

    const k = p.life / p.maxLife;
    const alpha = (1 - k) * 0.28 * params.intensity;
    const px = params.x + p.x;
    const py = params.y + p.y;
    const r = p.size * params.size;

    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, withAlpha(params.color, alpha));
    g.addColorStop(0.6, withAlpha(params.color, alpha * 0.4));
    g.addColorStop(1, withAlpha(params.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};

function withAlpha(hex: string, alpha: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

export function disposeSmokeInstance(instanceId: string): void {
  pools.delete(instanceId);
}

export const smokeEffect: EffectModule<SmokeParams> = {
  id: 'smoke',
  name: 'Smoke',
  description: 'World-space rising smoke plume — placeable, seed-randomized.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 0.9,
    instanceId: 'smoke-default',
    x: 1100,
    y: 780,
    seed: 2,
    color: '#6a7388',
    size: 1,
    spread: 1,
    rise: 0.85,
    density: 0.7,
  },
  draw: drawSmoke,
};
