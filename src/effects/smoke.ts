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

interface Puff {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  size: number;
  seed: number;
  /** Number of soft circular billows clustered on this puff */
  bumps: number;
}

const pools = new Map<string, Puff[]>();

function spawnPuff(rand: () => number, params: SmokeParams): Puff {
  return {
    x: (rand() - 0.5) * 12 * params.spread,
    y: (rand() - 0.5) * 6,
    life: rand() * 0.15,
    maxLife: 3.5 + rand() * 5,
    vx: (rand() - 0.5) * 4,
    vy: -(4 + rand() * 10) * params.rise,
    size: 14 + rand() * 22,
    seed: rand() * 1000,
    bumps: 3 + Math.floor(rand() * 4),
  };
}

function ensurePool(params: SmokeParams): Puff[] {
  let pool = pools.get(params.instanceId);
  if (!pool) {
    pool = [];
    pools.set(params.instanceId, pool);
  }
  const target = Math.floor(70 + params.density * 140 * params.intensity);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < target) pool.push(spawnPuff(rand, params));
  if (pool.length > target) pool.length = target;
  return pool;
}

/** Soft circular billow — flat soft density, avoid lit marble-sphere look. */
function billow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  body: string,
  dark: string,
  a: number,
): void {
  if (r < 1 || a < 0.01) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, withAlpha(body, Math.min(1, a * 0.95)));
  g.addColorStop(0.35, withAlpha(body, a * 0.75));
  g.addColorStop(0.65, withAlpha(dark, a * 0.35));
  g.addColorStop(1, withAlpha(body, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export const drawSmoke: DrawFn<SmokeParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const body = lerpColor(mat.baseColor, '#7a8494', 0.4);
  const dark = lerpColor(mat.baseColor, '#1a1e24', 0.5);
  const soft = 0.7 + mat.roughness * 0.4;
  const pool = ensurePool(params);
  const dt = scene.dt || 1 / 60;
  const rand = mulberry32((params.seed ^ 0x9e3779b9) | 0);
  const wind = scene.wind.x;
  const windSign = wind >= 0 ? 1 : -1;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = Math.max(0.7, Math.min(1, mat.opacity));

  const sorted = [...pool].sort((a, b) => b.size - a.size);

  for (const p of sorted) {
    if (!scene.paused) {
      p.life += dt;
      const n1 = fbm2(p.x * 0.018 + p.seed, t * 0.38 + p.y * 0.01, 4, params.seed);
      const n2 = fbm2(p.y * 0.018, t * 0.3 + p.seed, 3, params.seed + 17);
      p.vx += (n1 * 22 * params.turbulence + wind * 72) * dt;
      p.vy += (-2.5 * params.rise + n2 * 8 * params.turbulence + Math.abs(wind) * 4 * dt) * dt;
      p.vx *= 1 - 0.06 * dt;
      p.vy *= 1 - 0.04 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Expand more as travels downwind
      p.size += (16 + params.size * 12) * soft * (0.5 + p.life * 0.35) * (1 + Math.abs(wind) * 0.15) * dt;
      if (p.life >= p.maxLife) Object.assign(p, spawnPuff(rand, params));
    }

    const k = p.life / p.maxLife;
    const dens = 1.9 - k * 1.1;
    const env = k < 0.06 ? k / 0.06 : k > 0.55 ? (1 - k) / 0.45 : 1;
    const alpha = env * 0.75 * params.intensity * dens * (0.85 + params.density * 0.5);
    if (alpha < 0.015) continue;

    const px = params.x + p.x;
    const py = params.y + p.y;
    const R = p.size * params.size * (1 + Math.min(0.9, Math.abs(wind) * 0.25) * k);

    // Core mass
    billow(ctx, px, py, R * 0.7, body, dark, alpha * 0.9);

    // Soft overlapping bumps (no sphere lighting)
    for (let i = 0; i < p.bumps; i++) {
      const ang = (i / p.bumps) * Math.PI * 2 + p.seed * 0.01;
      const dist = 0.2 + (i % 3) * 0.14;
      const n = fbm2(p.seed + i, t * 0.4, 2, params.seed + i);
      const bx = px + Math.cos(ang) * R * dist + n * R * 0.08;
      const by = py + Math.sin(ang) * R * dist * 0.65 + n * R * 0.05;
      const br = R * (0.42 + (i % 4) * 0.1);
      billow(ctx, bx, by, br, body, dark, alpha * (0.55 + (i % 3) * 0.12));
    }

    // Broad soft veil
    billow(ctx, px + windSign * R * 0.15, py - R * 0.05, R * 1.05, body, dark, alpha * 0.35);

    // Downwind soft dissipation
    if (k > 0.18) {
      for (let w = 0; w < 4; w++) {
        const wn = fbm2(p.seed + w * 3, t * 0.5, 2, params.seed + 40 + w);
        const wx = px + windSign * R * (0.45 + w * 0.28) + wn * R * 0.12;
        const wy = py + (w - 1.5) * R * 0.1;
        const wr = R * (0.22 + w * 0.06) * (1 + k * 0.3);
        billow(ctx, wx, wy, wr, body, dark, alpha * 0.32 * (1 - k * 0.45));
      }
    }
  }

  ctx.restore();
};

export function disposeSmokeInstance(instanceId: string): void {
  pools.delete(instanceId);
}

export const smokeEffect: EffectModule<SmokeParams> = {
  id: 'smoke',
  name: 'Smoke',
  description: 'Industrial plume: soft circular cauliflower billows, wind trail.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'smoke-default',
    x: 1100,
    y: 780,
    seed: 2,
    size: 1.4,
    spread: 1.2,
    rise: 0.55,
    density: 1,
    turbulence: 0.85,
    material: createDefaultMaterial({
      name: 'Ash Smoke',
      baseColor: '#4a5360',
      emissive: '#e0d2b4',
      emissiveIntensity: 0.55,
      opacity: 0.96,
      roughness: 0.9,
      metalness: 0.05,
      blend: 'normal',
    }),
  },
  draw: drawSmoke,
};
