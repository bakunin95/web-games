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
 * Soft campfire with a charcoal fuel bed:
 * - Dark logs / coals under the flame (source-over)
 * - Dense soft luminous mass (lighter blobs only — no flame threads/sticks)
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

function drawLog(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  len: number,
  thick: number,
  rot: number,
  shade: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  const g = ctx.createLinearGradient(0, -thick, 0, thick);
  const s = Math.floor(18 + shade * 22);
  g.addColorStop(0, `rgb(${s + 8},${s + 4},${s - 2})`);
  g.addColorStop(0.45, `rgb(${s - 4},${s - 8},${s - 12})`);
  g.addColorStop(1, `rgb(${Math.max(4, s - 14)},${Math.max(2, s - 16)},${Math.max(0, s - 18)})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, len, thick, 0, 0, Math.PI * 2);
  ctx.fill();
  // Soft bark hint
  ctx.strokeStyle = `rgba(0,0,0,${0.25 + shade * 0.15})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, len * 0.92, thick * 0.72, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function ensureEmbers(params: FireParams): Ember[] {
  let pool = pools.get(params.instanceId);
  if (!pool) {
    pool = [];
    pools.set(params.instanceId, pool);
  }
  const n = Math.floor(10 + params.embers * 32 * params.intensity);
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
    0.9 +
    0.05 * Math.sin(t * 5.5) +
    0.05 * fbm2(t * 1.8, params.seed * 0.02, 2, params.seed);
  const bright = I * flicker;

  const lean =
    wind * 18 +
    fbm2(t * 0.35, params.seed * 0.02, 2, params.seed + 2) * 14 * Sp * params.turbulence;

  const deep = '#5a1000';
  const mid = mat.baseColor || '#ff3b10';
  const hot = '#ff6a18';
  const tip = mat.emissive || '#ffb060';
  const core = '#ffe8c0';

  const bx = params.x;
  const by = params.y;

  // ── Ground spill (additive) ──
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = mat.opacity;
  softBlob(
    ctx,
    bx + lean * 0.04,
    by + 12 * S,
    135 * S * Sp,
    40 * S,
    0,
    hot,
    0.38 * bright * ei,
    mid,
    0.18 * bright,
    deep,
    0.05 * bright,
  );
  ctx.restore();

  // ── Fuel logs / charcoal bed (source-over) ──
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = mat.opacity;
  const logY = by + 6 * S;
  drawLog(ctx, bx - 28 * S * Sp, logY + 2 * S, 38 * S, 11 * S, -0.32, 0.55);
  drawLog(ctx, bx + 30 * S * Sp, logY + 3 * S, 40 * S, 12 * S, 0.38, 0.4);
  drawLog(ctx, bx - 4 * S, logY - 2 * S, 46 * S, 13 * S, 0.08, 0.7);
  drawLog(ctx, bx + 10 * S * Sp, logY + 8 * S, 34 * S, 10 * S, -0.12, 0.35);
  // Dark coal pile between logs
  softBlob(ctx, bx, logY + 4 * S, 36 * S * Sp, 14 * S, 0, '#1a0c06', 0.95, '#0c0604', 0.85, '#050302', 0.5);
  ctx.restore();

  // ── Ember pockets in log cracks (additive) ──
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = mat.opacity;
  const crackRand = mulberry32((params.seed + 77) | 0);
  for (let i = 0; i < 18; i++) {
    const u = (crackRand() - 0.5) * 70 * Sp * S;
    const v = (crackRand() - 0.5) * 10 * S;
    const pulse = 0.65 + 0.35 * Math.sin(t * (4 + (i % 5)) + i);
    softBlob(
      ctx,
      bx + u,
      logY + v,
      (4 + crackRand() * 7) * S,
      (2 + crackRand() * 3) * S,
      (crackRand() - 0.5) * 0.8,
      tip,
      0.45 * bright * ei * pulse,
      hot,
      0.28 * bright * pulse,
      deep,
      0.06 * bright,
    );
  }

  // Bed glow under flame
  softBlob(ctx, bx, logY - 4 * S, 58 * S * Sp, 18 * S, 0, hot, 0.55 * bright * ei, mid, 0.28 * bright, deep, 0.06);

  // ── Dense soft flame mass ──
  const tongues = Math.floor(14 + Sp * 8);
  for (let i = 0; i < tongues; i++) {
    const u = (i + 0.5) / tongues - 0.5;
    const phase = t * (1.35 + (i % 4) * 0.28) + i * 1.4 + params.seed * 0.01;
    const wobble = Math.sin(phase) * 14 * Sp * params.turbulence;
    const riseN = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(phase * 0.65 + i * 0.7));
    const h = (85 + riseN * 125 * params.rise) * S;
    // Cluster denser near center
    const densU = u * (0.55 + Math.abs(u) * 0.7);
    const cx = bx + densU * 85 * Sp * S + lean * (0.2 + riseN * 0.6) + wobble;
    const cy = by - h * 0.52 - 8 * S;
    const rx = (26 + (1 - Math.abs(u)) * 32) * S * Sp * (0.9 + 0.18 * Math.sin(phase * 1.2));
    const ry = h * 0.58;
    const rot = lean * 0.004 + densU * 0.18 + Math.sin(phase) * 0.1;

    softBlob(ctx, cx, cy, rx, ry, rot, hot, 0.55 * bright * ei, mid, 0.32 * bright, deep, 0.06 * bright);
    softBlob(
      ctx,
      cx + lean * 0.06,
      cy - ry * 0.18,
      rx * 0.62,
      ry * 0.75,
      rot,
      tip,
      0.4 * bright * ei,
      hot,
      0.22 * bright,
      mid,
      0.05 * bright,
    );
  }

  // Extra mid-layer density blobs (fill gaps between tongues)
  for (let i = 0; i < 10; i++) {
    const n1 = fbm2(i * 0.9, t * 0.85 + params.seed * 0.02, 2, params.seed + 21);
    const n2 = fbm2(i * 1.2 + 1.5, t * 0.6, 2, params.seed + 33);
    const cx = bx + n1 * 40 * Sp * S + lean * 0.35;
    const cy = by - (55 + Math.abs(n2) * 70 * params.rise) * S;
    softBlob(
      ctx,
      cx,
      cy,
      (18 + Math.abs(n1) * 16) * S,
      (28 + Math.abs(n2) * 36) * S,
      n1 * 0.15,
      tip,
      0.28 * bright * ei,
      hot,
      0.16 * bright,
      mid,
      0.04 * bright,
    );
  }

  // Hot core (soft)
  softBlob(
    ctx,
    bx + lean * 0.08,
    by - 40 * S * params.rise,
    28 * S * Sp,
    42 * S,
    lean * 0.003,
    tip,
    0.62 * bright * ei,
    hot,
    0.36 * bright,
    mid,
    0.07 * bright,
  );
  softBlob(
    ctx,
    bx + lean * 0.05,
    by - 26 * S,
    12 * S,
    18 * S,
    0,
    core,
    0.4 * bright * ei,
    tip,
    0.2 * bright,
    hot,
    0.04 * bright,
  );

  // Soft fringe
  for (let i = 0; i < 16; i++) {
    const n1 = fbm2(i * 0.8, t * 0.9 + params.seed * 0.02, 2, params.seed + 11);
    const n2 = fbm2(i * 1.3 + 2, t * 0.7, 2, params.seed + 17);
    const h = (55 + Math.abs(n2) * 95 * params.rise) * S;
    const cx = bx + n1 * 68 * Sp * S + lean * 0.5;
    const cy = by - h;
    const a = 0.2 * bright * (0.5 + Math.abs(n2));
    softBlob(
      ctx,
      cx,
      cy,
      (12 + Math.abs(n1) * 16) * S,
      (22 + Math.abs(n2) * 30) * S,
      n1 * 0.2,
      tip,
      a,
      mid,
      a * 0.55,
      deep,
      0,
    );
  }
  ctx.restore();

  // Soft ember dots
  if (params.embers > 0.02) {
    const embers = ensureEmbers(params);
    const rand = mulberry32((params.seed + ((t * 10) | 0)) | 0);
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
          e.x = (rand() - 0.5) * 40 * Sp * S;
          e.y = -rand() * 12 * S;
          e.vx = (rand() - 0.5) * 25 + wind * 10;
          e.vy = -(28 + rand() * 55) * params.rise;
          e.r = 1.1 + rand() * 2.2;
          e.hot = rand();
        }
      }
      const fade = 1 - e.life / e.maxLife;
      const a = fade * params.embers * bright * 0.6 * (0.4 + e.hot);
      if (a < 0.03) continue;
      softBlob(ctx, bx + e.x + lean * 0.2, by + e.y - 36 * S, e.r * S, e.r * S, 0, tip, a, hot, a * 0.5, mid, 0);
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
  description: 'Soft campfire over charcoal fuel logs — dense luminous mass, no flame lines.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'fire-default',
    x: 900,
    y: 790,
    seed: 1,
    size: 1.25,
    spread: 1.15,
    rise: 0.95,
    turbulence: 0.9,
    embers: 0.8,
    material: createDefaultMaterial({
      name: 'Fire / Magma',
      baseColor: '#ff3b10',
      emissive: '#ff9a40',
      emissiveIntensity: 1.4,
      blend: 'additive',
      roughness: 0.4,
      metalness: 0.1,
    }),
  },
  draw: drawFire,
};
