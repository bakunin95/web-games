import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { withAlpha } from './noise';

export interface FrostParams extends PlacedEffectParams {
  radius: number;
  growth: number;
  crystals: number;
}

export const drawFrost: DrawFn<FrostParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const grow = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.4 * params.growth));
  const R = 70 * params.radius * grow;
  ctx.save();
  applyMaterial(ctx, mat);

  const g = ctx.createRadialGradient(params.x, params.y, 0, params.x, params.y, R);
  g.addColorStop(0, withAlpha(mat.emissive, 0.15 * params.intensity));
  g.addColorStop(0.55, withAlpha(mat.baseColor, 0.22 * params.intensity));
  g.addColorStop(1, withAlpha(mat.baseColor, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(params.x, params.y, R, 0, Math.PI * 2);
  ctx.fill();

  const n = Math.floor(6 + params.crystals * 16);
  ctx.strokeStyle = withAlpha(mat.emissive, 0.55 * params.intensity);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + t * 0.05;
    const len = R * (0.4 + (i % 3) * 0.2);
    ctx.beginPath();
    ctx.moveTo(params.x, params.y);
    ctx.lineTo(params.x + Math.cos(ang) * len, params.y + Math.sin(ang) * len);
    // side crystals
    const mx = params.x + Math.cos(ang) * len * 0.55;
    const my = params.y + Math.sin(ang) * len * 0.55;
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + Math.cos(ang + 0.8) * 10, my + Math.sin(ang + 0.8) * 10);
    ctx.stroke();
  }
  ctx.restore();
};

export function disposeFrostInstance(_id: string): void {}

export const frostEffect: EffectModule<FrostParams> = {
  id: 'frost',
  name: 'Ice / Frost',
  description: 'Growing crystalline frost overlay.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'frost-default',
    x: 1000,
    y: 760,
    seed: 29,
    radius: 1,
    growth: 1,
    crystals: 0.8,
    material: createDefaultMaterial({
      name: 'Frost',
      baseColor: '#a8d0e8',
      emissive: '#e8f6ff',
      emissiveIntensity: 0.7,
      blend: 'screen',
      opacity: 0.9,
    }),
  },
  draw: drawFrost,
};
