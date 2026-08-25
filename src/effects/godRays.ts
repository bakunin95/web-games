import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { withAlpha } from './noise';

export interface GodRaysParams extends PlacedEffectParams {
  length: number;
  spread: number;
  rays: number;
  flicker: number;
}

export const drawGodRays: DrawFn<GodRaysParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const n = Math.max(3, Math.floor(3 + params.rays * 8));
  ctx.save();
  applyMaterial(ctx, mat);
  ctx.translate(params.x, params.y);
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (i / (n - 1) - 0.5) * params.spread * 1.2;
    const flicker = 0.75 + Math.sin(t * 2.5 + i) * 0.25 * params.flicker;
    const len = 160 * params.length * flicker;
    const half = 8 + i * 2;
    ctx.rotate(ang);
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, withAlpha(mat.emissive, 0.35 * params.intensity * mat.emissiveIntensity * flicker));
    g.addColorStop(0.5, withAlpha(mat.emissive, 0.1 * params.intensity));
    g.addColorStop(1, withAlpha(mat.emissive, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(2, 0);
    ctx.lineTo(half, len);
    ctx.lineTo(-half, len);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(-ang);
  }
  ctx.restore();
};

export function disposeGodRaysInstance(_id: string): void {}

export const godRaysEffect: EffectModule<GodRaysParams> = {
  id: 'god-rays',
  name: 'God Rays',
  description: 'Volumetric light shafts from a point.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'godrays-default',
    x: 1180,
    y: 420,
    seed: 18,
    length: 1.2,
    spread: 0.9,
    rays: 0.7,
    flicker: 0.5,
    material: createDefaultMaterial({
      name: 'Shaft Light',
      baseColor: '#ffe29a',
      emissive: '#fff1c1',
      emissiveIntensity: 1,
      blend: 'additive',
    }),
  },
  draw: drawGodRays,
};
