import type { BaseEffectParams, EffectModule, SceneContext } from '../core/types';
import { fireEffect, disposeFireInstance } from './fire';
import { smokeEffect, disposeSmokeInstance } from './smoke';
import { sparksEffect, disposeSparksInstance } from './sparks';
import { rainEffect } from './rain';
import { hazardAtmosphereEffect } from './hazardAtmosphere';
import { neonBloomEffect } from './neonBloom';
import { embersEffect } from './embers';

/** Always-on atmospheric demos (not spawned via Create VFX). */
export const BUILTIN_EFFECTS: EffectModule[] = [
  rainEffect as unknown as EffectModule,
  hazardAtmosphereEffect as unknown as EffectModule,
  embersEffect as unknown as EffectModule,
  neonBloomEffect as unknown as EffectModule,
];

/**
 * Templates you can spawn with the Create VFX button.
 * Each spawn gets a fresh instanceId + randomized seed/colors/position.
 */
export const CREATABLE_EFFECTS: EffectModule[] = [
  fireEffect as unknown as EffectModule,
  smokeEffect as unknown as EffectModule,
  sparksEffect as unknown as EffectModule,
];

/** @deprecated use BUILTIN_EFFECTS — kept for console helpers */
export const EFFECTS = BUILTIN_EFFECTS;

export function getCreatable(id: string): EffectModule | undefined {
  return CREATABLE_EFFECTS.find((e) => e.id === id);
}

export function disposeInstancePools(typeId: string, instanceId: string): void {
  if (typeId === 'fire') disposeFireInstance(instanceId);
  else if (typeId === 'smoke') disposeSmokeInstance(instanceId);
  else if (typeId === 'sparks') disposeSparksInstance(instanceId);
}

const FIRE_HOT = ['#ffe29a', '#ffd27a', '#fff1c1', '#ffb347'];
const FIRE_COOL = ['#ff5a1f', '#ff3d00', '#ff7a18', '#e63900', '#ff4fd8'];
const SMOKE_COLORS = ['#6a7388', '#8a909c', '#4a5568', '#9aa3b5', '#5c4a42'];
const SPARK_COLORS = ['#ffd36a', '#fff4b0', '#ff8a3d', '#7af0ff', '#ff4fd8', '#b8ff6a'];

function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}

function pick<T>(arr: T[]): T {
  return arr[randInt(arr.length)]!;
}

/** Build unique params for a newly created VFX instance. */
export function createRandomizedParams(
  module: EffectModule,
  scene: SceneContext,
  counter: number,
): BaseEffectParams {
  const base = structuredClone(module.defaultParams) as BaseEffectParams & Record<string, unknown>;
  const instanceId = `${module.id}-${Date.now().toString(36)}-${counter}`;
  const seed = (Math.random() * 1e9) | 0;

  base.instanceId = instanceId;
  base.seed = seed;
  base.enabled = true;
  base.intensity = 0.75 + Math.random() * 0.55;

  // Spawn near camera center with jitter so it shows up immediately
  const jitterX = (Math.random() - 0.5) * 420;
  const jitterY = (Math.random() - 0.5) * 160;
  base.x = scene.camera.x + jitterX;
  base.y = Math.min(scene.worldHeight - 80, Math.max(280, scene.camera.y + 120 + jitterY));

  if (module.id === 'fire') {
    base.colorHot = pick(FIRE_HOT);
    base.colorCool = pick(FIRE_COOL);
    base.size = 0.7 + Math.random() * 1.1;
    base.spread = 0.6 + Math.random() * 1.2;
    base.rise = 0.6 + Math.random() * 1.1;
  } else if (module.id === 'smoke') {
    base.color = pick(SMOKE_COLORS);
    base.size = 0.7 + Math.random() * 1.3;
    base.spread = 0.5 + Math.random() * 1.4;
    base.rise = 0.5 + Math.random() * 1.2;
    base.density = 0.45 + Math.random() * 0.55;
  } else if (module.id === 'sparks') {
    base.color = pick(SPARK_COLORS);
    base.size = 0.7 + Math.random() * 1.2;
    base.spread = 0.5 + Math.random() * 1.4;
    base.speed = 0.6 + Math.random() * 1.3;
    base.count = 0.45 + Math.random() * 0.55;
  }

  return base;
}

export {
  fireEffect,
  smokeEffect,
  sparksEffect,
  rainEffect,
  hazardAtmosphereEffect,
  neonBloomEffect,
  embersEffect,
};
