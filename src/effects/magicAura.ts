import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { withAlpha } from './noise';

export interface MagicAuraParams extends PlacedEffectParams {
  radius: number;
  runes: number;
  spin: number;
}

const GLYPHS = ['✦', '✧', '⬡', '◈', '⟡', '✵'];

export const drawMagicAura: DrawFn<MagicAuraParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const r = 50 * params.radius;
  ctx.save();
  applyMaterial(ctx, mat);

  const g = ctx.createRadialGradient(params.x, params.y, r * 0.2, params.x, params.y, r * 1.3);
  g.addColorStop(0, withAlpha(mat.emissive, 0.2 * params.intensity * mat.emissiveIntensity));
  g.addColorStop(0.6, withAlpha(mat.baseColor, 0.12 * params.intensity));
  g.addColorStop(1, withAlpha(mat.baseColor, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(params.x, params.y, r * 1.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = withAlpha(mat.emissive, 0.55 * params.intensity);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(params.x, params.y, r, 0, Math.PI * 2);
  ctx.stroke();

  const n = Math.max(3, Math.floor(3 + params.runes * 8));
  ctx.font = `${Math.round(14 * params.radius)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = withAlpha(mat.emissive, 0.85 * params.intensity);
  for (let i = 0; i < n; i++) {
    const ang = t * params.spin + (i / n) * Math.PI * 2;
    const px = params.x + Math.cos(ang) * r;
    const py = params.y + Math.sin(ang) * r;
    ctx.fillText(GLYPHS[i % GLYPHS.length]!, px, py);
  }
  ctx.restore();
};

export function disposeMagicAuraInstance(_id: string): void {}

export const magicAuraEffect: EffectModule<MagicAuraParams> = {
  id: 'magic-aura',
  name: 'Magic Aura',
  description: 'Orbiting runes and soft energy ring.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'aura-default',
    x: 1000,
    y: 700,
    seed: 21,
    radius: 1,
    runes: 0.7,
    spin: 0.8,
    material: createDefaultMaterial({
      name: 'Arcane',
      baseColor: '#7a4dff',
      emissive: '#d4b8ff',
      emissiveIntensity: 1.1,
      blend: 'additive',
    }),
  },
  draw: drawMagicAura,
};
