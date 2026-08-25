import type { BaseEffectParams } from './types';
import type { EffectMaterial } from './material';
import { createDefaultMaterial } from './material';

/** Params shared by placeable / selectable creatable VFX. */
export interface PlacedEffectParams extends BaseEffectParams {
  instanceId: string;
  x: number;
  y: number;
  seed: number;
  material: EffectMaterial;
}

export function isPlacedParams(p: BaseEffectParams): p is PlacedEffectParams {
  return (
    typeof (p as PlacedEffectParams).x === 'number' &&
    typeof (p as PlacedEffectParams).y === 'number' &&
    typeof (p as PlacedEffectParams).instanceId === 'string' &&
    !!(p as PlacedEffectParams).material
  );
}

export function ensureMaterial(p: PlacedEffectParams): EffectMaterial {
  if (!p.material) p.material = createDefaultMaterial();
  return p.material;
}

export interface WorldBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Axis-aligned hit bounds in world space for a placed effect. */
export function getPlacedBounds(
  typeId: string,
  params: PlacedEffectParams & Record<string, unknown>,
): WorldBounds {
  if (typeId === 'water') {
    const w = Number(params.width ?? 420);
    const h = Number(params.height ?? 160);
    return { x: params.x - w / 2, y: params.y - h / 2, w, h };
  }
  if (typeId === 'smoke') {
    const s = Number(params.size ?? 1) * 70;
    return { x: params.x - s * 0.6, y: params.y - s * 1.6, w: s * 1.2, h: s * 2 };
  }
  if (typeId === 'fire') {
    const s = Number(params.size ?? 1) * 50;
    return { x: params.x - s * 0.55, y: params.y - s * 1.8, w: s * 1.1, h: s * 2.1 };
  }
  // sparks default
  const s = Number(params.size ?? 1) * 40;
  return { x: params.x - s, y: params.y - s * 1.4, w: s * 2, h: s * 1.8 };
}

export function pointInBounds(px: number, py: number, b: WorldBounds): boolean {
  return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
}
