import type { BaseEffectParams, EffectModule, SceneContext } from '../core/types';
import { fireEffect, disposeFireInstance } from './fire';
import { smokeEffect, disposeSmokeInstance } from './smoke';
import { sparksEffect, disposeSparksInstance } from './sparks';
import { waterEffect, disposeWaterInstance } from './water';
import { rainEffect } from './rain';
import { hazardAtmosphereEffect } from './hazardAtmosphere';
import { neonBloomEffect } from './neonBloom';
import { embersEffect } from './embers';
import { MATERIAL_PRESETS, copyMaterial } from '../core/material';

export const BUILTIN_EFFECTS: EffectModule[] = [
  rainEffect as unknown as EffectModule,
  hazardAtmosphereEffect as unknown as EffectModule,
  embersEffect as unknown as EffectModule,
  neonBloomEffect as unknown as EffectModule,
];

export const CREATABLE_EFFECTS: EffectModule[] = [
  fireEffect as unknown as EffectModule,
  smokeEffect as unknown as EffectModule,
  sparksEffect as unknown as EffectModule,
  waterEffect as unknown as EffectModule,
];

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

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

const FIRE_PRESETS = ['Fire / Magma', 'Cold Plasma', 'Toxic Green'] as const;
const SMOKE_PRESETS = ['Ash Smoke', 'Oil Smoke'] as const;
const WATER_PRESETS = ['Clear Water', 'Murky Water'] as const;
const SPARK_PRESETS = ['Neon Sparks', 'Fire / Magma', 'Cold Plasma'] as const;

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
  base.intensity = 0.85 + Math.random() * 0.4;

  const jitterX = (Math.random() - 0.5) * 420;
  const jitterY = (Math.random() - 0.5) * 160;
  base.x = scene.camera.x + jitterX;
  base.y = Math.min(scene.worldHeight - 80, Math.max(280, scene.camera.y + 120 + jitterY));

  if (module.id === 'fire') {
    const preset = MATERIAL_PRESETS[pick([...FIRE_PRESETS])]!;
    base.material = copyMaterial(preset);
    base.size = 0.9 + Math.random() * 0.6;
    base.spread = 0.75 + Math.random() * 0.6;
    base.rise = 0.8 + Math.random() * 0.55;
    base.turbulence = 0.65 + Math.random() * 0.55;
    base.embers = 0.5 + Math.random() * 0.5;
  } else if (module.id === 'smoke') {
    const preset = MATERIAL_PRESETS[pick([...SMOKE_PRESETS])]!;
    base.material = copyMaterial(preset);
    base.size = 0.85 + Math.random() * 0.7;
    base.spread = 0.7 + Math.random() * 0.8;
    base.rise = 0.65 + Math.random() * 0.7;
    base.density = 0.6 + Math.random() * 0.4;
    base.turbulence = 0.55 + Math.random() * 0.6;
  } else if (module.id === 'sparks') {
    const preset = MATERIAL_PRESETS[pick([...SPARK_PRESETS])]!;
    base.material = copyMaterial(preset);
    base.size = 0.75 + Math.random() * 0.9;
    base.spread = 0.6 + Math.random() * 1.0;
    base.speed = 0.7 + Math.random() * 1.0;
    base.count = 0.5 + Math.random() * 0.5;
  } else if (module.id === 'water') {
    const preset = MATERIAL_PRESETS[pick([...WATER_PRESETS])]!;
    base.material = copyMaterial(preset);
    base.y = Math.min(scene.worldHeight - 60, Math.max(760, scene.camera.y + 180 + jitterY * 0.3));
    base.width = 300 + Math.random() * 280;
    base.height = 100 + Math.random() * 100;
    base.waveStrength = 0.6 + Math.random() * 0.6;
    base.waveScale = 0.75 + Math.random() * 0.7;
    base.shoreFoam = 0.5 + Math.random() * 0.5;
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
