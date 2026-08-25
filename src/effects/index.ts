import type { BaseEffectParams, EffectModule, SceneContext } from '../core/types';
import { fireEffect, disposeFireInstance } from './fire';
import { smokeEffect, disposeSmokeInstance } from './smoke';
import { sparksEffect, disposeSparksInstance } from './sparks';
import { waterEffect, disposeWaterInstance } from './water';
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
  waterEffect as unknown as EffectModule,
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
  else if (typeId === 'water') disposeWaterInstance(instanceId);
}

const FIRE_HOT = ['#fff6d5', '#fff1c1', '#ffe29a', '#ffd27a'];
const FIRE_MID = ['#ff9a3c', '#ff8a1a', '#ffb347', '#ff7a18'];
const FIRE_COOL = ['#ff3b10', '#e63900', '#ff5a1f', '#cc2200'];
const SMOKE_DARK = ['#2a303a', '#3d4452', '#4a4038', '#343a46'];
const SMOKE_LIT = ['#8b95a8', '#a8b0c0', '#9a9088', '#7a8496'];
const WATER_DEEP = ['#0b2a44', '#071e33', '#0a3348', '#102a3c'];
const WATER_SHALLOW = ['#1a6b8c', '#1f7a8c', '#2a8aaa', '#148f9c'];
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
  base.intensity = 0.8 + Math.random() * 0.45;

  const jitterX = (Math.random() - 0.5) * 420;
  const jitterY = (Math.random() - 0.5) * 160;
  base.x = scene.camera.x + jitterX;
  base.y = Math.min(scene.worldHeight - 80, Math.max(280, scene.camera.y + 120 + jitterY));

  if (module.id === 'fire') {
    base.colorHot = pick(FIRE_HOT);
    base.colorMid = pick(FIRE_MID);
    base.colorCool = pick(FIRE_COOL);
    base.size = 0.85 + Math.random() * 0.7;
    base.spread = 0.7 + Math.random() * 0.8;
    base.rise = 0.75 + Math.random() * 0.7;
    base.turbulence = 0.55 + Math.random() * 0.7;
    base.embers = 0.45 + Math.random() * 0.55;
  } else if (module.id === 'smoke') {
    base.color = pick(SMOKE_DARK);
    base.colorLit = pick(SMOKE_LIT);
    base.size = 0.8 + Math.random() * 0.9;
    base.spread = 0.6 + Math.random() * 1.0;
    base.rise = 0.6 + Math.random() * 0.9;
    base.density = 0.55 + Math.random() * 0.45;
    base.turbulence = 0.5 + Math.random() * 0.7;
  } else if (module.id === 'sparks') {
    base.color = pick(SPARK_COLORS);
    base.size = 0.7 + Math.random() * 1.2;
    base.spread = 0.5 + Math.random() * 1.4;
    base.speed = 0.6 + Math.random() * 1.3;
    base.count = 0.45 + Math.random() * 0.55;
  } else if (module.id === 'water') {
    // Sit water on the street / low ground near camera
    base.y = Math.min(scene.worldHeight - 60, Math.max(760, scene.camera.y + 180 + jitterY * 0.3));
    base.width = 280 + Math.random() * 320;
    base.height = 90 + Math.random() * 110;
    base.colorDeep = pick(WATER_DEEP);
    base.colorShallow = pick(WATER_SHALLOW);
    base.colorFoam = '#d7f1ff';
    base.waveStrength = 0.55 + Math.random() * 0.7;
    base.waveScale = 0.7 + Math.random() * 0.8;
    base.reflectivity = 0.55 + Math.random() * 0.45;
    base.shoreFoam = 0.45 + Math.random() * 0.55;
  }

  return base;
}

export {
  fireEffect,
  smokeEffect,
  sparksEffect,
  waterEffect,
  rainEffect,
  hazardAtmosphereEffect,
  neonBloomEffect,
  embersEffect,
};
