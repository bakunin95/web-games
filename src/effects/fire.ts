import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { createDefaultMaterial } from '../core/material';
import { fbm2, mulberry32, withAlpha } from './noise';

export interface FireParams extends PlacedEffectParams {
  size: number;
  spread: number;
  rise: number;
  turbulence: number;
  embers: number;
}

/**
 * Soft rising tongue. Dense overlaps MERGE into luminous mass;
 * multi-column bias keeps silhouette irregular (not one cone glyph).
 */
interface Tongue {
  ox: number;
  oy: number;
  life: number;
  maxLife: number;
  phase: number;
  size: number;
  /** 0 outer orange · 1 body amber · 2 inner hot · 3 rare micro-white */
  role: 0 | 1 | 2 | 3;
  lean: number;
  bias: number;
  swayA: number;
  swayB: number;
  stretch: number;
  column: number;
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
  trail: { x: number; y: number }[];
}

interface FireState {
  tongues: Tongue[];
  sparks: Spark[];
}

const states = new Map<string, FireState>();

function spawnTongue(rand: () => number): Tongue {
  const r = rand();
  // Orange fringe dominates volume; white ~3%
  const role = (r < 0.52 ? 0 : r < 0.82 ? 1 : r < 0.97 ? 2 : 3) as 0 | 1 | 2 | 3;
  const column = Math.floor(rand() * 6);
  const colBias = (column - 2.5) * 0.62;
  const jitter = (rand() - 0.5) * 0.9;
  return {
    ox: colBias + jitter,
    oy: rand() * rand() * 0.85,
    life: rand(),
    maxLife: 0.28 + rand() * 0.9,
    phase: rand() * Math.PI * 2,
    size: 5 + rand() * 18,
    role,
    lean: (rand() - 0.5) * 1.5 + colBias * 0.35,
    bias: colBias + (rand() - 0.5) * 0.8,
    swayA: 1.2 + rand() * 4.8,
    swayB: 1.6 + rand() * 7,
    stretch: 1.25 + rand() * 1.6,
    column,
  };
}

function spawnSpark(rand: () => number, params: FireParams): Spark {
  return {
    x: (rand() - 0.5) * 40 * params.spread,
    y: -rand() * 5,
    vx: (rand() - 0.5) * 70,
    vy: -(80 + rand() * 160) * params.rise,
    life: rand() * 0.3,
    maxLife: 0.7 + rand() * 2.2,
    size: 0.7 + rand() * 2.0,
    wobble: 2 + rand() * 8,
    trail: [],
  };
}

function ensureState(params: FireParams): FireState {
  let state = states.get(params.instanceId);
  if (!state) {
    state = { tongues: [], sparks: [] };
    states.set(params.instanceId, state);
  }
  const tongueTarget = Math.floor(40 + params.intensity * 55 * params.size);
  const rand = mulberry32(params.seed | 0);
  while (state.tongues.length < tongueTarget) state.tongues.push(spawnTongue(rand));
  if (state.tongues.length > tongueTarget) state.tongues.length = tongueTarget;

  const sparkTarget = Math.floor(12 + params.embers * 60 * params.intensity);
  while (state.sparks.length < sparkTarget) state.sparks.push(spawnSpark(rand, params));
  if (state.sparks.length > sparkTarget) state.sparks.length = sparkTarget;
  return state;
}

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
  g.addColorStop(0.32, withAlpha(c0, a0 * 0.78));
  g.addColorStop(0.6, withAlpha(c1, a1));
  g.addColorStop(0.85, withAlpha(c2, a2));
  g.addColorStop(1, withAlpha(c2, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

function drawFuelBed(
  ctx: CanvasRenderingContext2D,
  params: FireParams,
  t: number,
  I: number,
  ei: number,
  massLean: number,
  colorHot: string,
  colorDeep: string,
  coreYellow: string,
): void {
  const S = params.size;
  const Sp = params.spread;
  const logY = params.y + 6 * S;
  const bedW = 58 * S * Sp;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // Charcoal mound
  {
    const g = ctx.createRadialGradient(params.x, logY, 3, params.x, logY, bedW);
    g.addColorStop(0, '#2e1a10');
    g.addColorStop(0.35, '#1a0c06');
    g.addColorStop(0.7, '#0c0502');
    g.addColorStop(1, withAlpha('#050201', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(params.x + massLean * 0.04, logY + 3, bedW, 17 * S, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const logs = [
    { ox: -18 * Sp, oy: 2, w: 28, h: 7, rot: -0.3, dark: '#1a0e08' },
    { ox: 14 * Sp, oy: 1, w: 26, h: 6.5, rot: 0.35, dark: '#120804' },
    { ox: -3 * Sp, oy: 6, w: 32, h: 6, rot: 0.05, dark: '#24160e' },
    { ox: 20 * Sp, oy: 7, w: 17, h: 5, rot: -0.55, dark: '#0e0603' },
    { ox: -22 * Sp, oy: 8, w: 15, h: 4.8, rot: 0.6, dark: '#1c100a' },
    { ox: 6 * Sp, oy: -1, w: 19, h: 5.5, rot: -0.18, dark: '#1e120c' },
    { ox: -10 * Sp, oy: -2, w: 16, h: 4.5, rot: 0.42, dark: '#160c08' },
  ];

  for (let i = 0; i < logs.length; i++) {
    const L = logs[i]!;
    const lx = params.x + L.ox * S + massLean * 0.03;
    const ly = logY + L.oy * S;
    const lw = L.w * S;
    const lh = L.h * S;

    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(L.rot);

    const g = ctx.createLinearGradient(-lw, 0, lw, 0);
    g.addColorStop(0, '#060201');
    g.addColorStop(0.28, L.dark);
    g.addColorStop(0.48, '#3a2414');
    g.addColorStop(0.72, L.dark);
    g.addColorStop(1, '#040101');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, lw, lh, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bark grain
    ctx.strokeStyle = withAlpha('#030101', 0.65);
    ctx.lineWidth = Math.max(0.8, 0.9 * S);
    for (let k = 0; k < 5; k++) {
      const yy = -lh * 0.5 + ((k + 0.35) / 5) * lh * 1.15;
      ctx.beginPath();
      ctx.moveTo(-lw * 0.82, yy + Math.sin(i * 2.2 + k) * 1.2);
      ctx.quadraticCurveTo(0, yy + Math.cos(i + k) * 1.5, lw * 0.82, yy);
      ctx.stroke();
    }

    // Ember glow in crack along top
    const pulse = 0.45 + 0.55 * Math.sin(t * (4.2 + i * 0.8) + i * 1.1);
    ctx.strokeStyle = withAlpha('#ff9020', 0.55 * pulse * I * ei);
    ctx.lineWidth = Math.max(1.2, 1.8 * S);
    ctx.beginPath();
    ctx.moveTo(-lw * 0.6, -lh * 0.4);
    ctx.quadraticCurveTo(-lw * 0.1, -lh * 0.85, lw * 0.55, -lh * 0.3);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(coreYellow, 0.75 * pulse * I * ei);
    ctx.lineWidth = Math.max(0.6, 0.85 * S);
    ctx.stroke();

    // Hot spots in log hollows
    softBlob(
      ctx,
      (randish(i) - 0.5) * lw * 0.6,
      -lh * 0.15,
      lw * 0.25,
      lh * 0.55,
      0,
      coreYellow,
      0.4 * pulse * I * ei,
      colorHot,
      0.2 * pulse * I,
      colorDeep,
      0,
    );

    ctx.restore();
  }

  // Ember pockets between logs
  const crackRand = mulberry32((params.seed + 91) | 0);
  for (let i = 0; i < 40; i++) {
    const cx = params.x + (crackRand() - 0.5) * bedW * 1.5;
    const cy = logY + (crackRand() - 0.5) * 11 * S;
    const pulse =
      0.45 +
      0.55 * Math.sin(t * (3.2 + crackRand() * 8) + i) *
        (0.5 + 0.5 * fbm2(i * 0.4, t * 2.1, 2, params.seed + i));
    const a = pulse * 0.85 * I * ei;
    softBlob(
      ctx,
      cx,
      cy,
      (3.5 + crackRand() * 9) * S,
      (1.6 + crackRand() * 3.2) * S,
      (crackRand() - 0.5) * 1.1,
      coreYellow,
      a,
      colorHot,
      a * 0.6,
      colorDeep,
      a * 0.1,
    );
  }

  softBlob(
    ctx,
    params.x + massLean * 0.1,
    params.y + 4 * S,
    34 * S * Sp,
    11 * S,
    0,
    colorHot,
    0.55 * I * ei,
    '#ff6a10',
    0.28 * I,
    colorDeep,
    0.05 * I,
  );

  ctx.restore();
}

function randish(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export const drawFire: DrawFn<FireParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  // Prefer deep red-orange over pale/yellow — yellow stacks to white under additive
  const colorHot = '#ff5a12';
  const colorMid = mat.baseColor;
  const colorFringe = '#d02808';
  const colorDeep = '#4a0800';
  const colorOrange = '#ff4810';
  const colorAmber = '#ff7018';
  const coreWhite = '#fff8e8';
  const corePale = '#ffc070';
  const coreYellow = '#ff9028';
  const state = ensureState(params);
  const dt = scene.dt || 1 / 60;
  const rand = mulberry32((params.seed + 42) | 0);
  const wind = scene.wind.x;
  const ei = mat.emissiveIntensity;

  const flicker =
    0.84 +
    0.08 * Math.sin(t * 6.2) +
    0.06 * Math.sin(t * 14.8 + 1.2) +
    0.08 * fbm2(t * 2.4, params.seed * 0.01, 3, params.seed);
  const I = params.intensity * flicker;
  const S = params.size;
  const Sp = params.spread;

  const massLean =
    fbm2(t * 0.42, params.seed * 0.02, 3, params.seed + 3) * 26 * Sp +
    Math.sin(t * 0.88) * 9 * Sp +
    wind * 16;

  // ── 1. Strong textured warm ground spill ──
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = mat.opacity;
  {
    const spillR = 150 * S * Sp;
    const by = params.y + 22 * S;
    const bx = params.x + massLean * 0.08;

    softBlob(ctx, bx, by, spillR, spillR * 0.25, 0, colorHot, 0.22 * I * ei, colorOrange, 0.12 * I * ei, colorFringe, 0.04 * I);
    softBlob(ctx, bx + massLean * 0.1, by - 4, spillR * 0.38, spillR * 0.12, 0, coreYellow, 0.14 * I * ei, colorHot, 0.08 * I, colorMid, 0.02 * I);

    const patches = Math.floor(100 + 55 * S);
    for (let i = 0; i < patches; i++) {
      const n1 = fbm2(i * 0.4, t * 0.32 + params.seed * 0.01, 3, params.seed + 11);
      const n2 = fbm2(i * 0.73 + 1.5, t * 0.24, 3, params.seed + 19);
      const n3 = fbm2(i * 0.29 + t * 0.2, params.seed * 0.03, 2, params.seed + 31);
      const ang = (i / patches) * Math.PI * 2 + n1 * 2.1 + ((i * 23) % 9) * 0.2;
      const u = 0.03 + Math.abs(n2) * 0.78 + ((i * 17) % 13) * 0.03;
      const dist = Math.min(1, u) * spillR;
      const invSq = 1 / (1 + (dist / (spillR * 0.18)) ** 2);
      const n = 0.35 + 0.65 * (0.5 + 0.5 * n1);
      const a = invSq * n * (0.32 + 0.18 * n3) * I * ei;
      if (a < 0.014) continue;
      const px = bx + Math.cos(ang) * dist * (0.48 + Math.abs(n2) * 0.7);
      const py = by + Math.sin(ang) * dist * 0.18 + n1 * 7;
      const prx = (5 + n * 24 + Math.abs(n2) * 18) * S;
      const pry = prx * (0.18 + Math.abs(n1) * 0.2);
      const warm = i % 5 === 0 ? coreYellow : i % 5 === 1 ? colorHot : i % 5 === 2 ? colorOrange : i % 5 === 3 ? colorAmber : colorMid;
      softBlob(ctx, px, py, prx, pry, ang * 0.4 + n2 * 0.5, warm, a, colorFringe, a * 0.4, colorDeep, a * 0.06);
    }
  }
  ctx.restore();

  // ── 2. Fuel bed (charcoal + crack embers) ──
  drawFuelBed(ctx, params, t, I, ei, massLean, colorHot, colorDeep, coreYellow);

  // ── 3. Flame BODY — additive saturated orange (soft merge, no pale→white blowout) ──
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = mat.opacity;

  const ordered = [...state.tongues].sort((a, b) => a.role - b.role);
  const riseBase = (1.05 + params.rise * 0.85) * S;

  // Soft low bloom — offset lobes break bilateral symmetry
  {
    const bloomH = 88 * S * (0.4 + params.rise * 0.5);
    const bloomW = 100 * S * Sp;
    softBlob(
      ctx,
      params.x + wind * 18 + massLean * 0.8,
      params.y - bloomH * 0.32,
      bloomW * 1.3,
      bloomH * 0.78,
      massLean * 0.008,
      colorOrange,
      0.055 * I * ei,
      colorFringe,
      0.025 * I,
      colorDeep,
      0.008 * I,
    );
    softBlob(
      ctx,
      params.x + massLean * 1.2 + 22 * Sp,
      params.y - bloomH * 0.22,
      bloomW * 0.62,
      bloomH * 0.55,
      0.15,
      colorAmber,
      0.04 * I * ei,
      colorOrange,
      0.02 * I,
      colorFringe,
      0.006 * I,
    );
    softBlob(
      ctx,
      params.x + massLean * 0.15 - 24 * Sp,
      params.y - bloomH * 0.14,
      bloomW * 0.48,
      bloomH * 0.4,
      -0.14,
      colorHot,
      0.03 * I * ei,
      colorOrange,
      0.015 * I,
      colorFringe,
      0.005 * I,
    );
  }

  for (const f of ordered) {
    if (!scene.paused) {
      f.life += dt;
      if (f.life >= f.maxLife) Object.assign(f, spawnTongue(rand), { life: 0 });
    }

    const p = f.life / f.maxLife;
    const age = 1 - p;
    const roleRise = f.role === 0 ? 0.65 : f.role === 1 ? 1.15 : f.role === 2 ? 0.5 : 0.22;
    const height = (24 + f.size * 3.5) * riseBase * roleRise * f.stretch * (0.4 + f.oy * 0.8);

    const turb =
      fbm2(f.ox * 3.4 + f.phase, t * (2.0 + params.turbulence) + f.phase, 4, params.seed) *
      params.turbulence *
      22 *
      Sp;
    const turb2 =
      fbm2(f.oy * 3.8 + f.bias, t * 2.9 + f.phase * 0.55, 3, params.seed + 5) *
      params.turbulence *
      12 *
      Sp;

    const sway =
      Math.sin(t * f.swayA + f.phase) * 8.5 * Sp +
      Math.sin(t * f.swayB + f.phase * 1.9) * 5 * Sp +
      Math.cos(t * (f.swayA * 0.4) + f.bias) * 3.5 * Sp +
      wind * (16 + p * 40) +
      turb +
      turb2 +
      f.lean * 18 * p +
      f.bias * 12 * (0.5 + p) +
      massLean * (0.4 + p * 0.7);

    const lateral = f.role === 0 ? 1.9 : f.role === 1 ? 1.3 : f.role === 2 ? 0.45 : 0.16;
    const bulge = 0.75 + Math.sin(p * Math.PI) * 0.4 + (1 - p) * 0.2;
    const ragged =
      1 + 0.4 * fbm2(f.ox * 5.2 + t * 1.1, f.oy * 3.8 + f.phase, 2, params.seed + f.role + f.column * 3);

    const px =
      params.x +
      f.ox * 30 * Sp * lateral * bulge * ragged +
      f.bias * 12 * Sp * (1 - p * 0.2) +
      sway * p * 1.0;
    const py =
      params.y -
      p * height -
      f.oy * 5 * S * (1 - p * 0.15) +
      Math.sin(t * f.swayB * 0.28 + f.phase) * 3.5 * S * p;

    // Very low alphas — additive must merge soft, not blow white
    const roleA = f.role === 0 ? 0.055 : f.role === 1 ? 0.065 : f.role === 2 ? 0.05 : 0.12;
    const alpha = age * roleA * I * ei;
    const roleScale = f.role === 0 ? 2.5 : f.role === 1 ? 1.6 : f.role === 2 ? 0.55 : 0.24;
    const radius = f.size * S * roleScale * (0.5 + age * 0.55) * ragged;

    let c0: string;
    let c1: string;
    let c2: string;
    if (f.role === 3) {
      c0 = coreWhite;
      c1 = corePale;
      c2 = coreYellow;
    } else if (f.role === 2) {
      c0 = coreYellow;
      c1 = colorAmber;
      c2 = colorHot;
    } else if (f.role === 1) {
      c0 = colorAmber;
      c1 = colorHot;
      c2 = colorOrange;
    } else {
      c0 = colorOrange;
      c1 = colorFringe;
      c2 = colorDeep;
    }

    const stretchY =
      (f.role === 0 ? 1.55 : f.role === 1 ? 1.95 : f.role === 2 ? 1.35 : 0.9) *
      f.stretch *
      (1.0 + p * 0.95);
    const stretchX =
      (f.role === 0 ? 1.3 : f.role === 1 ? 0.88 : 0.48) *
      (0.7 + Math.abs(f.bias) * 0.1 + (1 - p) * 0.35);

    softBlob(
      ctx,
      px,
      py,
      radius * stretchX,
      radius * stretchY,
      sway * 0.018 + f.lean * 0.14,
      c0,
      alpha,
      c1,
      alpha * 0.55,
      c2,
      alpha * 0.12,
    );

    // Tip wisps on fringe/body — separate rising tongues
    if (f.role <= 1 && p > 0.18 && p < 0.92) {
      const tipA = alpha * 0.55;
      softBlob(
        ctx,
        px + sway * 0.12 + f.lean * 6,
        py - radius * stretchY * 0.62,
        radius * stretchX * 0.38,
        radius * stretchY * 0.65,
        sway * 0.03,
        c0,
        tipA,
        c1,
        tipA * 0.4,
        c2,
        tipA * 0.06,
      );
    }
  }

  // Tiny white kernel nest at base only — orange already owns the volume
  {
    const cx =
      params.x +
      wind * 1.2 +
      fbm2(t * 2.5, params.seed * 0.03, 2, params.seed + 9) * 6 * Sp +
      massLean * 0.12;
    const cy = params.y + 2 * S + fbm2(t * 3.2, params.seed * 0.04, 2, params.seed + 13) * 2 * S;
    softBlob(ctx, cx, cy - 2 * S, 14 * S * Sp, 9 * S, 0, colorAmber, 0.08 * I * ei, colorHot, 0.04 * I, colorOrange, 0.012 * I);
    softBlob(ctx, cx, cy, 3.2 * S * Sp, 2.4 * S, 0, coreWhite, 0.4 * I * ei, corePale, 0.2 * I * ei, coreYellow, 0.04 * I);
  }
  ctx.restore();

  // ── 4. Log silhouettes over flame base so charcoal reads ──
  {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const logY = params.y + 7 * S;
    for (let i = 0; i < 5; i++) {
      const lx = params.x + (i - 2) * 13 * S * Sp + Math.sin(i * 2.3) * 4 * S + massLean * 0.05;
      const ly = logY + (i % 2) * 3.5 * S;
      const lw = (15 + (i % 3) * 6) * S;
      const lh = (4 + (i % 2) * 1.5) * S;
      const rot = (i - 2) * 0.14;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(rot);
      ctx.fillStyle = withAlpha('#080301', 0.72 * Math.min(1, I));
      ctx.beginPath();
      ctx.ellipse(0, 0, lw, lh, 0, 0, Math.PI * 2);
      ctx.fill();
      const pulse = 0.5 + 0.5 * Math.sin(t * 4.8 + i * 1.4);
      ctx.strokeStyle = withAlpha(coreYellow, 0.55 * pulse * I * ei);
      ctx.lineWidth = Math.max(1, 1.2 * S);
      ctx.beginPath();
      ctx.moveTo(-lw * 0.55, -lh * 0.35);
      ctx.quadraticCurveTo(0, -lh * 0.75, lw * 0.5, -lh * 0.25);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // ── 5. Rising sparks with trails (drawn last so they pop) ──
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const e of state.sparks) {
    if (!scene.paused) {
      e.life += dt;
      const n = fbm2(e.x * 0.05, t * 1.9 + e.y * 0.02, 2, params.seed + 7);
      const n2 = fbm2(e.y * 0.04, t * 2.4 + e.x * 0.03, 2, params.seed + 17);
      e.vx += (n * 85 + n2 * 40 + wind * 40) * dt;
      e.vy -= (30 + Math.abs(n2) * 35) * params.rise * dt;
      e.x += e.vx * dt + Math.sin(t * e.wobble + e.x * 0.1) * 20 * dt;
      e.y += e.vy * dt;
      e.trail.push({ x: params.x + e.x, y: params.y + e.y });
      if (e.trail.length > 14) e.trail.shift();
      if (e.life >= e.maxLife || e.y < -220) {
        Object.assign(e, spawnSpark(rand, params));
        e.trail = [];
      }
    }

    const ep = e.life / e.maxLife;
    const a = (1 - ep) * 1.0 * I * Math.max(0.55, params.embers) * ei;
    if (a <= 0.01) continue;

    // Always draw a velocity streak even if trail is short (capture freeze)
    const len = (14 + (1 - ep) * 22) * S;
    const hx = params.x + e.x;
    const hy = params.y + e.y;
    ctx.strokeStyle = withAlpha(ep < 0.25 ? '#fff8e0' : coreYellow, a * 0.9);
    ctx.lineWidth = Math.max(1.2, e.size * 1.8 * S);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - e.vx * 0.025 * len, hy - e.vy * 0.025 * len);
    ctx.stroke();

    if (e.trail.length >= 2) {
      for (let i = 1; i < e.trail.length; i++) {
        const a0 = e.trail[i - 1]!;
        const a1 = e.trail[i]!;
        const ta = a * (i / e.trail.length) * 0.9;
        ctx.strokeStyle = withAlpha(ep < 0.35 ? corePale : colorHot, ta);
        ctx.lineWidth = e.size * (1.0 + (i / e.trail.length) * 2.0) * S;
        ctx.beginPath();
        ctx.moveTo(a0.x, a0.y);
        ctx.lineTo(a1.x, a1.y);
        ctx.stroke();
      }
    }

    softBlob(
      ctx,
      hx,
      hy,
      e.size * 2.6 * S,
      e.size * 2.8 * S,
      0,
      ep < 0.2 ? coreWhite : coreYellow,
      a,
      colorHot,
      a * 0.4,
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
    spread: 1.1,
    rise: 0.85,
    turbulence: 1.0,
    embers: 0.9,
    material: createDefaultMaterial({
      name: 'Fire / Magma',
      baseColor: '#ff3b10',
      emissive: '#ff9a40',
      emissiveIntensity: 1.15,
      blend: 'additive',
      roughness: 0.35,
      metalness: 0.1,
    }),
  },
  draw: drawFire,
};
