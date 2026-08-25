import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { createDefaultMaterial } from '../core/material';
import { fbm2, mulberry32, withAlpha, lerpColor } from './noise';

export interface SmokeParams extends PlacedEffectParams {
  size: number;
  spread: number;
  rise: number;
  density: number;
  turbulence: number;
}

interface Lobe {
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  phase: number;
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
  lobes: Lobe[];
}

const pools = new Map<string, Puff[]>();

function makeLobes(rand: () => number): Lobe[] {
  const n = 4 + Math.floor(rand() * 4);
  const lobes: Lobe[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + rand() * 0.6;
    const dist = 0.15 + rand() * 0.55;
    lobes.push({
      ox: Math.cos(ang) * dist,
      oy: Math.sin(ang) * dist * 0.75,
      sx: 0.45 + rand() * 0.55,
      sy: 0.4 + rand() * 0.5,
      phase: rand() * Math.PI * 2,
    });
  }
  return lobes;
}

function spawnPuff(rand: () => number, params: SmokeParams): Puff {
  return {
    x: (rand() - 0.5) * 14 * params.spread,
    y: (rand() - 0.5) * 8,
    life: rand() * 0.2,
    maxLife: 2.6 + rand() * 3.8,
    vx: (rand() - 0.5) * 8 * params.spread,
    vy: -(8 + rand() * 16) * params.rise,
    size: 18 + rand() * 28,
    spin: (rand() - 0.5) * 0.4,
    seed: rand() * 1000,
    lobes: makeLobes(rand),
  };
}

function ensurePool(params: SmokeParams): Puff[] {
  let pool = pools.get(params.instanceId);
  if (!pool) {
    pool = [];
    pools.set(params.instanceId, pool);
  }
  const target = Math.floor(36 + params.density * 80 * params.intensity);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < target) pool.push(spawnPuff(rand, params));
  if (pool.length > target) pool.length = target;
  return pool;
}

export const drawSmoke: DrawFn<SmokeParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  // Visible mass on dark skies: lift base toward mid-grey, keep dark in crevices
  const colorBody = lerpColor(mat.baseColor, '#6a7382', 0.35);
  const colorDark = lerpColor(mat.baseColor, '#12151a', 0.55);
  const colorLit = lerpColor(mat.emissive, '#fff3d6', 0.4);
  const soft = 0.65 + mat.roughness * 0.45;
  const pool = ensurePool(params);
  const dt = scene.dt || 1 / 60;
  const rand = mulberry32((params.seed ^ 0x9e3779b9) | 0);
  const wind = scene.wind.x;
  const windSign = wind >= 0 ? 1 : -1;
  const ei = mat.emissiveIntensity;

  ctx.save();
  // Force readable smoke stacking (ignore additive materials)
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = Math.max(0.55, Math.min(1, mat.opacity));

  const sorted = [...pool].sort((a, b) => b.size - a.size || a.life - b.life);

  for (const p of sorted) {
    if (!scene.paused) {
      p.life += dt;
      const n1 = fbm2(p.x * 0.02 + p.seed, t * 0.42 + p.y * 0.012, 4, params.seed);
      const n2 = fbm2(p.y * 0.02, t * 0.32 + p.seed, 3, params.seed + 19);
      p.vx += (n1 * 32 * params.turbulence + wind * 48) * dt;
      p.vy += (-5 * params.rise + n2 * 12 * params.turbulence) * dt;
      p.vx *= 1 - 0.12 * dt;
      p.vy *= 1 - 0.06 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += (12 + params.size * 9) * soft * (0.65 + p.life * 0.2) * dt;
      p.spin += n1 * 0.3 * dt;
      if (p.life >= p.maxLife) Object.assign(p, spawnPuff(rand, params));
    }

    const k = p.life / p.maxLife;
    const densNear = 1.85 - k * 0.95;
    const envelope = k < 0.06 ? k / 0.06 : k > 0.55 ? (1 - k) / 0.45 : 1;
    const alpha =
      envelope * 0.82 * params.intensity * densNear * (0.9 + params.density * 0.5);
    if (alpha <= 0.012) continue;

    const px = params.x + p.x;
    const py = params.y + p.y;
    const baseR = p.size * params.size;
    const windStretch = 1 + Math.min(1.4, Math.abs(wind) * 0.55) * (0.3 + k);
    const rx = baseR * (0.95 + Math.sin(p.spin) * 0.08) * (0.85 + windStretch * 0.35);
    const ry = baseR * (0.7 + Math.cos(p.spin * 0.8) * 0.1);

    // Dark inter-lobe crevice mass first
    {
      const g = ctx.createRadialGradient(px, py + ry * 0.12, 0, px, py, Math.max(rx, ry) * 0.7);
      g.addColorStop(0, withAlpha(colorDark, alpha * 0.9));
      g.addColorStop(0.55, withAlpha(colorBody, alpha * 0.4));
      g.addColorStop(1, withAlpha(colorBody, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(px, py, rx * 0.55, ry * 0.48, p.spin * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < p.lobes.length; i++) {
      const L = p.lobes[i]!;
      const wobX = Math.sin(L.phase + t * 0.55) * 0.05;
      const wobY = Math.cos(L.phase * 0.9 + t * 0.4) * 0.04;
      const lx = px + (L.ox + wobX) * rx;
      const ly = py + (L.oy + wobY) * ry;
      const lrx = rx * L.sx * (0.95 + k * 0.25);
      const lry = ry * L.sy * (0.95 + k * 0.2);
      const la = alpha * (0.7 + (i % 3) * 0.1);
      if (lrx < 1 || la < 0.015) continue;

      // Body fill — readable grey mass
      const body = ctx.createRadialGradient(lx, ly + lry * 0.2, 0, lx, ly, Math.max(lrx, lry));
      body.addColorStop(0, withAlpha(colorDark, la * 1.05));
      body.addColorStop(0.4, withAlpha(colorBody, la * 0.95));
      body.addColorStop(0.78, withAlpha(colorBody, la * 0.35));
      body.addColorStop(1, withAlpha(colorBody, 0));
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(lx, ly, lrx, lry, p.spin * 0.25 + L.phase * 0.1, 0, Math.PI * 2);
      ctx.fill();

      // Lit windward/top rim — subtle, not white scribble
      const litX = lx - windSign * lrx * 0.2;
      const litY = ly - lry * 0.35;
      const lit = ctx.createRadialGradient(litX, litY, 0, lx, ly, Math.max(lrx, lry));
      const litA = la * 0.28 * ei;
      lit.addColorStop(0, withAlpha(colorLit, litA));
      lit.addColorStop(0.4, withAlpha(colorLit, litA * 0.25));
      lit.addColorStop(1, withAlpha(colorLit, 0));
      ctx.fillStyle = lit;
      ctx.beginPath();
      ctx.ellipse(lx, ly, lrx * 0.95, lry * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();

      // Underside shadow
      const shade = ctx.createRadialGradient(lx, ly + lry * 0.4, 0, lx, ly + lry * 0.15, lry);
      shade.addColorStop(0, withAlpha(colorDark, la * 0.55));
      shade.addColorStop(1, withAlpha(colorDark, 0));
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.ellipse(lx, ly + lry * 0.25, lrx * 0.7, lry * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Downwind wisps
    if (k > 0.15) {
      for (let w = 0; w < 3; w++) {
        const wn = fbm2(p.seed + w, t * 0.6, 2, params.seed + w);
        const wx = px + windSign * rx * (0.45 + w * 0.2) + wn * rx * 0.2;
        const wy = py + ry * (-0.1 + w * 0.15);
        const wrx = rx * (0.12 + w * 0.04);
        const wry = ry * (0.06 + w * 0.02);
        const wa = alpha * 0.22 * (1 - k * 0.4);
        const wg = ctx.createRadialGradient(wx, wy, 0, wx, wy, Math.max(wrx, wry) * 1.4);
        wg.addColorStop(0, withAlpha(colorBody, wa));
        wg.addColorStop(1, withAlpha(colorBody, 0));
        ctx.fillStyle = wg;
        ctx.beginPath();
        ctx.ellipse(wx, wy, wrx * 1.4, wry, wn * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
};

export function disposeSmokeInstance(instanceId: string): void {
  pools.delete(instanceId);
}

export const smokeEffect: EffectModule<SmokeParams> = {
  id: 'smoke',
  name: 'Smoke',
  description: 'Industrial plume: cauliflower billows, self-shadowed lobes, wind trail.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'smoke-default',
    x: 1100,
    y: 780,
    seed: 2,
    size: 1.35,
    spread: 1.2,
    rise: 0.65,
    density: 1,
    turbulence: 0.9,
    material: createDefaultMaterial({
      name: 'Ash Smoke',
      baseColor: '#3a4250',
      emissive: '#e8d9b8',
      emissiveIntensity: 0.7,
      opacity: 0.95,
      roughness: 0.9,
      metalness: 0.05,
      blend: 'normal',
    }),
  },
  draw: drawSmoke,
};
