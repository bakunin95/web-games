import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { mulberry32, withAlpha } from './noise';

export interface MeteorParams extends PlacedEffectParams {
  size: number;
  speed: number;
  frequency: number;
  trail: number;
}

interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  impact: number;
}

const states = new Map<string, { next: number; shots: Shot[] }>();

export const drawMeteor: DrawFn<MeteorParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let st = states.get(params.instanceId);
  if (!st) {
    st = { next: t, shots: [] };
    states.set(params.instanceId, st);
  }
  const rand = mulberry32(params.seed | 0);
  const dt = scene.dt || 1 / 60;

  if (!scene.paused && t >= st.next) {
    st.shots.push({
      x: -40 - rand() * 40,
      y: -120 - rand() * 40,
      vx: (120 + rand() * 80) * params.speed,
      vy: (160 + rand() * 60) * params.speed,
      life: 0,
      impact: 0,
    });
    st.next = t + (1.2 + rand() * 2.2) / Math.max(0.2, params.frequency);
  }

  ctx.save();
  applyMaterial(ctx, mat);
  for (let i = st.shots.length - 1; i >= 0; i--) {
    const s = st.shots[i]!;
    if (!scene.paused) {
      if (s.impact <= 0) {
        s.life += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.y >= 0) {
          s.y = 0;
          s.impact = 0.45;
        }
      } else {
        s.impact -= dt;
        if (s.impact <= 0) {
          st.shots.splice(i, 1);
          continue;
        }
      }
    }

    const px = params.x + s.x;
    const py = params.y + s.y;

    if (s.impact > 0) {
      const a = s.impact / 0.45;
      const g = ctx.createRadialGradient(px, py, 0, px, py, 40 * params.size * a);
      g.addColorStop(0, withAlpha(mat.emissive, 0.7 * a * params.intensity));
      g.addColorStop(1, withAlpha(mat.baseColor, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, 40 * params.size * a, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    // Trail
    ctx.strokeStyle = withAlpha(mat.emissive, 0.55 * params.intensity * params.trail);
    ctx.lineWidth = 3 * params.size;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - s.vx * 0.08 * params.trail, py - s.vy * 0.08 * params.trail);
    ctx.stroke();
    ctx.fillStyle = withAlpha('#ffffff', 0.9 * params.intensity);
    ctx.beginPath();
    ctx.arc(px, py, 3 * params.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

export function disposeMeteorInstance(id: string): void {
  states.delete(id);
}

export const meteorEffect: EffectModule<MeteorParams> = {
  id: 'meteor',
  name: 'Meteor',
  description: 'Falling ember trail with impact glow.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'meteor-default',
    x: 1100,
    y: 800,
    seed: 30,
    size: 1,
    speed: 1,
    frequency: 0.7,
    trail: 1,
    material: createDefaultMaterial({
      name: 'Fire / Magma',
      baseColor: '#ff7a18',
      emissive: '#ffe29a',
      emissiveIntensity: 1.3,
      blend: 'additive',
    }),
  },
  draw: drawMeteor,
};
