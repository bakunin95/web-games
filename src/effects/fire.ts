import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial } from '../core/material';
import { createDefaultMaterial } from '../core/material';
import { fbm2, mulberry32, withAlpha, lerpColor } from './noise';

export interface FireParams extends PlacedEffectParams {
  size: number;
  spread: number;
  rise: number;
  turbulence: number;
  embers: number;
}

/** Soft luminous kernel — dense overlaps merge into irregular rising mass. */
interface Kernel {
  ox: number;
  oy: number;
  life: number;
  maxLife: number;
  phase: number;
  size: number;
  /** 0 fringe · 1 body · 2 inner · 3 core */
  role: 0 | 1 | 2 | 3;
  lean: number;
  /** Persistent side bias — breaks left/right mirror symmetry */
  bias: number;
  /** Per-kernel sway frequency mix */
  swayA: number;
  swayB: number;
}

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  wobble: number;
}

interface FireState {
  kernels: Kernel[];
  embers: Ember[];
}

const states = new Map<string, FireState>();

function spawnKernel(rand: () => number): Kernel {
  const r = rand();
  const role = (r < 0.28 ? 0 : r < 0.58 ? 1 : r < 0.86 ? 2 : 3) as 0 | 1 | 2 | 3;
  // Chaotic, non-radial placement: cluster toward base with heavy side bias
  const side = rand() < 0.55 ? -1 : 1;
  const biasMag = 0.15 + rand() * 0.95;
  return {
    ox: (rand() - 0.5) * 2.4 + side * biasMag * 0.35,
    oy: rand() * rand() * 1.15, // denser near base
    life: rand(),
    maxLife: 0.4 + rand() * 1.15,
    phase: rand() * Math.PI * 2,
    size: 7 + rand() * 26,
    role,
    lean: (rand() - 0.5) * 0.85,
    bias: side * biasMag,
    swayA: 1.6 + rand() * 3.8,
    swayB: 2.2 + rand() * 5.5,
  };
}

function ensureState(params: FireParams): FireState {
  let state = states.get(params.instanceId);
  if (!state) {
    state = { kernels: [], embers: [] };
    states.set(params.instanceId, state);
  }

  // Dense soft kernels → additive luminous mass (wide campfire, not torch)
  const kernelTarget = Math.floor(95 + params.intensity * 170 * params.size);
  const rand = mulberry32(params.seed | 0);
  while (state.kernels.length < kernelTarget) {
    state.kernels.push(spawnKernel(rand));
  }
  if (state.kernels.length > kernelTarget) state.kernels.length = kernelTarget;

  // More secondary sparks than before — drifting embers sell "real fire"
  const emberTarget = Math.floor(params.embers * 42 * params.intensity);
  while (state.embers.length < emberTarget) {
    state.embers.push(spawnEmber(rand, params));
  }
  if (state.embers.length > emberTarget) state.embers.length = emberTarget;

  return state;
}

function spawnEmber(rand: () => number, params: FireParams): Ember {
  return {
    x: (rand() - 0.5) * 28 * params.spread,
    y: -rand() * 10,
    vx: (rand() - 0.5) * 70,
    vy: -(40 + rand() * 95) * params.rise,
    life: 0,
    maxLife: 0.5 + rand() * 1.6,
    size: 0.4 + rand() * 1.85,
    wobble: 2.5 + rand() * 6,
  };
}

/**
 * Soft additive ellipse. Gradient reaches zero at the contour — no hard edge.
 */
function softBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
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
  if (a0 <= 0.003 && a1 <= 0.003) return;
  const R = Math.max(rx, ry);
  if (R < 0.5) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, withAlpha(c0, a0));
  g.addColorStop(0.22, withAlpha(c0, a0 * 0.92));
  g.addColorStop(0.45, withAlpha(c1, a1));
  g.addColorStop(0.78, withAlpha(c2, a2));
  g.addColorStop(1, withAlpha(c2, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

export const drawFire: DrawFn<FireParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const colorHot = mat.emissive;
  const colorMid = mat.baseColor;
  const colorFringe = lerpColor(mat.baseColor, '#ff7018', 0.2);
  const colorDeep = lerpColor(mat.baseColor, '#2a0600', 0.5);
  const coreWhite = '#ffffff';
  const corePale = '#fff8d0';
  const coreYellow = '#ffe49a';
  const state = ensureState(params);
  const dt = scene.dt || 1 / 60;
  const rand = mulberry32((params.seed + 42) | 0);
  const wind = scene.wind.x;
  const ei = mat.emissiveIntensity;
  // Global flicker — uneven, not a single sine
  const flicker =
    0.9 +
    0.05 * Math.sin(t * 7.2) +
    0.04 * Math.sin(t * 13.1 + 1.3) +
    0.05 * fbm2(t * 1.9, params.seed * 0.01, 3, params.seed);
  const I = params.intensity * flicker;
  const S = params.size;
  const Sp = params.spread;

  // Whole-mass lean: breaks bilateral symmetry of the silhouette
  const massLean =
    fbm2(t * 0.55, params.seed * 0.02, 3, params.seed + 3) * 14 * Sp +
    Math.sin(t * 1.15) * 4.5 * Sp +
    wind * 10;

  ctx.save();
  applyMaterial(ctx, mat);

  // ── 1. Ground spill: textured warm light, strong at base, inverse-square ──
  {
    const spillR = 110 * S * Sp;
    const by = params.y + 14;
    const bx = params.x + massLean * 0.12;
    softBlob(
      ctx,
      bx,
      by,
      spillR,
      spillR * 0.3,
      0,
      colorHot,
      0.32 * I * ei,
      colorMid,
      0.18 * I * ei,
      colorFringe,
      0.05 * I,
    );
    softBlob(
      ctx,
      bx + massLean * 0.08,
      by - 2,
      spillR * 0.45,
      spillR * 0.16,
      0,
      coreYellow,
      0.4 * I * ei,
      colorHot,
      0.22 * I * ei,
      colorMid,
      0.06 * I,
    );

    const patches = Math.floor(56 + 32 * S);
    for (let i = 0; i < patches; i++) {
      const n1 = fbm2(i * 0.37, t * 0.22 + params.seed * 0.01, 3, params.seed + 11);
      const n2 = fbm2(i * 0.61 + 2.1, t * 0.18, 3, params.seed + 19);
      // Irregular angular spacing — not even radial spokes
      const ang = (i / patches) * Math.PI * 2 + n1 * 1.55 + (i % 3) * 0.31;
      const u = 0.05 + Math.abs(n2) * 0.65 + ((i * 13) % 7) * 0.055;
      const dist = Math.min(1, u) * spillR;
      const invSq = 1 / (1 + (dist / (spillR * 0.25)) ** 2);
      const n = 0.45 + 0.55 * (0.5 + 0.5 * n1);
      const a = invSq * n * 0.42 * I * ei;
      if (a < 0.012) continue;
      const px = bx + Math.cos(ang) * dist * (0.65 + Math.abs(n2) * 0.5);
      const py = by + Math.sin(ang) * dist * 0.24 + n1 * 4;
      const prx = (7 + n * 18 + Math.abs(n2) * 12) * S;
      const pry = prx * (0.26 + Math.abs(n1) * 0.14);
      const warm =
        i % 5 === 0 ? corePale : i % 5 === 1 ? coreYellow : i % 5 === 2 ? colorHot : colorMid;
      softBlob(
        ctx,
        px,
        py,
        prx,
        pry,
        ang * 0.25 + n2 * 0.35,
        warm,
        a,
        colorFringe,
        a * 0.55,
        colorDeep,
        a * 0.12,
      );
    }
  }

  // ── 2. Volumetric glow: irregular low-alpha bloom (not a centered cone) ──
  {
    const bloomH = 100 * S * (0.5 + params.rise * 0.45);
    const bloomW = 78 * S * Sp;
    const lean = massLean;
    softBlob(
      ctx,
      params.x + wind * 16 + lean * 0.55,
      params.y - bloomH * 0.4,
      bloomW * 1.4,
      bloomH * 0.92,
      lean * 0.004 + wind * 0.03,
      colorHot,
      0.08 * I * ei,
      colorMid,
      0.042 * I,
      colorDeep,
      0.011 * I,
    );
    // Offset secondary bloom — breaks teardrop silhouette
    softBlob(
      ctx,
      params.x + wind * 10 + lean * 0.85 + 8 * Sp,
      params.y - bloomH * 0.32,
      bloomW * 0.75,
      bloomH * 0.7,
      lean * 0.006 + 0.08,
      coreYellow,
      0.055 * I * ei,
      colorHot,
      0.028 * I,
      colorMid,
      0.009 * I,
    );
    softBlob(
      ctx,
      params.x + wind * 6 + lean * 0.35 - 10 * Sp,
      params.y - bloomH * 0.22,
      bloomW * 0.55,
      bloomH * 0.48,
      -0.06 + lean * 0.003,
      corePale,
      0.04 * I * ei,
      coreYellow,
      0.02 * I,
      colorHot,
      0.007 * I,
    );
  }

  // ── 3. Ember bed / fuel logs — fire sits on something real ──
  {
    const logY = params.y + 8;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 5; i++) {
      const lx = params.x + (i - 2) * 11 * S * Sp + Math.sin(i * 1.7) * 3;
      const ly = logY + (i % 2) * 3;
      const lw = (18 + (i % 3) * 6) * S;
      const lh = (5 + (i % 2) * 2) * S;
      const g = ctx.createLinearGradient(lx - lw, ly, lx + lw, ly);
      g.addColorStop(0, withAlpha('#1a0e08', 0.85 * I));
      g.addColorStop(0.4, withAlpha('#3a2214', 0.9 * I));
      g.addColorStop(0.7, withAlpha('#2a180c', 0.85 * I));
      g.addColorStop(1, withAlpha('#120804', 0.7 * I));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(lx, ly, lw, lh, (i - 2) * 0.08, 0, Math.PI * 2);
      ctx.fill();
      softBlob(
        ctx,
        lx,
        ly - 2,
        lw * 0.6,
        lh * 0.8,
        0,
        colorHot,
        0.25 * I * ei,
        colorMid,
        0.1 * I,
        colorDeep,
        0,
      );
    }
    ctx.restore();
    softBlob(
      ctx,
      params.x + massLean * 0.15,
      params.y + 4,
      36 * S * Sp,
      12 * S,
      0,
      corePale,
      0.5 * I * ei,
      colorHot,
      0.35 * I * ei,
      colorMid,
      0.1 * I,
    );
    softBlob(
      ctx,
      params.x + massLean * 0.1,
      params.y + 2,
      18 * S * Sp,
      7 * S,
      0,
      coreWhite,
      0.65 * I * ei,
      corePale,
      0.4 * I * ei,
      colorHot,
      0.08 * I,
    );
  }

  // ── 4. Luminous mass: asymmetric chaotic kernels (irregular rising soft mass) ──
  const ordered = [...state.kernels].sort((a, b) => a.role - b.role);
  const riseBase = (0.9 + params.rise * 0.9) * S;

  for (const f of ordered) {
    if (!scene.paused) {
      f.life += dt;
      if (f.life >= f.maxLife) {
        Object.assign(f, spawnKernel(rand), { life: 0 });
      }
    }

    const p = f.life / f.maxLife;
    const age = 1 - p;
    const roleRise = f.role === 0 ? 0.5 : f.role === 1 ? 0.9 : f.role === 2 ? 1.15 : 0.65;
    const height = (30 + f.size * 3.0) * riseBase * roleRise * (0.55 + f.oy * 0.65);

    const turb =
      fbm2(f.ox * 2.8 + f.phase, t * (1.7 + params.turbulence) + f.phase, 4, params.seed) *
      params.turbulence *
      16 *
      Sp;
    const turb2 =
      fbm2(f.oy * 3.1 + f.bias, t * 2.4 + f.phase * 0.7, 3, params.seed + 5) *
      params.turbulence *
      9 *
      Sp;

    // Multi-frequency chaotic sway — each kernel independent
    const sway =
      Math.sin(t * f.swayA + f.phase) * 5.5 * Sp +
      Math.sin(t * f.swayB + f.phase * 1.7) * 3.2 * Sp +
      Math.cos(t * (f.swayA * 0.55) + f.bias) * 2.4 * Sp +
      wind * (10 + p * 28) +
      turb +
      turb2 +
      f.lean * 11 * p +
      f.bias * 6 * (0.35 + p) +
      massLean * (0.25 + p * 0.55);

    // Wide at mid-height, ragged edges — NOT a pinched cone/teardrop
    const lateral =
      f.role === 0 ? 1.45 : f.role === 1 ? 1.1 : f.role === 2 ? 0.62 : 0.32;
    // Soft bulge then slight taper — irregular, not geometric pinch
    const bulge = 0.55 + Math.sin(p * Math.PI) * 0.55 + p * 0.15;
    const ragged =
      1 +
      0.22 *
        fbm2(f.ox * 4 + t * 0.8, f.oy * 3 + f.phase, 2, params.seed + f.role);

    const px =
      params.x +
      f.ox * 24 * Sp * lateral * bulge * ragged +
      f.bias * 8 * Sp * (1 - p * 0.35) +
      sway * p * 0.85;
    const py =
      params.y -
      p * height -
      f.oy * 8 * S * (1 - p * 0.3) +
      Math.sin(t * f.swayB * 0.4 + f.phase) * 2.5 * S * p;

    const roleA =
      f.role === 0 ? 0.13 : f.role === 1 ? 0.23 : f.role === 2 ? 0.35 : 0.5;
    const alpha = age * roleA * I * ei;

    const roleScale =
      f.role === 0 ? 1.95 : f.role === 1 ? 1.4 : f.role === 2 ? 0.88 : 0.52;
    const radius = f.size * S * roleScale * (0.65 + age * 0.5) * ragged;

    let c0: string;
    let c1: string;
    let c2: string;
    if (f.role === 3) {
      c0 = coreWhite;
      c1 = corePale;
      c2 = coreYellow;
    } else if (f.role === 2) {
      c0 = corePale;
      c1 = coreYellow;
      c2 = colorHot;
    } else if (f.role === 1) {
      c0 = coreYellow;
      c1 = colorHot;
      c2 = colorFringe;
    } else {
      c0 = colorHot;
      c1 = colorFringe;
      c2 = colorDeep;
    }

    // Stretch varies per kernel — soft rising blobs, not identical ellipses
    const stretchY =
      (f.role === 0 ? 1.05 : f.role === 1 ? 1.35 : f.role === 2 ? 1.65 : 1.25) *
      (1.15 + p * 0.75 + Math.abs(f.lean) * 0.2);
    const stretchX =
      (f.role === 0 ? 1.15 : f.role === 1 ? 0.95 : 0.7) *
      (0.85 + Math.abs(f.bias) * 0.15 + (1 - p) * 0.2);
    softBlob(
      ctx,
      px,
      py,
      radius * stretchX,
      radius * stretchY,
      sway * 0.012 + f.lean * 0.08,
      c0,
      alpha,
      c1,
      alpha * 0.7,
      c2,
      alpha * 0.2,
    );
  }

  // ── 5. White-hot core — irregular, slightly offset (not a perfect centered orb) ──
  {
    const coreWobbleX =
      fbm2(t * 2.1, params.seed * 0.03, 2, params.seed + 9) * 6 * Sp + massLean * 0.2;
    const coreWobbleY = fbm2(t * 2.8 + 1.1, params.seed * 0.04, 2, params.seed + 13) * 3 * S;
    const cx = params.x + wind * 1.5 + coreWobbleX;
    const cy = params.y - 5 * S + coreWobbleY;
    softBlob(
      ctx,
      cx,
      cy,
      13 * S * Sp * (1 + 0.08 * Math.sin(t * 9.2)),
      10 * S * (1 + 0.1 * Math.sin(t * 7.5 + 0.8)),
      0.05 * Math.sin(t * 4.2),
      coreWhite,
      0.92 * I * ei,
      corePale,
      0.72 * I * ei,
      coreYellow,
      0.18 * I,
    );
    softBlob(
      ctx,
      cx + 4 * Sp,
      cy - 2 * S,
      10 * S * Sp,
      8 * S,
      -0.12,
      coreWhite,
      0.45 * I * ei,
      corePale,
      0.3 * I * ei,
      coreYellow,
      0.08 * I,
    );
    softBlob(
      ctx,
      cx - 3 * Sp,
      cy - 5 * S,
      26 * S * Sp,
      20 * S,
      massLean * 0.004,
      corePale,
      0.32 * I * ei,
      coreYellow,
      0.2 * I * ei,
      colorHot,
      0.055 * I,
    );
  }

  // ── 6. Embers / sparks — denser secondary drift ──
  for (const e of state.embers) {
    if (!scene.paused) {
      e.life += dt;
      const n = fbm2(e.x * 0.05, t * 1.6 + e.y * 0.02, 2, params.seed + 7);
      const n2 = fbm2(e.y * 0.04, t * 2.1 + e.x * 0.03, 2, params.seed + 17);
      e.vx += (n * 75 + n2 * 35 + wind * 28) * dt;
      e.vy -= (18 + Math.abs(n2) * 25) * params.rise * dt;
      e.x += e.vx * dt + Math.sin(t * e.wobble + e.x * 0.1) * 18 * dt;
      e.y += e.vy * dt;
      if (e.life >= e.maxLife || e.y < -140) Object.assign(e, spawnEmber(rand, params));
    }
    const ep = e.life / e.maxLife;
    const a = (1 - ep) * 0.62 * I * params.embers * ei;
    if (a <= 0.015) continue;
    const er = e.size * 2.2 * (1 - ep * 0.4);
    softBlob(
      ctx,
      params.x + e.x,
      params.y + e.y,
      er,
      er * (1.1 + ep * 0.4),
      0,
      ep < 0.25 ? coreWhite : ep < 0.55 ? coreYellow : colorHot,
      a,
      colorMid,
      a * 0.35,
      colorFringe,
      a * 0.06,
    );
  }

  ctx.restore();
};

export function disposeFireInstance(instanceId: string): void {
  states.delete(instanceId);
}

export const fireEffect: EffectModule<FireParams> = {
  id: 'fire',
  name: 'Fire',
  description:
    'Campfire: asymmetric soft luminous mass, white-hot core, fuel logs, drifting embers.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'fire-default',
    x: 900,
    y: 790,
    seed: 1,
    size: 1.15,
    spread: 0.95,
    rise: 0.85,
    turbulence: 0.9,
    embers: 0.75,
    material: createDefaultMaterial({
      name: 'Fire / Magma',
      baseColor: '#ff3b10',
      emissive: '#fff1c1',
      emissiveIntensity: 1.35,
      blend: 'additive',
      roughness: 0.35,
      metalness: 0.1,
    }),
  },
  draw: drawFire,
};
