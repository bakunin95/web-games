/**
 * Material-driven creature FX: bees, mosquitoes, small animals.
 * Colors / softness / sheen come from EffectMaterial (baseColor, emissive,
 * roughness, metalness, opacity, blend).
 */
import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { mulberry32, withAlpha } from './noise';

type P = PlacedEffectParams;

function disposeMap<T>(map: Map<string, T>, id: string): void {
  map.delete(id);
}

/** Softness from roughness: high roughness → softer / blurrier bodies. */
function softR(roughness: number): number {
  return 0.55 + roughness * 0.9;
}

/** Specular blink from metalness. */
function sheenA(metalness: number, ei: number): number {
  return metalness * 0.55 * ei;
}

// ——— Bees ———
export interface BeesParams extends P {
  count: number;
  size: number;
  buzz: number;
}

interface Bee {
  x: number;
  y: number;
  phase: number;
  speed: number;
  facing: number;
}

const beePools = new Map<string, Bee[]>();

export const drawBees: DrawFn<BeesParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const soft = softR(mat.roughness);
  const n = Math.floor(14 + params.count * 48);
  let pool = beePools.get(params.instanceId) ?? [];
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 110,
      y: (rand() - 0.5) * 80,
      phase: rand() * Math.PI * 2,
      speed: 1.4 + rand() * 2.2,
      facing: rand() * Math.PI * 2,
    });
  }
  pool.length = n;
  beePools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  const aMul = params.intensity * mat.opacity;

  ctx.save();
  applyMaterial(ctx, mat);
  for (const b of pool) {
    if (!scene.paused) {
      const vx = Math.sin(t * b.speed * params.buzz + b.phase) * 55;
      const vy = Math.cos(t * b.speed * 1.35 * params.buzz + b.phase) * 40;
      b.x += vx * dt;
      b.y += vy * dt;
      b.x *= 1 - 0.45 * dt;
      b.y *= 1 - 0.45 * dt;
      b.facing = Math.atan2(vy, vx);
    }
    const px = params.x + b.x;
    const py = params.y + b.y;
    const flap = 0.55 + 0.45 * Math.abs(Math.sin(t * 28 * b.speed + b.phase));
    const s = params.size;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(b.facing);

    // Wings (emissive, translucent)
    ctx.fillStyle = withAlpha(mat.emissive, 0.35 * aMul * mat.emissiveIntensity);
    ctx.beginPath();
    ctx.ellipse(-1.5 * s, -2.2 * s, 3.2 * s * flap, 1.6 * s * soft, -0.5, 0, Math.PI * 2);
    ctx.ellipse(-1.5 * s, 2.2 * s, 3.2 * s * flap, 1.6 * s * soft, 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Body (baseColor) with stripe hint via emissive
    ctx.fillStyle = withAlpha(mat.baseColor, 0.92 * aMul);
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.2 * s, 2.6 * s * soft, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha(mat.emissive, 0.55 * aMul);
    ctx.fillRect(-1.2 * s, -2.2 * s * soft, 1.1 * s, 4.4 * s * soft);
    ctx.fillRect(1.2 * s, -2.2 * s * soft, 1.1 * s, 4.4 * s * soft);

    // Head
    ctx.fillStyle = withAlpha(mat.baseColor, 0.95 * aMul);
    ctx.beginPath();
    ctx.arc(3.6 * s, 0, 1.7 * s, 0, Math.PI * 2);
    ctx.fill();

    // Metalness sheen
    const sh = sheenA(mat.metalness, mat.emissiveIntensity);
    if (sh > 0.02) {
      ctx.fillStyle = withAlpha('#ffffff', sh * aMul);
      ctx.beginPath();
      ctx.ellipse(-0.5 * s, -0.8 * s, 1.4 * s, 0.7 * s, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
};

export function disposeBeesInstance(id: string): void {
  disposeMap(beePools, id);
}

export const beesEffect: EffectModule<BeesParams> = {
  id: 'bees',
  name: 'Bees',
  description: 'Material-driven buzzing bees (body, wing, stripe colors).',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'bees-default',
    x: 980,
    y: 700,
    seed: 301,
    count: 0.85,
    size: 1,
    buzz: 1,
    material: createDefaultMaterial({
      name: 'Bee Gold',
      baseColor: '#e8a020',
      emissive: '#ffe08a',
      emissiveIntensity: 0.65,
      opacity: 1,
      roughness: 0.45,
      metalness: 0.25,
      blend: 'normal',
    }),
  },
  draw: drawBees,
};

// ——— Mosquitoes ———
export interface MosquitoesParams extends P {
  count: number;
  size: number;
  wander: number;
}

interface Mosquito {
  x: number;
  y: number;
  phase: number;
  speed: number;
  facing: number;
}

const mozPools = new Map<string, Mosquito[]>();

export const drawMosquitoes: DrawFn<MosquitoesParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const soft = softR(mat.roughness);
  const n = Math.floor(18 + params.count * 55);
  let pool = mozPools.get(params.instanceId) ?? [];
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 160,
      y: (rand() - 0.5) * 120,
      phase: rand() * Math.PI * 2,
      speed: 2 + rand() * 2.8,
      facing: rand() * Math.PI * 2,
    });
  }
  pool.length = n;
  mozPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  const aMul = params.intensity * mat.opacity;

  ctx.save();
  applyMaterial(ctx, mat);
  for (const m of pool) {
    if (!scene.paused) {
      // Erratic darting
      const vx =
        Math.sin(t * m.speed * 1.7 + m.phase) * 70 * params.wander +
        Math.sin(t * m.speed * 5.5 + m.phase * 2) * 25;
      const vy =
        Math.cos(t * m.speed * 1.4 + m.phase) * 55 * params.wander +
        Math.cos(t * m.speed * 4.2 + m.phase) * 18;
      m.x += vx * dt;
      m.y += vy * dt;
      m.x *= 1 - 0.35 * dt;
      m.y *= 1 - 0.35 * dt;
      m.facing = Math.atan2(vy, vx);
    }
    const px = params.x + m.x;
    const py = params.y + m.y;
    const flap = 0.4 + 0.6 * Math.abs(Math.sin(t * 40 * m.speed + m.phase));
    const s = params.size * 0.85;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(m.facing);

    // Thin wings
    ctx.strokeStyle = withAlpha(mat.emissive, 0.4 * aMul * mat.emissiveIntensity);
    ctx.lineWidth = 0.7 * soft;
    ctx.beginPath();
    ctx.ellipse(-0.5 * s, -1.8 * s * flap, 3.5 * s, 1.1 * s, -0.6, 0, Math.PI * 2);
    ctx.ellipse(-0.5 * s, 1.8 * s * flap, 3.5 * s, 1.1 * s, 0.6, 0, Math.PI * 2);
    ctx.stroke();

    // Slender body
    ctx.strokeStyle = withAlpha(mat.baseColor, 0.9 * aMul);
    ctx.lineWidth = 1.1 * s;
    ctx.beginPath();
    ctx.moveTo(-3.5 * s, 0);
    ctx.lineTo(3.2 * s, 0);
    ctx.stroke();

    // Abdomen blob
    ctx.fillStyle = withAlpha(mat.baseColor, 0.85 * aMul);
    ctx.beginPath();
    ctx.ellipse(-2.2 * s, 0, 2.2 * s, 1.1 * s * soft, 0, 0, Math.PI * 2);
    ctx.fill();

    // Leg ticks
    ctx.strokeStyle = withAlpha(mat.baseColor, 0.55 * aMul);
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 3; i++) {
      const lx = -1 + i * 1.2;
      ctx.beginPath();
      ctx.moveTo(lx * s, 0);
      ctx.lineTo(lx * s - 1.5 * s, 2.5 * s);
      ctx.stroke();
    }

    const sh = sheenA(mat.metalness, mat.emissiveIntensity);
    if (sh > 0.02) {
      ctx.fillStyle = withAlpha('#ffffff', sh * 0.7 * aMul);
      ctx.beginPath();
      ctx.arc(2.5 * s, -0.4 * s, 0.7 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
};

export function disposeMosquitoesInstance(id: string): void {
  disposeMap(mozPools, id);
}

export const mosquitoesEffect: EffectModule<MosquitoesParams> = {
  id: 'mosquitoes',
  name: 'Mosquitoes',
  description: 'Material-driven darting mosquitoes.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'mosquitoes-default',
    x: 1000,
    y: 720,
    seed: 302,
    count: 0.9,
    size: 1,
    wander: 1,
    material: createDefaultMaterial({
      name: 'Mosquito',
      baseColor: '#3a322c',
      emissive: '#8a7a68',
      emissiveIntensity: 0.35,
      opacity: 0.95,
      roughness: 0.7,
      metalness: 0.15,
      blend: 'normal',
    }),
  },
  draw: drawMosquitoes,
};

// ——— Small Animals (mice, birds, frogs, rabbits — material tints the species look) ———
export type CritterKind = 'mouse' | 'bird' | 'frog' | 'rabbit';

export interface SmallAnimalsParams extends P {
  count: number;
  size: number;
  speed: number;
  /** 0 mouse-heavy → 1 bird-heavy mix bias */
  mix: number;
}

interface Critter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  kind: CritterKind;
  facing: number;
}

const critterPools = new Map<string, Critter[]>();

function pickKind(rand: () => number, mix: number): CritterKind {
  const r = rand();
  const birdBias = mix * 0.45;
  if (r < 0.28 - birdBias * 0.1) return 'mouse';
  if (r < 0.5 + birdBias) return 'bird';
  if (r < 0.72) return 'frog';
  return 'rabbit';
}

export const drawSmallAnimals: DrawFn<SmallAnimalsParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const soft = softR(mat.roughness);
  const n = Math.floor(6 + params.count * 18);
  let pool = critterPools.get(params.instanceId) ?? [];
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    const kind = pickKind(rand, params.mix);
    pool.push({
      x: (rand() - 0.5) * 220,
      y: (rand() - 0.5) * 90,
      vx: (rand() - 0.5) * 40 * params.speed,
      vy: (rand() - 0.5) * 20 * params.speed,
      phase: rand() * Math.PI * 2,
      kind,
      facing: rand() > 0.5 ? 1 : -1,
    });
  }
  pool.length = n;
  critterPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  const aMul = params.intensity * mat.opacity;
  const wind = scene.wind.x;

  ctx.save();
  applyMaterial(ctx, mat);
  for (const c of pool) {
    if (!scene.paused) {
      if (c.kind === 'bird') {
        c.vx += Math.sin(t * 1.2 + c.phase) * 30 * params.speed * dt + wind * 8 * dt;
        c.vy += Math.cos(t * 1.5 + c.phase) * 22 * params.speed * dt;
      } else if (c.kind === 'frog') {
        // Hop
        const hop = Math.sin(t * 2.2 * params.speed + c.phase);
        if (hop > 0.92 && Math.sin(t * 2.2 * params.speed + c.phase - dt * 2.2) <= 0.92) {
          c.vx = c.facing * (50 + rand() * 40) * params.speed;
          c.vy = -70 * params.speed;
        }
        c.vy += 160 * dt;
      } else if (c.kind === 'rabbit') {
        const hop = Math.sin(t * 1.6 * params.speed + c.phase);
        if (hop > 0.94) {
          c.vx = c.facing * (60 + rand() * 50) * params.speed;
          c.vy = -55 * params.speed;
        }
        c.vy += 140 * dt;
      } else {
        // Mouse scurry
        c.vx += (Math.sin(t * 3 + c.phase) * 50 * params.speed - c.vx) * 2 * dt;
        c.vy += (Math.sin(t * 5 + c.phase * 2) * 12 - c.vy) * 2 * dt;
      }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.kind !== 'bird') {
        // Ground bias
        if (c.y > 40) {
          c.y = 40;
          c.vy *= -0.15;
        }
      }
      // Soft bounds
      if (Math.abs(c.x) > 140) {
        c.facing *= -1;
        c.vx *= -0.6;
        c.x = Math.sign(c.x) * 140;
      }
      if (c.vx !== 0) c.facing = c.vx >= 0 ? 1 : -1;
    }

    const px = params.x + c.x;
    const py = params.y + c.y;
    const s = params.size;
    drawCritter(ctx, c.kind, px, py, s, c.facing, t, c.phase, mat.baseColor, mat.emissive, aMul, soft, mat);
  }
  ctx.restore();
};

function drawCritter(
  ctx: CanvasRenderingContext2D,
  kind: CritterKind,
  px: number,
  py: number,
  s: number,
  facing: number,
  t: number,
  phase: number,
  body: string,
  accent: string,
  aMul: number,
  soft: number,
  mat: { metalness: number; emissiveIntensity: number },
): void {
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(facing, 1);

  if (kind === 'bird') {
    const flap = Math.sin(t * 10 + phase);
    ctx.fillStyle = withAlpha(body, 0.9 * aMul);
    ctx.beginPath();
    ctx.ellipse(0, 0, 5 * s, 2.8 * s * soft, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha(accent, 0.75 * aMul);
    ctx.beginPath();
    ctx.ellipse(-1 * s, -1 * s + flap * 3 * s, 4 * s, 1.5 * s, -0.4 + flap * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(4 * s, -0.5 * s, 1.8 * s, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'frog') {
    ctx.fillStyle = withAlpha(body, 0.92 * aMul);
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.5 * s, 3.2 * s * soft, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha(accent, 0.85 * aMul);
    ctx.beginPath();
    ctx.arc(3 * s, -2 * s, 1.6 * s, 0, Math.PI * 2);
    ctx.arc(1.2 * s, -2.2 * s, 1.6 * s, 0, Math.PI * 2);
    ctx.fill();
    // Legs
    ctx.strokeStyle = withAlpha(body, 0.7 * aMul);
    ctx.lineWidth = 1.4 * s;
    ctx.beginPath();
    ctx.moveTo(-2 * s, 1 * s);
    ctx.quadraticCurveTo(-6 * s, 4 * s, -3 * s, 5 * s);
    ctx.moveTo(2 * s, 1 * s);
    ctx.quadraticCurveTo(6 * s, 4 * s, 3 * s, 5 * s);
    ctx.stroke();
  } else if (kind === 'rabbit') {
    ctx.fillStyle = withAlpha(body, 0.92 * aMul);
    ctx.beginPath();
    ctx.ellipse(0, 1 * s, 5 * s, 3.5 * s * soft, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ears
    ctx.fillStyle = withAlpha(accent, 0.8 * aMul);
    ctx.beginPath();
    ctx.ellipse(-1.5 * s, -4 * s, 1.2 * s, 3.5 * s, -0.15, 0, Math.PI * 2);
    ctx.ellipse(0.5 * s, -4.2 * s, 1.2 * s, 3.8 * s, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha(body, 0.95 * aMul);
    ctx.beginPath();
    ctx.arc(3.5 * s, -0.5 * s, 2.2 * s, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Mouse
    ctx.fillStyle = withAlpha(body, 0.92 * aMul);
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.5 * s, 2.4 * s * soft, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(3.5 * s, -0.5 * s, 1.8 * s, 0, Math.PI * 2);
    ctx.fill();
    // Ear
    ctx.fillStyle = withAlpha(accent, 0.7 * aMul);
    ctx.beginPath();
    ctx.arc(2.8 * s, -2 * s, 1.3 * s, 0, Math.PI * 2);
    ctx.fill();
    // Tail
    ctx.strokeStyle = withAlpha(body, 0.65 * aMul);
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(-4 * s, 0);
    ctx.quadraticCurveTo(-8 * s, 2 * s + Math.sin(t * 6 + phase) * s, -10 * s, 0);
    ctx.stroke();
  }

  const sh = sheenA(mat.metalness, mat.emissiveIntensity);
  if (sh > 0.02) {
    ctx.fillStyle = withAlpha('#ffffff', sh * aMul);
    ctx.beginPath();
    ctx.ellipse(0.5 * s, -0.8 * s, 1.5 * s, 0.7 * s, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function disposeSmallAnimalsInstance(id: string): void {
  disposeMap(critterPools, id);
}

export const smallAnimalsEffect: EffectModule<SmallAnimalsParams> = {
  id: 'small-animals',
  name: 'Small Animals',
  description: 'Mice, birds, frogs, rabbits — tinted by material.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'small-animals-default',
    x: 1000,
    y: 820,
    seed: 303,
    count: 0.75,
    size: 1.1,
    speed: 1,
    mix: 0.45,
    material: createDefaultMaterial({
      name: 'Fur Brown',
      baseColor: '#6b4a2e',
      emissive: '#c4a06a',
      emissiveIntensity: 0.35,
      opacity: 1,
      roughness: 0.8,
      metalness: 0.05,
      blend: 'normal',
    }),
  },
  draw: drawSmallAnimals,
};

export const CREATURE_EFFECTS: EffectModule[] = [
  mosquitoesEffect as unknown as EffectModule,
  smallAnimalsEffect as unknown as EffectModule,
];

export const CREATURE_DISPOSE: Record<string, (id: string) => void> = {
  mosquitoes: disposeMosquitoesInstance,
  'small-animals': disposeSmallAnimalsInstance,
};
