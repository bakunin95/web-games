import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { mulberry32, withAlpha } from './noise';

export interface ElectricArcsParams extends PlacedEffectParams {
  span: number;
  density: number;
  thickness: number;
}

export const drawElectricArcs: DrawFn<ElectricArcsParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const rand = mulberry32((params.seed + Math.floor(t * 20)) | 0);
  const ax = params.x - 60 * params.span;
  const ay = params.y;
  const bx = params.x + 60 * params.span;
  const by = params.y + Math.sin(t * 3) * 8;

  ctx.save();
  applyMaterial(ctx, mat);
  const arcs = Math.max(1, Math.floor(1 + params.density * 4));
  for (let a = 0; a < arcs; a++) {
    if (rand() > 0.7 + params.density * 0.2) continue;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    const steps = 8;
    for (let i = 1; i < steps; i++) {
      const u = i / steps;
      const x = ax + (bx - ax) * u;
      const y = ay + (by - ay) * u + (rand() - 0.5) * 40 * params.span;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(bx, by);
    ctx.strokeStyle = withAlpha(mat.emissive, 0.7 * params.intensity * mat.emissiveIntensity);
    ctx.lineWidth = params.thickness * 2;
    ctx.shadowColor = mat.emissive;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.strokeStyle = withAlpha('#ffffff', 0.6 * params.intensity);
    ctx.lineWidth = params.thickness;
    ctx.shadowBlur = 0;
    ctx.stroke();
  }
  // Anchors
  ctx.fillStyle = withAlpha(mat.emissive, 0.9 * params.intensity);
  ctx.beginPath();
  ctx.arc(ax, ay, 4, 0, Math.PI * 2);
  ctx.arc(bx, by, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

export function disposeElectricArcsInstance(_id: string): void {}

export const electricArcsEffect: EffectModule<ElectricArcsParams> = {
  id: 'electric-arcs',
  name: 'Electric Arcs',
  description: 'Short crackling arcs between anchors.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'arcs-default',
    x: 1000,
    y: 720,
    seed: 23,
    span: 1,
    density: 0.8,
    thickness: 1,
    material: createDefaultMaterial({
      name: 'Cold Plasma',
      baseColor: '#4da3ff',
      emissive: '#d0ecff',
      emissiveIntensity: 1.3,
      blend: 'additive',
    }),
  },
  draw: drawElectricArcs,
};
