import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { getScale } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { mulberry32, withAlpha } from './noise';

export interface FlowersParams extends PlacedEffectParams {
  /** Bloom count density 0–1 */
  density: number;
  /** Patch width scale */
  spread: number;
  /** Stem + bloom size */
  size: number;
  /** Petal count per bloom (approx) */
  petals: number;
  /** Wind sway */
  sway: number;
}

interface Bloom {
  ox: number;
  stemH: number;
  lean: number;
  bloomR: number;
  petalN: number;
  hueShift: number;
  phase: number;
  stemShade: number;
}

const PETAL_PALETTE = ['#ff6b8a', '#ffd166', '#c77dff', '#ff9f1c', '#ef476f', '#f4a261', '#e9c46a'];

const pools = new Map<string, Bloom[]>();

function ensureBlooms(id: string, seed: number, n: number, spread: number, petals: number): Bloom[] {
  let pool = pools.get(id);
  const rand = mulberry32(seed | 0);
  if (!pool || pool.length !== n) {
    pool = [];
    for (let i = 0; i < n; i++) {
      pool.push({
        ox: (rand() - 0.5) * spread * 200,
        stemH: 36 + rand() * 48,
        lean: (rand() - 0.5) * 0.4,
        bloomR: 5 + rand() * 7,
        petalN: Math.max(4, Math.floor(4 + petals * 4 + rand() * 2)),
        hueShift: Math.floor(rand() * PETAL_PALETTE.length),
        phase: rand() * Math.PI * 2,
        stemShade: 0.55 + rand() * 0.4,
      });
    }
    pools.set(id, pool);
  }
  return pool;
}

export const drawFlowers: DrawFn<FlowersParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const scale = getScale(params);
  const n = Math.floor(6 + params.density * 22);
  const blooms = ensureBlooms(params.instanceId, params.seed, n, params.spread, params.petals);
  const wind = scene.wind.x * 0.7 + Math.sin(t * 1.5) * 0.1;

  ctx.save();
  applyMaterial(ctx, mat);
  ctx.translate(params.x, params.y);
  ctx.scale(scale, scale);

  for (const f of blooms) {
    const sway =
      (wind * params.sway + Math.sin(t * 2.1 + f.phase) * 0.18 * params.sway) * f.stemH * 0.018;
    const tipX = f.ox + (f.lean + sway) * f.stemH * 0.5;
    const tipY = -f.stemH * params.size;
    const midX = f.ox + (f.lean + sway * 0.5) * f.stemH * 0.25;

    // Stem
    ctx.beginPath();
    ctx.moveTo(f.ox, 0);
    ctx.quadraticCurveTo(midX, tipY * 0.55, tipX, tipY);
    ctx.strokeStyle = withAlpha('#2f6b28', 0.85 * params.intensity * f.stemShade);
    ctx.lineWidth = 1.6 * params.size;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Small leaf
    ctx.beginPath();
    ctx.ellipse(midX - 6, tipY * 0.55, 7 * params.size, 3 * params.size, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha('#3d8f2e', 0.7 * params.intensity);
    ctx.fill();

    const petalColor = mat.baseColor !== '#ffffff' ? mat.baseColor : PETAL_PALETTE[f.hueShift]!;
    const r = f.bloomR * params.size;

    // Petals
    for (let p = 0; p < f.petalN; p++) {
      const a = (p / f.petalN) * Math.PI * 2 + t * 0.15;
      const px = tipX + Math.cos(a) * r * 0.85;
      const py = tipY + Math.sin(a) * r * 0.55;
      ctx.beginPath();
      ctx.ellipse(px, py, r * 0.55, r * 0.32, a, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(petalColor, 0.88 * params.intensity);
      ctx.fill();
    }

    // Center
    ctx.beginPath();
    ctx.arc(tipX, tipY, r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(mat.emissive, 0.95 * params.intensity);
    ctx.fill();
  }

  ctx.restore();
};

export function disposeFlowersInstance(id: string): void {
  pools.delete(id);
}

export const flowersEffect: EffectModule<FlowersParams> = {
  id: 'flowers',
  name: 'Flowers',
  description: 'A small flower patch with swaying stems.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'flowers-default',
    x: 1000,
    y: 910,
    seed: 77,
    density: 0.7,
    spread: 1,
    size: 1,
    petals: 0.7,
    sway: 1,
    scale: 1,
    material: createDefaultMaterial({
      name: 'Flower Petal',
      baseColor: '#ff6b8a',
      emissive: '#ffe08a',
      emissiveIntensity: 0.55,
      opacity: 1,
      roughness: 0.6,
      metalness: 0.1,
      blend: 'normal',
    }),
  },
  draw: drawFlowers,
};
