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

/** Axis-aligned hit bounds in world space for a placed effect (generous for clicking). */
export function getPlacedBounds(
  typeId: string,
  params: PlacedEffectParams & Record<string, unknown>,
): WorldBounds {
  if (typeId === 'water') {
    const w = Number(params.width ?? 420);
    const h = Number(params.height ?? 160);
    return { x: params.x - w / 2 - 8, y: params.y - h / 2 - 8, w: w + 16, h: h + 16 };
  }
  if (typeId === 'smoke') {
    const s = Number(params.size ?? 1) * 110;
    return { x: params.x - s * 0.75, y: params.y - s * 2.1, w: s * 1.5, h: s * 2.4 };
  }
  if (typeId === 'fire') {
    const s = Number(params.size ?? 1) * 80;
    return { x: params.x - s * 0.7, y: params.y - s * 2.2, w: s * 1.4, h: s * 2.5 };
  }
  const s = Number(params.size ?? 1) * 70;
  return { x: params.x - s, y: params.y - s * 1.6, w: s * 2, h: s * 2.1 };
}

export function pointInBounds(px: number, py: number, b: WorldBounds): boolean {
  return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
}
