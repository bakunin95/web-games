import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { mulberry32, withAlpha } from './noise';

export interface ExplosionParams extends PlacedEffectParams {
  size: number;
  debris: number;
  frequency: number;
}

interface Boom {
  t0: number;
  seed: number;
}

interface Chip {
  ang: number;
  spd: number;
  life: number;
}

const states = new Map<string, { next: number; boom: Boom | null; chips: Chip[] }>();

export const drawExplosion: DrawFn<ExplosionParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let st = states.get(params.instanceId);
  if (!st) {
    st = { next: t, boom: null, chips: [] };
    states.set(params.instanceId, st);
  }
  const rand = mulberry32(params.seed | 0);
  const dt = scene.dt || 1 / 60;

  if (!scene.paused && t >= st.next) {
    st.boom = { t0: t, seed: rand() * 1e6 };
    st.chips = [];
    for (let i = 0; i < Math.floor(8 + params.debris * 24); i++) {
      st.chips.push({
        ang: rand() * Math.PI * 2,
        spd: 80 + rand() * 180,
        life: 0.4 + rand() * 0.5,
      });
    }
    st.next = t + (1.2 + rand() * 2.5) / Math.max(0.25, params.frequency);
  }

  if (!st.boom) return;
  const age = t - st.boom.t0;
  if (age > 1.2) {
    st.boom = null;
    return;
  }

  ctx.save();
  applyMaterial(ctx, mat);
  const flash = Math.max(0, 1 - age * 5);
  const ring = age * 140 * params.size;
  const ringA = Math.max(0, 1 - age / 0.7) * params.intensity;

  if (flash > 0) {
    const g = ctx.createRadialGradient(params.x, params.y, 0, params.x, params.y, 70 * params.size);
    g.addColorStop(0, withAlpha('#ffffff', 0.7 * flash * mat.emissiveIntensity));
    g.addColorStop(0.4, withAlpha(mat.emissive, 0.4 * flash));
    g.addColorStop(1, withAlpha(mat.baseColor, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(params.x, params.y, 70 * params.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = withAlpha(mat.emissive, ringA);
  ctx.lineWidth = 4 * (1 - age);
  ctx.beginPath();
  ctx.arc(params.x, params.y, ring, 0, Math.PI * 2);
  ctx.stroke();

  for (const c of st.chips) {
    const life = c.life - age;
    if (life <= 0) continue;
    const d = c.spd * age;
    const px = params.x + Math.cos(c.ang) * d;
    const py = params.y + Math.sin(c.ang) * d + age * age * 120;
    ctx.fillStyle = withAlpha(mat.baseColor, (life / c.life) * params.intensity);
    ctx.fillRect(px, py, 3, 3);
  }
  void dt;
  ctx.restore();
};

export function disposeExplosionInstance(id: string): void {
  states.delete(id);
}

export const explosionEffect: EffectModule<ExplosionParams> = {
  id: 'explosion',
  name: 'Explosion',
  description: 'Expanding shock ring, debris, and flash.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'explosion-default',
    x: 1000,
    y: 780,
    seed: 19,
    size: 1,
    debris: 0.8,
    frequency: 0.6,
    material: createDefaultMaterial({
      name: 'Fire / Magma',
      baseColor: '#ff5a1f',
      emissive: '#ffe29a',
      emissiveIntensity: 1.3,
      blend: 'additive',
    }),
  },
  draw: drawExplosion,
};
