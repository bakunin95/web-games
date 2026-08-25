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
 * Soft blob particle for industrial plume mass.
 * Scale roles create multi-scale cauliflower without concentric discs:
 * 0 = wispy filament · 1 = small billow · 2 = mid cauliflower · 3 = large body
 */
interface Blob {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  r: number;
  seed: number;
  role: 0 | 1 | 2 | 3;
  /** Persistent vertical bias for self-shadow sampling */
  shade: number;
  /** Stretch bias along wind */
  stretch: number;
  /** Secondary soft offset so overlaps stay irregular */
  jx: number;
  jy: number;
}

const pools = new Map<string, Blob[]>();

function pickRole(rand: () => number): 0 | 1 | 2 | 3 {
  const r = rand();
  if (r < 0.22) return 0;
  if (r < 0.48) return 1;
  if (r < 0.78) return 2;
  return 3;
}

function spawn(rand: () => number, params: SmokeParams): Blob {
  const role = pickRole(rand);
  // Tight stack-mouth spawn — narrow column that will expand downwind
  const mouthW = (role === 0 ? 5.5 : role === 1 ? 4 : 3) * params.spread;
  const mouthH = (role === 0 ? 3.5 : 2.2) * params.spread;
  const baseR =
    role === 0 ? 2.5 + rand() * 5 : role === 1 ? 5 + rand() * 8 : role === 2 ? 8 + rand() * 12 : 11 + rand() * 16;
  return {
    x: (rand() - 0.5) * mouthW,
    y: (rand() - 0.5) * mouthH - rand() * 2,
    life: rand() * 0.08,
    maxLife:
      role === 0
        ? 1.4 + rand() * 2.8
        : role === 1
          ? 2.2 + rand() * 3.6
          : role === 2
            ? 2.8 + rand() * 4.2
            : 3.2 + rand() * 5.0,
    vx: (rand() - 0.5) * 4,
    vy: -(2 + rand() * 8) * params.rise,
    r: baseR,
    seed: rand() * 10000,
    role,
    shade: 0.35 + rand() * 0.65,
    stretch: 0.7 + rand() * 0.7,
    jx: (rand() - 0.5) * 0.55,
    jy: (rand() - 0.5) * 0.45,
  };
}

function ensurePool(params: SmokeParams): Blob[] {
  let pool = pools.get(params.instanceId);
  if (!pool) {
    pool = [];
    pools.set(params.instanceId, pool);
  }
  // Dense soft mass — many overlapping blobs, no disc rings
  const target = Math.floor(160 + params.density * 260 * params.intensity);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < target) pool.push(spawn(rand, params));
  if (pool.length > target) pool.length = target;
  return pool;
}

/** Soft body fill: one gentle fade, offset center — never multi-band marble rings. */
function paintSoftBlob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot: number,
  color: string,
  alpha: number,
  softEdge = 0.55,
): void {
  if (rx < 0.5 || ry < 0.5 || alpha < 0.008) return;
  const R = Math.max(rx, ry);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(softEdge, withAlpha(color, alpha * 0.42));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

export const drawSmoke: DrawFn<SmokeParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const body = lerpColor(mat.baseColor, '#4a5562', 0.2);
  const mid = lerpColor(mat.baseColor, '#6a7380', 0.15);
  const dark = lerpColor(mat.baseColor, '#141820', 0.55);
  const lit = lerpColor(mat.emissive, '#e8dfc8', 0.35);
  const haze = lerpColor(mat.baseColor, '#9aa3ae', 0.45);
  const pool = ensurePool(params);
  const dt = scene.dt || 1 / 60;
  const rand = mulberry32((params.seed ^ 0x9e3779b9) | 0);
  const wind = scene.wind.x;
  const windAbs = Math.abs(wind);
  const windSign = wind >= 0 ? 1 : -1;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = Math.max(0.7, Math.min(1, mat.opacity));

  // Far / large first so small mouth blobs sit on top near the stack
  const sorted = [...pool].sort((a, b) => {
    const ka = a.life / a.maxLife;
    const kb = b.life / b.maxLife;
    return kb - ka || b.r - a.r || a.role - b.role;
  });

  for (const p of sorted) {
    if (!scene.paused) {
      p.life += dt;
      const n1 = fbm2(p.x * 0.012 + p.seed * 0.01, t * 0.42 + p.y * 0.008, 4, params.seed);
      const n2 = fbm2(p.y * 0.014, t * 0.32 + p.seed * 0.01, 3, params.seed + 17);
      const n3 = fbm2(p.seed * 0.02, t * 0.55, 2, params.seed + 43);

      // Strong horizontal wind shear — long trailing plume, not a round puff
      const windPull =
        wind * (95 + p.role * 12 + (p.role === 0 ? 40 : 0));
      p.vx += (n1 * 28 * params.turbulence + windPull) * dt;
      p.vy +=
        (-3.5 * params.rise + n2 * 12 * params.turbulence + wind * n3 * 4.5) * dt;
      // Light drag — keep momentum so plume stretches far downwind
      p.vx *= 1 - 0.045 * dt;
      p.vy *= 1 - 0.06 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Expand downwind: growth accelerates with age → cauliflower scale-up
      const growBase =
        p.role === 0
          ? 3.5 + params.size * 2.5
          : p.role === 1
            ? 6 + params.size * 4.5
            : p.role === 2
              ? 9 + params.size * 7
              : 11 + params.size * 9;
      const ageGrow = 0.45 + p.life * (0.55 + windAbs * 0.12);
      p.r += growBase * ageGrow * dt;

      if (p.life >= p.maxLife) Object.assign(p, spawn(rand, params));
    }

    const k = p.life / p.maxLife;
    // Birth tight at mouth; long soft death for wispy trailing edge
    const birth = k < 0.05 ? k / 0.05 : 1;
    const deathStart = p.role === 0 ? 0.28 : 0.42;
    const death = k > deathStart ? Math.max(0, (1 - k) / (1 - deathStart)) : 1;
    const envelope = birth * death;

    const dens =
      p.role === 0
        ? 0.55 - k * 0.25
        : p.role === 1
          ? 1.15 - k * 0.55
          : p.role === 2
            ? 1.45 - k * 0.7
            : 1.65 - k * 0.85;

    const a =
      envelope *
      dens *
      params.intensity *
      (0.75 + params.density * 0.55) *
      (p.role === 0 ? 0.22 : p.role === 1 ? 0.28 : p.role === 2 ? 0.34 : 0.38);
    if (a < 0.01) continue;

    const px = params.x + p.x;
    const py = params.y + p.y;
    const baseR = p.r * params.size;

    // Wind stretch grows with age — long horizontal trailing silhouette
    const windStretch = 1 + Math.min(2.4, windAbs * 0.55) * (0.25 + k * 1.35) * p.stretch;
    const rx =
      baseR *
      (p.role === 0 ? 1.55 * windStretch : p.role === 1 ? 0.85 + windStretch * 0.55 : 0.7 + windStretch * 0.45);
    const ry =
      baseR *
      (p.role === 0 ? 0.28 + k * 0.12 : p.role === 1 ? 0.62 : p.role === 2 ? 0.72 : 0.78) *
      (1 + k * 0.15);

    const nJ = fbm2(p.seed * 0.03, t * 0.35, 2, params.seed + 7);
    const jx = (p.jx + nJ * 0.2) * rx * 0.35;
    const jy = (p.jy + nJ * 0.15) * ry * 0.3;
    const cx = px + jx;
    const cy = py + jy;
    const rot = nJ * 0.35 + windSign * k * 0.12;

    // --- Density / self-shadow (subtle: darker underside, slightly lighter top) ---
    // Body mass — soft dark-mid blob (no marble rim)
    const bodyCol = k > 0.65 ? lerpColor(body, haze, (k - 0.65) / 0.35) : body;
    paintSoftBlob(ctx, cx, cy + ry * 0.06, rx, ry, rot, bodyCol, a, 0.5);

    // Underside shade — soft vertical bias only
    const shadeA = a * (0.45 + p.shade * 0.4) * (1 - k * 0.35);
    if (shadeA > 0.015 && p.role > 0) {
      paintSoftBlob(
        ctx,
        cx + windSign * rx * 0.04,
        cy + ry * (0.28 + p.shade * 0.12),
        rx * 0.82,
        ry * 0.55,
        rot * 0.4,
        dark,
        shadeA,
        0.45,
      );
    }

    // Top light — very subtle, no bright sphere highlight
    const litA = a * (0.22 + p.shade * 0.18) * mat.emissiveIntensity * (1 - k * 0.4);
    if (litA > 0.012 && p.role >= 1 && k < 0.75) {
      paintSoftBlob(
        ctx,
        cx - windSign * rx * 0.08,
        cy - ry * 0.38,
        rx * 0.55,
        ry * 0.32,
        rot * 0.2,
        lit,
        litA,
        0.4,
      );
    }

    // Secondary irregular bump — cauliflower lumpiness without rings
    if (p.role >= 2 && k < 0.7) {
      const bx = cx + p.jx * rx * 0.7;
      const by = cy + p.jy * ry * 0.55 - ry * 0.1;
      paintSoftBlob(ctx, bx, by, rx * 0.42, ry * 0.38, -rot * 0.5, mid, a * 0.55, 0.48);
    }

    // Soft wispy dissipation at trailing edge (aged particles + dedicated wisps)
    if (k > 0.35 || p.role === 0) {
      const filaments = p.role === 0 ? 3 : 1 + (Math.floor(p.seed) % 3);
      for (let w = 0; w < filaments; w++) {
        const wn = fbm2(p.seed * 0.05 + w * 1.7, t * 0.7 + w * 0.4, 3, params.seed + w * 29);
        const along = 0.35 + w * 0.22 + Math.abs(wn) * 0.4 + k * 0.35;
        const wx = cx + windSign * rx * along + wn * rx * 0.2;
        const wy = cy + ry * (-0.2 + (w % 4) * 0.18 + wn * 0.3);
        const wrx = rx * (0.12 + (w % 3) * 0.05) * (0.8 + k) * (p.role === 0 ? 1.6 : 1.1);
        const wry = ry * (0.04 + (w % 4) * 0.025) * (0.5 + Math.abs(wn));
        const wa = a * (p.role === 0 ? 0.7 : 0.28) * (1 - k * 0.35) * (0.35 + (w % 3) * 0.2);
        if (wa < 0.01 || wrx < 0.5) continue;
        paintSoftBlob(ctx, wx, wy, wrx * (1.1 + windAbs * 0.25), wry, wn * 0.9, haze, wa, 0.35);
      }
    }
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
    size: 1.25,
    spread: 0.85,
    rise: 0.35,
    density: 1.1,
    turbulence: 0.95,
    material: createDefaultMaterial({
      name: 'Ash Smoke',
      baseColor: '#343c48',
      emissive: '#d4c6a8',
      emissiveIntensity: 0.4,
      opacity: 0.96,
      roughness: 0.92,
      metalness: 0.05,
      blend: 'normal',
    }),
  },
  draw: drawSmoke,
};
