import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { mulberry32, withAlpha } from './noise';

export interface BloodMistParams extends PlacedEffectParams {
  count: number;
  spread: number;
  frequency: number;
}

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  stain: boolean;
}

const pools = new Map<string, { next: number; drops: Drop[] }>();

export const drawBloodMist: DrawFn<BloodMistParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let st = pools.get(params.instanceId);
  if (!st) {
    st = { next: t, drops: [] };
    pools.set(params.instanceId, st);
  }
  const rand = mulberry32(params.seed | 0);
  const dt = scene.dt || 1 / 60;

  if (!scene.paused && t >= st.next) {
    const n = Math.floor(10 + params.count * 40);
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (rand() - 0.5) * Math.PI * params.spread;
      const spd = 60 + rand() * 160;
      st.drops.push({
        x: 0,
        y: 0,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0,
        max: 0.35 + rand() * 0.5,
        stain: rand() > 0.55,
      });
    }
    st.next = t + (0.9 + rand() * 1.8) / Math.max(0.2, params.frequency);
  }

  ctx.save();
  applyMaterial(ctx, mat);
  for (let i = st.drops.length - 1; i >= 0; i--) {
    const d = st.drops[i]!;
    if (!scene.paused) {
      d.life += dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += 280 * dt;
    }
    const p = d.life / d.max;
    if (p >= 1) {
      st.drops.splice(i, 1);
      continue;
    }
    const a = (1 - p) * params.intensity;
    ctx.fillStyle = withAlpha(p > 0.7 && d.stain ? mat.baseColor : mat.emissive, a);
    ctx.beginPath();
    ctx.ellipse(params.x + d.x, params.y + d.y, 2 + p * 3, 1.5 + p * (d.stain ? 4 : 2), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

export function disposeBloodMistInstance(id: string): void {
  pools.delete(id);
}

export const bloodMistEffect: EffectModule<BloodMistParams> = {
  id: 'blood-mist',
  name: 'Blood Mist',
  description: 'Stylized spray with settle stains.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'blood-default',
    x: 1000,
    y: 760,
    seed: 25,
    count: 0.7,
    spread: 1,
    frequency: 0.7,
    material: createDefaultMaterial({
      name: 'Crimson',
      baseColor: '#5a0008',
      emissive: '#c41028',
      emissiveIntensity: 0.7,
      blend: 'normal',
    }),
  },
  draw: drawBloodMist,
};
