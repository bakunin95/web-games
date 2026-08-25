import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { fbm2, mulberry32, withAlpha, lerpColor } from './noise';

export interface SmokeParams extends PlacedEffectParams {
  size: number;
  spread: number;
  rise: number;
  density: number;
  turbulence: number;
}

interface Puff {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  seed: number;
  lobes: number;
}

const pools = new Map<string, Puff[]>();

function ensurePool(params: SmokeParams): Puff[] {
  let pool = pools.get(params.instanceId);
  if (!pool) {
    pool = [];
    pools.set(params.instanceId, pool);
  }
  const target = Math.floor(40 + params.density * 90 * params.intensity);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < target) pool.push(spawnPuff(rand, params));
  if (pool.length > target) pool.length = target;
  return pool;
}

function spawnPuff(rand: () => number, params: SmokeParams): Puff {
  return {
    x: (rand() - 0.5) * 16 * params.spread,
    y: (rand() - 0.5) * 6,
    life: rand() * 0.25,
    maxLife: 2.8 + rand() * 4.2,
    vx: (rand() - 0.5) * 10 * params.spread,
    vy: -(10 + rand() * 18) * params.rise,
    size: 12 + rand() * 26,
    spin: (rand() - 0.5) * 0.5,
    seed: rand() * 1000,
    lobes: 2 + Math.floor(rand() * 3),
  };
}

export const drawSmoke: DrawFn<SmokeParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const colorCore = mat.baseColor;
  const colorLit = lerpColor(mat.emissive, '#f0e6d0', 0.35);
  const colorDark = lerpColor(mat.baseColor, '#0a0c10', 0.45);
  const soft = 0.7 + mat.roughness * 0.6;
  const pool = ensurePool(params);
  const dt = scene.dt || 1 / 60;
  const rand = mulberry32((params.seed ^ 0x9e3779b9) | 0);
  const wind = scene.wind.x;

  ctx.save();
  applyMaterial(ctx, mat);

  // Draw large/back first for volume stacking
  const sorted = [...pool].sort((a, b) => b.size - a.size || a.y - b.y);

  for (const p of sorted) {
    if (!scene.paused) {
      p.life += dt;
      const n1 = fbm2(p.x * 0.025 + p.seed, t * 0.45 + p.y * 0.015, 4, params.seed);
      const n2 = fbm2(p.y * 0.025, t * 0.35 + p.seed, 3, params.seed + 19);
      // Strong horizontal advection (industrial plume look)
      p.vx += (n1 * 28 * params.turbulence + wind * 42) * dt;
      p.vy += (-6 * params.rise + n2 * 10 * params.turbulence) * dt;
      p.vx *= 1 - 0.18 * dt;
      p.vy *= 1 - 0.08 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Billows expand as they age / rise
      p.size += (14 + params.size * 10) * soft * (0.7 + p.life * 0.15) * dt;
      p.spin += n1 * 0.35 * dt;
      if (p.life >= p.maxLife) Object.assign(p, spawnPuff(rand, params));
    }

    const k = p.life / p.maxLife;
    // Dense near source, soft dissipate far away
    const densNear = 1.35 - k * 0.55;
    const envelope = k < 0.08 ? k / 0.08 : k > 0.5 ? (1 - k) / 0.5 : 1;
    const alpha =
      envelope * 0.32 * params.intensity * densNear * (0.75 + params.density * 0.55) * mat.opacity;
    if (alpha <= 0.008) continue;

    const px = params.x + p.x;
    const py = params.y + p.y;
    const baseR = p.size * params.size;
    const rx = baseR * (0.95 + Math.sin(p.spin) * 0.1);
    const ry = baseR * (0.72 + Math.cos(p.spin * 0.7) * 0.12);

    // Multi-lobe billow silhouette
    for (let L = 0; L < p.lobes; L++) {
      const ang = p.spin + (L / p.lobes) * Math.PI * 2;
      const ox = Math.cos(ang) * rx * 0.28;
      const oy = Math.sin(ang * 0.9) * ry * 0.22;
      const lrx = rx * (0.55 + (L % 2) * 0.15);
      const lry = ry * (0.5 + ((L + 1) % 2) * 0.18);
      const lx = px + ox;
      const ly = py + oy;

      // Self-shadowed volume: dark core, lit top/windward rim
      const body = ctx.createRadialGradient(lx, ly + lry * 0.15, 0, lx, ly, Math.max(lrx, lry));
      body.addColorStop(0, withAlpha(colorDark, alpha * 1.05));
      body.addColorStop(0.4, withAlpha(colorCore, alpha * 0.85));
      body.addColorStop(0.75, withAlpha(colorCore, alpha * 0.28));
      body.addColorStop(1, withAlpha(colorCore, 0));
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(lx, ly, lrx, lry, p.spin * 0.35 + L * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Lit rim (cream/warm top edge — matching plume photo)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const litA = alpha * 0.55 * mat.emissiveIntensity;
    const litX = px - Math.sign(wind || 1) * rx * 0.15;
    const litY = py - ry * 0.35;
    const lit = ctx.createRadialGradient(litX, litY, 0, px, py, Math.max(rx, ry) * 1.05);
    lit.addColorStop(0, withAlpha(colorLit, litA));
    lit.addColorStop(0.35, withAlpha(colorLit, litA * 0.35));
    lit.addColorStop(0.7, withAlpha(colorLit, litA * 0.08));
    lit.addColorStop(1, withAlpha(colorLit, 0));
    ctx.fillStyle = lit;
    ctx.beginPath();
    ctx.ellipse(px, py, rx * 1.05, ry * 1.05, p.spin * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Soft underside shadow for mass
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const shade = ctx.createRadialGradient(px, py + ry * 0.35, 0, px, py + ry * 0.2, ry);
    shade.addColorStop(0, withAlpha(colorDark, alpha * 0.45));
    shade.addColorStop(1, withAlpha(colorDark, 0));
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.ellipse(px, py + ry * 0.2, rx * 0.75, ry * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
};

export function disposeSmokeInstance(instanceId: string): void {
  pools.delete(instanceId);
}

export const smokeEffect: EffectModule<SmokeParams> = {
  id: 'smoke',
  name: 'Smoke',
  description: 'Volumetric plume with self-shadowed billows and windward lit rims.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'smoke-default',
    x: 1100,
    y: 780,
    seed: 2,
    size: 1.2,
    spread: 1.1,
    rise: 0.75,
    density: 0.9,
    turbulence: 0.85,
    material: createDefaultMaterial({
      name: 'Ash Smoke',
      baseColor: '#2a3038',
      emissive: '#d9c9a8',
      emissiveIntensity: 0.55,
      opacity: 0.92,
      roughness: 0.9,
      metalness: 0.05,
      blend: 'normal',
    }),
  },
  draw: drawSmoke,
};
