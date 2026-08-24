import type { BaseEffectParams, DrawFn, EffectModule } from '../core/types';

export interface EmbersParams extends BaseEffectParams {
  count: number;
  color: string;
  size: number;
  rise: number;
}

interface Ember {
  x: number;
  y: number;
  life: number;
  seed: number;
}

const EMBERS: Ember[] = [];

function ensure(count: number, sceneWidth: number, sceneHeight: number): void {
  while (EMBERS.length < count) {
    EMBERS.push({
      x: Math.random() * sceneWidth,
      y: Math.random() * sceneHeight,
      life: Math.random(),
      seed: Math.random() * Math.PI * 2,
    });
  }
  if (EMBERS.length > count) EMBERS.length = count;
}

/** Soft rising smoke/embers — world-space particle accent near street level. */
export const drawEmbers: DrawFn<EmbersParams> = (ctx, params, _t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;

  const n = Math.floor(20 + params.count * 80 * params.intensity);
  ensure(n, scene.worldWidth, scene.worldHeight);
  const dt = scene.dt || 1 / 60;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const e of EMBERS) {
    if (!scene.paused) {
      e.life += dt * (0.15 + params.rise * 0.35);
      e.x += (Math.sin(e.life * 2 + e.seed) * 18 + scene.wind.x * 40) * dt;
      e.y -= (30 + params.rise * 50 + Math.cos(e.seed) * 10) * dt;
      if (e.life > 1 || e.y < 200) {
        e.life = 0;
        e.x = 400 + Math.random() * (scene.worldWidth - 800);
        e.y = 780 + Math.random() * 120;
      }
    }

    const alpha = (1 - e.life) * 0.55 * params.intensity;
    const r = params.size * (1.5 + (1 - e.life) * 2);
    ctx.fillStyle = withAlpha(params.color, alpha);
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};

function withAlpha(hex: string, alpha: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const embersEffect: EffectModule<EmbersParams> = {
  id: 'embers',
  name: 'Embers / Smoke',
  description: 'World-space rising ember particles near street level.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 0.55,
    count: 0.6,
    color: '#ff8a3d',
    size: 1,
    rise: 0.7,
  },
  draw: drawEmbers,
};
