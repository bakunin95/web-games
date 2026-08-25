import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { fbm2, withAlpha } from './noise';

export interface CausticsParams extends PlacedEffectParams {
  width: number;
  height: number;
  speed: number;
  scale: number;
}

export const drawCaustics: DrawFn<CausticsParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const hw = params.width * 0.5;
  const hh = params.height * 0.5;
  ctx.save();
  applyMaterial(ctx, mat);
  ctx.beginPath();
  ctx.ellipse(params.x, params.y, hw, hh, 0, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = withAlpha(mat.baseColor, 0.25 * params.intensity);
  ctx.fillRect(params.x - hw, params.y - hh, hw * 2, hh * 2);

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 18; i++) {
    const px =
      params.x +
      fbm2(i * 0.8, t * params.speed, 2, params.seed + i) * hw * 0.85 * params.scale;
    const py =
      params.y +
      fbm2(i * 1.1 + 4, t * params.speed * 0.9, 2, params.seed + 40) * hh * 0.85;
    const r = 8 + (i % 4) * 5;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, withAlpha(mat.emissive, 0.22 * params.intensity * mat.emissiveIntensity));
    g.addColorStop(1, withAlpha(mat.emissive, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

export function disposeCausticsInstance(_id: string): void {}

export const causticsEffect: EffectModule<CausticsParams> = {
  id: 'caustics',
  name: 'Caustics',
  description: 'Animated underwater light patterns on a surface.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'caustics-default',
    x: 1000,
    y: 860,
    seed: 28,
    width: 360,
    height: 160,
    speed: 0.8,
    scale: 1,
    material: createDefaultMaterial({
      name: 'Clear Water',
      baseColor: '#0a3a4a',
      emissive: '#7af0ff',
      emissiveIntensity: 1,
      blend: 'additive',
    }),
  },
  draw: drawCaustics,
};
