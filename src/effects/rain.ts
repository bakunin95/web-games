import type { BaseEffectParams, DrawFn, EffectModule, SceneContext } from '../core/types';

export interface RainParams extends BaseEffectParams {
  density: number;
  length: number;
  color: string;
  splash: boolean;
}

interface Drop {
  x: number;
  y: number;
  z: number;
  speed: number;
}

const DROPS: Drop[] = [];
let seededFor = 0;

function ensureDrops(count: number, scene: SceneContext): void {
  if (seededFor === count && DROPS.length === count) return;
  DROPS.length = 0;
  seededFor = count;
  for (let i = 0; i < count; i++) {
    DROPS.push({
      x: Math.random() * scene.worldWidth,
      y: Math.random() * scene.worldHeight,
      z: 0.4 + Math.random() * 0.6,
      speed: 520 + Math.random() * 480,
    });
  }
}

export const drawRain: DrawFn<RainParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;

  const count = Math.floor(80 + params.density * 420 * params.intensity);
  ensureDrops(count, scene);

  const windX = scene.wind.x * 220;
  const windY = scene.wind.y * 40;
  const len = params.length * (12 + 28 * params.intensity);

  ctx.save();
  ctx.strokeStyle = params.color;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.35 + 0.45 * params.intensity;

  for (const d of DROPS) {
    // Integrate in world space; wrap for endless rain
    const dt = scene.dt || 1 / 60;
    if (!scene.paused) {
      d.x += (windX * d.z) * dt;
      d.y += (d.speed * d.z + windY) * dt;
      if (d.y > scene.worldHeight) {
        d.y = -20;
        d.x = Math.random() * scene.worldWidth;
      }
      if (d.x < 0) d.x += scene.worldWidth;
      if (d.x > scene.worldWidth) d.x -= scene.worldWidth;
    }

    const dx = windX * d.z * 0.02;
    const dy = len * d.z;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + dx, d.y + dy);
    ctx.stroke();

    if (params.splash && scene.rainWet && d.y > 800 && d.y < 820) {
      ctx.globalAlpha = 0.2 * params.intensity;
      ctx.beginPath();
      ctx.ellipse(d.x, 805 + (t * 40 + d.x) % 8, 4 + d.z * 3, 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.35 + 0.45 * params.intensity;
    }
  }

  ctx.restore();
};

export const rainEffect: EffectModule<RainParams> = {
  id: 'rain',
  name: 'Rain',
  description: 'World-space wind-driven rain streaks with optional wet-road splash.',
  space: 'world',
  defaultParams: {
    enabled: false,
    intensity: 0.75,
    density: 0.7,
    length: 1,
    color: '#a8c8ff',
    splash: true,
  },
  draw: drawRain,
};

/** Reset particle pool (useful when world size changes). */
export function resetRain(): void {
  DROPS.length = 0;
  seededFor = 0;
}
