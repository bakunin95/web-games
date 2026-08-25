import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { fbm2, withAlpha } from './noise';

export interface ThundercloudsParams extends PlacedEffectParams {
  width: number;
  height: number;
  density: number;
  flicker: number;
}

export const drawThunderclouds: DrawFn<ThundercloudsParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const hw = params.width * 0.5;
  const hh = params.height * 0.5;
  ctx.save();
  applyMaterial(ctx, mat);

  const blobs = Math.floor(8 + params.density * 14);
  for (let i = 0; i < blobs; i++) {
    const n = fbm2(i * 0.7 + params.seed * 0.001, t * 0.12, 3, params.seed + i);
    const px = params.x + n * hw * 0.85 + Math.sin(t * 0.2 + i) * 12;
    const py = params.y + fbm2(i * 1.1, t * 0.1, 2, params.seed + 9) * hh * 0.5;
    const rx = (40 + (i % 5) * 18) * (0.7 + params.density * 0.5);
    const ry = rx * 0.55;
    const g = ctx.createRadialGradient(px, py, 0, px, py, rx);
    g.addColorStop(0, withAlpha(mat.baseColor, 0.55 * params.intensity));
    g.addColorStop(0.65, withAlpha(mat.baseColor, 0.25 * params.intensity));
    g.addColorStop(1, withAlpha(mat.baseColor, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Internal lightning flicker
    if (params.flicker > 0) {
      const flash = Math.max(0, Math.sin(t * (4 + i) + i * 2) * params.flicker);
      if (flash > 0.7) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = withAlpha(mat.emissive, (flash - 0.7) * 0.8 * params.intensity * mat.emissiveIntensity);
        ctx.beginPath();
        ctx.ellipse(px, py, rx * 0.4, ry * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }
  ctx.restore();
};

export function disposeThundercloudsInstance(_id: string): void {}

export const thundercloudsEffect: EffectModule<ThundercloudsParams> = {
  id: 'thunderclouds',
  name: 'Thunderclouds',
  description: 'Dark rolling cloud mass with internal flickers.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'thunderclouds-default',
    x: 1100,
    y: 360,
    seed: 12,
    width: 520,
    height: 200,
    density: 0.75,
    flicker: 0.8,
    material: createDefaultMaterial({
      name: 'Storm Cloud',
      baseColor: '#1a1e28',
      emissive: '#8aa4ff',
      emissiveIntensity: 0.9,
      opacity: 0.95,
      blend: 'normal',
    }),
  },
  draw: drawThunderclouds,
};
