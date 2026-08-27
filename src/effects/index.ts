import type { BaseEffectParams, EffectModule, SceneContext } from '../core/types';
import { MATERIAL_PRESETS, copyMaterial, createDefaultMaterial } from '../core/material';

import { fireEffect, disposeFireInstance } from './fire';
import { smokeEffect, disposeSmokeInstance } from './smoke';
import { sparksEffect, disposeSparksInstance } from './sparks';
import { waterEffect, disposeWaterInstance } from './water';
import { lightningEffect, disposeLightningInstance } from './lightning';
import { thundercloudsEffect, disposeThundercloudsInstance } from './thunderclouds';
import { snowEffect, disposeSnowInstance } from './snow';
import { fogBankEffect, disposeFogBankInstance } from './fogBank';
import { heatHazeEffect, disposeHeatHazeInstance } from './heatHaze';
import { sandstormEffect, disposeSandstormInstance } from './sandstorm';
import { dustMotesEffect, disposeDustMotesInstance } from './dustMotes';
import { godRaysEffect, disposeGodRaysInstance } from './godRays';
import { explosionEffect, disposeExplosionInstance } from './explosion';
import { shockwaveEffect, disposeShockwaveInstance } from './shockwave';
import { magicAuraEffect, disposeMagicAuraInstance } from './magicAura';
import { portalEffect, disposePortalInstance } from './portal';
import { electricArcsEffect, disposeElectricArcsInstance } from './electricArcs';
import { toxicGasEffect, disposeToxicGasInstance } from './toxicGas';
import { bloodMistEffect, disposeBloodMistInstance } from './bloodMist';
import { leavesEffect, disposeLeavesInstance } from './leaves';
import { firefliesEffect, disposeFirefliesInstance } from './fireflies';
import { causticsEffect, disposeCausticsInstance } from './caustics';
import { frostEffect, disposeFrostInstance } from './frost';
import { meteorEffect, disposeMeteorInstance } from './meteor';
import { PACK2_EFFECTS, PACK2_DISPOSE } from './pack2';
import { PACK3_EFFECTS, PACK3_DISPOSE } from './pack3';
import { CREATURE_EFFECTS, CREATURE_DISPOSE } from './creatures';

import { rainEffect } from './rain';
import { hazardAtmosphereEffect } from './hazardAtmosphere';
import { neonBloomEffect } from './neonBloom';
import { embersEffect } from './embers';
import { shatterEffect, disposeShatterInstance } from './shatter';
import { windowGlassShatterEffect, disposeWindowGlassShatterInstance } from './windowGlassShatter';
import { neonSignEffect, disposeNeonSignInstance } from './neonSign';

export const BUILTIN_EFFECTS: EffectModule[] = [
  rainEffect as unknown as EffectModule,
  hazardAtmosphereEffect as unknown as EffectModule,
  embersEffect as unknown as EffectModule,
  neonBloomEffect as unknown as EffectModule,
];

export const CREATABLE_EFFECTS: EffectModule[] = [
  neonSignEffect as unknown as EffectModule,
  windowGlassShatterEffect as unknown as EffectModule,
  fireEffect as unknown as EffectModule,
  smokeEffect as unknown as EffectModule,
  sparksEffect as unknown as EffectModule,
  waterEffect as unknown as EffectModule,
  lightningEffect as unknown as EffectModule,
  thundercloudsEffect as unknown as EffectModule,
  snowEffect as unknown as EffectModule,
  fogBankEffect as unknown as EffectModule,
  heatHazeEffect as unknown as EffectModule,
  sandstormEffect as unknown as EffectModule,
  dustMotesEffect as unknown as EffectModule,
  godRaysEffect as unknown as EffectModule,
  explosionEffect as unknown as EffectModule,
  shockwaveEffect as unknown as EffectModule,
  magicAuraEffect as unknown as EffectModule,
  portalEffect as unknown as EffectModule,
  electricArcsEffect as unknown as EffectModule,
  toxicGasEffect as unknown as EffectModule,
  bloodMistEffect as unknown as EffectModule,
  leavesEffect as unknown as EffectModule,
  firefliesEffect as unknown as EffectModule,
  causticsEffect as unknown as EffectModule,
  frostEffect as unknown as EffectModule,
  meteorEffect as unknown as EffectModule,
  shatterEffect as unknown as EffectModule,
  ...PACK2_EFFECTS,
  ...PACK3_EFFECTS,
  ...CREATURE_EFFECTS,
];

export const EFFECTS = BUILTIN_EFFECTS;

export function getCreatable(id: string): EffectModule | undefined {
  return CREATABLE_EFFECTS.find((e) => e.id === id);
}

const DISPOSE: Record<string, (id: string) => void> = {
  fire: disposeFireInstance,
  smoke: disposeSmokeInstance,
  sparks: disposeSparksInstance,
  water: disposeWaterInstance,
  lightning: disposeLightningInstance,
  thunderclouds: disposeThundercloudsInstance,
  snow: disposeSnowInstance,
  'fog-bank': disposeFogBankInstance,
  'heat-haze': disposeHeatHazeInstance,
  sandstorm: disposeSandstormInstance,
  'dust-motes': disposeDustMotesInstance,
  'god-rays': disposeGodRaysInstance,
  explosion: disposeExplosionInstance,
  shockwave: disposeShockwaveInstance,
  'magic-aura': disposeMagicAuraInstance,
  portal: disposePortalInstance,
  'electric-arcs': disposeElectricArcsInstance,
  'toxic-gas': disposeToxicGasInstance,
  'blood-mist': disposeBloodMistInstance,
  leaves: disposeLeavesInstance,
  fireflies: disposeFirefliesInstance,
  caustics: disposeCausticsInstance,
  frost: disposeFrostInstance,
  meteor: disposeMeteorInstance,
  shatter: disposeShatterInstance,
  'window-glass-shatter': disposeWindowGlassShatterInstance,
  'neon-sign': disposeNeonSignInstance,
  ...PACK2_DISPOSE,
  ...PACK3_DISPOSE,
  ...CREATURE_DISPOSE,
};

export function disposeInstancePools(typeId: string, instanceId: string): void {
  DISPOSE[typeId]?.(instanceId);
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Build unique params for a newly created VFX instance. */
export function createRandomizedParams(
  module: EffectModule,
  scene: SceneContext,
  counter: number,
): BaseEffectParams {
  const base = structuredClone(module.defaultParams) as BaseEffectParams & Record<string, unknown>;
  const instanceId = `${module.id}-${Date.now().toString(36)}-${counter}`;
  base.instanceId = instanceId;
  base.seed = (Math.random() * 1e9) | 0;
  base.enabled = true;
  base.intensity = 0.85 + Math.random() * 0.4;
  base.scale = 1;

  const jitterX = (Math.random() - 0.5) * 480;
  const jitterY = (Math.random() - 0.5) * 200;
  base.x = scene.camera.x + jitterX;
  base.y = Math.min(scene.worldHeight - 80, Math.max(260, scene.camera.y + 80 + jitterY));

  // Prefer module's own material; optionally swap related presets
  if (base.material && typeof base.material === 'object') {
    const name = String((base.material as { name?: string }).name ?? '');
    if (name && MATERIAL_PRESETS[name]) {
      base.material = copyMaterial(MATERIAL_PRESETS[name]!);
    }
  } else {
    base.material = createDefaultMaterial();
  }

  // Creature FX: occasionally swap to a related material preset
  if (module.id === 'bees' || module.id === 'bee-swarm') {
    base.material = copyMaterial(pick([MATERIAL_PRESETS['Bee Gold']!, MATERIAL_PRESETS['Carapace Dark']!]));
  } else if (module.id === 'mosquitoes') {
    base.material = copyMaterial(pick([MATERIAL_PRESETS.Mosquito!, MATERIAL_PRESETS['Carapace Dark']!]));
  } else if (module.id === 'small-animals') {
    base.material = copyMaterial(
      pick([
        MATERIAL_PRESETS['Fur Brown']!,
        MATERIAL_PRESETS['Feather Soft']!,
        MATERIAL_PRESETS['Frog Green']!,
      ]),
    );
  }

  // Light randomization of common numeric knobs when present
  for (const key of ['size', 'spread', 'density', 'radius', 'speed', 'count', 'drift', 'turbulence', 'buzz', 'wander', 'mix']) {
    if (typeof base[key] === 'number') {
      base[key] = Number(base[key]) * (0.85 + Math.random() * 0.35);
    }
  }
  if (typeof base.width === 'number') base.width = Number(base.width) * (0.85 + Math.random() * 0.35);
  if (typeof base.height === 'number') base.height = Number(base.height) * (0.85 + Math.random() * 0.35);

  // Water / fog / critters sit lower
  if (
    module.id === 'water' ||
    module.id === 'fog-bank' ||
    module.id === 'heat-haze' ||
    module.id === 'caustics' ||
    module.id === 'small-animals'
  ) {
    base.y = Math.min(scene.worldHeight - 60, Math.max(760, scene.camera.y + 160));
  }
  if (module.id === 'thunderclouds' || module.id === 'god-rays') {
    base.y = Math.max(280, scene.camera.y - 80 + jitterY * 0.3);
  }

  return base;
}

export {
  fireEffect,
  smokeEffect,
  sparksEffect,
  waterEffect,
  lightningEffect,
  thundercloudsEffect,
  snowEffect,
  fogBankEffect,
  heatHazeEffect,
  sandstormEffect,
  dustMotesEffect,
  godRaysEffect,
  explosionEffect,
  shockwaveEffect,
  magicAuraEffect,
  portalEffect,
  electricArcsEffect,
  toxicGasEffect,
  bloodMistEffect,
  leavesEffect,
  firefliesEffect,
  causticsEffect,
  frostEffect,
  meteorEffect,
  rainEffect,
  hazardAtmosphereEffect,
  neonBloomEffect,
  embersEffect,
  shatterEffect,
  windowGlassShatterEffect,
  neonSignEffect,
};
