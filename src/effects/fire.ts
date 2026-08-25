import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { fbm2, mulberry32, withAlpha, lerpColor } from './noise';

export interface FireParams extends PlacedEffectParams {
  size: number;
  spread: number;
  rise: number;
  turbulence: number;
  embers: number;
}

/**
 * Soft rising tongue / wisp. Dense overlaps merge into luminous mass,
 * but each tongue has independent lean so the silhouette stays irregular.
 */
interface Tongue {
  /** Lateral spawn offset (−1…1 scale) */
  ox: number;
  /** Base height bias (0 near logs … 1 mid) */
  oy: number;
  life: number;
  maxLife: number;
  phase: number;
  /** Base blob radius */
  size: number;
  /**
   * 0 = outer fringe (big orange) · 1 = body · 2 = inner amber · 3 = tiny white core
   * Fringe dominates count so orange volume wins over white.
   */
  role: 0 | 1 | 2 | 3;
  lean: number;
  bias: number;
  swayA: number;
  swayB: number;
  /** Stretch along rise — longer = more tongue-like */
  stretch: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  wobble: number;
  /** Previous positions for trail (newest last) */
  trail: { x: number; y: number }[];
}

interface FireState {
  tongues: Tongue[];
  sparks: Spark[];
}

const states = new Map<string, FireState>();

function spawnTongue(rand: () => number): Tongue {
  const r = rand();
  // Heavy fringe/body bias — white core is rare (~6%)
  const role = (r < 0.42 ? 0 : r < 0.72 ? 1 : r < 0.94 ? 2 : 3) as 0 | 1 | 2 | 3;
  const side = rand() < 0.52 ? -1 : 1;
  const biasMag = 0.25 + rand() * 1.15;
  return {
    ox: (rand() - 0.5) * 2.8 + side * biasMag * 0.45,
    oy: rand() * rand() * 0.95,
    life: rand(),
    maxLife: 0.35 + rand() * 1.05,
    phase: rand() * Math.PI * 2,
    size: 6 + rand() * 22,
    role,
    lean: (rand() - 0.5) * 1.2,
    bias: side * biasMag,
    swayA: 1.4 + rand() * 4.2,
    swayB: 2.0 + rand() * 6.0,
    stretch: 1.15 + rand() * 1.35,
  };
}

function spawnSpark(rand: () => number, params: FireParams): Spark {
  return {
    x: (rand() - 0.5) * 32 * params.spread,
    y: -rand() * 8,
    vx: (rand() - 0.5) * 55,
    vy: -(55 + rand() * 120) * params.rise,
    life: 0,
    maxLife: 0.55 + rand() * 1.8,
    size: 0.45 + rand() * 1.6,
    wobble: 2.2 + rand() * 7,
    trail: [],
  };
}

function ensureState(params: FireParams): FireState {
  let state = states.get(params.instanceId);
  if (!state) {
    state = { tongues: [], sparks: [] };
    states.set(params.instanceId, state);
  }

  // Enough soft tongues to merge into mass, not so many they become a cone glyph
  const tongueTarget = Math.floor(70 + params.intensity * 110 * params.size);
  const rand = mulberry32(params.seed | 0);
  while (state.tongues.length < tongueTarget) {
    state.tongues.push(spawnTongue(rand));
  }
  if (state.tongues.length > tongueTarget) state.tongues.length = tongueTarget;

  const sparkTarget = Math.floor(params.embers * 48 * params.intensity);
  while (state.sparks.length < sparkTarget) {
    state.sparks.push(spawnSpark(rand, params));
  }
  if (state.sparks.length > sparkTarget) state.sparks.length = sparkTarget;

  return state;
}

/** Soft additive ellipse — gradient fades to zero at contour. */
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
  g.addColorStop(0.28, withAlpha(c0, a0 * 0.85));
  g.addColorStop(0.55, withAlpha(c1, a1));
  g.addColorStop(0.82, withAlpha(c2, a2));
  g.addColorStop(1, withAlpha(c2, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

/** Charcoal / log fuel bed with glowing cracks — drawn source-over so it stays readable. */
function drawFuelBed(
  ctx: CanvasRenderingContext2D,
  params: FireParams,
  t: number,
  I: number,
  ei: number,
  massLean: number,
  colorHot: string,
  colorMid: string,
  colorDeep: string,
  coreYellow: string,
): void {
  const S = params.size;
  const Sp = params.spread;
  const logY = params.y + 10 * S;
  const bedW = 48 * S * Sp;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // Charcoal mound silhouette
  {
    const g = ctx.createRadialGradient(params.x, logY, 2, params.x, logY, bedW);
    g.addColorStop(0, withAlpha('#2a1810', 0.95 * I));
    g.addColorStop(0.45, withAlpha('#1a0e08', 0.92 * I));
    g.addColorStop(1, withAlpha('#0a0503', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(params.x + massLean * 0.05, logY, bedW, 14 * S, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crossed log / charcoal chunks
  const logs: { ox: number; oy: number; w: number; h: number; rot: number; dark: string }[] = [
    { ox: -14 * Sp, oy: 2, w: 22, h: 5.5, rot: -0.22, dark: '#1c100a' },
    { ox: 10 * Sp, oy: 1, w: 20, h: 5, rot: 0.28, dark: '#160c08' },
    { ox: -2 * Sp, oy: 4, w: 26, h: 4.5, rot: 0.06, dark: '#22140c' },
    { ox: 16 * Sp, oy: 5, w: 14, h: 4, rot: -0.45, dark: '#140a06' },
    { ox: -18 * Sp, oy: 6, w: 12, h: 3.8, rot: 0.55, dark: '#1a0e08' },
    { ox: 4 * Sp, oy: -1, w: 16, h: 4.2, rot: -0.12, dark: '#1e120c' },
  ];

  for (let i = 0; i < logs.length; i++) {
    const L = logs[i]!;
    const lx = params.x + L.ox * S + massLean * 0.04;
    const ly = logY + L.oy * S;
    const lw = L.w * S;
    const lh = L.h * S;

    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(L.rot);
    const g = ctx.createLinearGradient(-lw, 0, lw, 0);
    g.addColorStop(0, withAlpha('#0c0604', 0.95 * I));
    g.addColorStop(0.35, withAlpha(L.dark, 0.98 * I));
    g.addColorStop(0.55, withAlpha('#3a2418', 0.7 * I));
    g.addColorStop(0.75, withAlpha(L.dark, 0.95 * I));
    g.addColorStop(1, withAlpha('#080402', 0.9 * I));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, lw, lh, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bark grain / charcoal texture lines
    ctx.strokeStyle = withAlpha('#0a0402', 0.45 * I);
    ctx.lineWidth = 0.6 * S;
    for (let k = 0; k < 4; k++) {
      const yy = -lh * 0.5 + ((k + 0.5) / 4) * lh * 1.1;
      ctx.beginPath();
      ctx.moveTo(-lw * 0.75, yy + Math.sin(i + k) * 0.8);
      ctx.lineTo(lw * 0.75, yy + Math.cos(i * 1.3 + k) * 0.6);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Ember glow in cracks between logs (source-over warm, then additive pops)
  const crackRand = mulberry32((params.seed + 77) | 0);
  for (let i = 0; i < 28; i++) {
    const cx = params.x + (crackRand() - 0.5) * bedW * 1.5;
    const cy = logY + (crackRand() - 0.5) * 10 * S;
    const pulse =
      0.55 +
      0.45 *
        (0.5 +
          0.5 *
            Math.sin(t * (4 + crackRand() * 6) + i) +
            0.3 * fbm2(i * 0.4, t * 1.8, 2, params.seed + i));
    const a = pulse * 0.55 * I * ei;
    const rw = (2.5 + crackRand() * 7) * S;
    const rh = (1.2 + crackRand() * 2.5) * S;
    softBlob(
      ctx,
      cx,
      cy,
      rw,
      rh,
      (crackRand() - 0.5) * 0.8,
      coreYellow,
      a,
      colorHot,
      a * 0.7,
      colorDeep,
      a * 0.15,
    );
  }

  // Hot coals nest under flame base
  softBlob(
    ctx,
    params.x + massLean * 0.12,
    params.y + 6 * S,
    28 * S * Sp,
    9 * S,
    0,
    colorHot,
    0.45 * I * ei,
    colorMid,
    0.22 * I,
    colorDeep,
    0.05 * I,
  );

  ctx.restore();
}

export const drawFire: DrawFn<FireParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const colorHot = mat.emissive;
  const colorMid = mat.baseColor;
  const colorFringe = lerpColor(mat.baseColor, '#ff5a12', 0.35);
  const colorDeep = lerpColor(mat.baseColor, '#1a0400', 0.55);
  const colorOrange = lerpColor(mat.baseColor, '#ff8a20', 0.25);
  const coreWhite = '#fffef8';
  const corePale = '#ffe8a8';
  const coreYellow = '#ffc14a';
  const state = ensureState(params);
  const dt = scene.dt || 1 / 60;
  const rand = mulberry32((params.seed + 42) | 0);
  const wind = scene.wind.x;
  const ei = mat.emissiveIntensity;

  const flicker =
    0.88 +
    0.06 * Math.sin(t * 6.8) +
    0.05 * Math.sin(t * 14.2 + 0.9) +
    0.06 * fbm2(t * 2.1, params.seed * 0.01, 3, params.seed);
  const I = params.intensity * flicker;
  const S = params.size;
  const Sp = params.spread;

  // Global mass lean — breaks left/right mirror symmetry
  const massLean =
    fbm2(t * 0.48, params.seed * 0.02, 3, params.seed + 3) * 18 * Sp +
    Math.sin(t * 1.05) * 5.5 * Sp +
    wind * 12;

  // ── 1. Strong textured warm ground spill (noise patches) ──
  ctx.save();
  applyMaterial(ctx, mat);
  {
    const spillR = 130 * S * Sp;
    const by = params.y + 18 * S;
    const bx = params.x + massLean * 0.1;

    // Broad warm pool
    softBlob(
      ctx,
      bx,
      by,
      spillR,
      spillR * 0.28,
      0,
      colorHot,
      0.38 * I * ei,
      colorOrange,
      0.22 * I * ei,
      colorFringe,
      0.06 * I,
    );
    softBlob(
      ctx,
      bx + massLean * 0.1,
      by - 3,
      spillR * 0.42,
      spillR * 0.14,
      0,
      coreYellow,
      0.35 * I * ei,
      colorHot,
      0.18 * I * ei,
      colorMid,
      0.05 * I,
    );

    // Noise-driven dirt patches — irregular, not smooth radial fade
    const patches = Math.floor(72 + 40 * S);
    for (let i = 0; i < patches; i++) {
      const n1 = fbm2(i * 0.41, t * 0.28 + params.seed * 0.01, 3, params.seed + 11);
      const n2 = fbm2(i * 0.67 + 1.7, t * 0.21, 3, params.seed + 19);
      const n3 = fbm2(i * 0.23 + t * 0.15, params.seed * 0.03, 2, params.seed + 31);
      const ang = (i / patches) * Math.PI * 2 + n1 * 1.8 + ((i * 17) % 5) * 0.27;
      const u = 0.04 + Math.abs(n2) * 0.72 + ((i * 11) % 9) * 0.04;
      const dist = Math.min(1, u) * spillR;
      const invSq = 1 / (1 + (dist / (spillR * 0.22)) ** 2);
      const n = 0.4 + 0.6 * (0.5 + 0.5 * n1);
      const a = invSq * n * (0.48 + 0.2 * n3) * I * ei;
      if (a < 0.01) continue;
      const px = bx + Math.cos(ang) * dist * (0.55 + Math.abs(n2) * 0.6);
      const py = by + Math.sin(ang) * dist * 0.22 + n1 * 5;
      const prx = (6 + n * 20 + Math.abs(n2) * 14) * S;
      const pry = prx * (0.22 + Math.abs(n1) * 0.16);
      const warm =
        i % 6 === 0
          ? corePale
          : i % 6 === 1
            ? coreYellow
            : i % 6 === 2
              ? colorHot
              : i % 6 === 3
                ? colorOrange
                : colorMid;
      softBlob(
        ctx,
        px,
        py,
        prx,
        pry,
        ang * 0.3 + n2 * 0.4,
        warm,
        a,
        colorFringe,
        a * 0.5,
        colorDeep,
        a * 0.1,
      );
    }
  }
  ctx.restore();

  // ── 2. Fuel bed (charcoal + glowing cracks) — source-over, under flames ──
  drawFuelBed(ctx, params, t, I, ei, massLean, colorHot, colorMid, colorDeep, coreYellow);

  // ── 3. Soft volumetric bloom (asymmetric, not a centered cone) ──
  ctx.save();
  applyMaterial(ctx, mat);
  {
    const bloomH = 95 * S * (0.45 + params.rise * 0.5);
    const bloomW = 85 * S * Sp;
    softBlob(
      ctx,
      params.x + wind * 14 + massLean * 0.6,
      params.y - bloomH * 0.38,
      bloomW * 1.35,
      bloomH * 0.85,
      massLean * 0.005 + wind * 0.025,
      colorHot,
      0.07 * I * ei,
      colorOrange,
      0.035 * I,
      colorDeep,
      0.01 * I,
    );
    softBlob(
      ctx,
      params.x + wind * 8 + massLean * 0.9 + 12 * Sp,
      params.y - bloomH * 0.28,
      bloomW * 0.7,
      bloomH * 0.65,
      0.1 + massLean * 0.006,
      colorOrange,
      0.05 * I * ei,
      colorHot,
      0.025 * I,
      colorMid,
      0.008 * I,
    );
    softBlob(
      ctx,
      params.x + wind * 5 + massLean * 0.3 - 14 * Sp,
      params.y - bloomH * 0.2,
      bloomW * 0.5,
      bloomH * 0.45,
      -0.08,
      coreYellow,
      0.035 * I * ei,
      colorHot,
      0.018 * I,
      colorFringe,
      0.006 * I,
    );
  }

  // ── 4. Rising soft tongues — irregular wisps that MERGE into luminous mass ──
  const ordered = [...state.tongues].sort((a, b) => a.role - b.role);
  const riseBase = (0.95 + params.rise * 0.95) * S;

  for (const f of ordered) {
    if (!scene.paused) {
      f.life += dt;
      if (f.life >= f.maxLife) {
        Object.assign(f, spawnTongue(rand), { life: 0 });
      }
    }

    const p = f.life / f.maxLife;
    const age = 1 - p;
    // Outer tongues rise less; body tongues climb; core stays low
    const roleRise = f.role === 0 ? 0.55 : f.role === 1 ? 1.05 : f.role === 2 ? 0.85 : 0.4;
    const height = (28 + f.size * 3.2) * riseBase * roleRise * f.stretch * (0.5 + f.oy * 0.7);

    const turb =
      fbm2(f.ox * 3.0 + f.phase, t * (1.8 + params.turbulence) + f.phase, 4, params.seed) *
      params.turbulence *
      18 *
      Sp;
    const turb2 =
      fbm2(f.oy * 3.4 + f.bias, t * 2.6 + f.phase * 0.7, 3, params.seed + 5) *
      params.turbulence *
      10 *
      Sp;

    const sway =
      Math.sin(t * f.swayA + f.phase) * 6.5 * Sp +
      Math.sin(t * f.swayB + f.phase * 1.7) * 3.8 * Sp +
      Math.cos(t * (f.swayA * 0.5) + f.bias) * 2.8 * Sp +
      wind * (12 + p * 32) +
      turb +
      turb2 +
      f.lean * 14 * p +
      f.bias * 8 * (0.4 + p) +
      massLean * (0.3 + p * 0.6);

    // Wide fringe laterally; core stays tight and LOW
    const lateral = f.role === 0 ? 1.65 : f.role === 1 ? 1.15 : f.role === 2 ? 0.55 : 0.22;
    // Soft mid bulge — no geometric pinch into a cone tip
    const bulge = 0.65 + Math.sin(p * Math.PI) * 0.5 + p * 0.1;
    const ragged =
      1 +
      0.28 * fbm2(f.ox * 4.5 + t * 0.9, f.oy * 3.2 + f.phase, 2, params.seed + f.role);

    const px =
      params.x +
      f.ox * 26 * Sp * lateral * bulge * ragged +
      f.bias * 10 * Sp * (1 - p * 0.3) +
      sway * p * 0.9;
    const py =
      params.y -
      p * height -
      f.oy * 7 * S * (1 - p * 0.25) +
      Math.sin(t * f.swayB * 0.35 + f.phase) * 2.8 * S * p;

    // Fringe/body carry most alpha; white core stays subtle
    const roleA = f.role === 0 ? 0.16 : f.role === 1 ? 0.26 : f.role === 2 ? 0.32 : 0.38;
    const alpha = age * roleA * I * ei;

    const roleScale = f.role === 0 ? 2.15 : f.role === 1 ? 1.45 : f.role === 2 ? 0.7 : 0.32;
    const radius = f.size * S * roleScale * (0.6 + age * 0.45) * ragged;

    let c0: string;
    let c1: string;
    let c2: string;
    if (f.role === 3) {
      c0 = coreWhite;
      c1 = corePale;
      c2 = coreYellow;
    } else if (f.role === 2) {
      c0 = coreYellow;
      c1 = colorHot;
      c2 = colorOrange;
    } else if (f.role === 1) {
      c0 = colorHot;
      c1 = colorOrange;
      c2 = colorFringe;
    } else {
      c0 = colorOrange;
      c1 = colorFringe;
      c2 = colorDeep;
    }

    // Tall soft tongues (vertical stretch), not round orbs
    const stretchY =
      (f.role === 0 ? 1.35 : f.role === 1 ? 1.7 : f.role === 2 ? 1.5 : 1.1) *
      f.stretch *
      (1.1 + p * 0.85);
    const stretchX =
      (f.role === 0 ? 1.2 : f.role === 1 ? 0.9 : 0.55) *
      (0.8 + Math.abs(f.bias) * 0.12 + (1 - p) * 0.25);

    softBlob(
      ctx,
      px,
      py,
      radius * stretchX,
      radius * stretchY,
      sway * 0.014 + f.lean * 0.1,
      c0,
      alpha,
      c1,
      alpha * 0.65,
      c2,
      alpha * 0.18,
    );

    // Extra tip wisp on body/fringe — sells separate rising tongues
    if (f.role <= 1 && p > 0.25 && p < 0.85) {
      const tipA = alpha * 0.45;
      softBlob(
        ctx,
        px + sway * 0.08 + f.lean * 4,
        py - radius * stretchY * 0.55,
        radius * stretchX * 0.45,
        radius * stretchY * 0.55,
        sway * 0.02,
        c0,
        tipA,
        c1,
        tipA * 0.5,
        c2,
        tipA * 0.1,
      );
    }
  }

  // ── 5. Tiny white-hot core nest — SMALL, low, slightly offset ──
  {
    const coreWobbleX =
      fbm2(t * 2.2, params.seed * 0.03, 2, params.seed + 9) * 5 * Sp + massLean * 0.15;
    const coreWobbleY = fbm2(t * 2.9 + 1.1, params.seed * 0.04, 2, params.seed + 13) * 2.5 * S;
    const cx = params.x + wind * 1.2 + coreWobbleX;
    const cy = params.y - 2 * S + coreWobbleY;

    // Amber halo around core (orange still dominates volume)
    softBlob(
      ctx,
      cx,
      cy - 4 * S,
      22 * S * Sp,
      16 * S,
      massLean * 0.003,
      coreYellow,
      0.28 * I * ei,
      colorHot,
      0.16 * I * ei,
      colorOrange,
      0.04 * I,
    );
    // Small white kernel — intentionally much smaller than prior cone core
    softBlob(
      ctx,
      cx,
      cy,
      7 * S * Sp * (1 + 0.1 * Math.sin(t * 9.5)),
      5.5 * S * (1 + 0.12 * Math.sin(t * 7.8 + 0.6)),
      0.04 * Math.sin(t * 4.5),
      coreWhite,
      0.85 * I * ei,
      corePale,
      0.55 * I * ei,
      coreYellow,
      0.12 * I,
    );
    softBlob(
      ctx,
      cx + 3 * Sp,
      cy - 1.5 * S,
      4.5 * S * Sp,
      3.5 * S,
      -0.15,
      coreWhite,
      0.4 * I * ei,
      corePale,
      0.22 * I * ei,
      coreYellow,
      0.05 * I,
    );
  }

  // ── 6. Rising sparks with motion trails ──
  ctx.lineCap = 'round';
  for (const e of state.sparks) {
    if (!scene.paused) {
      e.life += dt;
      const n = fbm2(e.x * 0.05, t * 1.7 + e.y * 0.02, 2, params.seed + 7);
      const n2 = fbm2(e.y * 0.04, t * 2.2 + e.x * 0.03, 2, params.seed + 17);
      e.vx += (n * 70 + n2 * 30 + wind * 32) * dt;
      e.vy -= (22 + Math.abs(n2) * 28) * params.rise * dt;
      e.x += e.vx * dt + Math.sin(t * e.wobble + e.x * 0.1) * 16 * dt;
      e.y += e.vy * dt;

      const wx = params.x + e.x;
      const wy = params.y + e.y;
      e.trail.push({ x: wx, y: wy });
      if (e.trail.length > 8) e.trail.shift();

      if (e.life >= e.maxLife || e.y < -160) {
        Object.assign(e, spawnSpark(rand, params));
        e.trail = [];
      }
    }

    const ep = e.life / e.maxLife;
    const a = (1 - ep) * 0.75 * I * params.embers * ei;
    if (a <= 0.012) continue;

    // Trail streak
    if (e.trail.length >= 2) {
      for (let i = 1; i < e.trail.length; i++) {
        const a0 = e.trail[i - 1]!;
        const a1 = e.trail[i]!;
        const ta = a * (i / e.trail.length) * 0.55;
        ctx.strokeStyle = withAlpha(ep < 0.35 ? corePale : colorHot, ta);
        ctx.lineWidth = e.size * (0.7 + (i / e.trail.length) * 1.4) * S;
        ctx.beginPath();
        ctx.moveTo(a0.x, a0.y);
        ctx.lineTo(a1.x, a1.y);
        ctx.stroke();
      }
    }

    // Velocity-aligned streak fallback
    const len = (5 + (1 - ep) * 12) * S;
    ctx.strokeStyle = withAlpha(ep < 0.3 ? coreWhite : coreYellow, a * 0.7);
    ctx.lineWidth = e.size * 1.1 * S;
    ctx.beginPath();
    ctx.moveTo(params.x + e.x, params.y + e.y);
    ctx.lineTo(
      params.x + e.x - e.vx * 0.018 * len,
      params.y + e.y - e.vy * 0.018 * len,
    );
    ctx.stroke();

    const er = e.size * 1.8 * (1 - ep * 0.35);
    softBlob(
      ctx,
      params.x + e.x,
      params.y + e.y,
      er,
      er * 1.15,
      0,
      ep < 0.25 ? coreWhite : ep < 0.55 ? coreYellow : colorHot,
      a,
      colorMid,
      a * 0.3,
      colorFringe,
      a * 0.05,
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
    'Campfire: irregular rising tongues, charcoal fuel bed, warm ground spill, trailed sparks.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'fire-default',
    x: 900,
    y: 790,
    seed: 1,
    size: 1.2,
    spread: 1.05,
    rise: 0.85,
    turbulence: 0.95,
    embers: 0.85,
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
