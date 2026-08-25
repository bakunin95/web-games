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
 * Soft luminous fire (softBlob fills only):
 * - Blown white–yellow hot core + soft orange bloom
 * - Asymmetric turbulent soft mass
 * - Warm ground spill + sparse rising ember dots
 * - No fuel logs / wood geometry — flame only
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

/** Soft additive/normal ellipse; focus can sit off-center (avoids bullseye logo). */
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
  focusX = 0,
  focusY = 0,
): void {
  if (rx < 0.5 || ry < 0.5 || a0 < 0.004) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  const R = Math.max(rx, ry);
  const fx = Math.max(-rx * 0.55, Math.min(rx * 0.55, focusX * rx));
  const fy = Math.max(-ry * 0.55, Math.min(ry * 0.55, focusY * ry));
  const g = ctx.createRadialGradient(fx, fy, 0, 0, 0, R);
  g.addColorStop(0, withAlpha(c0, a0));
  g.addColorStop(0.4, withAlpha(c1, a1));
  g.addColorStop(0.78, withAlpha(c2, a2));
  g.addColorStop(1, withAlpha(c2, 0));
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

  // ── 2. Soft base heat + sparse sparkles (no fuel wood) ──
  const crackRand = mulberry32((params.seed + 77) | 0);
  for (let i = 0; i < 10; i++) {
    const u = (crackRand() - 0.5) * 40 * Sp * S;
    const v = (crackRand() - 0.5) * 8 * S;
    const pulse = 0.55 + 0.45 * Math.sin(t * (3.2 + (i % 5)) + i * 1.4);
    softBlob(
      ctx,
      bx + u,
      by + v,
      (3 + crackRand() * 6) * S,
      (1.8 + crackRand() * 2.5) * S,
      (crackRand() - 0.5) * 1.1,
      i % 3 === 0 ? corePale : tip,
      0.45 * bright * ei * pulse,
      hot,
      0.25 * bright * pulse,
      deep,
      0.05 * bright,
      (crackRand() - 0.5) * 0.4,
      0.25,
    );
  }

  // Hot bed under flame base — wide/shallow luminous contact
  softBlob(
    ctx,
    bx + lean * 0.05 + 4 * S,
    by + 2 * S,
    48 * S * Sp,
    12 * S,
    0.05,
    corePale,
    0.48 * bright * ei,
    hot,
    0.3 * bright,
    mid,
    0.07 * bright,
    0.15,
    0.35,
  );
  softBlob(
    ctx,
    bx - 6 * S,
    by + 4 * S,
    18 * S * Sp,
    7 * S,
    -0.1,
    coreWhite,
    0.55 * bright * ei,
    coreYellow,
    0.32 * bright,
    hot,
    0.06 * bright,
    -0.1,
    0.3,
  );

  // ── 3. Large soft orange bloom (very soft — no giant oval silhouette) ──
  {
    const bloomH = (100 + 35 * params.rise) * S;
    const bloomW = 70 * S * Sp;
    softBlob(
      ctx,
      bx + lean * 0.55,
      by - bloomH * 0.35,
      bloomW * 1.5,
      bloomH,
      lean * 0.005,
      hot,
      0.1 * bright * ei,
      mid,
      0.05 * bright,
      deep,
      0.015 * bright,
      0.2,
      0.15,
    );
  }

  // ── 4. Irregular luminous mass — clustered placements, not even lobe fan ──
  const placeRand = mulberry32((params.seed + 19) | 0);
  const lobeCount = Math.floor(7 + Sp * 3);
  for (let i = 0; i < lobeCount; i++) {
    // Uneven left/right density: more mass leans with wind + seed bias
    const sidePick = placeRand();
    const side = sidePick < 0.38 ? -1 : sidePick < 0.55 ? 0 : 1;
    const nH = fbm2(i * 1.1, t * 0.5 + params.seed * 0.02, 3, params.seed + 5);
    const nW = fbm2(i * 0.7 + 2, t * 0.65, 3, params.seed + 8);
    const phase = t * (1.1 + (i % 4) * 0.3) + i * 2.1;
    const lengthBias = 0.55 + 0.7 * Math.abs(nH) + 0.25 * (0.5 + 0.5 * Math.sin(phase));
    const h = (48 + lengthBias * 125 * params.rise) * S;
    const span = (22 + Math.abs(nW) * 55) * Sp * S;
    const cx =
      bx +
      side * span * (0.35 + placeRand() * 0.75) +
      lean * (0.25 + lengthBias * 0.5) +
      Math.sin(phase) * 14 * Sp * params.turbulence;
    const cy = by - h * (0.28 + 0.35 * Math.abs(nH)) - 6 * S;
    const rx = (18 + Math.abs(nW) * 22 + (1 - Math.abs(side) * 0.25) * 10) * S * Sp;
    const ry = h * (0.38 + 0.2 * Math.abs(nH));
    const rot = lean * 0.005 + side * 0.18 + nW * 0.2;

    // Single body blob per lobe (no nested concentric inner)
    softBlob(
      ctx,
      cx,
      cy,
      rx,
      ry,
      rot,
      tip,
      0.3 * bright * ei,
      hot,
      0.18 * bright,
      mid,
      0.04 * bright,
      side * 0.25,
      0.2,
    );
  }

  // Turbulent spine fill — anisotropic blobs along a leaning ridge
  for (let i = 0; i < 8; i++) {
    const n1 = fbm2(i * 0.9, t * 0.75 + params.seed * 0.02, 3, params.seed + 21);
    const n2 = fbm2(i * 1.3 + 1.2, t * 0.5, 3, params.seed + 33);
    const climb = (i + 0.5) / 8;
    const cx = bx + lean * (0.3 + climb * 0.55) + n1 * 38 * Sp * S + 8 * S;
    const cy = by - (28 + climb * 95 * params.rise + Math.abs(n2) * 20) * S;
    const wide = climb < 0.35;
    softBlob(
      ctx,
      cx,
      cy,
      ((wide ? 22 : 10) + Math.abs(n1) * 16) * S * Sp,
      ((wide ? 14 : 26) + Math.abs(n2) * 22) * S,
      n1 * 0.22 + lean * 0.004,
      coreYellow,
      0.2 * bright * ei * (1 - climb * 0.35),
      tip,
      0.12 * bright,
      hot,
      0.03 * bright,
      n1 * 0.3,
      wide ? 0.35 : -0.15,
    );
  }

  // ── 5. Blown white–yellow core — wide/shallow + offset shards (no bullseye stack) ──
  softBlob(
    ctx,
    bx + lean * 0.12 + 6 * S,
    by - 12 * S,
    42 * S * Sp,
    16 * S,
    0.08,
    corePale,
    0.5 * bright * ei,
    coreYellow,
    0.3 * bright,
    tip,
    0.07 * bright,
    0.2,
    0.4,
  );
  softBlob(
    ctx,
    bx + lean * 0.08 - 10 * S,
    by - 8 * S,
    20 * S * Sp,
    11 * S,
    -0.15,
    coreWhite,
    0.72 * bright * ei,
    corePale,
    0.45 * bright,
    coreYellow,
    0.1 * bright,
    -0.25,
    0.35,
  );
  softBlob(
    ctx,
    bx + lean * 0.05 + 14 * S,
    by - 5 * S,
    11 * S,
    7 * S,
    0.2,
    coreWhite,
    0.8 * bright * ei,
    coreWhite,
    0.5 * bright,
    corePale,
    0.12 * bright,
    0.15,
    0.25,
  );

  // ── 6. Turbulent soft tips — dissolve upward, bias one side ──
  for (let i = 0; i < 12; i++) {
    const n1 = fbm2(i * 0.95, t * 1.1 + params.seed * 0.02, 3, params.seed + 11);
    const n2 = fbm2(i * 1.5 + 2.2, t * 0.8, 3, params.seed + 17);
    if (n2 < -0.15 && i % 3 === 0) continue; // sparse gaps
    const tipH = (65 + Math.abs(n2) * 115 * params.rise) * S;
    const side = n1 > -0.1 ? 1.25 : 0.7; // majority lean one way
    const cx = bx + n1 * 78 * Sp * S * side + lean * 0.6;
    const cy = by - tipH;
    const a = 0.12 * bright * (0.35 + Math.abs(n2));
    softBlob(
      ctx,
      cx,
      cy,
      (8 + Math.abs(n1) * 12) * S,
      (20 + Math.abs(n2) * 32) * S,
      n1 * 0.3 + lean * 0.004,
      tip,
      a,
      mid,
      a * 0.45,
      deep,
      0,
      n1 * 0.2,
      -0.35,
    );
  }

  // ── 7. Faint soft heat haze above the mass ──
  softBlob(
    ctx,
    bx + lean * 0.55 + 10 * S,
    by - (125 + 45 * params.rise) * S,
    50 * S * Sp,
    36 * S,
    lean * 0.006,
    tip,
    0.04 * bright * ei,
    hot,
    0.02 * bright,
    mid,
    0.006 * bright,
    0.2,
    -0.2,
  );
  softBlob(
    ctx,
    bx + lean * 0.4 - 8 * S,
    by - (145 + 35 * params.rise) * S,
    32 * S * Sp,
    26 * S,
    -0.1,
    mid,
    0.025 * bright,
    deep,
    0.012 * bright,
    deep,
    0,
    -0.15,
    -0.25,
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
    'Soft luminous fire: blown white core + orange bloom — flame only, no fuel logs.',
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
