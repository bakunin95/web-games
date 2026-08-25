import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { fbm2, withAlpha } from './noise';

export interface ToxicGasParams extends PlacedEffectParams {
  width: number;
  height: number;
  density: number;
  turbulence: number;
}

export const drawToxicGas: DrawFn<ToxicGasParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const hw = params.width * 0.5;
  const hh = params.height * 0.5;
  ctx.save();
  applyMaterial(ctx, mat);
  for (let i = 0; i < 14; i++) {
    const n1 = fbm2(i * 0.6, t * (0.2 + params.turbulence * 0.3), 3, params.seed + i);
    const n2 = fbm2(i * 0.9 + 3, t * 0.15, 2, params.seed + 20);
    const px = params.x + n1 * hw * 0.85;
    const py = params.y + n2 * hh * 0.7;
    const rx = (35 + (i % 5) * 14) * (0.7 + params.density * 0.5);
    const g = ctx.createRadialGradient(px, py, 0, px, py, rx);
    g.addColorStop(0, withAlpha(mat.emissive, 0.28 * params.intensity * params.density));
    g.addColorStop(0.5, withAlpha(mat.baseColor, 0.18 * params.intensity));
    g.addColorStop(1, withAlpha(mat.baseColor, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, py, rx, rx * 0.7, n1 * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

export function disposeToxicGasInstance(_id: string): void {}

export const toxicGasEffect: EffectModule<ToxicGasParams> = {
  id: 'toxic-gas',
  name: 'Toxic Gas',
  description: 'Green/purple billowing hazard volume.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'toxic-default',
    x: 1050,
    y: 780,
    seed: 24,
    width: 280,
    height: 180,
    density: 0.8,
    turbulence: 0.75,
    material: createDefaultMaterial({
      name: 'Toxic Green',
      baseColor: '#2a6b2a',
      emissive: '#7cff4a',
      emissiveIntensity: 0.9,
      blend: 'normal',
      opacity: 0.85,
    }),
  },
  draw: drawToxicGas,
};
