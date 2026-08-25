import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { createDefaultMaterial } from '../core/material';
import { fbm2, mulberry32, withAlpha, lerpColor } from './noise';

export interface SmokeParams extends PlacedEffectParams {
  size: number;
  spread: number;
  rise: number;
  density: number;
  turbulence: number;
}

interface Particle {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  r: number;
  seed: number;
}

const pools = new Map<string, Particle[]>();

function spawn(rand: () => number, params: SmokeParams): Particle {
  return {
    x: (rand() - 0.5) * 10 * params.spread,
    y: (rand() - 0.5) * 6,
    life: rand() * 0.2,
    maxLife: 2.2 + rand() * 3.5,
    vx: (rand() - 0.5) * 8,
    vy: -(8 + rand() * 18) * params.rise,
    r: 6 + rand() * 14,
    seed: rand() * 1000,
  };
}

function ensurePool(params: SmokeParams): Particle[] {
  let pool = pools.get(params.instanceId);
  if (!pool) {
    pool = [];
    pools.set(params.instanceId, pool);
  }
  // Many small soft particles → continuous mass without concentric discs
  const target = Math.floor(120 + params.density * 220 * params.intensity);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < target) pool.push(spawn(rand, params));
  if (pool.length > target) pool.length = target;
  return pool;
}

export const drawSmoke: DrawFn<SmokeParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const body = lerpColor(mat.baseColor, '#8a92a0', 0.45);
  const dark = lerpColor(mat.baseColor, '#2a3038', 0.35);
  const warm = lerpColor(mat.emissive, '#e8d4b0', 0.25);
  const pool = ensurePool(params);
  const dt = scene.dt || 1 / 60;
  const rand = mulberry32((params.seed ^ 0x9e3779b9) | 0);
  const wind = scene.wind.x;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = Math.max(0.75, Math.min(1, mat.opacity));

  // Draw largest / oldest first
  const sorted = [...pool].sort((a, b) => b.r - a.r || a.life - b.life);

  for (const p of sorted) {
    if (!scene.paused) {
      p.life += dt;
      const n1 = fbm2(p.x * 0.04 + p.seed, t * 0.5 + p.y * 0.02, 3, params.seed);
      const n2 = fbm2(p.y * 0.04, t * 0.35 + p.seed, 3, params.seed + 11);
      p.vx += (n1 * 40 * params.turbulence + wind * 85) * dt;
      p.vy += (-6 * params.rise + n2 * 14 * params.turbulence) * dt;
      p.vx *= 1 - 0.08 * dt;
      p.vy *= 1 - 0.05 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += (8 + params.size * 6) * (0.6 + p.life * 0.35) * dt;
      if (p.life >= p.maxLife) Object.assign(p, spawn(rand, params));
    }

    const k = p.life / p.maxLife;
    const env = k < 0.08 ? k / 0.08 : k > 0.5 ? (1 - k) / 0.5 : 1;
    const dens = 1.6 - k * 0.9;
    const a = env * 0.22 * params.intensity * dens * (0.8 + params.density * 0.5);
    if (a < 0.01) continue;

    const px = params.x + p.x;
    const py = params.y + p.y;
    const r = p.r * params.size;
    // Noise-warped center so overlaps don't form clean concentric rings
    const jx = fbm2(p.seed, t * 0.3, 2, params.seed) * r * 0.15;
    const jy = fbm2(p.seed + 3, t * 0.25, 2, params.seed + 5) * r * 0.12;
    const col = k < 0.25 ? dark : k > 0.65 ? lerpColor(body, warm, 0.25) : body;

    const g = ctx.createRadialGradient(px + jx, py + jy, 0, px, py, r);
    g.addColorStop(0, withAlpha(col, a));
    g.addColorStop(0.5, withAlpha(col, a * 0.55));
    g.addColorStop(1, withAlpha(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px + jx * 0.5, py + jy * 0.5, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};

export function disposeSmokeInstance(instanceId: string): void {
  pools.delete(instanceId);
}

export const smokeEffect: EffectModule<SmokeParams> = {
  id: 'smoke',
  name: 'Smoke',
  description: 'Dense soft-particle plume with wind shear (no concentric discs).',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'smoke-default',
    x: 1100,
    y: 780,
    seed: 2,
    size: 1.3,
    spread: 1.1,
    rise: 0.55,
    density: 1,
    turbulence: 0.9,
    material: createDefaultMaterial({
      name: 'Ash Smoke',
      baseColor: '#3a424c',
      emissive: '#d8c9a8',
      emissiveIntensity: 0.45,
      opacity: 0.96,
      roughness: 0.9,
      metalness: 0.05,
      blend: 'normal',
    }),
  },
  draw: drawSmoke,
};
