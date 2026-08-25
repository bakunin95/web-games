import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { createDefaultMaterial } from '../core/material';
import { fbm2, mulberry32, withAlpha } from './noise';

export interface FireParams extends PlacedEffectParams {
  size: number;
  spread: number;
  rise: number;
  turbulence: number;
  /** Soft floating ember dots (not streaks/lines). */
  embers: number;
}

/**
 * Soft campfire: luminous orange mass from stacked soft blobs.
 * No filaments, stick lines, or stroke threads — just soft fire + soft ash dots.
 */

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  r: number;
  hot: number;
}

const pools = new Map<string, Ember[]>();

function softBlob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot: number,
  c0: string,
  a0: number,
  c1: string,
  a1: number,
  c2: string,
  a2: number,
): void {
  if (rx < 0.5 || ry < 0.5 || a0 < 0.004) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, withAlpha(c0, a0));
  g.addColorStop(0.45, withAlpha(c1, a1));
  g.addColorStop(1, withAlpha(c2, a2));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function ensureEmbers(params: FireParams): Ember[] {
  let pool = pools.get(params.instanceId);
  if (!pool) {
    pool = [];
    pools.set(params.instanceId, pool);
  }
  const n = Math.floor(8 + params.embers * 28 * params.intensity);
  const rand = mulberry32((params.seed + 9) | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 40,
      y: -rand() * 20,
      vx: (rand() - 0.5) * 20,
      vy: -(30 + rand() * 50),
      life: rand(),
      maxLife: 1.2 + rand() * 1.8,
      r: 1.2 + rand() * 2.4,
      hot: rand(),
    });
  }
  if (pool.length > n) pool.length = n;
  return pool;
}

export const drawFire: DrawFn<FireParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const S = params.size;
  const Sp = params.spread;
  const I = params.intensity;
  const ei = mat.emissiveIntensity;
  const wind = scene.wind.x;
  const dt = scene.dt || 1 / 60;

  const flicker =
    0.88 +
    0.06 * Math.sin(t * 5.5) +
    0.06 * fbm2(t * 1.8, params.seed * 0.02, 2, params.seed);
  const bright = I * flicker;

  const lean =
    wind * 18 +
    fbm2(t * 0.35, params.seed * 0.02, 2, params.seed + 2) * 16 * Sp * params.turbulence;

  const deep = '#5a1000';
  const mid = mat.baseColor || '#ff3b10';
  const hot = '#ff6a18';
  const tip = mat.emissive || '#ffb060';
  const core = '#ffe8c0';

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = mat.opacity;

  const bx = params.x;
  const by = params.y;

  // Soft warm ground spill
  softBlob(
    ctx,
    bx + lean * 0.05,
    by + 8 * S,
    95 * S * Sp,
    28 * S,
    0,
    hot,
    0.16 * bright * ei,
    mid,
    0.08 * bright,
    deep,
    0.02 * bright,
  );

  // Soft charcoal bed glow (no stick geometry)
  softBlob(ctx, bx, by + 2 * S, 42 * S * Sp, 14 * S, 0, hot, 0.35 * bright * ei, deep, 0.2 * bright, '#1a0800', 0.05);
  softBlob(ctx, bx - 18 * S * Sp, by + 4 * S, 22 * S, 10 * S, -0.2, mid, 0.22 * bright, deep, 0.1 * bright, '#000', 0);
  softBlob(ctx, bx + 20 * S * Sp, by + 5 * S, 24 * S, 11 * S, 0.25, mid, 0.2 * bright, deep, 0.1 * bright, '#000', 0);

  // Soft rising flame mass — stacked soft tongues (blobs only)
  const tongues = Math.floor(7 + Sp * 5);
  for (let i = 0; i < tongues; i++) {
    const u = (i + 0.5) / tongues - 0.5;
    const phase = t * (1.4 + (i % 3) * 0.35) + i * 1.7 + params.seed * 0.01;
    const wobble = Math.sin(phase) * 10 * Sp * params.turbulence;
    const riseN = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(phase * 0.7 + i));
    const h = (55 + riseN * 95 * params.rise) * S;
    const cx = bx + u * 70 * Sp * S + lean * (0.25 + riseN * 0.55) + wobble;
    const cy = by - h * 0.55;
    const rx = (18 + (1 - Math.abs(u)) * 22) * S * Sp * (0.85 + 0.2 * Math.sin(phase * 1.3));
    const ry = h * 0.55;
    const rot = lean * 0.004 + u * 0.15 + Math.sin(phase) * 0.08;

    softBlob(ctx, cx, cy, rx, ry, rot, hot, 0.28 * bright * ei, mid, 0.16 * bright, deep, 0.03 * bright);
    softBlob(
      ctx,
      cx + lean * 0.05,
      cy - ry * 0.15,
      rx * 0.55,
      ry * 0.7,
      rot,
      tip,
      0.18 * bright * ei,
      hot,
      0.1 * bright,
      mid,
      0.02 * bright,
    );
  }

  // Soft hot core near base (small, not a white cone)
  softBlob(
    ctx,
    bx + lean * 0.08,
    by - 28 * S * params.rise,
    16 * S * Sp,
    28 * S,
    lean * 0.003,
    tip,
    0.35 * bright * ei,
    hot,
    0.2 * bright,
    mid,
    0.04 * bright,
  );
  softBlob(
    ctx,
    bx + lean * 0.06,
    by - 18 * S,
    7 * S,
    12 * S,
    0,
    core,
    0.22 * bright * ei,
    tip,
    0.1 * bright,
    hot,
    0.02 * bright,
  );

  // Fringe wisps as soft ellipses only
  for (let i = 0; i < 10; i++) {
    const n1 = fbm2(i * 0.8, t * 0.9 + params.seed * 0.02, 2, params.seed + 11);
    const n2 = fbm2(i * 1.3 + 2, t * 0.7, 2, params.seed + 17);
    const u = n1;
    const h = (40 + Math.abs(n2) * 70 * params.rise) * S;
    const cx = bx + u * 55 * Sp * S + lean * 0.45;
    const cy = by - h;
    const a = 0.08 * bright * (0.5 + Math.abs(n2));
    softBlob(ctx, cx, cy, (8 + Math.abs(n1) * 12) * S, (16 + Math.abs(n2) * 22) * S, u * 0.2, tip, a, mid, a * 0.5, deep, 0);
  }

  ctx.restore();

  // Soft ember dots (no streaks)
  if (params.embers > 0.02) {
    const embers = ensureEmbers(params);
    const rand = mulberry32((params.seed + (t * 10) | 0) | 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const e of embers) {
      if (!scene.paused) {
        e.life += dt;
        e.x += (e.vx + wind * 40) * dt;
        e.y += e.vy * dt;
        e.vy -= 8 * dt;
        if (e.life >= e.maxLife) {
          e.life = 0;
          e.maxLife = 1.1 + rand() * 1.8;
          e.x = (rand() - 0.5) * 36 * Sp * S;
          e.y = -rand() * 10 * S;
          e.vx = (rand() - 0.5) * 25 + wind * 10;
          e.vy = -(25 + rand() * 55) * params.rise;
          e.r = 1.1 + rand() * 2.2;
          e.hot = rand();
        }
      }
      const fade = 1 - e.life / e.maxLife;
      const a = fade * params.embers * bright * 0.55 * (0.4 + e.hot);
      if (a < 0.03) continue;
      const px = bx + e.x + lean * 0.2;
      const py = by + e.y - 30 * S;
      softBlob(ctx, px, py, e.r * S, e.r * S, 0, tip, a, hot, a * 0.5, mid, 0);
    }
    ctx.restore();
  }
};

export function disposeFireInstance(instanceId: string): void {
  pools.delete(instanceId);
}

export const fireEffect: EffectModule<FireParams> = {
  id: 'fire',
  name: 'Fire',
  description: 'Soft campfire: luminous orange mass from soft blobs, gentle ember dots — no lines.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'fire-default',
    x: 900,
    y: 790,
    seed: 1,
    size: 1.2,
    spread: 1.1,
    rise: 0.9,
    turbulence: 0.85,
    embers: 0.7,
    material: createDefaultMaterial({
      name: 'Fire / Magma',
      baseColor: '#ff3b10',
      emissive: '#ff9a40',
      emissiveIntensity: 1.1,
      blend: 'additive',
      roughness: 0.4,
      metalness: 0.1,
    }),
  },
  draw: drawFire,
};
