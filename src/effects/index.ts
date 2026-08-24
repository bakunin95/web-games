import type { BaseEffectParams, EffectModule } from '../core/types';
import { rainEffect } from './rain';
import { hazardAtmosphereEffect } from './hazardAtmosphere';
import { neonBloomEffect } from './neonBloom';
import { embersEffect } from './embers';

/**
 * Registry of effect modules.
 * Typed loosely so specialized `draw` signatures remain assignable.
 */
export const EFFECTS: EffectModule[] = [
  rainEffect as unknown as EffectModule,
  hazardAtmosphereEffect as unknown as EffectModule,
  embersEffect as unknown as EffectModule,
  neonBloomEffect as unknown as EffectModule,
];

export function getEffect(id: string): EffectModule<BaseEffectParams> | undefined {
  return EFFECTS.find((e) => e.id === id);
}

export {
  rainEffect,
  hazardAtmosphereEffect,
  neonBloomEffect,
  embersEffect,
};
