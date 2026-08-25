import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { fbm2, withAlpha } from './noise';

export interface HeatHazeParams extends PlacedEffectParams {
  width: number;
  height: number;
  strength: number;
  speed: number;
}

/** Fake heat shimmer via wavy translucent bands (Canvas-friendly displacement look). */
export const drawHeatHaze: DrawFn<HeatHazeParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const hw = params.width * 0.5;
  const hh = params.height * 0.5;
  ctx.save();
  applyMaterial(ctx, mat);
  ctx.globalCompositeOperation = 'screen';

  const bands = 14;
  for (let i = 0; i < bands; i++) {
    const u = i / bands;
    const y = params.y - hh + u * hh * 2;
    const wobble =
      fbm2(u * 4, t * params.speed, 2, params.seed) * 18 * params.strength +
      Math.sin(t * params.speed * 3 + u * 8) * 6 * params.strength;
    ctx.strokeStyle = withAlpha(mat.emissive, 0.06 * params.intensity * params.strength);
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let s = 0; s <= 16; s++) {
      const x = params.x - hw + (s / 16) * hw * 2;
      const dy =
        Math.sin(s * 0.8 + t * params.speed * 2 + i) * 4 * params.strength +
        fbm2(s * 0.3, t * 0.5 + i, 2, params.seed) * 5;
      if (s === 0) ctx.moveTo(x + wobble, y + dy);
      else ctx.lineTo(x + wobble, y + dy);
    }
    ctx.stroke();
  }

  // Warm wash
  const g = ctx.createLinearGradient(params.x, params.y - hh, params.x, params.y + hh);
  g.addColorStop(0, withAlpha(mat.baseColor, 0));
  g.addColorStop(0.5, withAlpha(mat.baseColor, 0.08 * params.intensity));
  g.addColorStop(1, withAlpha(mat.baseColor, 0));
  ctx.fillStyle = g;
  ctx.fillRect(params.x - hw, params.y - hh, hw * 2, hh * 2);
  ctx.restore();
};

export function disposeHeatHazeInstance(_id: string): void {}

export const heatHazeEffect: EffectModule<HeatHazeParams> = {
  id: 'heat-haze',
  name: 'Heat Haze',
  description: 'Shimmer distortion bands over hot ground.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'heathaze-default',
    x: 1000,
    y: 860,
    seed: 15,
    width: 420,
    height: 120,
    strength: 1,
    speed: 1.2,
    material: createDefaultMaterial({
      name: 'Heat',
      baseColor: '#ffb060',
      emissive: '#ffe0a0',
      emissiveIntensity: 0.5,
      blend: 'screen',
      opacity: 0.7,
    }),
  },
  draw: drawHeatHaze,
};
