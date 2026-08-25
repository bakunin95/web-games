import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { getScale } from '../core/placed';
import type { PathPoint } from '../core/path';
import {
  pathWorldPoints,
  samplePath,
  traceOpenPath,
  worldToPathLocal,
} from '../core/path';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { mulberry32, withAlpha } from './noise';

export interface GrassPathParams extends PlacedEffectParams {
  /** Open spline nodes — never closed. Offsets from anchor. */
  points: PathPoint[];
  smooth: number;
  /** While true, stage clicks append to the end of the open line. */
  pathDrawing: boolean;
  density: number;
  height: number;
  sway: number;
  /** Half-width of the grass ribbon along the path (world-ish units). */
  bandWidth: number;
  /** Optional: fill grass below the open crest line down to a baseline. */
  fillHill: boolean;
  hillDepth: number;
}

function drawBlade(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  nx: number,
  ny: number,
  tx: number,
  ty: number,
  h: number,
  lean: number,
  width: number,
  shade: number,
  t: number,
  swayAmt: number,
  mat: GrassPathParams['material'],
  intensity: number,
): void {
  const windSway = Math.sin(t * 2.4 + lean * 3) * swayAmt * h * 0.018;
  const leanOff = (lean + windSway) * h * 0.38;

  // Grow along path normal (ny ≤ 0 → upward on screen, same as ground grass patch)
  const tipX = bx + nx * h + tx * leanOff;
  const tipY = by + ny * h + ty * leanOff * 0.2;
  const midX = bx + nx * h * 0.52 + tx * leanOff * 0.45;
  const midY = by + ny * h * 0.52 + ty * leanOff * 0.1;

  ctx.beginPath();
  ctx.moveTo(bx - tx * width * 0.5, by - ty * width * 0.5);
  ctx.quadraticCurveTo(midX - nx * width * 0.14, midY - ny * width * 0.14, tipX, tipY);
  ctx.quadraticCurveTo(midX + nx * width * 0.14, midY + ny * width * 0.14, bx + tx * width * 0.5, by + ty * width * 0.5);
  ctx.closePath();
  ctx.fillStyle = withAlpha(mat.baseColor, (0.55 + 0.4 * shade) * intensity);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.quadraticCurveTo(midX, midY, tipX, tipY);
  ctx.strokeStyle = withAlpha(mat.emissive, 0.22 * intensity * shade);
  ctx.lineWidth = 0.85;
  ctx.stroke();
}

function sampleOpenPolyline(
  wp: { x: number; y: number }[],
  smooth: number,
  stepsPerSeg = 12,
): { x: number; y: number; nx: number; ny: number; tx: number; ty: number }[] {
  if (wp.length < 2) return [];
  const out: { x: number; y: number; nx: number; ny: number; tx: number; ty: number }[] = [];
  const n = wp.length;
  const total = (n - 1) * stepsPerSeg;
  for (let i = 0; i <= total; i++) {
    const t = i / total;
    const s = samplePath(wp, t, smooth);
    if (s) out.push({ x: s.x, y: s.y, nx: s.nx, ny: s.ny, tx: s.tx, ty: s.ty });
  }
  return out;
}

function drawGrassRibbon(
  ctx: CanvasRenderingContext2D,
  params: GrassPathParams,
  wp: { x: number; y: number }[],
  t: number,
  sceneWind: number,
): void {
  if (wp.length < 2) return;
  const mat = params.material;
  const I = params.intensity;
  const samples = sampleOpenPolyline(wp, params.smooth, 14);
  if (samples.length < 2) return;

  const rand = mulberry32(params.seed | 0);
  const wind = sceneWind * params.sway;
  const band = params.bandWidth * getScale(params);
  const bladeCount = Math.floor(28 + params.density * 110);

  for (let i = 0; i < bladeCount; i++) {
    const u = rand();
    const idx = Math.min(samples.length - 1, Math.floor(u * samples.length));
    const s = samples[idx]!;
    const lateral = (rand() - 0.5) * band;
    const h = (34 + rand() * 56) * params.height;
    drawBlade(
      ctx,
      s.x + s.nx * lateral,
      s.y + s.ny * lateral * 0.35,
      s.nx,
      s.ny,
      s.tx,
      s.ty,
      h,
      (rand() - 0.5) * 0.65,
      1.8 + rand() * 2.4,
      0.5 + rand() * 0.5,
      t + rand() * 2,
      wind + Math.sin(t * 1.7 + idx * 0.08) * 0.15,
      mat,
      I,
    );
  }

  // Second layer for thickness — slightly shorter, offset along normal
  for (let i = 0; i < Math.floor(bladeCount * 0.55); i++) {
    const u = rand();
    const idx = Math.min(samples.length - 1, Math.floor(u * samples.length));
    const s = samples[idx]!;
    const lateral = (rand() - 0.5) * band * 1.15;
    const h = (22 + rand() * 38) * params.height;
    drawBlade(
      ctx,
      s.x + s.nx * lateral,
      s.y + s.ny * lateral * 0.35 + s.ny * 4,
      s.nx,
      s.ny,
      s.tx,
      s.ty,
      h,
      (rand() - 0.5) * 0.5,
      1.5 + rand() * 2,
      0.4 + rand() * 0.45,
      t + rand() * 2.5,
      wind * 0.9,
      mat,
      I * 0.88,
    );
  }
}

function drawHillFillBelowPath(
  ctx: CanvasRenderingContext2D,
  params: GrassPathParams,
  wp: { x: number; y: number }[],
  samples: { x: number; y: number }[],
  t: number,
  sceneWind: number,
): void {
  if (!params.fillHill || samples.length < 2) return;
  const mat = params.material;
  const I = params.intensity;
  let minX = wp[0]!.x;
  let maxX = wp[0]!.x;
  let maxY = wp[0]!.y;
  for (const p of wp) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const baseY = maxY + params.hillDepth * getScale(params);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(samples[0]!.x, samples[0]!.y);
  for (let i = 1; i < samples.length; i++) ctx.lineTo(samples[i]!.x, samples[i]!.y);
  ctx.lineTo(samples[samples.length - 1]!.x, baseY);
  ctx.lineTo(samples[0]!.x, baseY);
  ctx.closePath();
  ctx.clip();

  const g = ctx.createLinearGradient(0, samples[0]!.y, 0, baseY);
  g.addColorStop(0, withAlpha(mat.emissive, 0.28 * I));
  g.addColorStop(0.45, withAlpha(mat.baseColor, 0.82 * I));
  g.addColorStop(1, withAlpha(mat.baseColor, 0.92 * I));
  ctx.fillStyle = g;
  ctx.fillRect(minX - 24, samples[0]!.y - 24, maxX - minX + 48, baseY - samples[0]!.y + 48);

  const rand = mulberry32((params.seed + 17) | 0);
  const hillBlades = Math.floor(24 + params.density * 90);
  const wind = sceneWind * params.sway * 0.85;
  for (let i = 0; i < hillBlades; i++) {
    const bx = minX + rand() * (maxX - minX);
    const by = samples[0]!.y + rand() * (baseY - samples[0]!.y);
    drawBlade(
      ctx,
      bx,
      by,
      0,
      -1,
      1,
      0,
      (22 + rand() * 40) * params.height,
      (rand() - 0.5) * 0.35,
      1.6 + rand() * 2.2,
      0.42 + rand() * 0.5,
      t + rand() * 3,
      wind,
      mat,
      I * 0.9,
    );
  }
  ctx.restore();
}

export const drawGrassPath: DrawFn<GrassPathParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  if (params.points.length < 2) return;

  const wp = pathWorldPoints(params);
  const samples = sampleOpenPolyline(wp, params.smooth, 14);

  ctx.save();
  applyMaterial(ctx, params.material);

  if (params.fillHill) {
    drawHillFillBelowPath(ctx, params, wp, samples, t, scene.wind.x);
  }
  drawGrassRibbon(ctx, params, wp, t, scene.wind.x);

  ctx.restore();
};

export function drawGrassPathGizmo(
  ctx: CanvasRenderingContext2D,
  params: GrassPathParams,
  zoom: number,
  selected: boolean,
  hoverNode = -1,
): void {
  const wp = pathWorldPoints(params);
  if (wp.length === 0) return;
  const inv = 1 / Math.max(0.35, zoom);

  ctx.save();
  if (wp.length >= 2) {
    ctx.strokeStyle = selected
      ? 'rgba(150, 230, 100, 0.9)'
      : 'rgba(90, 160, 70, 0.55)';
    ctx.lineWidth = 2.5 * inv;
    ctx.setLineDash(params.pathDrawing ? [6 * inv, 4 * inv] : []);
    ctx.beginPath();
    traceOpenPath(ctx, wp, params.smooth, 12);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const r = 8 * inv;
  for (let i = 0; i < wp.length; i++) {
    const p = wp[i]!;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    const hot = i === hoverNode;
    ctx.fillStyle = hot
      ? 'rgba(255, 240, 120, 0.98)'
      : selected
        ? 'rgba(180, 240, 100, 0.95)'
        : 'rgba(120, 190, 70, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(20, 50, 15, 0.9)';
    ctx.lineWidth = 1.5 * inv;
    ctx.stroke();
  }

  if (params.pathDrawing) {
    ctx.font = `${Math.round(12 * inv)}px sans-serif`;
    ctx.fillStyle = 'rgba(220, 255, 200, 0.95)';
    const hint =
      wp.length < 2
        ? 'Click stage to draw open line (need 2+ nodes)'
        : 'Click to extend line · Enter/Done when finished · drag nodes anytime';
    ctx.fillText(hint, wp[0]!.x + 12 * inv, wp[0]!.y - 14 * inv);
  }
  ctx.restore();
}

/** Stop appending clicks — path stays open, never closed. */
export function finishGrassPathDrawing(params: GrassPathParams): boolean {
  if (params.points.length < 2) return false;
  params.pathDrawing = false;
  return true;
}

export function removeGrassPathNode(params: GrassPathParams, index: number): void {
  if (index < 0 || index >= params.points.length) return;
  params.points.splice(index, 1);
  if (params.points.length < 2) params.pathDrawing = true;
}

export function appendGrassPathNode(params: GrassPathParams, wx: number, wy: number): void {
  params.points.push(worldToPathLocal(params, wx, wy));
}

export function disposeGrassPathInstance(_id: string): void {
  /* stateless */
}

export const grassPathEffect: EffectModule<GrassPathParams> = {
  id: 'grass-path',
  name: 'Grass Path',
  description: 'Open spline line — click to draw a grass ridge, drag nodes to edit. Optional hill fill below.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'grass-path-default',
    x: 1100,
    y: 880,
    seed: 52,
    points: [],
    smooth: 0.85,
    pathDrawing: true,
    density: 0.9,
    height: 1.15,
    sway: 1,
    bandWidth: 52,
    fillHill: false,
    hillDepth: 120,
    scale: 1,
    material: createDefaultMaterial({
      name: 'Grass Green',
      baseColor: '#3d8f2e',
      emissive: '#a8e06a',
      emissiveIntensity: 0.35,
      opacity: 1,
      roughness: 0.85,
      metalness: 0.05,
      blend: 'normal',
    }),
  },
  draw: drawGrassPath,
};

export function isGrassPathParams(p: unknown): p is GrassPathParams {
  return (
    typeof p === 'object' &&
    p !== null &&
    Array.isArray((p as GrassPathParams).points) &&
    'fillHill' in p &&
    'pathDrawing' in p &&
    'bandWidth' in p
  );
}

/** @deprecated alias */
export const closeGrassPath = finishGrassPathDrawing;
