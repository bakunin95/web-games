import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { fbm2, mulberry32, withAlpha, lerpColor } from './noise';

export interface SmokeParams extends PlacedEffectParams {
  size: number;
  spread: number;
  rise: number;
  density: number;
  turbulence: number;
}

/** One cauliflower billow within a puff cluster. */
interface Lobe {
  /** Offset from puff center, normalized roughly [-1,1] then scaled by puff radii. */
  ox: number;
  oy: number;
  /** Relative radii multipliers (uneven scale is critical). */
  sx: number;
  sy: number;
  phase: number;
  /** 0 = deep shadow core, 1 = more lit / outer. */
  litBias: number;
}

interface Puff {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  seed: number;
  lobes: Lobe[];
  /** 'core' = dense billow mass; 'wisp' = fine edge filament. */
  kind: 'core' | 'wisp';
}

const pools = new Map<string, Puff[]>();

function makeLobes(rand: () => number, count: number): Lobe[] {
  const lobes: Lobe[] = [];
  for (let i = 0; i < count; i++) {
    // Irregular packing — not a neat ring. Prefer upper hemisphere for cauliflower tops.
    const ang = rand() * Math.PI * 2;
    const rad = 0.15 + rand() * 0.85;
    const yBias = (rand() - 0.35) * 0.9;
    lobes.push({
      ox: Math.cos(ang) * rad * (0.55 + rand() * 0.55),
      oy: Math.sin(ang) * rad * 0.45 + yBias * 0.35,
      sx: 0.35 + rand() * 0.85,
      sy: 0.28 + rand() * 0.7,
      phase: rand() * Math.PI * 2,
      litBias: 0.25 + rand() * 0.75,
    });
  }
  return lobes;
}

function spawnPuff(rand: () => number, params: SmokeParams, asWisp = false): Puff {
  const kind: 'core' | 'wisp' = asWisp || rand() < 0.22 ? 'wisp' : 'core';
  const lobeCount =
    kind === 'wisp' ? 1 + Math.floor(rand() * 2) : 4 + Math.floor(rand() * 5);
  // Anchor hard at the stack mouth; tiny jitter only.
  const mouthJitter = kind === 'wisp' ? 10 : 6;
  return {
    x: (rand() - 0.5) * mouthJitter * params.spread,
    y: (rand() - 0.55) * mouthJitter * 0.6,
    life: rand() * 0.12,
    maxLife:
      kind === 'wisp'
        ? 1.4 + rand() * 2.4
        : 2.6 + rand() * 4.8,
    vx: (rand() - 0.5) * 6 * params.spread,
    vy: -(8 + rand() * 14) * params.rise,
    size: kind === 'wisp' ? 4 + rand() * 10 : 10 + rand() * 22,
    spin: (rand() - 0.5) * 0.55,
    seed: rand() * 10000,
    lobes: makeLobes(rand, lobeCount),
    kind,
  };
}

function ensurePool(params: SmokeParams): Puff[] {
  let pool = pools.get(params.instanceId);
  if (!pool) {
    pool = [];
    pools.set(params.instanceId, pool);
  }
  // Dense near-source mass needs many overlapping clusters.
  const target = Math.floor(55 + params.density * 120 * params.intensity);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < target) pool.push(spawnPuff(rand, params));
  if (pool.length > target) pool.length = target;
  return pool;
}

/** Draw one self-shadowed cauliflower lobe. */
function drawLobe(
  ctx: CanvasRenderingContext2D,
  lx: number,
  ly: number,
  lrx: number,
  lry: number,
  rot: number,
  alpha: number,
  colorCore: string,
  colorDark: string,
  colorLit: string,
  litBias: number,
  windSign: number,
  emissiveIntensity: number,
): void {
  if (lrx < 0.5 || lry < 0.5 || alpha < 0.004) return;

  // --- Body: dark core (baseColor) with soft falloff — mass, not a glow blob ---
  const body = ctx.createRadialGradient(
    lx,
    ly + lry * 0.22,
    0,
    lx,
    ly,
    Math.max(lrx, lry) * 1.05,
  );
  body.addColorStop(0, withAlpha(colorDark, alpha * 1.15));
  body.addColorStop(0.38, withAlpha(colorCore, alpha * 0.95));
  body.addColorStop(0.72, withAlpha(colorCore, alpha * 0.32));
  body.addColorStop(1, withAlpha(colorCore, 0));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(lx, ly, lrx, lry, rot, 0, Math.PI * 2);
  ctx.fill();

  // --- Underside / crevice self-shadow ---
  const shade = ctx.createRadialGradient(
    lx,
    ly + lry * 0.42,
    0,
    lx,
    ly + lry * 0.15,
    Math.max(lrx, lry) * 0.95,
  );
  shade.addColorStop(0, withAlpha(colorDark, alpha * 0.7));
  shade.addColorStop(0.55, withAlpha(colorDark, alpha * 0.22));
  shade.addColorStop(1, withAlpha(colorDark, 0));
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.ellipse(lx, ly + lry * 0.18, lrx * 0.85, lry * 0.55, rot * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // --- Windward / top lit rim (emissive) — per lobe ---
  const litA = alpha * (0.35 + litBias * 0.55) * emissiveIntensity;
  if (litA > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rimX = lx - windSign * lrx * 0.28;
    const rimY = ly - lry * 0.48;
    const rim = ctx.createRadialGradient(rimX, rimY, 0, lx, ly - lry * 0.15, Math.max(lrx, lry) * 0.95);
    rim.addColorStop(0, withAlpha(colorLit, litA));
    rim.addColorStop(0.28, withAlpha(colorLit, litA * 0.45));
    rim.addColorStop(0.6, withAlpha(colorLit, litA * 0.12));
    rim.addColorStop(1, withAlpha(colorLit, 0));
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.ellipse(lx, ly - lry * 0.12, lrx * 0.92, lry * 0.78, rot * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export const drawSmoke: DrawFn<SmokeParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const colorCore = mat.baseColor;
  const colorLit = lerpColor(mat.emissive, '#f4efe4', 0.4);
  const colorDark = lerpColor(mat.baseColor, '#06080c', 0.55);
  const colorMid = lerpColor(mat.baseColor, mat.emissive, 0.18);
  const soft = 0.65 + mat.roughness * 0.55;
  const pool = ensurePool(params);
  const dt = scene.dt || 1 / 60;
  const rand = mulberry32((params.seed ^ 0x9e3779b9) | 0);
  const wind = scene.wind.x;
  const windSign = wind >= 0 ? 1 : -1;
  const ei = mat.emissiveIntensity;

  ctx.save();
  applyMaterial(ctx, mat);

  // Back-to-front: larger / lower first so lit rims stack on top.
  const sorted = [...pool].sort((a, b) => b.size - a.size || a.y - b.y || a.x - b.x);

  for (const p of sorted) {
    if (!scene.paused) {
      p.life += dt;
      const n1 = fbm2(p.x * 0.02 + p.seed * 0.01, t * 0.38 + p.y * 0.012, 4, params.seed);
      const n2 = fbm2(p.y * 0.02, t * 0.28 + p.seed * 0.01, 3, params.seed + 19);
      const n3 = fbm2(p.seed * 0.02, t * 0.5, 2, params.seed + 41);

      // Strong horizontal advection — industrial plume stretch with wind.
      const windPull = wind * (38 + (p.kind === 'wisp' ? 22 : 12));
      p.vx += (n1 * 32 * params.turbulence + windPull) * dt;
      p.vy += (-5.5 * params.rise + n2 * 12 * params.turbulence) * dt;
      // Slight vertical shear so the trail isn't a sealed tube.
      p.vy += wind * n3 * 4 * dt;

      p.vx *= 1 - 0.12 * dt;
      p.vy *= 1 - 0.06 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Billows swell with age; wisps stay thinner and elongate with wind.
      const grow =
        p.kind === 'wisp'
          ? (6 + params.size * 4) * soft * (0.5 + p.life * 0.2)
          : (12 + params.size * 11) * soft * (0.65 + p.life * 0.18);
      p.size += grow * dt;
      p.spin += (n1 * 0.4 + wind * 0.08) * dt;

      // Lobes breathe / tumble independently for turbulent mass.
      for (const L of p.lobes) {
        L.phase += (0.4 + L.litBias * 0.6) * dt;
        L.ox += n1 * 0.08 * params.turbulence * dt;
        L.oy += n2 * 0.06 * params.turbulence * dt;
      }

      if (p.life >= p.maxLife) Object.assign(p, spawnPuff(rand, params));
    }

    const k = p.life / p.maxLife;
    // Dense near source, softer / thinner farther along the trail.
    const densNear = p.kind === 'wisp' ? 0.55 - k * 0.35 : 1.45 - k * 0.75;
    const birth = k < 0.06 ? k / 0.06 : 1;
    const death = k > 0.45 ? Math.max(0, (1 - k) / 0.55) : 1;
    const envelope = birth * death;
    const alpha =
      envelope *
      (p.kind === 'wisp' ? 0.16 : 0.3) *
      params.intensity *
      densNear *
      (0.7 + params.density * 0.6) *
      mat.opacity;
    if (alpha <= 0.006) continue;

    const px = params.x + p.x;
    const py = params.y + p.y;
    const baseR = p.size * params.size;
    // Stretch along wind — ragged dissipation trail, not a sealed oval.
    const windStretch = 1 + Math.min(1.4, Math.abs(wind) * 0.35) * (0.35 + k * 0.9);
    const rx = baseR * (0.9 + Math.sin(p.spin) * 0.08) * (p.kind === 'wisp' ? windStretch * 1.35 : windStretch);
    const ry = baseR * (0.62 + Math.cos(p.spin * 0.7) * 0.1) * (p.kind === 'wisp' ? 0.45 : 0.85);

    // Inter-lobe crevice pass: darken cluster center before lit lobes.
    if (p.kind === 'core' && p.lobes.length > 2) {
      const crevice = ctx.createRadialGradient(px, py + ry * 0.1, 0, px, py, Math.max(rx, ry) * 0.7);
      crevice.addColorStop(0, withAlpha(colorDark, alpha * 0.55));
      crevice.addColorStop(0.5, withAlpha(colorCore, alpha * 0.2));
      crevice.addColorStop(1, withAlpha(colorCore, 0));
      ctx.fillStyle = crevice;
      ctx.beginPath();
      ctx.ellipse(px, py + ry * 0.05, rx * 0.55, ry * 0.45, p.spin * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stack overlapping cauliflower lobes of uneven scale / opacity.
    for (let i = 0; i < p.lobes.length; i++) {
      const L = p.lobes[i];
      const wobX = Math.sin(L.phase + t * 0.7) * 0.06;
      const wobY = Math.cos(L.phase * 0.9 + t * 0.55) * 0.05;
      const lx = px + (L.ox + wobX) * rx;
      const ly = py + (L.oy + wobY) * ry;
      const lrx = rx * L.sx * (0.85 + 0.15 * Math.sin(L.phase));
      const lry = ry * L.sy * (0.85 + 0.15 * Math.cos(L.phase * 1.1));
      const lobeAlpha = alpha * (0.55 + L.litBias * 0.5) * (0.75 + (i % 3) * 0.08);
      const rot = p.spin * 0.35 + L.phase * 0.15 + i * 0.12;

      drawLobe(
        ctx,
        lx,
        ly,
        lrx,
        lry,
        rot,
        lobeAlpha,
        i % 2 === 0 ? colorCore : colorMid,
        colorDark,
        colorLit,
        L.litBias,
        windSign,
        ei,
      );
    }

    // Fine edge wisps peeling off the leeward / lower fringe (ragged, not sealed).
    if (p.kind === 'core' && k > 0.2) {
      const wispN = 2 + (Math.floor(p.seed) % 3);
      for (let w = 0; w < wispN; w++) {
        const wn = fbm2(p.seed * 0.03 + w, t * 0.6 + w, 2, params.seed + w * 17);
        const wx = px - windSign * rx * (0.55 + w * 0.18 + wn * 0.2);
        const wy = py + ry * (0.15 + w * 0.22 + wn * 0.15);
        const wrx = rx * (0.12 + w * 0.04) * (0.7 + k);
        const wry = ry * (0.08 + w * 0.03);
        const wa = alpha * 0.22 * (1 - k * 0.5);
        if (wa < 0.008) continue;
        const wg = ctx.createRadialGradient(wx, wy, 0, wx, wy, Math.max(wrx, wry) * 1.2);
        wg.addColorStop(0, withAlpha(colorMid, wa));
        wg.addColorStop(0.5, withAlpha(colorCore, wa * 0.35));
        wg.addColorStop(1, withAlpha(colorCore, 0));
        ctx.fillStyle = wg;
        ctx.beginPath();
        ctx.ellipse(wx, wy, wrx, wry, p.spin * 0.2 + w * 0.3, 0, Math.PI * 2);
        ctx.fill();
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
  description: 'Industrial plume: cauliflower billows, self-shadowed lobes, wind-stretched wisps.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'smoke-default',
    x: 1100,
    y: 780,
    seed: 2,
    size: 1.2,
    spread: 1.1,
    rise: 0.75,
    density: 0.9,
    turbulence: 0.85,
    material: createDefaultMaterial({
      name: 'Ash Smoke',
      baseColor: '#2a3038',
      emissive: '#d9c9a8',
      emissiveIntensity: 0.55,
      opacity: 0.92,
      roughness: 0.9,
      metalness: 0.05,
      blend: 'normal',
    }),
  },
  draw: drawSmoke,
};
