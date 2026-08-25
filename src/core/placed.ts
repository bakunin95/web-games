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
  const width = Number(params.width ?? 0);
  const height = Number(params.height ?? 0);
  if (width > 0 && height > 0) {
    return {
      x: params.x - width / 2 - 10,
      y: params.y - height / 2 - 10,
      w: width + 20,
      h: height + 20,
    };
  }

  if (typeId === 'lightning') {
    const s = Number(params.size ?? 1) * 100;
    return { x: params.x - s * 0.5, y: params.y - s * 2.2, w: s, h: s * 2.4 };
  }
  if (typeId === 'god-rays') {
    const len = Number(params.length ?? 1) * 180;
    const spread = Number(params.spread ?? 1) * 80;
    return { x: params.x - spread, y: params.y - 20, w: spread * 2, h: len + 40 };
  }
  if (typeId === 'magic-aura' || typeId === 'frost') {
    const r = Number(params.radius ?? 1) * 90;
    return { x: params.x - r, y: params.y - r, w: r * 2, h: r * 2 };
  }
  if (typeId === 'electric-arcs') {
    const span = Number(params.span ?? 1) * 80;
    return { x: params.x - span - 20, y: params.y - 40, w: span * 2 + 40, h: 80 };
  }
  if (typeId === 'smoke') {
    const s = Number(params.size ?? 1) * 110;
    return { x: params.x - s * 0.75, y: params.y - s * 2.1, w: s * 1.5, h: s * 2.4 };
  }
  if (typeId === 'fire') {
    const s = Number(params.size ?? 1) * 80;
    return { x: params.x - s * 0.7, y: params.y - s * 2.2, w: s * 1.4, h: s * 2.5 };
  }
  if (typeId === 'meteor') {
    const s = Number(params.size ?? 1) * 100;
    return { x: params.x - s, y: params.y - s * 1.5, w: s * 2, h: s * 1.8 };
  }

  const s = Number(params.size ?? 1) * 80;
  return { x: params.x - s, y: params.y - s * 1.4, w: s * 2, h: s * 2 };
}

export function pointInBounds(px: number, py: number, b: WorldBounds): boolean {
  return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
}
