/**
 * Second creatable VFX pack — 20 atmospheric / fantasy / world FX.
 * Same contract as other modules: PlacedEffectParams + materials + dispose.
 */
import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { fbm2, mulberry32, withAlpha } from './noise';

type P = PlacedEffectParams;

function disposeMap<T>(map: Map<string, T>, id: string): void {
  map.delete(id);
}

function softDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  a: number,
): void {
  if (a <= 0.01 || r <= 0.2) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, withAlpha(color, a));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ——— 1. Aurora ———
export interface AuroraParams extends P {
  size: number;
  spread: number;
  speed: number;
}

export const drawAurora: DrawFn<AuroraParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  ctx.save();
  applyMaterial(ctx, mat);
  const bands = 5;
  for (let b = 0; b < bands; b++) {
    const phase = t * (0.25 + params.speed * 0.35) + b * 0.9 + params.seed * 0.001;
    ctx.beginPath();
    const y0 = params.y - 40 * params.size + b * 18;
    ctx.moveTo(params.x - 160 * params.spread, y0);
    for (let s = 0; s <= 24; s++) {
      const u = s / 24;
      const x = params.x - 160 * params.spread + u * 320 * params.spread;
      const n = fbm2(u * 3 + b, phase, 3, params.seed + b);
      const y = y0 + Math.sin(u * Math.PI * 2 + phase) * 28 * params.size + n * 22;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = withAlpha(
      b % 2 ? mat.emissive : mat.baseColor,
      0.18 * params.intensity * mat.emissiveIntensity,
    );
    ctx.lineWidth = 10 + b * 3;
    ctx.stroke();
  }
  ctx.restore();
};

export const auroraEffect: EffectModule<AuroraParams> = {
  id: 'aurora',
  name: 'Aurora',
  description: 'Curtain of northern-lights ribbons.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'aurora-default',
    x: 1000,
    y: 360,
    seed: 101,
    size: 1.2,
    spread: 1.4,
    speed: 0.8,
    material: createDefaultMaterial({
      name: 'Aurora',
      baseColor: '#2cff9a',
      emissive: '#7ab8ff',
      emissiveIntensity: 1.2,
      blend: 'additive',
    }),
  },
  draw: drawAurora,
};
export function disposeAuroraInstance(_id: string): void {}

// ——— 2. Confetti ———
export interface ConfettiParams extends P {
  size: number;
  count: number;
  spread: number;
}
interface ConfettiBit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
  max: number;
  hue: number;
}
const confettiPools = new Map<string, ConfettiBit[]>();

export const drawConfetti: DrawFn<ConfettiParams> = (ctx, params, _t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = confettiPools.get(params.instanceId) ?? [];
  const n = Math.floor(30 + params.count * 80);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 40,
      y: (rand() - 0.5) * 20,
      vx: (rand() - 0.5) * 120 * params.spread,
      vy: -(40 + rand() * 140),
      rot: rand() * Math.PI,
      vr: (rand() - 0.5) * 8,
      life: rand(),
      max: 1.2 + rand() * 1.8,
      hue: rand(),
    });
  }
  pool.length = n;
  confettiPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const c of pool) {
    if (!scene.paused) {
      c.life += dt;
      c.vy += 90 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
      if (c.life >= c.max) {
        c.x = (rand() - 0.5) * 40;
        c.y = (rand() - 0.5) * 20;
        c.vx = (rand() - 0.5) * 120 * params.spread;
        c.vy = -(40 + rand() * 140);
        c.life = 0;
        c.max = 1.2 + rand() * 1.8;
        c.hue = rand();
      }
    }
    const a = (1 - c.life / c.max) * params.intensity * mat.opacity;
    const color = c.hue < 0.33 ? mat.baseColor : c.hue < 0.66 ? mat.emissive : '#ffe08a';
    ctx.save();
    ctx.translate(params.x + c.x, params.y + c.y);
    ctx.rotate(c.rot);
    ctx.fillStyle = withAlpha(color, a);
    ctx.fillRect(-3 * params.size, -1.5 * params.size, 6 * params.size, 3 * params.size);
    ctx.restore();
  }
  ctx.restore();
};

export const confettiEffect: EffectModule<ConfettiParams> = {
  id: 'confetti',
  name: 'Confetti',
  description: 'Bursting colorful paper bits.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'confetti-default',
    x: 1000,
    y: 620,
    seed: 102,
    size: 1,
    count: 0.8,
    spread: 1,
    material: createDefaultMaterial({
      name: 'Party',
      baseColor: '#ff4f8a',
      emissive: '#4fd8ff',
      emissiveIntensity: 0.6,
      blend: 'normal',
    }),
  },
  draw: drawConfetti,
};
export const disposeConfettiInstance = (id: string) => disposeMap(confettiPools, id);

// ——— 3. Ash Fall ———
export interface AshFallParams extends P {
  size: number;
  density: number;
  drift: number;
}
interface Ash {
  x: number;
  y: number;
  vy: number;
  phase: number;
}
const ashPools = new Map<string, Ash[]>();

export const drawAshFall: DrawFn<AshFallParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = ashPools.get(params.instanceId) ?? [];
  const n = Math.floor(40 + params.density * 100);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 280 * params.size,
      y: (rand() - 0.5) * 220 * params.size,
      vy: 12 + rand() * 28,
      phase: rand() * Math.PI * 2,
    });
  }
  pool.length = n;
  ashPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  const wind = scene.wind.x;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const a of pool) {
    if (!scene.paused) {
      a.y += a.vy * dt;
      a.x += (Math.sin(t + a.phase) * 18 * params.drift + wind * 40) * dt;
      if (a.y > 120 * params.size) {
        a.y = -120 * params.size;
        a.x = (rand() - 0.5) * 280 * params.size;
      }
    }
    softDot(
      ctx,
      params.x + a.x,
      params.y + a.y,
      (1.2 + (a.phase % 1) * 2) * params.size,
      mat.baseColor,
      0.45 * params.intensity,
    );
  }
  ctx.restore();
};

export const ashFallEffect: EffectModule<AshFallParams> = {
  id: 'ash-fall',
  name: 'Ash Fall',
  description: 'Slow drifting ash flakes.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 0.95,
    instanceId: 'ash-fall-default',
    x: 1000,
    y: 560,
    seed: 103,
    size: 1.2,
    density: 0.85,
    drift: 1,
    material: createDefaultMaterial({
      name: 'Ash',
      baseColor: '#9aa3b0',
      emissive: '#6a7280',
      emissiveIntensity: 0.2,
      blend: 'normal',
      opacity: 0.9,
    }),
  },
  draw: drawAshFall,
};
export const disposeAshFallInstance = (id: string) => disposeMap(ashPools, id);

// ——— 4. Steam ———
export interface SteamParams extends P {
  size: number;
  density: number;
  rise: number;
}
interface SteamPuff {
  x: number;
  y: number;
  life: number;
  max: number;
  s: number;
}
const steamPools = new Map<string, SteamPuff[]>();

export const drawSteam: DrawFn<SteamParams> = (ctx, params, _t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = steamPools.get(params.instanceId) ?? [];
  const n = Math.floor(18 + params.density * 40);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 30,
      y: rand() * 10,
      life: rand(),
      max: 1.4 + rand() * 1.6,
      s: 10 + rand() * 20,
    });
  }
  pool.length = n;
  steamPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const p of pool) {
    if (!scene.paused) {
      p.life += dt;
      p.y -= 28 * params.rise * dt;
      p.x += (rand() - 0.5) * 12 * dt;
      p.s += 14 * dt;
      if (p.life >= p.max) {
        p.x = (rand() - 0.5) * 30;
        p.y = rand() * 10;
        p.life = 0;
        p.max = 1.4 + rand() * 1.6;
        p.s = 10 + rand() * 20;
      }
    }
    const k = p.life / p.max;
    const a = (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * 0.28 * params.intensity;
    softDot(ctx, params.x + p.x, params.y + p.y, p.s * params.size, mat.baseColor, a);
  }
  ctx.restore();
};

export const steamEffect: EffectModule<SteamParams> = {
  id: 'steam',
  name: 'Steam',
  description: 'Soft rising vapor wisps.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'steam-default',
    x: 920,
    y: 800,
    seed: 104,
    size: 1,
    density: 0.8,
    rise: 1,
    material: createDefaultMaterial({
      name: 'Steam',
      baseColor: '#dfe8f2',
      emissive: '#ffffff',
      emissiveIntensity: 0.35,
      opacity: 0.85,
      blend: 'normal',
    }),
  },
  draw: drawSteam,
};
export const disposeSteamInstance = (id: string) => disposeMap(steamPools, id);

// ——— 5. Bubbles ———
export interface BubblesParams extends P {
  size: number;
  count: number;
  rise: number;
}
interface Bubble {
  x: number;
  y: number;
  r: number;
  vy: number;
  phase: number;
}
const bubblePools = new Map<string, Bubble[]>();

export const drawBubbles: DrawFn<BubblesParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = bubblePools.get(params.instanceId) ?? [];
  const n = Math.floor(12 + params.count * 40);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 100 * params.size,
      y: rand() * 80,
      r: 2 + rand() * 7,
      vy: -(20 + rand() * 40) * params.rise,
      phase: rand() * Math.PI * 2,
    });
  }
  pool.length = n;
  bubblePools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const b of pool) {
    if (!scene.paused) {
      b.y += b.vy * dt;
      b.x += Math.sin(t * 2 + b.phase) * 20 * dt;
      if (b.y < -100) {
        b.y = 60 + rand() * 40;
        b.x = (rand() - 0.5) * 100 * params.size;
      }
    }
    const px = params.x + b.x;
    const py = params.y + b.y;
    ctx.strokeStyle = withAlpha(mat.emissive, 0.55 * params.intensity);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(px, py, b.r * params.size, 0, Math.PI * 2);
    ctx.stroke();
    softDot(ctx, px - b.r * 0.3, py - b.r * 0.3, b.r * 0.45, '#ffffff', 0.5 * params.intensity);
  }
  ctx.restore();
};

export const bubblesEffect: EffectModule<BubblesParams> = {
  id: 'bubbles',
  name: 'Bubbles',
  description: 'Rising underwater bubbles.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'bubbles-default',
    x: 1000,
    y: 860,
    seed: 105,
    size: 1,
    count: 0.75,
    rise: 1,
    material: createDefaultMaterial({
      name: 'Bubble',
      baseColor: '#8ec8e8',
      emissive: '#e8f7ff',
      emissiveIntensity: 0.8,
      blend: 'additive',
    }),
  },
  draw: drawBubbles,
};
export const disposeBubblesInstance = (id: string) => disposeMap(bubblePools, id);

// ——— 6. Pollen ———
export interface PollenParams extends P {
  size: number;
  density: number;
  drift: number;
}
interface PollenBit {
  x: number;
  y: number;
  phase: number;
}
const pollenPools = new Map<string, PollenBit[]>();

export const drawPollen: DrawFn<PollenParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = pollenPools.get(params.instanceId) ?? [];
  const n = Math.floor(35 + params.density * 90);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 260,
      y: (rand() - 0.5) * 180,
      phase: rand() * Math.PI * 2,
    });
  }
  pool.length = n;
  pollenPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  const wind = scene.wind.x;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const p of pool) {
    if (!scene.paused) {
      p.x += (Math.sin(t * 0.7 + p.phase) * 12 * params.drift + wind * 25) * dt;
      p.y += Math.cos(t * 0.5 + p.phase) * 8 * params.drift * dt;
    }
    softDot(
      ctx,
      params.x + p.x,
      params.y + p.y,
      2.2 * params.size,
      mat.baseColor,
      0.55 * params.intensity,
    );
  }
  ctx.restore();
};

export const pollenEffect: EffectModule<PollenParams> = {
  id: 'pollen',
  name: 'Pollen',
  description: 'Floating pollen / seed motes.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'pollen-default',
    x: 980,
    y: 700,
    seed: 106,
    size: 1,
    density: 0.8,
    drift: 1,
    material: createDefaultMaterial({
      name: 'Pollen',
      baseColor: '#ffe08a',
      emissive: '#fff6c8',
      emissiveIntensity: 0.5,
      blend: 'additive',
    }),
  },
  draw: drawPollen,
};
export const disposePollenInstance = (id: string) => disposeMap(pollenPools, id);

// ——— 7. Cherry Petals ———
export interface PetalsParams extends P {
  size: number;
  density: number;
  drift: number;
}
interface Petal {
  x: number;
  y: number;
  rot: number;
  vr: number;
  vy: number;
  phase: number;
}
const petalPools = new Map<string, Petal[]>();

export const drawPetals: DrawFn<PetalsParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = petalPools.get(params.instanceId) ?? [];
  const n = Math.floor(20 + params.density * 50);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 300,
      y: (rand() - 0.5) * 240,
      rot: rand() * Math.PI,
      vr: (rand() - 0.5) * 2,
      vy: 18 + rand() * 30,
      phase: rand() * Math.PI * 2,
    });
  }
  pool.length = n;
  petalPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const p of pool) {
    if (!scene.paused) {
      p.y += p.vy * dt;
      p.x += Math.sin(t + p.phase) * 28 * params.drift * dt;
      p.rot += p.vr * dt;
      if (p.y > 140) {
        p.y = -140;
        p.x = (rand() - 0.5) * 300;
      }
    }
    ctx.save();
    ctx.translate(params.x + p.x, params.y + p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = withAlpha(mat.baseColor, 0.75 * params.intensity);
    ctx.beginPath();
    ctx.ellipse(0, 0, 5 * params.size, 3 * params.size, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha(mat.emissive, 0.5 * params.intensity);
    ctx.beginPath();
    ctx.ellipse(2 * params.size, 0, 3 * params.size, 2 * params.size, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
};

export const petalsEffect: EffectModule<PetalsParams> = {
  id: 'petals',
  name: 'Cherry Petals',
  description: 'Falling blossom petals.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'petals-default',
    x: 1000,
    y: 520,
    seed: 107,
    size: 1,
    density: 0.85,
    drift: 1,
    material: createDefaultMaterial({
      name: 'Blossom',
      baseColor: '#ffb0c8',
      emissive: '#ffe0ea',
      emissiveIntensity: 0.4,
      blend: 'normal',
    }),
  },
  draw: drawPetals,
};
export const disposePetalsInstance = (id: string) => disposeMap(petalPools, id);

// ——— 8. Fireworks ———
export interface FireworksParams extends P {
  size: number;
  count: number;
  speed: number;
}
interface SparkBit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
}
interface Rocket {
  x: number;
  y: number;
  vy: number;
  life: number;
  sparks: SparkBit[];
  phase: 'up' | 'burst';
}
const fwPools = new Map<string, Rocket[]>();

export const drawFireworks: DrawFn<FireworksParams> = (ctx, params, _t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = fwPools.get(params.instanceId) ?? [];
  const n = Math.max(1, Math.floor(params.count * 3));
  const rand = mulberry32((params.seed + ((scene.time * 10) | 0)) | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 80,
      y: 40,
      vy: -(160 + rand() * 80) * params.speed,
      life: 0,
      sparks: [],
      phase: 'up',
    });
  }
  pool.length = n;
  fwPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const r of pool) {
    if (!scene.paused) {
      r.life += dt;
      if (r.phase === 'up') {
        r.y += r.vy * dt;
        r.vy += 40 * dt;
        softDot(
          ctx,
          params.x + r.x,
          params.y + r.y,
          4 * params.size,
          mat.emissive,
          0.9 * params.intensity,
        );
        if (r.vy > -20 || r.life > 1.1) {
          r.phase = 'burst';
          r.sparks = [];
          for (let i = 0; i < 36; i++) {
            const ang = (i / 36) * Math.PI * 2 + rand();
            const spd = (60 + rand() * 120) * params.speed;
            r.sparks.push({
              x: r.x,
              y: r.y,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd,
              life: 0,
              max: 0.7 + rand() * 0.7,
            });
          }
        }
      } else {
        let alive = false;
        for (const s of r.sparks) {
          s.life += dt;
          s.vy += 50 * dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          const a = (1 - s.life / s.max) * params.intensity;
          if (a > 0.02) {
            alive = true;
            softDot(
              ctx,
              params.x + s.x,
              params.y + s.y,
              3 * params.size,
              s.life < s.max * 0.3 ? mat.emissive : mat.baseColor,
              a,
            );
          }
        }
        if (!alive) {
          r.phase = 'up';
          r.x = (rand() - 0.5) * 80;
          r.y = 40;
          r.vy = -(160 + rand() * 80) * params.speed;
          r.life = 0;
          r.sparks = [];
        }
      }
    } else if (r.phase === 'up') {
      softDot(
        ctx,
        params.x + r.x,
        params.y + r.y,
        4 * params.size,
        mat.emissive,
        0.9 * params.intensity,
      );
    } else {
      for (const s of r.sparks) {
        const a = (1 - s.life / s.max) * params.intensity;
        softDot(ctx, params.x + s.x, params.y + s.y, 3 * params.size, mat.baseColor, a);
      }
    }
  }
  ctx.restore();
};

export const fireworksEffect: EffectModule<FireworksParams> = {
  id: 'fireworks',
  name: 'Fireworks',
  description: 'Rockets that climb and burst.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'fireworks-default',
    x: 1000,
    y: 780,
    seed: 108,
    size: 1,
    count: 0.7,
    speed: 1,
    material: createDefaultMaterial({
      name: 'Firework',
      baseColor: '#ff5a3c',
      emissive: '#fff0a0',
      emissiveIntensity: 1.4,
      blend: 'additive',
    }),
  },
  draw: drawFireworks,
};
export const disposeFireworksInstance = (id: string) => disposeMap(fwPools, id);

// ——— 9. Lava Glow ———
export interface LavaGlowParams extends P {
  size: number;
  spread: number;
  pulse: number;
}

export const drawLavaGlow: DrawFn<LavaGlowParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const pulse = 0.75 + 0.25 * Math.sin(t * (1.5 + params.pulse));
  ctx.save();
  applyMaterial(ctx, mat);
  const rx = 90 * params.size * params.spread;
  const ry = 36 * params.size;
  const g = ctx.createRadialGradient(params.x, params.y, 4, params.x, params.y, rx);
  g.addColorStop(0, withAlpha(mat.emissive, 0.85 * pulse * params.intensity * mat.emissiveIntensity));
  g.addColorStop(0.4, withAlpha(mat.baseColor, 0.45 * pulse * params.intensity));
  g.addColorStop(1, withAlpha(mat.baseColor, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(params.x, params.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 8; i++) {
    const n = fbm2(i * 1.3, t * 0.8, 2, params.seed + i);
    softDot(
      ctx,
      params.x + n * rx * 0.7,
      params.y + fbm2(i, t * 0.5, 2, params.seed + 9) * ry * 0.5,
      10 + (i % 3) * 6,
      mat.emissive,
      0.35 * pulse * params.intensity,
    );
  }
  ctx.restore();
};

export const lavaGlowEffect: EffectModule<LavaGlowParams> = {
  id: 'lava-glow',
  name: 'Lava Glow',
  description: 'Molten ground patch with heat pulse.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'lava-glow-default',
    x: 1050,
    y: 860,
    seed: 109,
    size: 1.2,
    spread: 1.1,
    pulse: 1,
    material: createDefaultMaterial({
      name: 'Fire / Magma',
      baseColor: '#ff3b10',
      emissive: '#fff1c1',
      emissiveIntensity: 1.3,
      blend: 'additive',
    }),
  },
  draw: drawLavaGlow,
};
export function disposeLavaGlowInstance(_id: string): void {}

// ——— 10. Moths ———
export interface MothsParams extends P {
  count: number;
  size: number;
  wander: number;
}
interface Moth {
  x: number;
  y: number;
  phase: number;
  speed: number;
}
const mothPools = new Map<string, Moth[]>();

export const drawMoths: DrawFn<MothsParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = mothPools.get(params.instanceId) ?? [];
  const n = Math.floor(8 + params.count * 28);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 160,
      y: (rand() - 0.5) * 120,
      phase: rand() * Math.PI * 2,
      speed: 0.8 + rand() * 1.4,
    });
  }
  pool.length = n;
  mothPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const m of pool) {
    if (!scene.paused) {
      // Orbit toward center light
      const ang = Math.atan2(m.y, m.x) + 1.2 * dt * m.speed;
      const dist = Math.hypot(m.x, m.y) * 0.998 + Math.sin(t * 2 + m.phase) * 4 * params.wander;
      m.x = Math.cos(ang) * Math.max(20, dist);
      m.y = Math.sin(ang) * Math.max(16, dist * 0.75);
    }
    const flap = 0.6 + 0.4 * Math.abs(Math.sin(t * 18 * m.speed + m.phase));
    softDot(
      ctx,
      params.x + m.x,
      params.y + m.y,
      4 * params.size * flap,
      mat.baseColor,
      0.7 * params.intensity,
    );
  }
  ctx.restore();
};

export const mothsEffect: EffectModule<MothsParams> = {
  id: 'moths',
  name: 'Moths',
  description: 'Moths orbiting a light.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'moths-default',
    x: 960,
    y: 680,
    seed: 110,
    count: 0.75,
    size: 1,
    wander: 1,
    material: createDefaultMaterial({
      name: 'Moth',
      baseColor: '#c8b89a',
      emissive: '#fff4d8',
      emissiveIntensity: 0.4,
      blend: 'normal',
    }),
  },
  draw: drawMoths,
};
export const disposeMothsInstance = (id: string) => disposeMap(mothPools, id);

// ——— 11. Spore Cloud ———
export interface SporesParams extends P {
  size: number;
  density: number;
  rise: number;
}
interface Spore {
  x: number;
  y: number;
  life: number;
  max: number;
  s: number;
}
const sporePools = new Map<string, Spore[]>();

export const drawSpores: DrawFn<SporesParams> = (ctx, params, _t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = sporePools.get(params.instanceId) ?? [];
  const n = Math.floor(25 + params.density * 60);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 60,
      y: (rand() - 0.5) * 20,
      life: rand(),
      max: 2 + rand() * 3,
      s: 4 + rand() * 12,
    });
  }
  pool.length = n;
  sporePools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const s of pool) {
    if (!scene.paused) {
      s.life += dt;
      s.y -= 10 * params.rise * dt;
      s.x += (rand() - 0.5) * 20 * dt;
      s.s += 6 * dt;
      if (s.life >= s.max) {
        s.x = (rand() - 0.5) * 60;
        s.y = (rand() - 0.5) * 20;
        s.life = 0;
        s.max = 2 + rand() * 3;
        s.s = 4 + rand() * 12;
      }
    }
    const k = s.life / s.max;
    const a = (1 - k) * 0.22 * params.intensity;
    softDot(ctx, params.x + s.x, params.y + s.y, s.s * params.size, mat.baseColor, a);
  }
  ctx.restore();
};

export const sporesEffect: EffectModule<SporesParams> = {
  id: 'spores',
  name: 'Spore Cloud',
  description: 'Fungal spore plume.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'spores-default',
    x: 1100,
    y: 820,
    seed: 111,
    size: 1.1,
    density: 0.8,
    rise: 0.7,
    material: createDefaultMaterial({
      name: 'Toxic Green',
      baseColor: '#7cff4a',
      emissive: '#c8ff7a',
      emissiveIntensity: 0.55,
      opacity: 0.85,
      blend: 'normal',
    }),
  },
  draw: drawSpores,
};
export const disposeSporesInstance = (id: string) => disposeMap(sporePools, id);

// ——— 12. Ink Cloud ———
export interface InkCloudParams extends P {
  size: number;
  density: number;
  spread: number;
}
interface InkBlob {
  x: number;
  y: number;
  life: number;
  max: number;
  s: number;
  vx: number;
  vy: number;
}
const inkPools = new Map<string, InkBlob[]>();

export const drawInkCloud: DrawFn<InkCloudParams> = (ctx, params, _t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = inkPools.get(params.instanceId) ?? [];
  const n = Math.floor(16 + params.density * 40);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    const ang = rand() * Math.PI * 2;
    const spd = (20 + rand() * 40) * params.spread;
    pool.push({
      x: 0,
      y: 0,
      life: rand() * 0.3,
      max: 1.5 + rand() * 2,
      s: 16 + rand() * 30,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
    });
  }
  pool.length = n;
  inkPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const b of pool) {
    if (!scene.paused) {
      b.life += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= 1 - 0.6 * dt;
      b.vy *= 1 - 0.6 * dt;
      b.s += 20 * dt;
      if (b.life >= b.max) {
        const ang = rand() * Math.PI * 2;
        const spd = (20 + rand() * 40) * params.spread;
        b.x = 0;
        b.y = 0;
        b.life = 0;
        b.max = 1.5 + rand() * 2;
        b.s = 16 + rand() * 30;
        b.vx = Math.cos(ang) * spd;
        b.vy = Math.sin(ang) * spd;
      }
    }
    const k = b.life / b.max;
    const a = (k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9) * 0.55 * params.intensity;
    softDot(ctx, params.x + b.x, params.y + b.y, b.s * params.size, mat.baseColor, a);
  }
  ctx.restore();
};

export const inkCloudEffect: EffectModule<InkCloudParams> = {
  id: 'ink-cloud',
  name: 'Ink Cloud',
  description: 'Expanding dark ink burst.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'ink-cloud-default',
    x: 1000,
    y: 780,
    seed: 112,
    size: 1,
    density: 0.85,
    spread: 1,
    material: createDefaultMaterial({
      name: 'Ink',
      baseColor: '#1a0a28',
      emissive: '#4a2060',
      emissiveIntensity: 0.25,
      opacity: 0.9,
      blend: 'normal',
    }),
  },
  draw: drawInkCloud,
};
export const disposeInkCloudInstance = (id: string) => disposeMap(inkPools, id);

// ——— 13. Hologram ———
export interface HologramParams extends P {
  size: number;
  height: number;
  glitch: number;
}

export const drawHologram: DrawFn<HologramParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const h = 120 * params.height;
  const w = 50 * params.size;
  ctx.save();
  applyMaterial(ctx, mat);
  const flicker = 0.7 + 0.3 * Math.sin(t * 17) * (0.4 + params.glitch);
  const g = ctx.createLinearGradient(params.x, params.y - h, params.x, params.y);
  g.addColorStop(0, withAlpha(mat.emissive, 0.05 * params.intensity));
  g.addColorStop(0.5, withAlpha(mat.baseColor, 0.35 * flicker * params.intensity));
  g.addColorStop(1, withAlpha(mat.emissive, 0.15 * params.intensity));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(params.x, params.y - h);
  ctx.lineTo(params.x + w * 0.55, params.y);
  ctx.lineTo(params.x - w * 0.55, params.y);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 10; i++) {
    const y = params.y - h + ((i + ((t * 2) % 1)) / 10) * h;
    ctx.strokeStyle = withAlpha(mat.emissive, 0.2 * flicker * params.intensity);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(params.x - w * 0.4, y);
    ctx.lineTo(params.x + w * 0.4, y);
    ctx.stroke();
  }
  if (params.glitch > 0.3 && Math.sin(t * 40) > 0.85) {
    ctx.fillStyle = withAlpha(mat.emissive, 0.25 * params.intensity);
    ctx.fillRect(params.x - w * 0.5, params.y - h * 0.4, w, 6);
  }
  ctx.restore();
};

export const hologramEffect: EffectModule<HologramParams> = {
  id: 'hologram',
  name: 'Hologram',
  description: 'Flickering scanline projection.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'hologram-default',
    x: 1000,
    y: 780,
    seed: 113,
    size: 1.1,
    height: 1.2,
    glitch: 0.7,
    material: createDefaultMaterial({
      name: 'Cold Plasma',
      baseColor: '#3d7cff',
      emissive: '#b8f0ff',
      emissiveIntensity: 1.2,
      blend: 'additive',
    }),
  },
  draw: drawHologram,
};
export function disposeHologramInstance(_id: string): void {}

// ——— 14. Black Hole ———
export interface BlackHoleParams extends P {
  size: number;
  spin: number;
  accretion: number;
}

export const drawBlackHole: DrawFn<BlackHoleParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const R = 55 * params.size;
  ctx.save();
  applyMaterial(ctx, mat);
  for (let i = 0; i < 5; i++) {
    const rr = R * (0.7 + i * 0.28);
    ctx.beginPath();
    ctx.ellipse(params.x, params.y, rr, rr * 0.35, t * params.spin * 0.4 + i, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(
      i % 2 ? mat.emissive : mat.baseColor,
      0.22 * params.accretion * params.intensity,
    );
    ctx.lineWidth = 4 + i;
    ctx.stroke();
  }
  softDot(ctx, params.x, params.y, R * 0.55, '#000000', 0.95 * params.intensity);
  softDot(
    ctx,
    params.x,
    params.y,
    R * 0.9,
    mat.emissive,
    0.25 * params.intensity * mat.emissiveIntensity,
  );
  ctx.restore();
};

export const blackHoleEffect: EffectModule<BlackHoleParams> = {
  id: 'black-hole',
  name: 'Black Hole',
  description: 'Dark core with spinning accretion disk.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'black-hole-default',
    x: 1000,
    y: 620,
    seed: 114,
    size: 1.1,
    spin: 1,
    accretion: 1,
    material: createDefaultMaterial({
      name: 'Void',
      baseColor: '#6b3cff',
      emissive: '#ff7ad9',
      emissiveIntensity: 1.1,
      blend: 'additive',
    }),
  },
  draw: drawBlackHole,
};
export function disposeBlackHoleInstance(_id: string): void {}

// ——— 15. Energy Beam ———
export interface EnergyBeamParams extends P {
  size: number;
  length: number;
  width: number;
}

export const drawEnergyBeam: DrawFn<EnergyBeamParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const len = 220 * params.length;
  const w = 14 * params.width * params.size;
  const pulse = 0.75 + 0.25 * Math.sin(t * 14);
  ctx.save();
  applyMaterial(ctx, mat);
  const g = ctx.createLinearGradient(params.x, params.y, params.x, params.y - len);
  g.addColorStop(0, withAlpha(mat.emissive, 0.9 * pulse * params.intensity));
  g.addColorStop(0.6, withAlpha(mat.baseColor, 0.45 * params.intensity));
  g.addColorStop(1, withAlpha(mat.baseColor, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(params.x - w, params.y);
  ctx.lineTo(params.x - w * 0.35, params.y - len);
  ctx.lineTo(params.x + w * 0.35, params.y - len);
  ctx.lineTo(params.x + w, params.y);
  ctx.closePath();
  ctx.fill();
  softDot(ctx, params.x, params.y, w * 1.8, mat.emissive, 0.7 * pulse * params.intensity);
  ctx.restore();
};

export const energyBeamEffect: EffectModule<EnergyBeamParams> = {
  id: 'energy-beam',
  name: 'Energy Beam',
  description: 'Vertical energy column.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'energy-beam-default',
    x: 1000,
    y: 820,
    seed: 115,
    size: 1,
    length: 1.2,
    width: 1,
    material: createDefaultMaterial({
      name: 'Cold Plasma',
      baseColor: '#3d7cff',
      emissive: '#e8ffff',
      emissiveIntensity: 1.4,
      blend: 'additive',
    }),
  },
  draw: drawEnergyBeam,
};
export function disposeEnergyBeamInstance(_id: string): void {}

// ——— 16. Tornado ———
export interface TornadoParams extends P {
  size: number;
  height: number;
  spin: number;
  debris: number;
}
interface Debris {
  ang: number;
  y: number;
  r: number;
  s: number;
}
const tornadoPools = new Map<string, Debris[]>();

export const drawTornado: DrawFn<TornadoParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const H = 200 * params.height;
  ctx.save();
  applyMaterial(ctx, mat);
  for (let i = 0; i < 12; i++) {
    const u = i / 11;
    const y = params.y - u * H;
    const rad = (8 + u * 55) * params.size;
    const ox = Math.sin(t * params.spin * 3 + u * 6) * 8 * (1 - u);
    ctx.beginPath();
    ctx.ellipse(params.x + ox, y, rad, rad * 0.35, 0, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(mat.baseColor, 0.16 * params.intensity * (1 - u * 0.4));
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  let pool = tornadoPools.get(params.instanceId) ?? [];
  const n = Math.floor(10 + params.debris * 30);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      ang: rand() * Math.PI * 2,
      y: rand(),
      r: 10 + rand() * 50,
      s: 2 + rand() * 4,
    });
  }
  pool.length = n;
  tornadoPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  for (const d of pool) {
    if (!scene.paused) {
      d.ang += params.spin * 4 * dt;
      d.y += 0.15 * dt;
      if (d.y > 1) d.y = 0;
    }
    const rad = (8 + d.y * 55) * params.size * (0.4 + d.r / 80);
    softDot(
      ctx,
      params.x + Math.cos(d.ang) * rad,
      params.y - d.y * H,
      d.s * params.size,
      mat.emissive,
      0.55 * params.intensity,
    );
  }
  ctx.restore();
};

export const tornadoEffect: EffectModule<TornadoParams> = {
  id: 'tornado',
  name: 'Tornado',
  description: 'Swirling debris funnel.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'tornado-default',
    x: 1100,
    y: 880,
    seed: 116,
    size: 1.1,
    height: 1.2,
    spin: 1,
    debris: 0.8,
    material: createDefaultMaterial({
      name: 'Ash Smoke',
      baseColor: '#6a7380',
      emissive: '#c4b49a',
      emissiveIntensity: 0.4,
      blend: 'normal',
      opacity: 0.9,
    }),
  },
  draw: drawTornado,
};
export const disposeTornadoInstance = (id: string) => disposeMap(tornadoPools, id);

// ——— 17. Starfield ———
export interface StarfieldParams extends P {
  size: number;
  density: number;
  twinkle: number;
}
interface Star {
  x: number;
  y: number;
  phase: number;
  r: number;
}
const starPools = new Map<string, Star[]>();

export const drawStarfield: DrawFn<StarfieldParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = starPools.get(params.instanceId) ?? [];
  const n = Math.floor(40 + params.density * 120);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 320 * params.size,
      y: (rand() - 0.5) * 220 * params.size,
      phase: rand() * Math.PI * 2,
      r: 0.6 + rand() * 2.2,
    });
  }
  pool.length = n;
  starPools.set(params.instanceId, pool);
  ctx.save();
  applyMaterial(ctx, mat);
  for (const s of pool) {
    const tw =
      0.35 + 0.65 * Math.max(0, Math.sin(t * (2 + params.twinkle * 3) + s.phase));
    softDot(
      ctx,
      params.x + s.x,
      params.y + s.y,
      s.r * params.size * (0.8 + tw * 0.4),
      mat.emissive,
      tw * params.intensity * mat.emissiveIntensity,
    );
  }
  ctx.restore();
};

export const starfieldEffect: EffectModule<StarfieldParams> = {
  id: 'starfield',
  name: 'Starfield',
  description: 'Twinkling local star field.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'starfield-default',
    x: 1000,
    y: 420,
    seed: 117,
    size: 1.3,
    density: 0.85,
    twinkle: 1,
    material: createDefaultMaterial({
      name: 'Stars',
      baseColor: '#c8d8ff',
      emissive: '#ffffff',
      emissiveIntensity: 1.1,
      blend: 'additive',
    }),
  },
  draw: drawStarfield,
};
export const disposeStarfieldInstance = (id: string) => disposeMap(starPools, id);

// ——— 18. Butterflies ———
export interface ButterfliesParams extends P {
  count: number;
  size: number;
  wander: number;
}
interface Butterfly {
  x: number;
  y: number;
  phase: number;
  speed: number;
  hue: number;
}
const bfPools = new Map<string, Butterfly[]>();

export const drawButterflies: DrawFn<ButterfliesParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = bfPools.get(params.instanceId) ?? [];
  const n = Math.floor(6 + params.count * 18);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 200,
      y: (rand() - 0.5) * 140,
      phase: rand() * Math.PI * 2,
      speed: 0.5 + rand() * 0.9,
      hue: rand(),
    });
  }
  pool.length = n;
  bfPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const b of pool) {
    if (!scene.paused) {
      b.x += Math.sin(t * b.speed + b.phase) * 30 * params.wander * dt;
      b.y += Math.cos(t * b.speed * 0.7 + b.phase) * 22 * params.wander * dt;
    }
    const flap = Math.sin(t * 14 * b.speed + b.phase);
    const color = b.hue < 0.5 ? mat.baseColor : mat.emissive;
    ctx.save();
    ctx.translate(params.x + b.x, params.y + b.y);
    ctx.fillStyle = withAlpha(color, 0.8 * params.intensity);
    ctx.beginPath();
    ctx.ellipse(-4 * params.size, 0, 5 * params.size * Math.abs(flap), 3.5 * params.size, -0.4, 0, Math.PI * 2);
    ctx.ellipse(4 * params.size, 0, 5 * params.size * Math.abs(flap), 3.5 * params.size, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
};

export const butterfliesEffect: EffectModule<ButterfliesParams> = {
  id: 'butterflies',
  name: 'Butterflies',
  description: 'Fluttering butterfly flock.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'butterflies-default',
    x: 980,
    y: 700,
    seed: 118,
    count: 0.8,
    size: 1,
    wander: 1,
    material: createDefaultMaterial({
      name: 'Wings',
      baseColor: '#ff7a3c',
      emissive: '#ffd24a',
      emissiveIntensity: 0.5,
      blend: 'normal',
    }),
  },
  draw: drawButterflies,
};
export const disposeButterfliesInstance = (id: string) => disposeMap(bfPools, id);

// ——— 19. Water Drips ———
export interface DripsParams extends P {
  size: number;
  count: number;
  speed: number;
}
interface Drip {
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
}
const dripPools = new Map<string, Drip[]>();

export const drawDrips: DrawFn<DripsParams> = (ctx, params, _t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = dripPools.get(params.instanceId) ?? [];
  const n = Math.floor(8 + params.count * 24);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 80 * params.size,
      y: 0,
      vy: 0,
      life: rand() * 2,
      max: 1.2 + rand() * 1.5,
    });
  }
  pool.length = n;
  dripPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const d of pool) {
    if (!scene.paused) {
      d.life += dt;
      if (d.life < 0.35) {
        // form drop
        softDot(
          ctx,
          params.x + d.x,
          params.y,
          (2 + d.life * 6) * params.size,
          mat.emissive,
          0.7 * params.intensity,
        );
      } else {
        d.vy += 220 * params.speed * dt;
        d.y += d.vy * dt;
        softDot(
          ctx,
          params.x + d.x,
          params.y + d.y,
          2.5 * params.size,
          mat.baseColor,
          0.75 * params.intensity,
        );
        if (d.y > 140 * params.size || d.life > d.max) {
          d.y = 0;
          d.vy = 0;
          d.life = 0;
          d.max = 1.2 + rand() * 1.5;
          d.x = (rand() - 0.5) * 80 * params.size;
          // splash
          softDot(ctx, params.x + d.x, params.y + 140 * params.size, 10 * params.size, mat.emissive, 0.35);
        }
      }
    }
  }
  ctx.restore();
};

export const dripsEffect: EffectModule<DripsParams> = {
  id: 'drips',
  name: 'Water Drips',
  description: 'Ceiling drips with splash.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'drips-default',
    x: 1000,
    y: 520,
    seed: 119,
    size: 1,
    count: 0.75,
    speed: 1,
    material: createDefaultMaterial({
      name: 'Clear Water',
      baseColor: '#8ec8e8',
      emissive: '#e8f7ff',
      emissiveIntensity: 0.7,
      blend: 'additive',
    }),
  },
  draw: drawDrips,
};
export const disposeDripsInstance = (id: string) => disposeMap(dripPools, id);

// ——— 20. Ember Ring ———
export interface EmberRingParams extends P {
  size: number;
  count: number;
  radius: number;
  spin: number;
}
interface RingEmber {
  ang: number;
  elev: number;
  life: number;
  max: number;
  s: number;
}
const ringPools = new Map<string, RingEmber[]>();

export const drawEmberRing: DrawFn<EmberRingParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = ringPools.get(params.instanceId) ?? [];
  const n = Math.floor(24 + params.count * 50);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      ang: rand() * Math.PI * 2,
      elev: rand() * 40,
      life: rand(),
      max: 1 + rand() * 1.5,
      s: 1.5 + rand() * 3,
    });
  }
  pool.length = n;
  ringPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  const R = 55 * params.radius * params.size;
  ctx.save();
  applyMaterial(ctx, mat);
  // ring glow
  ctx.beginPath();
  ctx.ellipse(params.x, params.y, R, R * 0.35, 0, 0, Math.PI * 2);
  ctx.strokeStyle = withAlpha(mat.baseColor, 0.35 * params.intensity);
  ctx.lineWidth = 4;
  ctx.stroke();
  for (const e of pool) {
    if (!scene.paused) {
      e.life += dt;
      e.ang += params.spin * 1.2 * dt;
      e.elev += 25 * dt;
      if (e.life >= e.max) {
        e.life = 0;
        e.elev = 0;
        e.ang = rand() * Math.PI * 2;
        e.max = 1 + rand() * 1.5;
      }
    }
    const a = (1 - e.life / e.max) * params.intensity;
    softDot(
      ctx,
      params.x + Math.cos(e.ang + t * 0.2) * R,
      params.y + Math.sin(e.ang + t * 0.2) * R * 0.35 - e.elev,
      e.s * params.size,
      e.life < e.max * 0.3 ? mat.emissive : mat.baseColor,
      a,
    );
  }
  ctx.restore();
};

export const emberRingEffect: EffectModule<EmberRingParams> = {
  id: 'ember-ring',
  name: 'Ember Ring',
  description: 'Circular rising ember orbit.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'ember-ring-default',
    x: 1000,
    y: 800,
    seed: 120,
    size: 1,
    count: 0.8,
    radius: 1,
    spin: 1,
    material: createDefaultMaterial({
      name: 'Fire / Magma',
      baseColor: '#ff6a20',
      emissive: '#ffe0a0',
      emissiveIntensity: 1.2,
      blend: 'additive',
    }),
  },
  draw: drawEmberRing,
};
export const disposeEmberRingInstance = (id: string) => disposeMap(ringPools, id);

/** All pack-2 modules for registry. */
export const PACK2_EFFECTS: EffectModule[] = [
  auroraEffect as unknown as EffectModule,
  confettiEffect as unknown as EffectModule,
  ashFallEffect as unknown as EffectModule,
  steamEffect as unknown as EffectModule,
  bubblesEffect as unknown as EffectModule,
  pollenEffect as unknown as EffectModule,
  petalsEffect as unknown as EffectModule,
  fireworksEffect as unknown as EffectModule,
  lavaGlowEffect as unknown as EffectModule,
  mothsEffect as unknown as EffectModule,
  sporesEffect as unknown as EffectModule,
  inkCloudEffect as unknown as EffectModule,
  hologramEffect as unknown as EffectModule,
  blackHoleEffect as unknown as EffectModule,
  energyBeamEffect as unknown as EffectModule,
  tornadoEffect as unknown as EffectModule,
  starfieldEffect as unknown as EffectModule,
  butterfliesEffect as unknown as EffectModule,
  dripsEffect as unknown as EffectModule,
  emberRingEffect as unknown as EffectModule,
];

export const PACK2_DISPOSE: Record<string, (id: string) => void> = {
  aurora: disposeAuroraInstance,
  confetti: disposeConfettiInstance,
  'ash-fall': disposeAshFallInstance,
  steam: disposeSteamInstance,
  bubbles: disposeBubblesInstance,
  pollen: disposePollenInstance,
  petals: disposePetalsInstance,
  fireworks: disposeFireworksInstance,
  'lava-glow': disposeLavaGlowInstance,
  moths: disposeMothsInstance,
  spores: disposeSporesInstance,
  'ink-cloud': disposeInkCloudInstance,
  hologram: disposeHologramInstance,
  'black-hole': disposeBlackHoleInstance,
  'energy-beam': disposeEnergyBeamInstance,
  tornado: disposeTornadoInstance,
  starfield: disposeStarfieldInstance,
  butterflies: disposeButterfliesInstance,
  drips: disposeDripsInstance,
  'ember-ring': disposeEmberRingInstance,
};
