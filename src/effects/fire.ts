import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { createDefaultMaterial } from '../core/material';
import { fbm2, mulberry32, withAlpha, lerpColor } from './noise';

export interface FireParams extends PlacedEffectParams {
  size: number;
  spread: number;
  rise: number;
  turbulence: number;
  /** Soft floating ember dots (not streaks/lines). */
  embers: number;
}

/**
 * Photographic soft campfire (softBlob / ellipse fills only):
 * - Blown white–yellow hot core + soft orange bloom
 * - Crossed charcoal logs with ember pockets, ash, uneven ground contact
 * - Asymmetric luminous mass with turbulent soft tips
 * - Warm ground spill + sparse rising ember dots + faint heat haze
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

/** Soft additive/normal ellipse; gradient fades to zero at the contour. */
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
  const R = Math.max(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, withAlpha(c0, a0));
  g.addColorStop(0.28, withAlpha(c0, a0 * 0.9));
  g.addColorStop(0.55, withAlpha(c1, a1));
  g.addColorStop(0.82, withAlpha(c2, a2));
  g.addColorStop(1, withAlpha(c2, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Charcoal log: dark cylinder with end-cap discs (fills only — no strokes). */
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

  // Shadow under log (uneven ground contact)
  softBlob(
    ctx,
    0,
    thick * 0.65,
    len * 0.95,
    thick * 0.55,
    0,
    '#050302',
    0.55,
    '#0a0604',
    0.35,
    '#000000',
    0.1,
  );

  // Main body — charcoal bark
  const s = Math.floor(10 + shade * 16);
  const body = ctx.createLinearGradient(0, -thick, 0, thick);
  body.addColorStop(0, `rgb(${s + 14},${s + 8},${s})`);
  body.addColorStop(0.35, `rgb(${s + 2},${s - 2},${Math.max(0, s - 6)})`);
  body.addColorStop(0.7, `rgb(${Math.max(4, s - 8)},${Math.max(2, s - 12)},${Math.max(0, s - 14)})`);
  body.addColorStop(1, `rgb(${Math.max(2, s - 16)},${Math.max(1, s - 18)},${Math.max(0, s - 20)})`);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, len, thick, 0, 0, Math.PI * 2);
  ctx.fill();

  // Soft char patches along length
  softBlob(ctx, -len * 0.25, -thick * 0.1, len * 0.35, thick * 0.55, 0.1, '#080604', 0.55, '#120a06', 0.3, '#1a1008', 0);
  softBlob(ctx, len * 0.3, thick * 0.15, len * 0.28, thick * 0.45, -0.15, '#060402', 0.5, '#100806', 0.25, '#000', 0);

  // Near end-cap (cut face)
  const endX = len * 0.82;
  const endRy = thick * 0.95;
  const endRx = thick * 0.42;
  const end = ctx.createRadialGradient(endX, 0, 0, endX, 0, endRy);
  const e = Math.floor(22 + shade * 18);
  end.addColorStop(0, `rgb(${e + 8},${e - 2},${Math.max(0, e - 12)})`);
  end.addColorStop(0.55, `rgb(${Math.max(6, e - 10)},${Math.max(4, e - 14)},${Math.max(2, e - 18)})`);
  end.addColorStop(1, `rgb(${Math.max(2, e - 18)},${Math.max(1, e - 20)},0)`);
  ctx.fillStyle = end;
  ctx.beginPath();
  ctx.ellipse(endX, 0, endRx, endRy, 0, 0, Math.PI * 2);
  ctx.fill();

  // Far end-cap (darker, foreshortened)
  softBlob(
    ctx,
    -len * 0.78,
    0,
    thick * 0.38,
    thick * 0.88,
    0,
    `rgb(${Math.max(4, s - 6)},${Math.max(2, s - 10)},${Math.max(0, s - 12)})`,
    0.95,
    `rgb(${Math.max(2, s - 14)},${Math.max(1, s - 16)},0)`,
    0.85,
    '#020100',
    0.4,
  );

  ctx.restore();
}

function ensureEmbers(params: FireParams): Ember[] {
  let pool = pools.get(params.instanceId);
  if (!pool) {
    pool = [];
    pools.set(params.instanceId, pool);
  }
  // Sparse — photographic campfires show few rising dots
  const n = Math.floor(4 + params.embers * 14 * params.intensity);
  const rand = mulberry32((params.seed + 9) | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 36,
      y: -rand() * 16,
      vx: (rand() - 0.5) * 18,
      vy: -(40 + rand() * 55),
      life: rand(),
      maxLife: 1.0 + rand() * 1.6,
      r: 0.9 + rand() * 1.8,
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
    0.055 * Math.sin(t * 6.2) +
    0.045 * fbm2(t * 1.9, params.seed * 0.02, 2, params.seed);
  const bright = I * flicker;

  const lean =
    wind * 16 +
    fbm2(t * 0.32, params.seed * 0.02, 2, params.seed + 2) * 12 * Sp * params.turbulence;

  // Photographic palette: white-blown core → pale yellow → hot orange → deep ember
  const deep = lerpColor(mat.baseColor || '#ff3b10', '#2a0500', 0.55);
  const mid = mat.baseColor || '#ff3b10';
  const hot = mat.emissive || '#ff9a40';
  const tip = '#ffb060';
  const coreYellow = '#ffe49a';
  const corePale = '#fff6d0';
  const coreWhite = '#ffffff';

  const bx = params.x;
  const by = params.y;
  const logY = by + 5 * S;

  // ── 1. Warm ground spill / environmental bounce (additive) ──
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = mat.opacity;

  softBlob(
    ctx,
    bx + lean * 0.03,
    by + 16 * S,
    150 * S * Sp,
    42 * S,
    0,
    hot,
    0.42 * bright * ei,
    mid,
    0.2 * bright,
    deep,
    0.05 * bright,
  );
  softBlob(
    ctx,
    bx,
    by + 12 * S,
    70 * S * Sp,
    22 * S,
    0,
    coreYellow,
    0.38 * bright * ei,
    hot,
    0.2 * bright,
    mid,
    0.05 * bright,
  );

  // Textured spill patches (inverse-square falloff — light on dirt, not a grey disc)
  const spillR = 120 * S * Sp;
  const patches = Math.floor(40 + 20 * S);
  for (let i = 0; i < patches; i++) {
    const n1 = fbm2(i * 0.41, t * 0.2 + params.seed * 0.01, 2, params.seed + 11);
    const n2 = fbm2(i * 0.67 + 1.7, t * 0.15, 2, params.seed + 19);
    const ang = (i / patches) * Math.PI * 2 + n1 * 1.1;
    const u = 0.08 + Math.abs(n2) * 0.55 + ((i * 11) % 5) * 0.07;
    const dist = Math.min(1, u) * spillR;
    const invSq = 1 / (1 + (dist / (spillR * 0.28)) ** 2);
    const a = invSq * (0.45 + 0.55 * Math.abs(n1)) * 0.38 * bright * ei;
    if (a < 0.012) continue;
    const px = bx + Math.cos(ang) * dist * (0.75 + Math.abs(n2) * 0.35);
    const py = by + 14 * S + Math.sin(ang) * dist * 0.22 + n1 * 3;
    const prx = (6 + Math.abs(n1) * 16) * S;
    const warm = i % 4 === 0 ? corePale : i % 4 === 1 ? coreYellow : hot;
    softBlob(ctx, px, py, prx, prx * 0.28, ang * 0.2, warm, a, mid, a * 0.5, deep, a * 0.1);
  }
  ctx.restore();

  // ── 2. Ash / charcoal ground contact (source-over) ──
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = mat.opacity;

  // Ash mound under logs
  softBlob(ctx, bx - 8 * S, logY + 10 * S, 52 * S * Sp, 14 * S, -0.05, '#3a342c', 0.55, '#2a241c', 0.4, '#14100c', 0.2);
  softBlob(ctx, bx + 18 * S, logY + 12 * S, 40 * S * Sp, 11 * S, 0.08, '#2e2820', 0.45, '#1c1812', 0.35, '#0c0a08', 0.15);
  softBlob(ctx, bx, logY + 8 * S, 28 * S * Sp, 9 * S, 0, '#4a4438', 0.35, '#2c261e', 0.25, '#12100c', 0.1);

  // Crossed dark logs — uneven Y so they sit in ash, not floating ovals
  drawLog(ctx, bx - 26 * S * Sp, logY + 4 * S, 42 * S, 10 * S, -0.48, 0.45);
  drawLog(ctx, bx + 22 * S * Sp, logY + 6 * S, 44 * S, 11 * S, 0.55, 0.32);
  drawLog(ctx, bx - 6 * S, logY - 1 * S, 48 * S, 12 * S, 0.12, 0.62);
  drawLog(ctx, bx + 14 * S * Sp, logY + 9 * S, 36 * S, 9 * S, -0.22, 0.28);
  drawLog(ctx, bx - 18 * S * Sp, logY + 11 * S, 30 * S, 8 * S, 0.72, 0.2);

  // Dark coal pile nestled between logs
  softBlob(ctx, bx + 2 * S, logY + 5 * S, 32 * S * Sp, 12 * S, 0.05, '#120a06', 0.92, '#080402', 0.8, '#030201', 0.45);
  softBlob(ctx, bx - 10 * S, logY + 7 * S, 18 * S, 8 * S, -0.2, '#1a0e08', 0.75, '#0c0604', 0.55, '#040201', 0.25);
  ctx.restore();

  // ── 3. Ember pockets between logs + bed glow (additive) ──
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = mat.opacity;

  const crackRand = mulberry32((params.seed + 77) | 0);
  for (let i = 0; i < 22; i++) {
    const u = (crackRand() - 0.5) * 68 * Sp * S;
    const v = (crackRand() - 0.5) * 12 * S + 2 * S;
    const pulse = 0.6 + 0.4 * Math.sin(t * (3.5 + (i % 6)) + i * 1.3);
    softBlob(
      ctx,
      bx + u,
      logY + v,
      (3.5 + crackRand() * 8) * S,
      (2 + crackRand() * 3.5) * S,
      (crackRand() - 0.5) * 0.9,
      i % 3 === 0 ? corePale : tip,
      0.55 * bright * ei * pulse,
      hot,
      0.32 * bright * pulse,
      deep,
      0.06 * bright,
    );
  }

  // Hot bed under flame base
  softBlob(
    ctx,
    bx + lean * 0.04,
    logY - 2 * S,
    52 * S * Sp,
    16 * S,
    0,
    corePale,
    0.55 * bright * ei,
    hot,
    0.35 * bright,
    mid,
    0.08 * bright,
  );
  softBlob(
    ctx,
    bx,
    logY,
    22 * S * Sp,
    8 * S,
    0,
    coreWhite,
    0.7 * bright * ei,
    coreYellow,
    0.4 * bright,
    hot,
    0.08 * bright,
  );

  // ── 4. Large soft orange bloom (photographic volume) ──
  {
    const bloomH = (110 + 40 * params.rise) * S;
    const bloomW = 78 * S * Sp;
    softBlob(
      ctx,
      bx + lean * 0.45,
      by - bloomH * 0.38,
      bloomW * 1.4,
      bloomH * 0.95,
      lean * 0.004,
      hot,
      0.14 * bright * ei,
      mid,
      0.07 * bright,
      deep,
      0.02 * bright,
    );
    softBlob(
      ctx,
      bx + lean * 0.3,
      by - bloomH * 0.28,
      bloomW,
      bloomH * 0.75,
      lean * 0.003,
      tip,
      0.12 * bright * ei,
      hot,
      0.06 * bright,
      mid,
      0.015 * bright,
    );
  }

  // ── 5. Asymmetric soft luminous mass (dense soft blobs — no strokes) ──
  const lobes = Math.floor(14 + Sp * 6);
  for (let i = 0; i < lobes; i++) {
    const u = (i + 0.5) / lobes - 0.5;
    const phase = t * (1.2 + (i % 5) * 0.22) + i * 1.55 + params.seed * 0.01;
    const wobble = Math.sin(phase) * 18 * Sp * params.turbulence;
    const turbN = fbm2(i * 0.75, t * 0.55 + params.seed * 0.02, 3, params.seed + 5);
    // Asymmetric height bias: left/right lobes differ; tips turbulent
    const sideBias = u > 0 ? 0.85 + 0.35 * Math.abs(u) : 1.05 + 0.2 * Math.abs(u);
    const lengthBias =
      (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(phase * 0.55 + i * 0.9)) + 0.4 * Math.abs(turbN)) *
      sideBias;
    const h = (55 + lengthBias * 130 * params.rise) * S;
    const sidePush = u * (0.4 + Math.abs(u) * 1.25);
    const cx = bx + sidePush * 88 * Sp * S + lean * (0.2 + lengthBias * 0.55) + wobble;
    const cy = by - h * 0.42 - 8 * S;
    const rx =
      (16 + (1 - Math.abs(u)) * 26 + Math.abs(fbm2(i, t * 0.28, 2, params.seed + 8)) * 12) * S * Sp;
    const ry = h * (0.42 + 0.14 * Math.abs(fbm2(i * 1.1, t * 0.3, 2, params.seed + 9)));
    const rot = lean * 0.004 + sidePush * 0.2 + Math.sin(phase) * 0.14;

    // Outer orange body
    softBlob(ctx, cx, cy, rx, ry, rot, tip, 0.32 * bright * ei, hot, 0.2 * bright, mid, 0.05 * bright);
    // Inner warmer mass
    softBlob(
      ctx,
      cx + lean * 0.05,
      cy - ry * 0.12,
      rx * 0.62,
      ry * 0.7,
      rot,
      coreYellow,
      0.28 * bright * ei,
      tip,
      0.16 * bright,
      hot,
      0.04 * bright,
    );
  }

  // Mid-fill density (closes gaps into one soft mass)
  for (let i = 0; i < 12; i++) {
    const n1 = fbm2(i * 0.85, t * 0.8 + params.seed * 0.02, 2, params.seed + 21);
    const n2 = fbm2(i * 1.15 + 1.4, t * 0.55, 2, params.seed + 33);
    const cx = bx + n1 * 48 * Sp * S + lean * 0.4;
    const cy = by - (40 + Math.abs(n2) * 75 * params.rise) * S;
    softBlob(
      ctx,
      cx,
      cy,
      (14 + Math.abs(n1) * 18) * S,
      (22 + Math.abs(n2) * 32) * S,
      n1 * 0.18,
      coreYellow,
      0.22 * bright * ei,
      tip,
      0.14 * bright,
      hot,
      0.035 * bright,
    );
  }

  // ── 6. Blown white–yellow hot core (low, wide — photo campfire) ──
  softBlob(
    ctx,
    bx + lean * 0.1,
    by - 18 * S,
    36 * S * Sp,
    32 * S,
    lean * 0.002,
    corePale,
    0.55 * bright * ei,
    coreYellow,
    0.35 * bright,
    tip,
    0.08 * bright,
  );
  softBlob(
    ctx,
    bx + lean * 0.06,
    by - 10 * S,
    22 * S * Sp,
    18 * S,
    0,
    coreWhite,
    0.85 * bright * ei,
    corePale,
    0.55 * bright,
    coreYellow,
    0.12 * bright,
  );
  softBlob(
    ctx,
    bx + lean * 0.04,
    by - 6 * S,
    12 * S,
    10 * S,
    0,
    coreWhite,
    0.95 * bright * ei,
    coreWhite,
    0.7 * bright,
    corePale,
    0.15 * bright,
  );

  // ── 7. Turbulent soft tips (asymmetric, dissolving upward) ──
  for (let i = 0; i < 14; i++) {
    const n1 = fbm2(i * 0.9, t * 1.05 + params.seed * 0.02, 3, params.seed + 11);
    const n2 = fbm2(i * 1.4 + 2.2, t * 0.75, 3, params.seed + 17);
    const tipH = (70 + Math.abs(n2) * 110 * params.rise) * S;
    // Push tips unevenly — one side climbs higher
    const side = n1 > 0 ? 1.15 : 0.85;
    const cx = bx + n1 * 72 * Sp * S * side + lean * 0.55;
    const cy = by - tipH;
    const a = 0.16 * bright * (0.4 + Math.abs(n2));
    softBlob(
      ctx,
      cx,
      cy,
      (10 + Math.abs(n1) * 14) * S,
      (18 + Math.abs(n2) * 28) * S,
      n1 * 0.25 + lean * 0.003,
      tip,
      a,
      mid,
      a * 0.5,
      deep,
      0,
    );
  }

  // ── 8. Faint soft heat haze above the mass ──
  softBlob(
    ctx,
    bx + lean * 0.5,
    by - (130 + 50 * params.rise) * S,
    55 * S * Sp,
    40 * S,
    lean * 0.005,
    tip,
    0.045 * bright * ei,
    hot,
    0.025 * bright,
    mid,
    0.008 * bright,
  );
  softBlob(
    ctx,
    bx + lean * 0.35 + 12 * S,
    by - (150 + 40 * params.rise) * S,
    35 * S * Sp,
    28 * S,
    0.08,
    mid,
    0.03 * bright,
    deep,
    0.015 * bright,
    deep,
    0,
  );
  ctx.restore();

  // ── 9. Sparse soft ember dots rising ──
  if (params.embers > 0.02) {
    const embers = ensureEmbers(params);
    const rand = mulberry32((params.seed + ((t * 10) | 0)) | 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const e of embers) {
      if (!scene.paused) {
        e.life += dt;
        e.x += (e.vx + wind * 35) * dt;
        e.y += e.vy * dt;
        e.vy -= 6 * dt;
        e.vx += fbm2(e.x * 0.04, t * 1.2, 2, params.seed + 7) * 40 * dt;
        if (e.life >= e.maxLife) {
          e.life = 0;
          e.maxLife = 0.9 + rand() * 1.5;
          e.x = (rand() - 0.5) * 36 * Sp * S;
          e.y = -rand() * 10 * S;
          e.vx = (rand() - 0.5) * 22 + wind * 8;
          e.vy = -(35 + rand() * 50) * params.rise;
          e.r = 0.85 + rand() * 1.7;
          e.hot = rand();
        }
      }
      const fade = 1 - e.life / e.maxLife;
      const a = fade * params.embers * bright * 0.55 * (0.45 + e.hot);
      if (a < 0.03) continue;
      const col = e.hot > 0.65 ? corePale : tip;
      softBlob(
        ctx,
        bx + e.x + lean * 0.15,
        by + e.y - 28 * S,
        e.r * S,
        e.r * S,
        0,
        col,
        a,
        hot,
        a * 0.45,
        mid,
        0,
      );
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
  description:
    'Photographic soft campfire: blown white core, charcoal logs, orange bloom — soft blobs only.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'fire-default',
    x: 900,
    y: 790,
    seed: 1,
    size: 1.25,
    spread: 1.2,
    rise: 0.95,
    turbulence: 1.0,
    embers: 0.7,
    material: createDefaultMaterial({
      name: 'Fire / Magma',
      baseColor: '#ff3b10',
      emissive: '#ffc878',
      emissiveIntensity: 1.45,
      blend: 'additive',
      roughness: 0.35,
      metalness: 0.1,
    }),
  },
  draw: drawFire,
};
