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
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  phase: number;
  litBias: number;
  /** Sub-bump offsets for irregular (non-sphere) silhouette. */
  bumpAx: number;
  bumpAy: number;
  bumpBx: number;
  bumpBy: number;
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
  kind: 'core' | 'wisp';
}

const pools = new Map<string, Puff[]>();

function makeLobes(rand: () => number, count: number): Lobe[] {
  const lobes: Lobe[] = [];
  for (let i = 0; i < count; i++) {
    const tier = i / count;
    const primary = tier < 0.3;
    const ang = rand() * Math.PI * 2;
    const rad = primary ? 0.15 + rand() * 0.4 : 0.4 + rand() * 1.05;
    const scale = primary ? 0.85 + rand() * 0.7 : 0.18 + rand() * 0.55 * (1.2 - tier);
    lobes.push({
      ox: Math.cos(ang) * rad * (0.45 + rand() * 0.75),
      oy: Math.sin(ang) * rad * 0.38 + (rand() - 0.6) * 0.6,
      sx: scale * (0.85 + rand() * 0.4),
      sy: scale * (0.55 + rand() * 0.55),
      phase: rand() * Math.PI * 2,
      litBias: 0.2 + rand() * 0.8,
      bumpAx: (rand() - 0.5) * 0.55,
      bumpAy: (rand() - 0.5) * 0.45,
      bumpBx: (rand() - 0.5) * 0.5,
      bumpBy: (rand() - 0.65) * 0.5,
    });
  }
  return lobes;
}

function spawnPuff(rand: () => number, params: SmokeParams): Puff {
  const kind: 'core' | 'wisp' = rand() < 0.32 ? 'wisp' : 'core';
  const lobeCount =
    kind === 'wisp' ? 1 + Math.floor(rand() * 2) : 6 + Math.floor(rand() * 7);
  const mouth = kind === 'wisp' ? 7 : 4.5;
  return {
    x: (rand() - 0.5) * mouth * params.spread,
    y: (rand() - 0.5) * mouth * 0.4,
    life: rand() * 0.06,
    maxLife: kind === 'wisp' ? 1.1 + rand() * 2.4 : 2.2 + rand() * 4.5,
    vx: (rand() - 0.3) * 3.5 * params.spread,
    vy: -(5 + rand() * 11) * params.rise,
    size: kind === 'wisp' ? 2.5 + rand() * 7 : 7 + rand() * 15,
    spin: (rand() - 0.5) * 0.65,
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
  const target = Math.floor(80 + params.density * 150 * params.intensity);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < target) pool.push(spawnPuff(rand, params));
  if (pool.length > target) pool.length = target;
  return pool;
}

/** Fill an irregular cauliflower lobe as overlapping ellipses (not a perfect ball). */
function fillIrregularLobe(
  ctx: CanvasRenderingContext2D,
  lx: number,
  ly: number,
  lrx: number,
  lry: number,
  rot: number,
  L: Lobe,
  fill: string | CanvasGradient,
): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(lx, ly, lrx, lry, rot, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(
    lx + L.bumpAx * lrx,
    ly + L.bumpAy * lry,
    lrx * (0.45 + L.litBias * 0.25),
    lry * (0.4 + (1 - L.litBias) * 0.25),
    rot + 0.4,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(
    lx + L.bumpBx * lrx,
    ly + L.bumpBy * lry,
    lrx * 0.38,
    lry * 0.42,
    rot - 0.35,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

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
  L: Lobe,
  windSign: number,
  emissiveIntensity: number,
): void {
  if (lrx < 0.55 || lry < 0.55 || alpha < 0.01) return;
  const R = Math.max(lrx, lry);

  const body = ctx.createRadialGradient(lx, ly + lry * 0.2, R * 0.02, lx, ly, R * 1.05);
  body.addColorStop(0, withAlpha(colorDark, Math.min(1, alpha * 1.4)));
  body.addColorStop(0.4, withAlpha(colorCore, Math.min(1, alpha * 1.15)));
  body.addColorStop(0.75, withAlpha(colorCore, alpha * 0.5));
  body.addColorStop(0.92, withAlpha(colorCore, alpha * 0.1));
  body.addColorStop(1, withAlpha(colorCore, 0));
  fillIrregularLobe(ctx, lx, ly, lrx, lry, rot, L, body);

  const shade = ctx.createRadialGradient(
    lx + windSign * lrx * 0.05,
    ly + lry * 0.4,
    0,
    lx,
    ly + lry * 0.05,
    R * 0.95,
  );
  shade.addColorStop(0, withAlpha(colorDark, Math.min(1, alpha * 1.05)));
  shade.addColorStop(0.5, withAlpha(colorDark, alpha * 0.35));
  shade.addColorStop(1, withAlpha(colorDark, 0));
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.ellipse(lx, ly + lry * 0.25, lrx * 0.9, lry * 0.6, rot * 0.3, 0, Math.PI * 2);
  ctx.fill();

  const litA = alpha * (0.25 + L.litBias * 0.55) * emissiveIntensity;
  if (litA > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rimX = lx - windSign * lrx * 0.18;
    const rimY = ly - lry * (0.45 + L.bumpAy * 0.15);
    const rim = ctx.createRadialGradient(rimX, rimY, 0, lx, ly - lry * 0.15, R * 0.8);
    rim.addColorStop(0, withAlpha(colorLit, litA));
    rim.addColorStop(0.3, withAlpha(colorLit, litA * 0.4));
    rim.addColorStop(0.65, withAlpha(colorLit, litA * 0.08));
    rim.addColorStop(1, withAlpha(colorLit, 0));
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.ellipse(
      lx - windSign * lrx * 0.04,
      ly - lry * 0.32,
      lrx * (0.65 + L.litBias * 0.15),
      lry * 0.38,
      rot * 0.2,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    if (L.litBias > 0.45) {
      ctx.fillStyle = withAlpha(colorLit, litA * 0.35);
      ctx.beginPath();
      ctx.ellipse(
        lx + L.bumpAx * lrx * 0.6,
        ly - lry * 0.35 + L.bumpAy * lry * 0.3,
        lrx * 0.28,
        lry * 0.2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
  }
}

export const drawSmoke: DrawFn<SmokeParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const colorCore = mat.baseColor;
  const colorLit = lerpColor(mat.emissive, '#f6f0e4', 0.42);
  const colorDark = lerpColor(mat.baseColor, '#030508', 0.65);
  const colorMid = lerpColor(mat.baseColor, mat.emissive, 0.1);
  const soft = 0.5 + mat.roughness * 0.5;
  const pool = ensurePool(params);
  const dt = scene.dt || 1 / 60;
  const rand = mulberry32((params.seed ^ 0x9e3779b9) | 0);
  const wind = scene.wind.x;
  const windSign = wind >= 0 ? 1 : -1;
  const ei = mat.emissiveIntensity;

  ctx.save();
  applyMaterial(ctx, mat);

  const sorted = [...pool].sort((a, b) => {
    const ka = a.life / a.maxLife;
    const kb = b.life / b.maxLife;
    return kb - ka || b.size - a.size || a.y - b.y;
  });

  for (const p of sorted) {
    if (!scene.paused) {
      p.life += dt;
      const n1 = fbm2(p.x * 0.016 + p.seed * 0.01, t * 0.4 + p.y * 0.01, 4, params.seed);
      const n2 = fbm2(p.y * 0.016, t * 0.28 + p.seed * 0.01, 3, params.seed + 19);
      const n3 = fbm2(p.seed * 0.02, t * 0.5, 2, params.seed + 41);

      const windPull = wind * (52 + (p.kind === 'wisp' ? 30 : 18));
      p.vx += (n1 * 40 * params.turbulence + windPull) * dt;
      p.vy += (-4 * params.rise + n2 * 15 * params.turbulence + wind * n3 * 6) * dt;
      p.vx *= 1 - 0.09 * dt;
      p.vy *= 1 - 0.045 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const grow =
        p.kind === 'wisp'
          ? (4.5 + params.size * 3) * soft * (0.4 + p.life * 0.28)
          : (9 + params.size * 8.5) * soft * (0.5 + p.life * 0.24);
      p.size += grow * dt;
      p.spin += (n1 * 0.5 + wind * 0.12) * dt;

      for (const L of p.lobes) {
        L.phase += (0.3 + L.litBias * 0.5) * dt;
        L.ox += n1 * 0.12 * params.turbulence * dt;
        L.oy += n2 * 0.08 * params.turbulence * dt;
      }

      if (p.life >= p.maxLife) Object.assign(p, spawnPuff(rand, params));
    }

    const k = p.life / p.maxLife;
    const densNear = p.kind === 'wisp' ? 0.48 - k * 0.3 : 1.6 - k * 1.05;
    const birth = k < 0.045 ? k / 0.045 : 1;
    const death = k > 0.4 ? Math.max(0, (1 - k) / 0.6) : 1;
    const envelope = birth * death;
    const alpha =
      envelope *
      (p.kind === 'wisp' ? 0.2 : 0.4) *
      params.intensity *
      densNear *
      (0.75 + params.density * 0.55) *
      mat.opacity;
    if (alpha <= 0.01) continue;

    const px = params.x + p.x;
    const py = params.y + p.y;
    const baseR = p.size * params.size;
    const windStretch = 1 + Math.min(1.8, Math.abs(wind) * 0.45) * (0.35 + k * 1.2);
    const rx =
      baseR *
      (0.86 + Math.sin(p.spin) * 0.06) *
      (p.kind === 'wisp' ? windStretch * 1.65 : 0.7 + windStretch * 0.4);
    const ry =
      baseR *
      (0.55 + Math.cos(p.spin * 0.7) * 0.08) *
      (p.kind === 'wisp' ? 0.32 : 0.74);

    if (p.kind === 'core' && p.lobes.length > 2) {
      const crevice = ctx.createRadialGradient(px, py + ry * 0.1, 0, px, py, Math.max(rx, ry) * 0.6);
      crevice.addColorStop(0, withAlpha(colorDark, Math.min(1, alpha * 0.85)));
      crevice.addColorStop(0.5, withAlpha(colorCore, alpha * 0.28));
      crevice.addColorStop(1, withAlpha(colorCore, 0));
      ctx.fillStyle = crevice;
      ctx.beginPath();
      ctx.ellipse(px, py + ry * 0.06, rx * 0.48, ry * 0.4, p.spin * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < p.lobes.length; i++) {
      const L = p.lobes[i];
      const wobX = Math.sin(L.phase + t * 0.6) * 0.045;
      const wobY = Math.cos(L.phase * 0.85 + t * 0.48) * 0.035;
      const lx = px + (L.ox + wobX) * rx;
      const ly = py + (L.oy + wobY) * ry;
      const ageMul = 0.8 + k * 0.4 + (i % 5) * 0.05;
      const lrx = rx * L.sx * ageMul * (0.88 + 0.14 * Math.sin(L.phase));
      const lry = ry * L.sy * ageMul * (0.88 + 0.14 * Math.cos(L.phase * 1.15));
      const lobeAlpha = alpha * (0.55 + L.litBias * 0.5) * (0.75 + (i % 5) * 0.06);
      const rot = p.spin * 0.28 + L.phase * 0.1 + i * 0.08;

      drawLobe(
        ctx,
        lx,
        ly,
        lrx,
        lry,
        rot,
        lobeAlpha,
        i % 4 === 0 ? colorMid : colorCore,
        colorDark,
        colorLit,
        L,
        windSign,
        ei,
      );
    }

    if (k > 0.12) {
      const filaments = p.kind === 'wisp' ? 2 : 4 + (Math.floor(p.seed) % 5);
      for (let w = 0; w < filaments; w++) {
        const wn = fbm2(p.seed * 0.04 + w * 2.1, t * 0.75 + w * 0.3, 3, params.seed + w * 23);
        const along = 0.3 + w * 0.18 + Math.abs(wn) * 0.35;
        const wx = px + windSign * rx * along + wn * rx * 0.25;
        const wy = py + ry * (-0.25 + (w % 5) * 0.2 + wn * 0.35);
        const wrx = rx * (0.08 + (w % 3) * 0.04) * (0.7 + k) * (p.kind === 'wisp' ? 1.4 : 1);
        const wry = ry * (0.035 + (w % 4) * 0.02) * (0.55 + Math.abs(wn));
        const wa = alpha * (p.kind === 'wisp' ? 0.55 : 0.26) * (1 - k * 0.5) * (0.4 + (w % 3) * 0.25);
        if (wa < 0.01 || wrx < 0.6) continue;

        const wg = ctx.createRadialGradient(wx, wy, 0, wx, wy, Math.max(wrx, wry) * 1.3);
        wg.addColorStop(0, withAlpha(colorMid, wa));
        wg.addColorStop(0.4, withAlpha(colorCore, wa * 0.45));
        wg.addColorStop(1, withAlpha(colorCore, 0));
        ctx.fillStyle = wg;
        ctx.beginPath();
        ctx.ellipse(wx, wy, wrx * (1.2 + Math.abs(wind) * 0.3), wry, wn * 0.8 + p.spin * 0.1, 0, Math.PI * 2);
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
