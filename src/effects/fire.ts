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
  oy: number;
  life: number;
  maxLife: number;
  phase: number;
  size: number;
  /** 0 fringe · 1 body · 2 inner · 3 core */
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

  // Dense soft kernels → additive luminous mass (wide campfire, not torch)
  const kernelTarget = Math.floor(90 + params.intensity * 160 * params.size);
  const rand = mulberry32(params.seed | 0);
  while (state.kernels.length < kernelTarget) {
    const r = rand();
    const role = (r < 0.3 ? 0 : r < 0.62 ? 1 : r < 0.88 ? 2 : 3) as 0 | 1 | 2 | 3;
    state.kernels.push({
      ox: (rand() - 0.5) * 2,
      oy: rand(),
      life: rand(),
      maxLife: 0.5 + rand() * 1.0,
      phase: rand() * Math.PI * 2,
      size: 8 + rand() * 22,
      role,
      lean: (rand() - 0.5) * 0.45,
    });
  }
  if (state.kernels.length > kernelTarget) state.kernels.length = kernelTarget;

  const emberTarget = Math.floor(params.embers * 18 * params.intensity);
  while (state.embers.length < emberTarget) {
    state.embers.push(spawnEmber(rand, params));
  }
  if (state.embers.length > emberTarget) state.embers.length = emberTarget;

  return state;
}

function spawnEmber(rand: () => number, params: FireParams): Ember {
  return {
    x: (rand() - 0.5) * 20 * params.spread,
    y: -rand() * 8,
    vx: (rand() - 0.5) * 48,
    vy: -(35 + rand() * 70) * params.rise,
    life: 0,
    maxLife: 0.6 + rand() * 1.2,
    size: 0.55 + rand() * 1.6,
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
  const flicker =
    0.92 +
    0.06 * Math.sin(t * 8.5) +
    0.04 * fbm2(t * 1.6, params.seed * 0.01, 2, params.seed);
  const I = params.intensity * flicker;
  const S = params.size;
  const Sp = params.spread;

  ctx.save();
  applyMaterial(ctx, mat);

  // ── 1. Ground spill: textured warm light, strong at base, inverse-square ──
  {
    const spillR = 110 * S * Sp;
    const by = params.y + 14;
    const bx = params.x;
    // Bright warm wash — must read as light on dark ground (never grey discs)
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
      bx,
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
      const ang = (i / patches) * Math.PI * 2 + n1 * 1.25;
      const u = 0.05 + Math.abs(n2) * 0.6 + ((i * 13) % 7) * 0.055;
      const dist = Math.min(1, u) * spillR;
      const invSq = 1 / (1 + (dist / (spillR * 0.25)) ** 2);
      const n = 0.45 + 0.55 * (0.5 + 0.5 * n1);
      const a = invSq * n * 0.42 * I * ei;
      if (a < 0.012) continue;
      const px = bx + Math.cos(ang) * dist * (0.7 + Math.abs(n2) * 0.4);
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

  // ── 2. Volumetric glow: LARGE low-alpha bloom, vertical heat loft ──
  {
    const bloomH = 95 * S * (0.5 + params.rise * 0.4);
    const bloomW = 70 * S * Sp;
    softBlob(
      ctx,
      params.x + wind * 16,
      params.y - bloomH * 0.42,
      bloomW * 1.35,
      bloomH * 0.95,
      wind * 0.035,
      colorHot,
      0.085 * I * ei,
      colorMid,
      0.045 * I,
      colorDeep,
      0.012 * I,
    );
    softBlob(
      ctx,
      params.x + wind * 10,
      params.y - bloomH * 0.3,
      bloomW * 0.9,
      bloomH * 0.78,
      wind * 0.028,
      coreYellow,
      0.07 * I * ei,
      colorHot,
      0.035 * I,
      colorMid,
      0.01 * I,
    );
    softBlob(
      ctx,
      params.x + wind * 6,
      params.y - bloomH * 0.18,
      bloomW * 0.55,
      bloomH * 0.5,
      0,
      corePale,
      0.05 * I * ei,
      coreYellow,
      0.025 * I,
      colorHot,
      0.008 * I,
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
      // ember glow on log tops
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
      params.x,
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
      params.x,
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

  // ── 4. Luminous mass: wide dense soft kernels (campfire mound) ──
  const ordered = [...state.kernels].sort((a, b) => a.role - b.role);
  const riseBase = (0.85 + params.rise * 0.85) * S;

  for (const f of ordered) {
    if (!scene.paused) {
      f.life += dt;
      if (f.life >= f.maxLife) {
        f.life = 0;
        f.maxLife = 0.45 + rand() * 0.95;
        f.ox = (rand() - 0.5) * 2;
        f.oy = rand();
        f.phase = rand() * Math.PI * 2;
        f.size = 8 + rand() * 22;
        f.lean = (rand() - 0.5) * 0.45;
        const r = rand();
        f.role = (r < 0.3 ? 0 : r < 0.62 ? 1 : r < 0.88 ? 2 : 3) as 0 | 1 | 2 | 3;
      }
    }

    const p = f.life / f.maxLife;
    const age = 1 - p;
    const roleRise = f.role === 0 ? 0.55 : f.role === 1 ? 0.85 : f.role === 2 ? 1.05 : 0.7;
    const height = (32 + f.size * 2.8) * riseBase * roleRise * (0.6 + f.oy * 0.55);
    const turb =
      fbm2(f.ox * 2.4 + f.phase, t * (1.5 + params.turbulence * 0.8) + f.phase, 3, params.seed) *
      params.turbulence *
      12 *
      Sp;
    const sway =
      Math.sin(t * 2.8 + f.phase) * 3.5 * Sp +
      wind * (8 + p * 22) +
      turb +
      f.lean * 7 * p;

    const lateral =
      f.role === 0 ? 1.25 : f.role === 1 ? 0.95 : f.role === 2 ? 0.5 : 0.25;
    const pinch = 1 - p * 0.4;
    const px =
      params.x +
      f.ox * 20 * Sp * lateral * (0.5 + p * 0.4) * pinch +
      sway * p * 0.75;
    const py = params.y - p * height - f.oy * 6 * S * (1 - p * 0.25);

    const roleA =
      f.role === 0 ? 0.14 : f.role === 1 ? 0.24 : f.role === 2 ? 0.36 : 0.52;
    const alpha = age * roleA * I * ei;

    const roleScale =
      f.role === 0 ? 1.85 : f.role === 1 ? 1.35 : f.role === 2 ? 0.85 : 0.5;
    // Tall soft ellipses so mass reads as rising flame not a ground orb
    const radius = f.size * S * roleScale * (0.7 + age * 0.45) * pinch;

    // White/pale core → yellow body → saturated orange ONLY on fringe
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

    const stretchY =
      (f.role === 0 ? 1.15 : f.role === 1 ? 1.45 : f.role === 2 ? 1.7 : 1.35) * (1.2 + p * 0.6);
    const stretchX = f.role === 0 ? 1.05 : f.role === 1 ? 0.85 : 0.65;
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
      alpha * 0.7,
      c2,
      alpha * 0.2,
    );
  }

  // ── 5. Near-clipped white→pale core (LOW and WIDE — not a tall tongue) ──
  {
    const cx = params.x + wind * 1.5;
    const cy = params.y - 4 * S;
    softBlob(
      ctx,
      cx,
      cy,
      14 * S * Sp,
      11 * S,
      0,
      coreWhite,
      0.9 * I * ei,
      corePale,
      0.7 * I * ei,
      coreYellow,
      0.18 * I,
    );
    softBlob(
      ctx,
      cx,
      cy - 3 * S,
      28 * S * Sp,
      22 * S,
      0,
      corePale,
      0.35 * I * ei,
      coreYellow,
      0.22 * I * ei,
      colorHot,
      0.06 * I,
    );
  }

  // ── 6. Embers / sparks (secondary) ──
  for (const e of state.embers) {
    if (!scene.paused) {
      e.life += dt;
      const n = fbm2(e.x * 0.05, t * 1.4 + e.y * 0.02, 2, params.seed + 7);
      e.vx += (n * 60 + wind * 22) * dt;
      e.vy -= 20 * params.rise * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.life >= e.maxLife || e.y < -120) Object.assign(e, spawnEmber(rand, params));
    }
    const ep = e.life / e.maxLife;
    const a = (1 - ep) * 0.55 * I * params.embers * ei;
    if (a <= 0.02) continue;
    const er = e.size * 2.4 * (1 - ep * 0.35);
    softBlob(
      ctx,
      params.x + e.x,
      params.y + e.y,
      er,
      er,
      0,
      ep < 0.28 ? coreWhite : colorHot,
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
