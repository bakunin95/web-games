/**
 * Third creatable VFX pack — 20 more atmospheric / fantasy / UI FX.
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

// ——— 1. Acid Rain ———
export interface AcidRainParams extends P {
  size: number;
  density: number;
  speed: number;
}
interface Drop {
  x: number;
  y: number;
  len: number;
  vy: number;
}
const acidPools = new Map<string, Drop[]>();

export const drawAcidRain: DrawFn<AcidRainParams> = (ctx, params, _t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = acidPools.get(params.instanceId) ?? [];
  const n = Math.floor(40 + params.density * 100);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 280 * params.size,
      y: (rand() - 0.5) * 220 * params.size,
      len: 8 + rand() * 16,
      vy: (140 + rand() * 120) * params.speed,
    });
  }
  pool.length = n;
  acidPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  const wind = scene.wind.x;
  ctx.save();
  applyMaterial(ctx, mat);
  ctx.strokeStyle = withAlpha(mat.baseColor, 0.55 * params.intensity);
  ctx.lineWidth = 1.5;
  for (const d of pool) {
    if (!scene.paused) {
      d.y += d.vy * dt;
      d.x += wind * 50 * dt;
      if (d.y > 120 * params.size) {
        d.y = -120 * params.size;
        d.x = (rand() - 0.5) * 280 * params.size;
      }
    }
    ctx.beginPath();
    ctx.moveTo(params.x + d.x, params.y + d.y);
    ctx.lineTo(params.x + d.x + wind * 8, params.y + d.y + d.len);
    ctx.stroke();
  }
  ctx.restore();
};

export const acidRainEffect: EffectModule<AcidRainParams> = {
  id: 'acid-rain',
  name: 'Acid Rain',
  description: 'Corrosive green rain streaks.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'acid-rain-default',
    x: 1000,
    y: 520,
    seed: 201,
    size: 1.2,
    density: 0.9,
    speed: 1,
    material: createDefaultMaterial({
      name: 'Toxic Green',
      baseColor: '#7cff4a',
      emissive: '#c8ff7a',
      emissiveIntensity: 0.8,
      blend: 'additive',
    }),
  },
  draw: drawAcidRain,
};
export const disposeAcidRainInstance = (id: string) => disposeMap(acidPools, id);

// ——— 2. Neon Rain ———
export interface NeonRainParams extends P {
  size: number;
  density: number;
  speed: number;
}
const neonRainPools = new Map<string, Drop[]>();

export const drawNeonRain: DrawFn<NeonRainParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = neonRainPools.get(params.instanceId) ?? [];
  const n = Math.floor(50 + params.density * 110);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 300 * params.size,
      y: (rand() - 0.5) * 240 * params.size,
      len: 10 + rand() * 22,
      vy: (160 + rand() * 140) * params.speed,
    });
  }
  pool.length = n;
  neonRainPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (let i = 0; i < pool.length; i++) {
    const d = pool[i]!;
    if (!scene.paused) {
      d.y += d.vy * dt;
      if (d.y > 130 * params.size) {
        d.y = -130 * params.size;
        d.x = (rand() - 0.5) * 300 * params.size;
      }
    }
    const col = i % 3 === 0 ? mat.baseColor : i % 3 === 1 ? mat.emissive : '#ff4fd8';
    ctx.strokeStyle = withAlpha(col, 0.5 * params.intensity);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(params.x + d.x, params.y + d.y);
    ctx.lineTo(params.x + d.x, params.y + d.y + d.len);
    ctx.stroke();
  }
  void t;
  ctx.restore();
};

export const neonRainEffect: EffectModule<NeonRainParams> = {
  id: 'neon-rain',
  name: 'Neon Rain',
  description: 'Cyberpunk multicolor rain.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'neon-rain-default',
    x: 1000,
    y: 500,
    seed: 202,
    size: 1.2,
    density: 0.85,
    speed: 1,
    material: createDefaultMaterial({
      name: 'Neon',
      baseColor: '#3de7ff',
      emissive: '#ff4fd8',
      emissiveIntensity: 1.1,
      blend: 'additive',
    }),
  },
  draw: drawNeonRain,
};
export const disposeNeonRainInstance = (id: string) => disposeMap(neonRainPools, id);

// ——— 3. Feathers ———
export interface FeathersParams extends P {
  size: number;
  density: number;
  drift: number;
}
interface Feather {
  x: number;
  y: number;
  rot: number;
  vr: number;
  vy: number;
  phase: number;
}
const featherPools = new Map<string, Feather[]>();

export const drawFeathers: DrawFn<FeathersParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = featherPools.get(params.instanceId) ?? [];
  const n = Math.floor(14 + params.density * 36);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 260,
      y: (rand() - 0.5) * 200,
      rot: rand() * Math.PI,
      vr: (rand() - 0.5) * 1.5,
      vy: 12 + rand() * 22,
      phase: rand() * Math.PI * 2,
    });
  }
  pool.length = n;
  featherPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const f of pool) {
    if (!scene.paused) {
      f.y += f.vy * dt;
      f.x += Math.sin(t + f.phase) * 24 * params.drift * dt;
      f.rot += f.vr * dt;
      if (f.y > 120) {
        f.y = -120;
        f.x = (rand() - 0.5) * 260;
      }
    }
    ctx.save();
    ctx.translate(params.x + f.x, params.y + f.y);
    ctx.rotate(f.rot);
    ctx.fillStyle = withAlpha(mat.baseColor, 0.75 * params.intensity);
    ctx.beginPath();
    ctx.ellipse(0, 0, 7 * params.size, 2.5 * params.size, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(mat.emissive, 0.4 * params.intensity);
    ctx.beginPath();
    ctx.moveTo(-6 * params.size, 0);
    ctx.lineTo(6 * params.size, 0);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
};

export const feathersEffect: EffectModule<FeathersParams> = {
  id: 'feathers',
  name: 'Feathers',
  description: 'Drifting soft feathers.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'feathers-default',
    x: 1000,
    y: 560,
    seed: 203,
    size: 1,
    density: 0.8,
    drift: 1,
    material: createDefaultMaterial({
      name: 'Feather',
      baseColor: '#f2ebe0',
      emissive: '#ffffff',
      emissiveIntensity: 0.3,
      blend: 'normal',
    }),
  },
  draw: drawFeathers,
};
export const disposeFeathersInstance = (id: string) => disposeMap(featherPools, id);

// ——— 4. Coin Rain ———
export interface CoinRainParams extends P {
  size: number;
  count: number;
  speed: number;
}
interface Coin {
  x: number;
  y: number;
  vy: number;
  rot: number;
  vr: number;
}
const coinPools = new Map<string, Coin[]>();

export const drawCoinRain: DrawFn<CoinRainParams> = (ctx, params, _t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = coinPools.get(params.instanceId) ?? [];
  const n = Math.floor(16 + params.count * 40);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 200,
      y: (rand() - 0.5) * 180,
      vy: (60 + rand() * 80) * params.speed,
      rot: rand() * Math.PI,
      vr: (rand() - 0.5) * 6,
    });
  }
  pool.length = n;
  coinPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const c of pool) {
    if (!scene.paused) {
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
      if (c.y > 110) {
        c.y = -110;
        c.x = (rand() - 0.5) * 200;
      }
    }
    const sx = Math.cos(c.rot);
    ctx.save();
    ctx.translate(params.x + c.x, params.y + c.y);
    ctx.scale(Math.max(0.2, Math.abs(sx)), 1);
    ctx.fillStyle = withAlpha(mat.baseColor, 0.9 * params.intensity);
    ctx.beginPath();
    ctx.ellipse(0, 0, 6 * params.size, 6 * params.size, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(mat.emissive, 0.7 * params.intensity);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
};

export const coinRainEffect: EffectModule<CoinRainParams> = {
  id: 'coin-rain',
  name: 'Coin Rain',
  description: 'Falling spinning gold coins.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'coin-rain-default',
    x: 1000,
    y: 520,
    seed: 204,
    size: 1,
    count: 0.8,
    speed: 1,
    material: createDefaultMaterial({
      name: 'Gold',
      baseColor: '#e8b84a',
      emissive: '#ffe08a',
      emissiveIntensity: 0.7,
      blend: 'normal',
      metalness: 0.9,
    }),
  },
  draw: drawCoinRain,
};
export const disposeCoinRainInstance = (id: string) => disposeMap(coinPools, id);

// ——— 5. Ghosts ———
export interface GhostsParams extends P {
  count: number;
  size: number;
  drift: number;
}
interface Ghost {
  x: number;
  y: number;
  phase: number;
  speed: number;
}
const ghostPools = new Map<string, Ghost[]>();

export const drawGhosts: DrawFn<GhostsParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = ghostPools.get(params.instanceId) ?? [];
  const n = Math.floor(3 + params.count * 8);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 180,
      y: (rand() - 0.5) * 100,
      phase: rand() * Math.PI * 2,
      speed: 0.4 + rand() * 0.6,
    });
  }
  pool.length = n;
  ghostPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const g of pool) {
    if (!scene.paused) {
      g.x += Math.sin(t * g.speed + g.phase) * 20 * params.drift * dt;
      g.y += Math.cos(t * g.speed * 0.7 + g.phase) * 12 * params.drift * dt;
    }
    const px = params.x + g.x;
    const py = params.y + g.y;
    const fade = 0.35 + 0.25 * Math.sin(t * 2 + g.phase);
    softDot(ctx, px, py - 10 * params.size, 18 * params.size, mat.baseColor, fade * params.intensity);
    softDot(ctx, px, py + 8 * params.size, 14 * params.size, mat.emissive, fade * 0.7 * params.intensity);
    softDot(ctx, px - 5 * params.size, py - 12 * params.size, 2.5, '#ffffff', 0.6 * params.intensity);
    softDot(ctx, px + 5 * params.size, py - 12 * params.size, 2.5, '#ffffff', 0.6 * params.intensity);
  }
  ctx.restore();
};

export const ghostsEffect: EffectModule<GhostsParams> = {
  id: 'ghosts',
  name: 'Ghosts',
  description: 'Wispy floating specters.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'ghosts-default',
    x: 1000,
    y: 680,
    seed: 205,
    count: 0.7,
    size: 1.1,
    drift: 1,
    material: createDefaultMaterial({
      name: 'Spirit',
      baseColor: '#b8d4ff',
      emissive: '#e8f0ff',
      emissiveIntensity: 0.9,
      blend: 'additive',
      opacity: 0.85,
    }),
  },
  draw: drawGhosts,
};
export const disposeGhostsInstance = (id: string) => disposeMap(ghostPools, id);

// ——— 6. Soul Wisps ———
export interface SoulWispsParams extends P {
  count: number;
  size: number;
  rise: number;
}
interface Wisp {
  x: number;
  y: number;
  life: number;
  max: number;
  phase: number;
}
const wispPools = new Map<string, Wisp[]>();

export const drawSoulWisps: DrawFn<SoulWispsParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = wispPools.get(params.instanceId) ?? [];
  const n = Math.floor(10 + params.count * 28);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 40,
      y: rand() * 20,
      life: rand(),
      max: 2 + rand() * 2.5,
      phase: rand() * Math.PI * 2,
    });
  }
  pool.length = n;
  wispPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const w of pool) {
    if (!scene.paused) {
      w.life += dt;
      w.y -= 35 * params.rise * dt;
      w.x += Math.sin(t * 2 + w.phase) * 25 * dt;
      if (w.life >= w.max) {
        w.x = (rand() - 0.5) * 40;
        w.y = rand() * 20;
        w.life = 0;
        w.max = 2 + rand() * 2.5;
      }
    }
    const a = (1 - w.life / w.max) * params.intensity;
    softDot(ctx, params.x + w.x, params.y + w.y, 8 * params.size, mat.emissive, a * 0.85);
    softDot(ctx, params.x + w.x, params.y + w.y, 3 * params.size, '#ffffff', a);
  }
  ctx.restore();
};

export const soulWispsEffect: EffectModule<SoulWispsParams> = {
  id: 'soul-wisps',
  name: 'Soul Wisps',
  description: 'Rising spirit orbs.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'soul-wisps-default',
    x: 980,
    y: 820,
    seed: 206,
    count: 0.8,
    size: 1,
    rise: 1,
    material: createDefaultMaterial({
      name: 'Soul',
      baseColor: '#6b8cff',
      emissive: '#c8e0ff',
      emissiveIntensity: 1.2,
      blend: 'additive',
    }),
  },
  draw: drawSoulWisps,
};
export const disposeSoulWispsInstance = (id: string) => disposeMap(wispPools, id);

// ——— 7. Shield Bubble ———
export interface ShieldBubbleParams extends P {
  size: number;
  pulse: number;
  hex: number;
}

export const drawShieldBubble: DrawFn<ShieldBubbleParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const R = 70 * params.size;
  const pulse = 0.85 + 0.15 * Math.sin(t * (2 + params.pulse));
  ctx.save();
  applyMaterial(ctx, mat);
  ctx.beginPath();
  ctx.arc(params.x, params.y, R * pulse, 0, Math.PI * 2);
  ctx.strokeStyle = withAlpha(mat.emissive, 0.55 * params.intensity);
  ctx.lineWidth = 2.5;
  ctx.stroke();
  const fill = ctx.createRadialGradient(params.x, params.y, R * 0.2, params.x, params.y, R);
  fill.addColorStop(0, withAlpha(mat.baseColor, 0.05 * params.intensity));
  fill.addColorStop(0.75, withAlpha(mat.baseColor, 0.12 * params.intensity));
  fill.addColorStop(1, withAlpha(mat.emissive, 0.35 * params.intensity));
  ctx.fillStyle = fill;
  ctx.fill();
  const sides = Math.max(4, Math.floor(4 + params.hex * 4));
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2 + t * 0.3;
    const a1 = ((i + 1) / sides) * Math.PI * 2 + t * 0.3;
    ctx.beginPath();
    ctx.moveTo(params.x + Math.cos(a0) * R * 0.7, params.y + Math.sin(a0) * R * 0.7);
    ctx.lineTo(params.x + Math.cos(a1) * R * 0.7, params.y + Math.sin(a1) * R * 0.7);
    ctx.strokeStyle = withAlpha(mat.emissive, 0.25 * params.intensity);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
};

export const shieldBubbleEffect: EffectModule<ShieldBubbleParams> = {
  id: 'shield-bubble',
  name: 'Shield Bubble',
  description: 'Pulsing energy dome.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'shield-bubble-default',
    x: 1000,
    y: 720,
    seed: 207,
    size: 1.15,
    pulse: 1,
    hex: 0.8,
    material: createDefaultMaterial({
      name: 'Cold Plasma',
      baseColor: '#3d7cff',
      emissive: '#b8f0ff',
      emissiveIntensity: 1.2,
      blend: 'additive',
    }),
  },
  draw: drawShieldBubble,
};
export function disposeShieldBubbleInstance(_id: string): void {}

// ——— 8. Magma Spray ———
export interface MagmaSprayParams extends P {
  size: number;
  count: number;
  speed: number;
}
interface MagmaBit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
}
const magmaPools = new Map<string, MagmaBit[]>();

export const drawMagmaSpray: DrawFn<MagmaSprayParams> = (ctx, params, _t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = magmaPools.get(params.instanceId) ?? [];
  const n = Math.floor(20 + params.count * 60);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    const ang = -Math.PI / 2 + (rand() - 0.5) * 1.2;
    const spd = (90 + rand() * 140) * params.speed;
    pool.push({
      x: (rand() - 0.5) * 12,
      y: 0,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: rand() * 0.2,
      max: 0.6 + rand() * 0.9,
    });
  }
  pool.length = n;
  magmaPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const m of pool) {
    if (!scene.paused) {
      m.life += dt;
      m.vy += 180 * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.life >= m.max) {
        const ang = -Math.PI / 2 + (rand() - 0.5) * 1.2;
        const spd = (90 + rand() * 140) * params.speed;
        m.x = (rand() - 0.5) * 12;
        m.y = 0;
        m.vx = Math.cos(ang) * spd;
        m.vy = Math.sin(ang) * spd;
        m.life = 0;
        m.max = 0.6 + rand() * 0.9;
      }
    }
    const a = (1 - m.life / m.max) * params.intensity;
    softDot(
      ctx,
      params.x + m.x,
      params.y + m.y,
      5 * params.size,
      m.life < m.max * 0.3 ? mat.emissive : mat.baseColor,
      a,
    );
  }
  ctx.restore();
};

export const magmaSprayEffect: EffectModule<MagmaSprayParams> = {
  id: 'magma-spray',
  name: 'Magma Spray',
  description: 'Upward lava splatters.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'magma-spray-default',
    x: 1050,
    y: 860,
    seed: 208,
    size: 1,
    count: 0.85,
    speed: 1,
    material: createDefaultMaterial({
      name: 'Fire / Magma',
      baseColor: '#ff3b10',
      emissive: '#fff1c1',
      emissiveIntensity: 1.3,
      blend: 'additive',
    }),
  },
  draw: drawMagmaSpray,
};
export const disposeMagmaSprayInstance = (id: string) => disposeMap(magmaPools, id);

// ——— 9. Crystal Shards ———
export interface CrystalShardsParams extends P {
  count: number;
  size: number;
  spin: number;
}
interface Shard {
  ang: number;
  r: number;
  rot: number;
  len: number;
}
const shardPools = new Map<string, Shard[]>();

export const drawCrystalShards: DrawFn<CrystalShardsParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = shardPools.get(params.instanceId) ?? [];
  const n = Math.floor(8 + params.count * 20);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      ang: rand() * Math.PI * 2,
      r: 20 + rand() * 50,
      rot: rand() * Math.PI,
      len: 10 + rand() * 18,
    });
  }
  pool.length = n;
  shardPools.set(params.instanceId, pool);
  ctx.save();
  applyMaterial(ctx, mat);
  softDot(ctx, params.x, params.y, 16 * params.size, mat.emissive, 0.35 * params.intensity);
  for (const s of pool) {
    const ang = s.ang + t * params.spin * 0.4;
    const px = params.x + Math.cos(ang) * s.r * params.size;
    const py = params.y + Math.sin(ang) * s.r * 0.55 * params.size;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(s.rot + t * params.spin);
    ctx.fillStyle = withAlpha(mat.baseColor, 0.7 * params.intensity);
    ctx.beginPath();
    ctx.moveTo(0, -s.len * 0.5);
    ctx.lineTo(4 * params.size, 0);
    ctx.lineTo(0, s.len * 0.5);
    ctx.lineTo(-4 * params.size, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
};

export const crystalShardsEffect: EffectModule<CrystalShardsParams> = {
  id: 'crystal-shards',
  name: 'Crystal Shards',
  description: 'Orbiting crystalline shards.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'crystal-shards-default',
    x: 1000,
    y: 700,
    seed: 209,
    count: 0.8,
    size: 1,
    spin: 1,
    material: createDefaultMaterial({
      name: 'Crystal',
      baseColor: '#a8e0ff',
      emissive: '#ffffff',
      emissiveIntensity: 1,
      blend: 'additive',
      metalness: 0.7,
    }),
  },
  draw: drawCrystalShards,
};
export const disposeCrystalShardsInstance = (id: string) => disposeMap(shardPools, id);

// ——— 10. Rain Ripples ———
export interface RainRipplesParams extends P {
  size: number;
  count: number;
  speed: number;
}
interface Ripple {
  x: number;
  y: number;
  life: number;
  max: number;
}
const ripplePools = new Map<string, Ripple[]>();

export const drawRainRipples: DrawFn<RainRipplesParams> = (ctx, params, _t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = ripplePools.get(params.instanceId) ?? [];
  const n = Math.floor(8 + params.count * 22);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 180 * params.size,
      y: (rand() - 0.5) * 80 * params.size,
      life: rand(),
      max: 0.8 + rand() * 1.2,
    });
  }
  pool.length = n;
  ripplePools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const r of pool) {
    if (!scene.paused) {
      r.life += dt * params.speed;
      if (r.life >= r.max) {
        r.x = (rand() - 0.5) * 180 * params.size;
        r.y = (rand() - 0.5) * 80 * params.size;
        r.life = 0;
        r.max = 0.8 + rand() * 1.2;
      }
    }
    const k = r.life / r.max;
    const rad = 4 + k * 28 * params.size;
    ctx.beginPath();
    ctx.ellipse(params.x + r.x, params.y + r.y, rad, rad * 0.35, 0, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(mat.emissive, (1 - k) * 0.55 * params.intensity);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
};

export const rainRipplesEffect: EffectModule<RainRipplesParams> = {
  id: 'rain-ripples',
  name: 'Rain Ripples',
  description: 'Expanding puddle ripples.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'rain-ripples-default',
    x: 1000,
    y: 880,
    seed: 210,
    size: 1.2,
    count: 0.85,
    speed: 1,
    material: createDefaultMaterial({
      name: 'Clear Water',
      baseColor: '#8ec8e8',
      emissive: '#e8f7ff',
      emissiveIntensity: 0.6,
      blend: 'additive',
    }),
  },
  draw: drawRainRipples,
};
export const disposeRainRipplesInstance = (id: string) => disposeMap(ripplePools, id);

// ——— 11. Smoke Ring ———
export interface SmokeRingParams extends P {
  size: number;
  speed: number;
  thickness: number;
}
interface RingState {
  life: number;
  max: number;
}
const smokeRingState = new Map<string, RingState>();

export const drawSmokeRing: DrawFn<SmokeRingParams> = (ctx, params, _t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let st = smokeRingState.get(params.instanceId);
  if (!st) {
    st = { life: 0, max: 2.2 };
    smokeRingState.set(params.instanceId, st);
  }
  const dt = scene.dt || 1 / 60;
  if (!scene.paused) {
    st.life += dt * params.speed;
    if (st.life >= st.max) st.life = 0;
  }
  const k = st.life / st.max;
  const rad = (20 + k * 90) * params.size;
  const a = (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * 0.45 * params.intensity;
  ctx.save();
  applyMaterial(ctx, mat);
  ctx.beginPath();
  ctx.ellipse(params.x, params.y, rad, rad * 0.4, 0, 0, Math.PI * 2);
  ctx.strokeStyle = withAlpha(mat.baseColor, a);
  ctx.lineWidth = (10 + (1 - k) * 14) * params.thickness;
  ctx.stroke();
  softDot(ctx, params.x, params.y - rad * 0.15, rad * 0.5, mat.emissive, a * 0.35);
  ctx.restore();
};

export const smokeRingEffect: EffectModule<SmokeRingParams> = {
  id: 'smoke-ring',
  name: 'Smoke Ring',
  description: 'Expanding toroidal smoke puff.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'smoke-ring-default',
    x: 1000,
    y: 760,
    seed: 211,
    size: 1.1,
    speed: 0.7,
    thickness: 1,
    material: createDefaultMaterial({
      name: 'Ash Smoke',
      baseColor: '#5a6270',
      emissive: '#9aa3b0',
      emissiveIntensity: 0.35,
      blend: 'normal',
      opacity: 0.9,
    }),
  },
  draw: drawSmokeRing,
};
export const disposeSmokeRingInstance = (id: string) => disposeMap(smokeRingState, id);

// ——— 12. Laser Grid ———
export interface LaserGridParams extends P {
  size: number;
  densX: number;
  densY: number;
  pulse: number;
}

export const drawLaserGrid: DrawFn<LaserGridParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const w = 160 * params.size;
  const h = 120 * params.size;
  const pulse = 0.65 + 0.35 * Math.sin(t * (3 + params.pulse));
  ctx.save();
  applyMaterial(ctx, mat);
  const nx = Math.max(2, Math.floor(3 + params.densX * 6));
  const ny = Math.max(2, Math.floor(2 + params.densY * 5));
  ctx.strokeStyle = withAlpha(mat.baseColor, 0.35 * pulse * params.intensity);
  ctx.lineWidth = 1.2;
  for (let i = 0; i <= nx; i++) {
    const x = params.x - w / 2 + (i / nx) * w;
    ctx.beginPath();
    ctx.moveTo(x, params.y - h / 2);
    ctx.lineTo(x, params.y + h / 2);
    ctx.stroke();
  }
  ctx.strokeStyle = withAlpha(mat.emissive, 0.3 * pulse * params.intensity);
  for (let j = 0; j <= ny; j++) {
    const y = params.y - h / 2 + (j / ny) * h;
    ctx.beginPath();
    ctx.moveTo(params.x - w / 2, y);
    ctx.lineTo(params.x + w / 2, y);
    ctx.stroke();
  }
  ctx.restore();
};

export const laserGridEffect: EffectModule<LaserGridParams> = {
  id: 'laser-grid',
  name: 'Laser Grid',
  description: 'Pulsing security laser lattice.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'laser-grid-default',
    x: 1000,
    y: 720,
    seed: 212,
    size: 1.2,
    densX: 0.8,
    densY: 0.7,
    pulse: 1,
    material: createDefaultMaterial({
      name: 'Laser',
      baseColor: '#ff3b5c',
      emissive: '#ff8aa0',
      emissiveIntensity: 1.1,
      blend: 'additive',
    }),
  },
  draw: drawLaserGrid,
};
export function disposeLaserGridInstance(_id: string): void {}

// ——— 13. Pixel Glitch ———
export interface PixelGlitchParams extends P {
  size: number;
  density: number;
  chaos: number;
}
interface PixelBlock {
  x: number;
  y: number;
  w: number;
  h: number;
  phase: number;
}
const glitchPools = new Map<string, PixelBlock[]>();

export const drawPixelGlitch: DrawFn<PixelGlitchParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = glitchPools.get(params.instanceId) ?? [];
  const n = Math.floor(12 + params.density * 40);
  const rand = mulberry32((params.seed + ((t * 8 * params.chaos) | 0)) | 0);
  // rebuild occasionally for glitch feel
  if (pool.length !== n || ((t * 6 * params.chaos) | 0) !== (((t - 0.016) * 6 * params.chaos) | 0)) {
    pool = [];
    for (let i = 0; i < n; i++) {
      pool.push({
        x: (rand() - 0.5) * 160 * params.size,
        y: (rand() - 0.5) * 100 * params.size,
        w: 4 + rand() * 28,
        h: 3 + rand() * 10,
        phase: rand(),
      });
    }
    glitchPools.set(params.instanceId, pool);
  }
  ctx.save();
  applyMaterial(ctx, mat);
  for (const p of pool) {
    const col = p.phase < 0.33 ? mat.baseColor : p.phase < 0.66 ? mat.emissive : '#ffffff';
    ctx.fillStyle = withAlpha(col, 0.55 * params.intensity);
    ctx.fillRect(params.x + p.x, params.y + p.y, p.w, p.h);
  }
  ctx.restore();
};

export const pixelGlitchEffect: EffectModule<PixelGlitchParams> = {
  id: 'pixel-glitch',
  name: 'Pixel Glitch',
  description: 'Jittering RGB pixel blocks.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'pixel-glitch-default',
    x: 1000,
    y: 700,
    seed: 213,
    size: 1.1,
    density: 0.85,
    chaos: 1,
    material: createDefaultMaterial({
      name: 'Glitch',
      baseColor: '#ff4fd8',
      emissive: '#3de7ff',
      emissiveIntensity: 1,
      blend: 'additive',
    }),
  },
  draw: drawPixelGlitch,
};
export const disposePixelGlitchInstance = (id: string) => disposeMap(glitchPools, id);

// ——— 14. Jellyfish ———
export interface JellyfishParams extends P {
  count: number;
  size: number;
  drift: number;
}
interface Jelly {
  x: number;
  y: number;
  phase: number;
  speed: number;
}
const jellyPools = new Map<string, Jelly[]>();

export const drawJellyfish: DrawFn<JellyfishParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = jellyPools.get(params.instanceId) ?? [];
  const n = Math.floor(3 + params.count * 8);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 160,
      y: (rand() - 0.5) * 120,
      phase: rand() * Math.PI * 2,
      speed: 0.4 + rand() * 0.7,
    });
  }
  pool.length = n;
  jellyPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const j of pool) {
    if (!scene.paused) {
      j.y += Math.sin(t * j.speed + j.phase) * 18 * params.drift * dt;
      j.x += Math.cos(t * j.speed * 0.6 + j.phase) * 12 * params.drift * dt;
    }
    const px = params.x + j.x;
    const py = params.y + j.y;
    const pulse = 0.85 + 0.15 * Math.sin(t * 3 + j.phase);
    softDot(ctx, px, py, 16 * params.size * pulse, mat.baseColor, 0.4 * params.intensity);
    softDot(ctx, px, py - 4, 8 * params.size, mat.emissive, 0.5 * params.intensity);
    for (let k = 0; k < 5; k++) {
      const ox = (k - 2) * 4 * params.size;
      const len = 18 + Math.sin(t * 4 + j.phase + k) * 6;
      ctx.strokeStyle = withAlpha(mat.emissive, 0.35 * params.intensity);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px + ox, py + 8);
      ctx.quadraticCurveTo(px + ox + Math.sin(t + k) * 6, py + len * 0.5, px + ox, py + len);
      ctx.stroke();
    }
  }
  ctx.restore();
};

export const jellyfishEffect: EffectModule<JellyfishParams> = {
  id: 'jellyfish',
  name: 'Jellyfish',
  description: 'Glowing drifting jellyfish.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'jellyfish-default',
    x: 1000,
    y: 760,
    seed: 214,
    count: 0.7,
    size: 1,
    drift: 1,
    material: createDefaultMaterial({
      name: 'Jelly',
      baseColor: '#c070ff',
      emissive: '#ffb0e8',
      emissiveIntensity: 1.1,
      blend: 'additive',
    }),
  },
  draw: drawJellyfish,
};
export const disposeJellyfishInstance = (id: string) => disposeMap(jellyPools, id);

// ——— 15. Comet Trail ———
export interface CometTrailParams extends P {
  size: number;
  length: number;
  speed: number;
}
interface CometState {
  u: number;
}
const cometState = new Map<string, CometState>();

export const drawCometTrail: DrawFn<CometTrailParams> = (ctx, params, _t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let st = cometState.get(params.instanceId);
  if (!st) {
    st = { u: 0 };
    cometState.set(params.instanceId, st);
  }
  const dt = scene.dt || 1 / 60;
  if (!scene.paused) {
    st.u += dt * 0.35 * params.speed;
    if (st.u > 1) st.u = 0;
  }
  const len = 180 * params.length;
  const cx = params.x - len / 2 + st.u * len;
  const cy = params.y + Math.sin(st.u * Math.PI * 2) * 20;
  ctx.save();
  applyMaterial(ctx, mat);
  for (let i = 0; i < 18; i++) {
    const k = i / 17;
    softDot(
      ctx,
      cx - k * 70 * params.size,
      cy + k * 6,
      (10 - k * 8) * params.size,
      k < 0.2 ? mat.emissive : mat.baseColor,
      (1 - k) * 0.7 * params.intensity,
    );
  }
  softDot(ctx, cx, cy, 12 * params.size, '#ffffff', 0.9 * params.intensity);
  ctx.restore();
};

export const cometTrailEffect: EffectModule<CometTrailParams> = {
  id: 'comet-trail',
  name: 'Comet Trail',
  description: 'Sweeping comet with long tail.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'comet-trail-default',
    x: 1000,
    y: 480,
    seed: 215,
    size: 1.1,
    length: 1.3,
    speed: 0.8,
    material: createDefaultMaterial({
      name: 'Comet',
      baseColor: '#7ab8ff',
      emissive: '#ffffff',
      emissiveIntensity: 1.4,
      blend: 'additive',
    }),
  },
  draw: drawCometTrail,
};
export const disposeCometTrailInstance = (id: string) => disposeMap(cometState, id);

// ——— 16. Bee Swarm ———
export interface BeeSwarmParams extends P {
  count: number;
  size: number;
  buzz: number;
}
interface Bee {
  x: number;
  y: number;
  phase: number;
  speed: number;
}
const beePools = new Map<string, Bee[]>();

export const drawBeeSwarm: DrawFn<BeeSwarmParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = beePools.get(params.instanceId) ?? [];
  const n = Math.floor(16 + params.count * 50);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 100,
      y: (rand() - 0.5) * 70,
      phase: rand() * Math.PI * 2,
      speed: 1.5 + rand() * 2,
    });
  }
  pool.length = n;
  beePools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const b of pool) {
    if (!scene.paused) {
      b.x += Math.sin(t * b.speed * params.buzz + b.phase) * 40 * dt;
      b.y += Math.cos(t * b.speed * 1.3 * params.buzz + b.phase) * 30 * dt;
      // soft pull to center
      b.x *= 1 - 0.4 * dt;
      b.y *= 1 - 0.4 * dt;
    }
    softDot(
      ctx,
      params.x + b.x,
      params.y + b.y,
      2.5 * params.size,
      mat.baseColor,
      0.85 * params.intensity,
    );
  }
  ctx.restore();
};

export const beeSwarmEffect: EffectModule<BeeSwarmParams> = {
  id: 'bee-swarm',
  name: 'Bee Swarm',
  description: 'Buzzing insect swarm.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'bee-swarm-default',
    x: 980,
    y: 700,
    seed: 216,
    count: 0.85,
    size: 1,
    buzz: 1,
    material: createDefaultMaterial({
      name: 'Bee',
      baseColor: '#ffc04a',
      emissive: '#ffe08a',
      emissiveIntensity: 0.5,
      blend: 'normal',
    }),
  },
  draw: drawBeeSwarm,
};
export const disposeBeeSwarmInstance = (id: string) => disposeMap(beePools, id);

// ——— 17. Candle Flames ———
export interface CandleFlamesParams extends P {
  count: number;
  size: number;
  spread: number;
}
interface Candle {
  ox: number;
  phase: number;
}
const candlePools = new Map<string, Candle[]>();

export const drawCandleFlames: DrawFn<CandleFlamesParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = candlePools.get(params.instanceId) ?? [];
  const n = Math.floor(3 + params.count * 10);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({ ox: (rand() - 0.5) * 2, phase: rand() * Math.PI * 2 });
  }
  pool.length = n;
  candlePools.set(params.instanceId, pool);
  ctx.save();
  applyMaterial(ctx, mat);
  for (let i = 0; i < pool.length; i++) {
    const c = pool[i]!;
    const px = params.x + c.ox * 50 * params.spread + (i - (n - 1) / 2) * 28 * params.spread;
    const flicker = 0.85 + 0.15 * Math.sin(t * 12 + c.phase) + 0.05 * fbm2(i, t * 3, 2, params.seed);
    const py = params.y;
    // wick base
    ctx.fillStyle = withAlpha('#2a2018', 0.9);
    ctx.fillRect(px - 1.5, py, 3, 8);
    softDot(ctx, px, py - 6 * params.size * flicker, 10 * params.size, mat.baseColor, 0.7 * params.intensity);
    softDot(ctx, px, py - 10 * params.size * flicker, 5 * params.size, mat.emissive, 0.85 * params.intensity * flicker);
    softDot(ctx, px, py - 12 * params.size * flicker, 2.5 * params.size, '#ffffff', 0.7 * params.intensity);
  }
  ctx.restore();
};

export const candleFlamesEffect: EffectModule<CandleFlamesParams> = {
  id: 'candle-flames',
  name: 'Candle Flames',
  description: 'Row of small flickering candles.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'candle-flames-default',
    x: 1000,
    y: 820,
    seed: 217,
    count: 0.7,
    size: 1,
    spread: 1,
    material: createDefaultMaterial({
      name: 'Fire / Magma',
      baseColor: '#ff6a20',
      emissive: '#fff1c1',
      emissiveIntensity: 1.2,
      blend: 'additive',
    }),
  },
  draw: drawCandleFlames,
};
export const disposeCandleFlamesInstance = (id: string) => disposeMap(candlePools, id);

// ——— 18. Vortex ———
export interface VortexParams extends P {
  size: number;
  spin: number;
  arms: number;
}

export const drawVortex: DrawFn<VortexParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const arms = Math.max(2, Math.floor(2 + params.arms * 4));
  ctx.save();
  applyMaterial(ctx, mat);
  for (let a = 0; a < arms; a++) {
    ctx.beginPath();
    for (let s = 0; s <= 28; s++) {
      const u = s / 28;
      const ang = u * Math.PI * 4 + t * params.spin * 2 + (a / arms) * Math.PI * 2;
      const r = u * 90 * params.size;
      const x = params.x + Math.cos(ang) * r;
      const y = params.y + Math.sin(ang) * r * 0.55;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = withAlpha(a % 2 ? mat.emissive : mat.baseColor, 0.35 * params.intensity);
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  softDot(ctx, params.x, params.y, 18 * params.size, mat.emissive, 0.45 * params.intensity);
  ctx.restore();
};

export const vortexEffect: EffectModule<VortexParams> = {
  id: 'vortex',
  name: 'Vortex',
  description: 'Spiral whirlpool arms.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'vortex-default',
    x: 1000,
    y: 740,
    seed: 218,
    size: 1.15,
    spin: 1,
    arms: 0.7,
    material: createDefaultMaterial({
      name: 'Vortex',
      baseColor: '#4a6cff',
      emissive: '#a0d0ff',
      emissiveIntensity: 1,
      blend: 'additive',
    }),
  },
  draw: drawVortex,
};
export function disposeVortexInstance(_id: string): void {}

// ——— 19. Fairy Dust ———
export interface FairyDustParams extends P {
  density: number;
  size: number;
  sparkle: number;
}
interface DustBit {
  x: number;
  y: number;
  phase: number;
  speed: number;
}
const fairyPools = new Map<string, DustBit[]>();

export const drawFairyDust: DrawFn<FairyDustParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  let pool = fairyPools.get(params.instanceId) ?? [];
  const n = Math.floor(40 + params.density * 100);
  const rand = mulberry32(params.seed | 0);
  while (pool.length < n) {
    pool.push({
      x: (rand() - 0.5) * 200,
      y: (rand() - 0.5) * 150,
      phase: rand() * Math.PI * 2,
      speed: 0.5 + rand() * 1.2,
    });
  }
  pool.length = n;
  fairyPools.set(params.instanceId, pool);
  const dt = scene.dt || 1 / 60;
  ctx.save();
  applyMaterial(ctx, mat);
  for (const d of pool) {
    if (!scene.paused) {
      d.x += Math.sin(t * d.speed + d.phase) * 14 * dt;
      d.y += Math.cos(t * d.speed * 0.8 + d.phase) * 10 * dt - 8 * dt;
      if (d.y < -80) d.y = 80;
    }
    const tw = Math.max(0, Math.sin(t * (4 + params.sparkle * 6) + d.phase));
    softDot(
      ctx,
      params.x + d.x,
      params.y + d.y,
      (1.2 + tw * 2.5) * params.size,
      tw > 0.7 ? '#ffffff' : mat.emissive,
      (0.25 + tw * 0.7) * params.intensity,
    );
  }
  ctx.restore();
};

export const fairyDustEffect: EffectModule<FairyDustParams> = {
  id: 'fairy-dust',
  name: 'Fairy Dust',
  description: 'Sparkling magical motes.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'fairy-dust-default',
    x: 1000,
    y: 680,
    seed: 219,
    density: 0.85,
    size: 1,
    sparkle: 1,
    material: createDefaultMaterial({
      name: 'Fairy',
      baseColor: '#ffb0e8',
      emissive: '#ffe8ff',
      emissiveIntensity: 1.2,
      blend: 'additive',
    }),
  },
  draw: drawFairyDust,
};
export const disposeFairyDustInstance = (id: string) => disposeMap(fairyPools, id);

// ——— 20. Ground Crack ———
export interface GroundCrackParams extends P {
  size: number;
  branches: number;
  glow: number;
}

export const drawGroundCrack: DrawFn<GroundCrackParams> = (ctx, params, t) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const rand = mulberry32(params.seed | 0);
  const pulse = 0.7 + 0.3 * Math.sin(t * 3);
  ctx.save();
  applyMaterial(ctx, mat);
  const n = Math.max(3, Math.floor(3 + params.branches * 6));
  for (let b = 0; b < n; b++) {
    const ang = -Math.PI / 2 + (b / (n - 1) - 0.5) * 1.6;
    let x = params.x;
    let y = params.y;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segs = 6;
    for (let s = 0; s < segs; s++) {
      x += Math.cos(ang + (rand() - 0.5) * 0.8) * 18 * params.size;
      y += Math.sin(ang + (rand() - 0.5) * 0.5) * 10 * params.size + 8 * params.size;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = withAlpha(mat.baseColor, 0.75 * params.intensity);
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = withAlpha(mat.emissive, 0.45 * pulse * params.glow * params.intensity);
    ctx.lineWidth = 5;
    ctx.stroke();
  }
  softDot(ctx, params.x, params.y, 22 * params.size, mat.emissive, 0.4 * pulse * params.glow * params.intensity);
  ctx.restore();
};

export const groundCrackEffect: EffectModule<GroundCrackParams> = {
  id: 'ground-crack',
  name: 'Ground Crack',
  description: 'Glowing fissure cracks in the ground.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'ground-crack-default',
    x: 1000,
    y: 860,
    seed: 220,
    size: 1.2,
    branches: 0.8,
    glow: 1,
    material: createDefaultMaterial({
      name: 'Fire / Magma',
      baseColor: '#2a1810',
      emissive: '#ff6a20',
      emissiveIntensity: 1.2,
      blend: 'additive',
    }),
  },
  draw: drawGroundCrack,
};
export function disposeGroundCrackInstance(_id: string): void {}

export const PACK3_EFFECTS: EffectModule[] = [
  acidRainEffect as unknown as EffectModule,
  neonRainEffect as unknown as EffectModule,
  feathersEffect as unknown as EffectModule,
  coinRainEffect as unknown as EffectModule,
  ghostsEffect as unknown as EffectModule,
  soulWispsEffect as unknown as EffectModule,
  shieldBubbleEffect as unknown as EffectModule,
  magmaSprayEffect as unknown as EffectModule,
  crystalShardsEffect as unknown as EffectModule,
  rainRipplesEffect as unknown as EffectModule,
  smokeRingEffect as unknown as EffectModule,
  laserGridEffect as unknown as EffectModule,
  pixelGlitchEffect as unknown as EffectModule,
  jellyfishEffect as unknown as EffectModule,
  cometTrailEffect as unknown as EffectModule,
  beeSwarmEffect as unknown as EffectModule,
  candleFlamesEffect as unknown as EffectModule,
  vortexEffect as unknown as EffectModule,
  fairyDustEffect as unknown as EffectModule,
  groundCrackEffect as unknown as EffectModule,
];

export const PACK3_DISPOSE: Record<string, (id: string) => void> = {
  'acid-rain': disposeAcidRainInstance,
  'neon-rain': disposeNeonRainInstance,
  feathers: disposeFeathersInstance,
  'coin-rain': disposeCoinRainInstance,
  ghosts: disposeGhostsInstance,
  'soul-wisps': disposeSoulWispsInstance,
  'shield-bubble': disposeShieldBubbleInstance,
  'magma-spray': disposeMagmaSprayInstance,
  'crystal-shards': disposeCrystalShardsInstance,
  'rain-ripples': disposeRainRipplesInstance,
  'smoke-ring': disposeSmokeRingInstance,
  'laser-grid': disposeLaserGridInstance,
  'pixel-glitch': disposePixelGlitchInstance,
  jellyfish: disposeJellyfishInstance,
  'comet-trail': disposeCometTrailInstance,
  'bee-swarm': disposeBeeSwarmInstance,
  'candle-flames': disposeCandleFlamesInstance,
  vortex: disposeVortexInstance,
  'fairy-dust': disposeFairyDustInstance,
  'ground-crack': disposeGroundCrackInstance,
};
