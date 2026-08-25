import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { mulberry32, withAlpha } from './noise';

export interface LightningParams extends PlacedEffectParams {
  size: number;
  branches: number;
  frequency: number;
}

interface BoltState {
  nextAt: number;
  segments: { x: number; y: number }[];
  life: number;
  flash: number;
}

const states = new Map<string, BoltState>();

function buildBolt(rand: () => number, params: LightningParams): { x: number; y: number }[] {
  const segs: { x: number; y: number }[] = [];
  const h = 180 * params.size;
  let x = 0;
  let y = -h;
  segs.push({ x, y });
  const steps = 10 + Math.floor(params.branches * 6);
  for (let i = 0; i < steps; i++) {
    x += (rand() - 0.5) * 40 * params.size;
    y += h / steps;
    segs.push({ x, y });
    if (rand() < 0.35 * params.branches) {
      // branch tip encoded as tiny detour
      segs.push({ x: x + (rand() - 0.5) * 50, y: y - 10 });
      segs.push({ x, y });
    }
  }
  return segs;
}

export const drawLightning: DrawFn<LightningParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let st = states.get(params.instanceId);
  if (!st) {
    st = { nextAt: t, segments: [], life: 0, flash: 0 };
    states.set(params.instanceId, st);
  }
  const rand = mulberry32((params.seed + Math.floor(t * 10)) | 0);
  const dt = scene.dt || 1 / 60;

  if (!scene.paused) {
    if (t >= st.nextAt) {
      st.segments = buildBolt(rand, params);
      st.life = 0.12 + rand() * 0.12;
      st.flash = 1;
      st.nextAt = t + (0.8 + rand() * 2.2) / Math.max(0.2, params.frequency);
    }
    st.life -= dt;
    st.flash = Math.max(0, st.flash - dt * 4);
  }

  if (st.life <= 0 && st.flash <= 0) return;

  ctx.save();
  applyMaterial(ctx, mat);
  const a = Math.max(st.life * 6, st.flash) * params.intensity * mat.emissiveIntensity;

  // Screen-ish flash disc
  if (st.flash > 0) {
    const g = ctx.createRadialGradient(params.x, params.y - 40, 0, params.x, params.y - 40, 120 * params.size);
    g.addColorStop(0, withAlpha(mat.emissive, 0.35 * st.flash * a));
    g.addColorStop(1, withAlpha(mat.emissive, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(params.x, params.y - 40, 120 * params.size, 0, Math.PI * 2);
    ctx.fill();
  }

  if (st.segments.length > 1 && st.life > 0) {
    ctx.strokeStyle = withAlpha(mat.emissive, Math.min(1, a));
    ctx.lineWidth = 2.5 * params.size;
    ctx.lineJoin = 'round';
    ctx.shadowColor = mat.emissive;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(params.x + st.segments[0]!.x, params.y + st.segments[0]!.y);
    for (let i = 1; i < st.segments.length; i++) {
      ctx.lineTo(params.x + st.segments[i]!.x, params.y + st.segments[i]!.y);
    }
    ctx.stroke();
    ctx.strokeStyle = withAlpha('#ffffff', Math.min(1, a * 0.8));
    ctx.lineWidth = 1 * params.size;
    ctx.shadowBlur = 0;
    ctx.stroke();
  }
  ctx.restore();
};

export function disposeLightningInstance(id: string): void {
  states.delete(id);
}

export const lightningEffect: EffectModule<LightningParams> = {
  id: 'lightning',
  name: 'Lightning',
  description: 'Jagged lightning strike with flash afterimage.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'lightning-default',
    x: 1000,
    y: 700,
    seed: 11,
    size: 1,
    branches: 0.7,
    frequency: 1,
    material: createDefaultMaterial({
      name: 'Cold Plasma',
      baseColor: '#6b8cff',
      emissive: '#e8f4ff',
      emissiveIntensity: 1.4,
      blend: 'additive',
    }),
  },
  draw: drawLightning,
};
