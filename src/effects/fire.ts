import type { BaseEffectParams, DrawFn, EffectModule } from '../core/types';

export interface FireParams extends BaseEffectParams {
  /** Stable id so particle pools stay per-instance. */
  instanceId: string;
  x: number;
  y: number;
  seed: number;
  colorHot: string;
  colorCool: string;
  size: number;
  spread: number;
  rise: number;
}

interface Flame {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  vx: number;
  size: number;
  hot: boolean;
}

const pools = new Map<string, Flame[]>();

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ensurePool(params: FireParams): Flame[] {
  let pool = pools.get(params.instanceId);
  if (!pool) {
    pool = [];
    pools.set(params.instanceId, pool);
  }
  const target = Math.floor(24 + params.intensity * 70 * params.size);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < target) {
    pool.push({
      x: 0,
      y: 0,
      life: rand(),
      maxLife: 0.45 + rand() * 0.7,
      vx: (rand() - 0.5) * 40,
      size: 4 + rand() * 10,
      hot: rand() > 0.45,
    });
  }
  if (pool.length > target) pool.length = target;
  return pool;
}

export const drawFire: DrawFn<FireParams> = (ctx, params, _t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const pool = ensurePool(params);
  const dt = scene.dt || 1 / 60;
  const rand = mulberry32((params.seed + pool.length * 17) | 0);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const f of pool) {
    if (!scene.paused) {
      f.life += dt;
      f.x += (f.vx + scene.wind.x * 55) * dt;
      f.y -= (50 + params.rise * 90 + rand() * 20) * dt;
      f.vx += (rand() - 0.5) * 80 * dt;
      if (f.life >= f.maxLife) {
        f.life = 0;
        f.maxLife = 0.4 + rand() * 0.75;
        f.x = (rand() - 0.5) * 40 * params.spread;
        f.y = (rand() - 0.5) * 8;
        f.vx = (rand() - 0.5) * 35 * params.spread;
        f.size = 3 + rand() * 12 * params.size;
        f.hot = rand() > 0.4;
      }
    }

    const p = f.life / f.maxLife;
    const alpha = (1 - p) * 0.75 * params.intensity;
    const r = f.size * (1 - p * 0.55) * params.size;
    const px = params.x + f.x;
    const py = params.y + f.y;
    const color = f.hot ? params.colorHot : params.colorCool;

    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, withAlpha(color, alpha));
    g.addColorStop(0.55, withAlpha(color, alpha * 0.45));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Core glow at base
  const core = ctx.createRadialGradient(params.x, params.y, 2, params.x, params.y, 28 * params.size);
  core.addColorStop(0, withAlpha(params.colorHot, 0.55 * params.intensity));
  core.addColorStop(1, withAlpha(params.colorHot, 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(params.x, params.y, 28 * params.size, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
};

function withAlpha(hex: string, alpha: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

export function disposeFireInstance(instanceId: string): void {
  pools.delete(instanceId);
}

export const fireEffect: EffectModule<FireParams> = {
  id: 'fire',
  name: 'Fire',
  description: 'World-space fire emitter — placeable, seed-randomized look.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'fire-default',
    x: 900,
    y: 790,
    seed: 1,
    colorHot: '#ffd27a',
    colorCool: '#ff5a1f',
    size: 1,
    spread: 1,
    rise: 1,
  },
  draw: drawFire,
};
