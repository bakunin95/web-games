import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import type { PathPoint } from '../core/path';
import {
  pathWorldPoints,
  sampleClosedPath,
  traceClosedPath,
  traceOpenPath,
} from '../core/path';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { fbm2, mulberry32, withAlpha, lerpColor } from './noise';

export interface SoilParams extends PlacedEffectParams {
  /** Closed spline nodes (offsets from anchor). Click stage to add while pathDrawing. */
  points: PathPoint[];
  /** Catmull–Rom smoothness 0–1 (0 = straight edges). */
  smooth: number;
  /** Subtle soil grain / patch variation 0–1 */
  texture: number;
  /** While true, stage clicks append nodes. Enter or Done when ≥3 nodes closes fill. */
  pathDrawing: boolean;
}

function shapeReady(params: SoilParams): boolean {
  return params.points.length >= 3 && !params.pathDrawing;
}

function drawSolidSoilFill(
  ctx: CanvasRenderingContext2D,
  wp: { x: number; y: number }[],
  params: SoilParams,
): void {
  const mat = params.material;
  const I = params.intensity;
  let minX = wp[0]!.x;
  let maxX = wp[0]!.x;
  let minY = wp[0]!.y;
  let maxY = wp[0]!.y;
  for (const p of wp) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  ctx.save();
  ctx.beginPath();
  traceClosedPath(ctx, wp, params.smooth, 16);
  ctx.clip();

  const deep = lerpColor(mat.baseColor, '#1a120c', 0.35);
  const mid = mat.baseColor;
  const light = lerpColor(mat.emissive, mat.baseColor, 0.55);

  const g = ctx.createLinearGradient(0, minY, 0, maxY);
  g.addColorStop(0, withAlpha(light, 0.95 * I));
  g.addColorStop(0.35, withAlpha(mid, 0.98 * I));
  g.addColorStop(1, withAlpha(deep, I));
  ctx.fillStyle = g;
  ctx.fillRect(minX - 8, minY - 8, maxX - minX + 16, maxY - minY + 16);

  const patches = Math.floor(18 + params.texture * 40);
  const rand = mulberry32(params.seed | 0);
  for (let i = 0; i < patches; i++) {
    const u = rand();
    const s = sampleClosedPath(wp, u, params.smooth);
    if (!s) continue;
    const n1 = fbm2(i * 0.7, params.seed * 0.02, 2, params.seed + 3);
    const cx = s.x + (rand() - 0.5) * 48;
    const cy = s.y + (rand() - 0.5) * 36;
    const rw = 16 + Math.abs(n1) * 42;
    const rh = 10 + Math.abs(n1) * 28;
    const a = (0.06 + params.texture * 0.12) * I;
    const blob = ctx.createRadialGradient(cx, cy, 0, cx, cy, rw);
    const col = i % 3 === 0 ? deep : i % 3 === 1 ? mid : light;
    blob.addColorStop(0, withAlpha(col, a * 0.8));
    blob.addColorStop(0.55, withAlpha(col, a * 0.35));
    blob.addColorStop(1, withAlpha(col, 0));
    ctx.fillStyle = blob;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export const drawSoil: DrawFn<SoilParams> = (ctx, params, _t, _scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  if (!shapeReady(params)) return;

  const wp = pathWorldPoints(params);
  ctx.save();
  applyMaterial(ctx, params.material);
  ctx.globalCompositeOperation = 'source-over';

  ctx.beginPath();
  traceClosedPath(ctx, wp, params.smooth, 16);
  ctx.fillStyle = withAlpha(params.material.baseColor, params.intensity);
  ctx.fill();

  drawSolidSoilFill(ctx, wp, params);

  ctx.beginPath();
  traceClosedPath(ctx, wp, params.smooth, 16);
  ctx.strokeStyle = withAlpha('#120c08', 0.35 * params.intensity);
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
};

export function drawSoilGizmo(
  ctx: CanvasRenderingContext2D,
  params: SoilParams,
  zoom: number,
  selected: boolean,
): void {
  const wp = pathWorldPoints(params);
  if (wp.length === 0) return;
  const inv = 1 / Math.max(0.35, zoom);
  const ready = shapeReady(params);

  ctx.save();
  if (wp.length >= 2) {
    ctx.strokeStyle = selected
      ? ready
        ? 'rgba(180, 130, 70, 0.9)'
        : 'rgba(220, 170, 90, 0.75)'
      : 'rgba(120, 90, 55, 0.5)';
    ctx.lineWidth = 2.5 * inv;
    ctx.setLineDash(ready ? [] : [6 * inv, 4 * inv]);
    ctx.beginPath();
    if (ready && wp.length >= 3) {
      traceClosedPath(ctx, wp, params.smooth, 12);
    } else {
      traceOpenPath(ctx, wp, params.smooth, 12);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const r = 8 * inv;
  for (let i = 0; i < wp.length; i++) {
    const p = wp[i]!;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = selected ? 'rgba(210, 160, 90, 0.95)' : 'rgba(160, 120, 70, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(30, 20, 12, 0.9)';
    ctx.lineWidth = 1.5 * inv;
    ctx.stroke();
  }

  if (params.pathDrawing && wp.length >= 1 && wp.length < 3) {
    ctx.font = `${Math.round(12 * inv)}px sans-serif`;
    ctx.fillStyle = 'rgba(232, 220, 200, 0.9)';
    const hint = wp.length === 1 ? 'Add nodes… (need 3+ to fill)' : 'One more node to close';
    ctx.fillText(hint, wp[0]!.x + 12 * inv, wp[0]!.y - 14 * inv);
  }
  ctx.restore();
}

export function disposeSoilInstance(_id: string): void {
  /* stateless */
}

export const soilEffect: EffectModule<SoilParams> = {
  id: 'soil',
  name: 'Soil',
  description:
    'Closed spline earth — add nodes, drag to sculpt, solid soil fill for hills and mounds.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'soil-default',
    x: 1100,
    y: 900,
    seed: 61,
    points: [],
    smooth: 0.88,
    texture: 0.55,
    pathDrawing: true,
    scale: 1,
    material: createDefaultMaterial({
      name: 'Soil',
      baseColor: '#5c4030',
      emissive: '#8a6848',
      emissiveIntensity: 0.25,
      opacity: 1,
      roughness: 0.95,
      metalness: 0.02,
      blend: 'normal',
    }),
  },
  draw: drawSoil,
};

export function isSoilParams(p: PlacedEffectParams): p is SoilParams {
  return Array.isArray((p as SoilParams).points) && 'texture' in p;
}
