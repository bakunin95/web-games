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

/**
 * Advected parcel for industrial plume.
 * role: 0 wisp · 1 small billow · 2 mid · 3 large cauliflower
 */
interface Parcel {
  s: number;
  u: number;
  life: number;
  maxLife: number;
  speed: number;
  seed: number;
  role: 0 | 1 | 2 | 3;
  shade: number;
  lobes: number;
  phase: number;
}

const pools = new Map<string, Parcel[]>();
const PLUME_LEN = 780;

function pickRole(rand: () => number): 0 | 1 | 2 | 3 {
  const r = rand();
  if (r < 0.28) return 0;
  if (r < 0.52) return 1;
  if (r < 0.78) return 2;
  return 3;
}

function spawn(rand: () => number, atMouth: boolean): Parcel {
  const role = pickRole(rand);
  const s = atMouth ? rand() * 18 : rand() * PLUME_LEN;
  return {
    s,
    u: (rand() - 0.5) * 2,
    life: atMouth ? rand() * 0.04 : rand() * 0.7,
    maxLife:
      role === 0 ? 2.2 + rand() * 2.6 : role === 1 ? 2.8 + rand() * 3.2 : role === 2 ? 3.4 + rand() * 3.8 : 3.8 + rand() * 4.2,
    speed: 85 + rand() * 50 + (role === 0 ? 35 : 0),
    seed: rand() * 10000,
    role,
    shade: 0.25 + rand() * 0.75,
    lobes: role === 0 ? 1 : role === 1 ? 3 : role === 2 ? 5 + Math.floor(rand() * 3) : 6 + Math.floor(rand() * 4),
    phase: rand() * Math.PI * 2,
  };
}

function ensurePool(params: SmokeParams): Parcel[] {
  let pool = pools.get(params.instanceId);
  if (!pool) {
    pool = [];
    pools.set(params.instanceId, pool);
  }
  const target = Math.floor(280 + params.density * 360 * params.intensity);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < target) {
    pool.push(spawn(rand, pool.length < target * 0.22));
  }
  if (pool.length > target) pool.length = target;
  return pool;
}

/** Flat soft ellipse — avoids multi-band concentric marble rings. */
function softBlob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot: number,
  color: string,
  alpha: number,
): void {
  if (rx < 0.5 || ry < 0.5 || alpha < 0.008) return;
  const R = Math.max(rx, ry);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(0.72, withAlpha(color, alpha * 0.25));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

export const drawSmoke: DrawFn<SmokeParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const body = lerpColor(mat.baseColor, '#3e4854', 0.12);
  const dark = lerpColor(mat.baseColor, '#0a0e14', 0.58);
  const mid = lerpColor(mat.baseColor, '#556070', 0.18);
  const lit = lerpColor(mat.emissive, '#e8dcc4', 0.25);
  const haze = lerpColor(mat.baseColor, '#8e97a4', 0.4);
  const pool = ensurePool(params);
  const dt = scene.dt || 1 / 60;
  const rand = mulberry32((params.seed ^ 0x9e3779b9) | 0);
  const wind = scene.wind.x;
  const windAbs = Math.max(0.25, Math.abs(wind));
  const windSign = wind >= 0 ? 1 : -1;
  const rise = 0.2 * params.rise;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = Math.max(0.78, Math.min(1, mat.opacity));

  // --- Structural stations: guarantee continuous connected plume (no gap islands) ---
  const stations = Math.floor(36 + params.density * 18);
  for (let si = 0; si < stations; si++) {
    const along = si / (stations - 1);
    const s = along * PLUME_LEN * 0.92;
    const n = fbm2(along * 4 + params.seed * 0.01, t * 0.2, 3, params.seed);
    const n2 = fbm2(along * 6, t * 0.15 + 2, 2, params.seed + 9);

    // Narrow mouth → expands downwind into cauliflower width
    const envH = (4 + along * 48 + along * along * 70) * params.size * (0.7 + params.spread * 0.4);
    const envCore = (5 + along * 28) * params.size;

    const cx = params.x + windSign * s;
    const cy = params.y - s * rise + n * envH * 0.08;

    const trail = along > 0.55 ? Math.max(0.15, 1 - (along - 0.55) / 0.55) : 1;
    const baseA =
      (0.55 - along * 0.22) * params.intensity * (0.8 + params.density * 0.4) * trail * mat.opacity;
    if (baseA < 0.02) continue;

    // Core mass along spine (keeps plume connected)
    const stretch = 1.5 + windAbs * 0.5 + along * 1.4;
    softBlob(
      ctx,
      cx,
      cy,
      envCore * stretch * 0.55,
      envCore * (0.35 + along * 0.25),
      n * 0.15,
      body,
      baseA * 0.55,
    );
    softBlob(
      ctx,
      cx + windSign * envCore * 0.05,
      cy + envCore * 0.22,
      envCore * stretch * 0.45,
      envCore * 0.28,
      0,
      dark,
      baseA * 0.35,
    );

    // Cauliflower billows — lobes protrude from envelope for lumpy silhouette
    const lobeCount = 5 + Math.floor(along * 6);
    for (let li = 0; li < lobeCount; li++) {
      const ang = (li / lobeCount) * Math.PI * 2 + n * 0.8 + along * 2.5 + t * 0.15;
      const protrude = 0.45 + (li % 5) * 0.12 + Math.abs(n2) * 0.2;
      const lx = cx + Math.cos(ang) * envH * protrude * 0.55 + windSign * (li % 3) * along * 6;
      const ly = cy + Math.sin(ang) * envH * protrude * 0.75;
      const sc = 0.35 + (li % 4) * 0.12 + along * 0.15;
      const lrx = envH * sc * stretch * 0.42;
      const lry = envH * sc * 0.38;
      const la = baseA * (0.4 + (li % 3) * 0.12);
      softBlob(ctx, lx, ly, lrx, lry, ang * 0.2, li % 2 ? mid : body, la);
      softBlob(ctx, lx, ly + lry * 0.3, lrx * 0.75, lry * 0.45, 0, dark, la * 0.4);
      if (along < 0.65 && li % 3 === 0) {
        softBlob(ctx, lx - windSign * lrx * 0.08, ly - lry * 0.35, lrx * 0.4, lry * 0.28, 0, lit, la * 0.18 * mat.emissiveIntensity);
      }
    }
  }

  // --- Advected parcels: multi-scale detail + trailing wisps ---
  const sorted = [...pool].sort((a, b) => b.s - a.s || a.role - b.role);
  for (const p of sorted) {
    if (!scene.paused) {
      p.life += dt;
      p.phase += dt * (0.45 + p.shade * 0.4);
      const n1 = fbm2(p.s * 0.008 + p.seed * 0.01, t * 0.4, 4, params.seed);
      const n2 = fbm2(p.u * 2, t * 0.32 + p.seed * 0.01, 3, params.seed + 21);
      p.s += p.speed * windAbs * dt;
      p.u += (n1 * 0.6 + n2 * 0.4) * params.turbulence * dt;
      p.u = Math.max(-1.4, Math.min(1.4, p.u * (1 - 0.03 * dt)));
      if (p.life >= p.maxLife || p.s > PLUME_LEN * 1.2) Object.assign(p, spawn(rand, true));
    }

    const along = Math.min(1, p.s / PLUME_LEN);
    const k = p.life / p.maxLife;
    const birth = k < 0.05 ? k / 0.05 : 1;
    const deathStart = p.role === 0 ? 0.3 : 0.48;
    const death = k > deathStart ? Math.max(0, (1 - k) / (1 - deathStart)) : 1;
    const trail = along > 0.5 ? Math.max(0, 1 - (along - 0.5) / 0.65) : 1;
    const envelope = birth * death * trail;
    if (envelope < 0.02) continue;

    const envH = (5 + along * 52 + along * along * 55) * params.size * (0.65 + params.spread * 0.45);
    const nBillow = fbm2(p.s * 0.015 + p.seed * 0.02, t * 0.22 + p.phase, 3, params.seed + 7);
    const px = params.x + windSign * p.s;
    const py = params.y - p.s * rise + p.u * envH * 0.55 + nBillow * envH * 0.1;

    const sizeMul =
      p.role === 0 ? 0.4 + along * 0.5 : p.role === 1 ? 0.5 + along * 0.65 : p.role === 2 ? 0.6 + along * 0.8 : 0.7 + along * 0.9;
    const baseR = (8 + p.role * 5) * params.size * sizeMul;
    const stretch = 1.35 + windAbs * 0.5 + along * 1.4;
    const rx0 = baseR * (p.role === 0 ? stretch * 2.0 : stretch * 0.9);
    const ry0 = baseR * (p.role === 0 ? 0.18 : 0.4 + along * 0.28);

    const dens = p.role === 0 ? 0.42 : p.role === 1 ? 0.7 - along * 0.15 : p.role === 2 ? 0.9 - along * 0.2 : 1.05 - along * 0.25;
    const a =
      envelope *
      dens *
      params.intensity *
      (0.75 + params.density * 0.45) *
      (p.role === 0 ? 0.2 : p.role === 1 ? 0.28 : p.role === 2 ? 0.34 : 0.38);
    if (a < 0.01) continue;

    const col = along > 0.6 ? lerpColor(body, haze, (along - 0.6) / 0.4) : body;

    for (let i = 0; i < p.lobes; i++) {
      const ang = (i / Math.max(1, p.lobes)) * Math.PI * 2 + p.phase * 0.4 + p.seed * 0.01;
      const protrude = i === 0 ? 0.12 : 0.5 + (i % 4) * 0.14;
      const lx = px + Math.cos(ang) * rx0 * protrude * 0.75 + windSign * (i % 3) * rx0 * 0.05 * along;
      const ly = py + Math.sin(ang) * ry0 * protrude * 0.95;
      const scale = i === 0 ? 0.9 : 0.38 + (i % 5) * 0.1;
      const lrx = rx0 * scale * (0.82 + 0.12 * Math.sin(p.phase + i));
      const lry = ry0 * scale * (0.78 + 0.14 * Math.cos(p.phase * 1.1 + i));
      const la = a * (i === 0 ? 1 : 0.52 + (i % 3) * 0.1);
      const rot = nBillow * 0.28 + windSign * along * 0.1;
      softBlob(ctx, lx, ly, lrx, lry, rot, i % 3 === 0 ? mid : col, la);
      if (p.role >= 1) {
        softBlob(
          ctx,
          lx + windSign * lrx * 0.02,
          ly + lry * (0.28 + p.shade * 0.1),
          lrx * 0.78,
          lry * 0.48,
          rot * 0.3,
          dark,
          la * (0.42 + p.shade * 0.28) * (1 - along * 0.2),
        );
      }
      if (p.role >= 2 && i <= 1 && along < 0.68) {
        softBlob(
          ctx,
          lx - windSign * lrx * 0.05,
          ly - lry * 0.36,
          lrx * 0.4,
          lry * 0.25,
          rot * 0.2,
          lit,
          la * 0.2 * mat.emissiveIntensity,
        );
      }
    }

    // Soft wispy dissipation at trailing edge
    if (along > 0.25 || p.role === 0) {
      const filaments = p.role === 0 ? 5 : 2;
      for (let w = 0; w < filaments; w++) {
        const wn = fbm2(p.seed * 0.04 + w * 1.9, t * 0.7 + w * 0.25, 3, params.seed + w * 29);
        const wx = px + windSign * rx0 * (0.5 + w * 0.18 + Math.abs(wn) * 0.4 + along * 0.25);
        const wy = py + ry0 * (-0.2 + (w % 5) * 0.18 + wn * 0.4);
        const wrx = rx0 * (0.15 + w * 0.04) * (0.9 + along) * (p.role === 0 ? 1.55 : 1);
        const wry = ry0 * (0.04 + (w % 4) * 0.02) * (0.5 + Math.abs(wn));
        const wa = a * (p.role === 0 ? 0.72 : 0.3) * (0.35 + along * 0.45);
        softBlob(ctx, wx, wy, wrx * (1.2 + windAbs * 0.25), wry, wn * 0.9, haze, wa);
      }
    }
  }

  // Mouth tether — dense small blobs so smoke reads as leaving the stack
  const mouthRand = mulberry32((params.seed + 777) | 0);
  const mouthN = Math.floor(22 + params.density * 16);
  for (let i = 0; i < mouthN; i++) {
    const ms = mouthRand() * 32;
    const mu = (mouthRand() - 0.5) * 2;
    const mx = params.x + windSign * ms;
    const my = params.y - ms * rise + mu * 4.5 * params.spread;
    const mr = (2.5 + mouthRand() * 4.5) * params.size * 0.5;
    const ma = 0.32 * params.intensity * (1 - ms / 36);
    softBlob(ctx, mx, my, mr * 1.15, mr * 0.65, mu * 0.15, body, ma);
    softBlob(ctx, mx, my + mr * 0.22, mr * 0.85, mr * 0.38, 0, dark, ma * 0.5);
  }

  ctx.restore();
};

export function disposeSmokeInstance(instanceId: string): void {
  pools.delete(instanceId);
}

export const smokeEffect: EffectModule<SmokeParams> = {
  id: 'smoke',
  name: 'Smoke',
  description:
    'Industrial plume: narrow stack mouth, wind-sheared cauliflower billows, soft trailing wisps.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'smoke-default',
    x: 1100,
    y: 780,
    seed: 2,
    size: 1.2,
    spread: 0.8,
    rise: 0.35,
    density: 1.15,
    turbulence: 1,
    material: createDefaultMaterial({
      name: 'Ash Smoke',
      baseColor: '#2e3640',
      emissive: '#d4c6a8',
      emissiveIntensity: 0.4,
      opacity: 0.96,
      roughness: 0.93,
      metalness: 0.05,
      blend: 'normal',
    }),
  },
  draw: drawSmoke,
};
