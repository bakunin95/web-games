import type { BaseEffectParams, DrawFn, EffectModule } from '../core/types';

export interface SparksParams extends BaseEffectParams {
  instanceId: string;
  x: number;
  y: number;
  seed: number;
  color: string;
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

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ensurePool(params: SparksParams): Spark[] {
  let pool = pools.get(params.instanceId);
  if (!pool) {
    pool = [];
    pools.set(params.instanceId, pool);
  }
  const target = Math.floor(20 + params.count * 90 * params.intensity);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < target) {
    pool.push(spawn(rand, params));
  }
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
  const pool = ensurePool(params);
  const dt = scene.dt || 1 / 60;
  const rand = mulberry32((params.seed + 99) | 0);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = params.color;
  ctx.lineCap = 'round';

  for (const s of pool) {
    if (!scene.paused) {
      s.life += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 180 * dt; // gravity
      s.vx += scene.wind.x * 40 * dt;
      if (s.life >= s.maxLife) {
        Object.assign(s, spawn(rand, params));
        s.life = 0;
      }
    }

    const p = s.life / s.maxLife;
    const alpha = (1 - p) * 0.95 * params.intensity;
    const px = params.x + s.x;
    const py = params.y + s.y;
    const len = (6 + (1 - p) * 10) * params.size;

    ctx.globalAlpha = alpha;
    ctx.lineWidth = (1.2 + (1 - p) * 1.8) * params.size;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - s.vx * 0.02 * len, py - s.vy * 0.02 * len);
    ctx.stroke();

    ctx.fillStyle = withAlpha(params.color, alpha);
    ctx.beginPath();
    ctx.arc(px, py, 1.2 * params.size, 0, Math.PI * 2);
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

export function disposeSparksInstance(instanceId: string): void {
  pools.delete(instanceId);
}

export const sparksEffect: EffectModule<SparksParams> = {
  id: 'sparks',
  name: 'Sparks',
  description: 'World-space spark burst emitter — placeable, seed-randomized.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'sparks-default',
    x: 1300,
    y: 800,
    seed: 3,
    color: '#ffd36a',
    size: 1,
    spread: 1,
    speed: 1,
    count: 0.7,
  },
  draw: drawSparks,
};
