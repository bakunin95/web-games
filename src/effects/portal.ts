import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { fbm2, mulberry32, withAlpha } from './noise';

export interface PortalParams extends PlacedEffectParams {
  width: number;
  height: number;
  swirl: number;
  crackle: number;
}

export const drawPortal: DrawFn<PortalParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const hw = params.width * 0.5;
  const hh = params.height * 0.5;
  ctx.save();
  applyMaterial(ctx, mat);

  // Outer crackle
  ctx.strokeStyle = withAlpha(mat.emissive, 0.55 * params.intensity * params.crackle);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const n = 1 + fbm2(Math.cos(a) * 2, Math.sin(a) * 2 + t * 2, 2, params.seed) * 0.12 * params.crackle;
    const px = params.x + Math.cos(a) * hw * n;
    const py = params.y + Math.sin(a) * hh * n;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();

  // Swirl fill
  ctx.beginPath();
  ctx.ellipse(params.x, params.y, hw * 0.92, hh * 0.92, 0, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 8; i++) {
    const ang = t * params.swirl + i * 0.7;
    const g = ctx.createRadialGradient(
      params.x + Math.cos(ang) * hw * 0.3,
      params.y + Math.sin(ang) * hh * 0.3,
      0,
      params.x,
      params.y,
      Math.max(hw, hh),
    );
    g.addColorStop(0, withAlpha(mat.emissive, 0.2 * params.intensity));
    g.addColorStop(0.5, withAlpha(mat.baseColor, 0.35 * params.intensity));
    g.addColorStop(1, withAlpha('#05010a', 0.85 * params.intensity));
    ctx.fillStyle = g;
    ctx.fillRect(params.x - hw, params.y - hh, hw * 2, hh * 2);
  }

  // Pull wisps
  const rand = mulberry32(params.seed | 0);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 10; i++) {
    const a = rand() * Math.PI * 2 + t * 0.5;
    const d = (0.4 + (i % 5) * 0.1) * hw;
    const px = params.x + Math.cos(a - t) * d;
    const py = params.y + Math.sin(a - t) * d * (hh / hw);
    ctx.fillStyle = withAlpha(mat.emissive, 0.25 * params.intensity);
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

export function disposePortalInstance(_id: string): void {}

export const portalEffect: EffectModule<PortalParams> = {
  id: 'portal',
  name: 'Portal / Rift',
  description: 'Swirling oval with edge crackle and pull wisps.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'portal-default',
    x: 1100,
    y: 680,
    seed: 22,
    width: 140,
    height: 200,
    swirl: 1.2,
    crackle: 0.8,
    material: createDefaultMaterial({
      name: 'Rift',
      baseColor: '#3a1060',
      emissive: '#ff4fd8',
      emissiveIntensity: 1.2,
      blend: 'additive',
    }),
  },
  draw: drawPortal,
};
