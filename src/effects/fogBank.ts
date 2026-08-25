import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { fbm2, withAlpha } from './noise';

export interface FogBankParams extends PlacedEffectParams {
  width: number;
  height: number;
  density: number;
  drift: number;
}

export const drawFogBank: DrawFn<FogBankParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const hw = params.width * 0.5;
  const hh = params.height * 0.5;
  ctx.save();
  applyMaterial(ctx, mat);

  for (let i = 0; i < 12; i++) {
    const n = fbm2(i * 0.5, t * (0.08 + params.drift * 0.1), 3, params.seed + i);
    const px = params.x + n * hw * 0.9;
    const py = params.y + Math.sin(t * 0.15 + i) * hh * 0.2;
    const rx = (50 + (i % 4) * 30) * (0.8 + params.density * 0.5);
    const ry = rx * 0.35;
    const g = ctx.createRadialGradient(px, py, 0, px, py, rx);
    g.addColorStop(0, withAlpha(mat.baseColor, 0.28 * params.intensity * params.density));
    g.addColorStop(0.55, withAlpha(mat.baseColor, 0.12 * params.intensity));
    g.addColorStop(1, withAlpha(mat.baseColor, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

export function disposeFogBankInstance(_id: string): void {}

export const fogBankEffect: EffectModule<FogBankParams> = {
  id: 'fog-bank',
  name: 'Fog Bank',
  description: 'Low ground fog that drifts and softens silhouettes.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'fog-default',
    x: 1000,
    y: 820,
    seed: 14,
    width: 600,
    height: 140,
    density: 0.8,
    drift: 0.7,
    material: createDefaultMaterial({
      name: 'Fog',
      baseColor: '#8a93a8',
      emissive: '#b8c0d0',
      emissiveIntensity: 0.2,
      opacity: 0.85,
      blend: 'normal',
      roughness: 0.9,
    }),
  },
  draw: drawFogBank,
};
