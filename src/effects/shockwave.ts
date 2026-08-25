import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { withAlpha } from './noise';

export interface ShockwaveParams extends PlacedEffectParams {
  size: number;
  speed: number;
  frequency: number;
}

const states = new Map<string, { next: number; t0: number | null }>();

export const drawShockwave: DrawFn<ShockwaveParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let st = states.get(params.instanceId);
  if (!st) {
    st = { next: t, t0: null };
    states.set(params.instanceId, st);
  }
  if (!scene.paused && t >= st.next) {
    st.t0 = t;
    st.next = t + (1.5 + Math.random() * 2) / Math.max(0.2, params.frequency);
  }
  if (st.t0 == null) return;
  const age = (t - st.t0) * params.speed;
  if (age > 1.4) {
    st.t0 = null;
    return;
  }
  const r = age * 160 * params.size;
  const a = Math.max(0, 1 - age / 1.4) * params.intensity;

  ctx.save();
  applyMaterial(ctx, mat);
  ctx.strokeStyle = withAlpha(mat.emissive, a * 0.85);
  ctx.lineWidth = 3 * (1 - age * 0.5);
  ctx.beginPath();
  ctx.ellipse(params.x, params.y, r, r * 0.35, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Dust ring
  ctx.strokeStyle = withAlpha(mat.baseColor, a * 0.35);
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.ellipse(params.x, params.y, r * 0.92, r * 0.32, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

export function disposeShockwaveInstance(id: string): void {
  states.delete(id);
}

export const shockwaveEffect: EffectModule<ShockwaveParams> = {
  id: 'shockwave',
  name: 'Shockwave',
  description: 'Radial ground distortion / dust ring.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'shockwave-default',
    x: 1050,
    y: 820,
    seed: 20,
    size: 1,
    speed: 1,
    frequency: 0.7,
    material: createDefaultMaterial({
      name: 'Dust Ring',
      baseColor: '#a09080',
      emissive: '#e8e0d0',
      emissiveIntensity: 0.7,
      blend: 'screen',
    }),
  },
  draw: drawShockwave,
};
