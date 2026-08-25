import type { BaseEffectParams } from './types';
import type { EffectMaterial } from './material';
import { createDefaultMaterial } from './material';

/** Params shared by placeable / selectable creatable VFX. */
export interface PlacedEffectParams extends BaseEffectParams {
  instanceId: string;
  x: number;
  y: number;
  seed: number;
  /** Uniform visual scale (1 = default). */
  scale?: number;
  material: EffectMaterial;
}

export function getScale(params: PlacedEffectParams): number {
  const s = params.scale;
  return typeof s === 'number' && Number.isFinite(s) ? Math.max(0.15, Math.min(5, s)) : 1;
}

export function ensureScale(params: PlacedEffectParams): number {
  if (typeof params.scale !== 'number' || !Number.isFinite(params.scale)) {
    params.scale = 1;
  }
  return getScale(params);
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
  const scale = getScale(params);
  let raw: WorldBounds;

  const width = Number(params.width ?? 0);
  const height = Number(params.height ?? 0);
  if (width > 0 && height > 0) {
    raw = {
      x: params.x - width / 2 - 10,
      y: params.y - height / 2 - 10,
      w: width + 20,
      h: height + 20,
    };
  } else if (typeId === 'lightning') {
    const s = Number(params.size ?? 1) * 100;
    raw = { x: params.x - s * 0.5, y: params.y - s * 2.2, w: s, h: s * 2.4 };
  } else if (typeId === 'god-rays') {
    const len = Number(params.length ?? 1) * 180;
    const spread = Number(params.spread ?? 1) * 80;
    raw = { x: params.x - spread, y: params.y - 20, w: spread * 2, h: len + 40 };
  } else if (typeId === 'magic-aura' || typeId === 'frost') {
    const r = Number(params.radius ?? 1) * 90;
    raw = { x: params.x - r, y: params.y - r, w: r * 2, h: r * 2 };
  } else if (typeId === 'electric-arcs') {
    const span = Number(params.span ?? 1) * 80;
    raw = { x: params.x - span - 20, y: params.y - 40, w: span * 2 + 40, h: 80 };
  } else if (typeId === 'smoke') {
    const s = Number(params.size ?? 1) * 110;
    raw = { x: params.x - s * 0.75, y: params.y - s * 2.1, w: s * 1.5, h: s * 2.4 };
  } else if (typeId === 'fire') {
    const s = Number(params.size ?? 1) * 80;
    raw = { x: params.x - s * 0.7, y: params.y - s * 2.2, w: s * 1.4, h: s * 2.5 };
  } else if (typeId === 'meteor') {
    const s = Number(params.size ?? 1) * 100;
    raw = { x: params.x - s, y: params.y - s * 1.5, w: s * 2, h: s * 1.8 };
  } else {
    const s = Number(params.size ?? 1) * 80;
    raw = { x: params.x - s, y: params.y - s * 1.4, w: s * 2, h: s * 2 };
  }

  if (scale === 1) return raw;
  const cx = params.x;
  const cy = params.y;
  return {
    x: cx + (raw.x - cx) * scale,
    y: cy + (raw.y - cy) * scale,
    w: raw.w * scale,
    h: raw.h * scale,
  };
}

export type ScaleHandle = 'nw' | 'ne' | 'sw' | 'se';

export function getScaleHandles(
  bounds: WorldBounds,
  zoom: number,
): Record<ScaleHandle, { x: number; y: number; r: number }> {
  const r = 10 / Math.max(0.35, zoom);
  return {
    nw: { x: bounds.x, y: bounds.y, r },
    ne: { x: bounds.x + bounds.w, y: bounds.y, r },
    sw: { x: bounds.x, y: bounds.y + bounds.h, r },
    se: { x: bounds.x + bounds.w, y: bounds.y + bounds.h, r },
  };
}

export function hitScaleHandle(
  wx: number,
  wy: number,
  bounds: WorldBounds,
  zoom: number,
): ScaleHandle | null {
  const handles = getScaleHandles(bounds, zoom);
  for (const key of ['se', 'sw', 'ne', 'nw'] as ScaleHandle[]) {
    const h = handles[key];
    if (Math.hypot(wx - h.x, wy - h.y) <= h.r * 1.4) return key;
  }
  return null;
}

export function pointInBounds(px: number, py: number, b: WorldBounds): boolean {
  return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
}
