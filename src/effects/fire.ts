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

/** Soft luminous kernel — dense overlaps merge into one mass (not tongues). */
interface Kernel {
  ox: number;
  life: number;
  maxLife: number;
  phase: number;
  size: number;
  /** 0 outer glow · 1 body · 2 inner · 3 hot core */
  role: 0 | 1 | 2 | 3;
  lean: number;
}

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

interface FireState {
  kernels: Kernel[];
  embers: Ember[];
}

const states = new Map<string, FireState>();

function ensureState(params: FireParams): FireState {
  let state = states.get(params.instanceId);
  if (!state) {
    state = { kernels: [], embers: [] };
    states.set(params.instanceId, state);
  }

  // Dense soft kernels → additive luminous mass (campfire, not torch)
  const kernelTarget = Math.floor(70 + params.intensity * 140 * params.size);
  const rand = mulberry32(params.seed | 0);
  while (state.kernels.length < kernelTarget) {
    const r = rand();
    // Bias toward body/inner so the mass reads continuous; fewer outer + core
    const role = (r < 0.22 ? 0 : r < 0.58 ? 1 : r < 0.86 ? 2 : 3) as 0 | 1 | 2 | 3;
    state.kernels.push({
      ox: (rand() - 0.5) * 2,
      life: rand(),
      maxLife: 0.45 + rand() * 0.9,
      phase: rand() * Math.PI * 2,
      size: 6 + rand() * 20,
      role,
      lean: (rand() - 0.5) * 0.55,
    });
  }
  if (state.kernels.length > kernelTarget) state.kernels.length = kernelTarget;

  const emberTarget = Math.floor(params.embers * 22 * params.intensity);
  while (state.embers.length < emberTarget) {
    state.embers.push(spawnEmber(rand, params));
  }
  if (state.embers.length > emberTarget) state.embers.length = emberTarget;

  return state;
}

function spawnEmber(rand: () => number, params: FireParams): Ember {
  return {
    x: (rand() - 0.5) * 18 * params.spread,
    y: -rand() * 10,
    vx: (rand() - 0.5) * 42,
    vy: -(40 + rand() * 80) * params.rise,
    life: 0,
    maxLife: 0.7 + rand() * 1.4,
    size: 0.6 + rand() * 1.8,
  };
}

/** Soft additive ellipse with soft radial falloff (no hard contour). */
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
  if (a0 <= 0.004 && a1 <= 0.004) return;
  const R = Math.max(rx, ry);
  if (R < 0.5) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, withAlpha(c0, a0));
  g.addColorStop(0.35, withAlpha(c1, a1));
  g.addColorStop(0.72, withAlpha(c2, a2));
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
  // Fringe / cool rim — saturated orange only lives here
  const colorFringe = lerpColor(mat.baseColor, '#ff6a18', 0.25);
  const colorDeep = lerpColor(mat.baseColor, '#3a0800', 0.45);
  // Near-clipped core: white → pale yellow (orange only at outer fringe)
  const coreWhite = '#ffffff';
  const corePale = '#fff6c4';
  const coreYellow = '#ffe08a';
  const state = ensureState(params);
  const dt = scene.dt || 1 / 60;
  const rand = mulberry32((params.seed + 42) | 0);
  const wind = scene.wind.x;
  const ei = mat.emissiveIntensity;
  const flicker =
    0.9 +
    0.08 * Math.sin(t * 9.7) +
    0.05 * fbm2(t * 1.8, params.seed * 0.01, 2, params.seed);
  const I = params.intensity * flicker;
  const S = params.size;
  const Sp = params.spread;

  ctx.save();
  applyMaterial(ctx, mat);

  // ── 1. Ground spill: textured warm light, strong at base, inverse-square ──
  {
    const spillR = 92 * S * Sp;
    const by = params.y + 10;
    const bx = params.x;
    // Broad soft ellipse base (warm, never grey)
    const baseG = ctx.createRadialGradient(bx, by, 1, bx, by, spillR);
    baseG.addColorStop(0, withAlpha(colorMid, 0.48 * I * ei));
    baseG.addColorStop(0.28, withAlpha(colorFringe, 0.22 * I));
    baseG.addColorStop(0.55, withAlpha(colorDeep, 0.09 * I));
    baseG.addColorStop(1, withAlpha(colorDeep, 0));
    ctx.fillStyle = baseG;
    ctx.beginPath();
    ctx.ellipse(bx, by + 2, spillR, spillR * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    // Noise-textured warm patches (inverse-square falloff from base)
    const patches = Math.floor(28 + 18 * S);
    for (let i = 0; i < patches; i++) {
      const ang = (i / patches) * Math.PI * 2 + fbm2(i * 0.7, t * 0.15, 2, params.seed) * 0.4;
      const u = ((i * 17 + 3) % patches) / patches;
      const dist = (0.12 + u * 0.88) * spillR;
      // inverse-square: strong near base
      const invSq = 1 / (1 + (dist / (spillR * 0.35)) ** 2);
      const n =
        0.55 +
        0.45 * fbm2(Math.cos(ang) * 2.2 + i * 0.13, Math.sin(ang) * 2.2 + t * 0.35, 3, params.seed + 9);
      const a = invSq * n * 0.2 * I * ei;
      if (a < 0.012) continue;
      const px = bx + Math.cos(ang) * dist * 0.95;
      const py = by + Math.sin(ang) * dist * 0.26 + 2;
      const pr = (7 + n * 14) * S * (0.55 + invSq * 0.6);
      softBlob(
        ctx,
        px,
        py,
        pr,
        pr * 0.38,
        ang * 0.15,
        i % 3 === 0 ? colorHot : colorMid,
        a * 0.85,
        colorFringe,
        a * 0.45,
        colorDeep,
        a * 0.12,
      );
    }
  }

  // ── 2. Volumetric glow: large low-alpha bloom, vertical heat loft ──
  {
    const bloomH = 70 * S * (0.55 + params.rise * 0.45);
    const bloomW = 48 * S * Sp;
    const loftX = params.x + wind * 14;
    const loftY = params.y - bloomH * 0.38;
    // Outer ambient bloom — no hard contour
    softBlob(
      ctx,
      loftX,
      loftY,
      bloomW * 1.15,
      bloomH * 0.85,
      wind * 0.03,
      colorHot,
      0.1 * I * ei,
      colorMid,
      0.055 * I,
      colorDeep,
      0.018 * I,
    );
    // Slightly tighter warm loft column
    softBlob(
      ctx,
      params.x + wind * 8,
      params.y - bloomH * 0.28,
      bloomW * 0.72,
      bloomH * 0.7,
      wind * 0.025,
      coreYellow,
      0.08 * I * ei,
      colorHot,
      0.045 * I,
      colorMid,
      0.015 * I,
    );
  }

  // ── 3. Ember bed / log glow (compact bright base) ──
  {
    softBlob(
      ctx,
      params.x,
      params.y + 3,
      30 * S * Sp,
      11 * S,
      0,
      corePale,
      0.55 * I * ei,
      colorHot,
      0.4 * I * ei,
      colorMid,
      0.12 * I,
    );
    softBlob(
      ctx,
      params.x,
      params.y + 1,
      16 * S * Sp,
      6.5 * S,
      0,
      coreWhite,
      0.7 * I * ei,
      corePale,
      0.45 * I * ei,
      colorHot,
      0.1 * I,
    );
  }

  // ── 4. Luminous mass: dense overlapping soft kernels ──
  const ordered = [...state.kernels].sort((a, b) => a.role - b.role);
  // Compact campfire rise (not tall torch)
  const riseBase = (0.38 + params.rise * 0.55) * S;

  for (const f of ordered) {
    if (!scene.paused) {
      f.life += dt;
      if (f.life >= f.maxLife) {
        f.life = 0;
        f.maxLife = 0.4 + rand() * 0.85;
        f.ox = (rand() - 0.5) * 2;
        f.phase = rand() * Math.PI * 2;
        f.size = 6 + rand() * 20;
        f.lean = (rand() - 0.5) * 0.55;
        const r = rand();
        f.role = (r < 0.22 ? 0 : r < 0.58 ? 1 : r < 0.86 ? 2 : 3) as 0 | 1 | 2 | 3;
      }
    }

    const p = f.life / f.maxLife;
    const age = 1 - p;
    // Height stays compact; outer roles sit lower/wider, core sits central/low
    const roleRise = f.role === 0 ? 0.55 : f.role === 1 ? 0.85 : f.role === 2 ? 1.0 : 0.72;
    const height = (18 + f.size * 2.1) * riseBase * roleRise;
    const turb =
      fbm2(f.ox * 2.8 + f.phase, t * (1.8 + params.turbulence * 0.9) + f.phase, 3, params.seed) *
      params.turbulence *
      12 *
      Sp;
    const sway =
      Math.sin(t * 3.4 + f.phase) * 3.5 * Sp +
      wind * (8 + p * 22) +
      turb +
      f.lean * 6 * p;

    // Lateral: outer kernels spread wider; core stays near axis
    const lateral =
      f.role === 0 ? 1.15 : f.role === 1 ? 0.85 : f.role === 2 ? 0.45 : 0.22;
    const pinch = 1 - p * 0.4;
    const px = params.x + f.ox * 16 * Sp * lateral * (0.5 + p * 0.45) * pinch + sway * p * 0.85;
    const py = params.y - p * height;

    // Soft alphas — overlaps merge; never hard silhouette tongues
    const roleA =
      f.role === 0 ? 0.09 : f.role === 1 ? 0.16 : f.role === 2 ? 0.28 : 0.42;
    const alpha = age * roleA * I * ei;

    const roleScale =
      f.role === 0 ? 1.85 : f.role === 1 ? 1.25 : f.role === 2 ? 0.78 : 0.42;
    const radius = f.size * S * roleScale * (0.7 + age * 0.45) * pinch;

    // Color by role: white/pale core → yellow mid → saturated orange ONLY on fringe
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

    // Slight vertical stretch for heat loft; keep blobs fat so they merge
    const stretchY = f.role === 0 ? 1.15 : f.role === 1 ? 1.25 : f.role === 2 ? 1.35 : 1.2;
    const stretchX = f.role === 0 ? 0.95 : 0.72;
    softBlob(
      ctx,
      px,
      py,
      radius * stretchX,
      radius * stretchY,
      sway * 0.01,
      c0,
      alpha,
      c1,
      alpha * 0.72,
      c2,
      alpha * 0.22,
    );
  }

  // ── 5. Near-clipped white→pale-yellow core bloom (campfire signature) ──
  {
    const cx = params.x + wind * 2;
    const cy = params.y - 8 * S;
    // Tight clipped white heart
    softBlob(
      ctx,
      cx,
      cy,
      10 * S,
      12 * S,
      0,
      coreWhite,
      0.95 * I * ei,
      corePale,
      0.75 * I * ei,
      coreYellow,
      0.2 * I,
    );
    // Soft pale bloom around heart — orange only at far fringe
    softBlob(
      ctx,
      cx,
      cy - 2 * S,
      22 * S * Sp,
      26 * S,
      0,
      corePale,
      0.45 * I * ei,
      coreYellow,
      0.28 * I * ei,
      colorHot,
      0.08 * I,
    );
    // Outer fringe orange veil (very soft)
    softBlob(
      ctx,
      cx,
      cy - 4 * S,
      34 * S * Sp,
      38 * S,
      0,
      colorHot,
      0.12 * I * ei,
      colorFringe,
      0.06 * I,
      colorDeep,
      0.015 * I,
    );
  }

  // ── 6. Embers / sparks (secondary) ──
  for (const e of state.embers) {
    if (!scene.paused) {
      e.life += dt;
      const n = fbm2(e.x * 0.05, t * 1.5 + e.y * 0.02, 2, params.seed + 7);
      e.vx += (n * 55 + wind * 24) * dt;
      e.vy -= 24 * params.rise * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.life >= e.maxLife || e.y < -140) Object.assign(e, spawnEmber(rand, params));
    }
    const ep = e.life / e.maxLife;
    const a = (1 - ep) * 0.7 * I * params.embers * ei;
    if (a <= 0.02) continue;
    const ex = params.x + e.x;
    const ey = params.y + e.y;
    const er = e.size * 2.6 * (1 - ep * 0.35);
    softBlob(
      ctx,
      ex,
      ey,
      er,
      er,
      0,
      ep < 0.3 ? coreWhite : colorHot,
      a,
      colorMid,
      a * 0.4,
      colorFringe,
      a * 0.08,
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
    'Commercial campfire: soft additive luminous mass, volumetric bloom, textured ground spill.',
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
