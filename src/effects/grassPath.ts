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
  points: PathPoint[];
  smooth: number;
  pathDrawing: boolean;
  density: number;
  height: number;
  sway: number;
  /** Fill solid grass below the spline crest (hill silhouette). */
  fillHill: boolean;
  /** Depth below lowest path point for hill fill baseline. */
  hillDepth: number;
}

function drawBlade(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  nx: number,
  ny: number,
  h: number,
  lean: number,
  width: number,
  shade: number,
  t: number,
  swayAmt: number,
  mat: GrassPathParams['material'],
  intensity: number,
): void {
  const windSway = Math.sin(t * 2.4 + lean * 3) * swayAmt * h * 0.02;
  const tx = -ny;
  const ty = nx;
  const tipX = bx + (tx * windSway + nx * lean * 0.35) * h * 0.45;
  const tipY = by + (-h + ty * windSway * 0.3);
  const midX = bx + (tx * windSway * 0.5 + nx * lean * 0.2) * h * 0.25;
  const midY = by + tipY * 0.55 * 0.5 - h * 0.25;

  ctx.beginPath();
  ctx.moveTo(bx - width * 0.5, by);
  ctx.quadraticCurveTo(midX - width * 0.12, midY, tipX, tipY);
  ctx.quadraticCurveTo(midX + width * 0.12, midY, bx + width * 0.5, by);
  ctx.closePath();
  ctx.fillStyle = withAlpha(mat.baseColor, (0.5 + 0.45 * shade) * intensity);
  ctx.fill();
}

function sampleOpenPolyline(
  wp: { x: number; y: number }[],
  smooth: number,
  stepsPerSeg = 10,
): { x: number; y: number; nx: number; ny: number }[] {
  if (wp.length < 2) return [];
  const out: { x: number; y: number; nx: number; ny: number }[] = [];
  const n = wp.length;
  const total = (n - 1) * stepsPerSeg;
  for (let i = 0; i <= total; i++) {
    const t = i / total;
    const s = samplePath(wp, t, smooth);
    if (s) out.push({ x: s.x, y: s.y, nx: s.nx, ny: s.ny });
  }
  return out;
}

function drawGrassAlongPath(
  ctx: CanvasRenderingContext2D,
  params: GrassPathParams,
  wp: { x: number; y: number }[],
  t: number,
  sceneWind: number,
  clip = false,
): void {
  if (wp.length < 2) return;
  const mat = params.material;
  const I = params.intensity;
  const samples = sampleOpenPolyline(wp, params.smooth, 12);
  if (samples.length < 2) return;

  const rand = mulberry32(params.seed | 0);
  const bladeCount = Math.floor(8 + params.density * 48);
  const wind = sceneWind * params.sway;

  ctx.save();
  if (clip && params.fillHill) {
    let minX = wp[0]!.x;
    let maxX = wp[0]!.x;
    let maxY = wp[0]!.y;
    for (const p of wp) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const baseY = maxY + params.hillDepth * getScale(params);
    ctx.beginPath();
    ctx.moveTo(samples[0]!.x, samples[0]!.y);
    for (let i = 1; i < samples.length; i++) ctx.lineTo(samples[i]!.x, samples[i]!.y);
    ctx.lineTo(samples[samples.length - 1]!.x, baseY);
    ctx.lineTo(samples[0]!.x, baseY);
    ctx.closePath();
    ctx.clip();

    const g = ctx.createLinearGradient(0, samples[0]!.y, 0, baseY);
    g.addColorStop(0, withAlpha(mat.emissive, 0.35 * I));
    g.addColorStop(0.4, withAlpha(mat.baseColor, 0.85 * I));
    g.addColorStop(1, withAlpha(mat.baseColor, 0.95 * I));
    ctx.fillStyle = g;
    ctx.fillRect(minX - 20, samples[0]!.y - 20, maxX - minX + 40, baseY - samples[0]!.y + 40);
  }

  for (let i = 0; i < bladeCount; i++) {
    const u = rand();
    const idx = Math.min(samples.length - 1, Math.floor(u * samples.length));
    const s = samples[idx]!;
    const jitter = (rand() - 0.5) * 14;
    drawBlade(
      ctx,
      s.x + s.nx * jitter,
      s.y + s.ny * jitter * 0.4,
      s.nx,
      s.ny,
      (22 + rand() * 40) * params.height,
      (rand() - 0.5) * 0.6,
      1 + rand() * 1.6,
      0.5 + rand() * 0.5,
      t + rand() * 2,
      wind + Math.sin(t * 1.7) * 0.15,
      mat,
      I,
    );
  }

  if (params.fillHill) {
    const hillBlades = Math.floor(20 + params.density * 80);
    let minX = wp[0]!.x;
    let maxX = wp[0]!.x;
    let maxY = wp[0]!.y;
    for (const p of wp) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const baseY = maxY + params.hillDepth * getScale(params);
    for (let i = 0; i < hillBlades; i++) {
      const bx = minX + rand() * (maxX - minX);
      const by = samples[0]!.y + rand() * (baseY - samples[0]!.y);
      drawBlade(
        ctx,
        bx,
        by,
        0,
        -1,
        (18 + rand() * 36) * params.height,
        (rand() - 0.5) * 0.4,
        1 + rand() * 1.4,
        0.45 + rand() * 0.5,
        t + rand() * 3,
        wind * 0.8,
        mat,
        I * 0.92,
      );
    }
  }

  ctx.restore();
}

export const drawGrassPath: DrawFn<GrassPathParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  if (params.points.length < 2) return;

  const wp = pathWorldPoints(params);
  ctx.save();
  applyMaterial(ctx, params.material);
  drawGrassAlongPath(ctx, params, wp, t, scene.wind.x, true);
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
  const done = !params.pathDrawing && wp.length >= 2;

  ctx.save();
  if (wp.length >= 2) {
    ctx.strokeStyle = selected
      ? done
        ? 'rgba(120, 200, 80, 0.95)'
        : 'rgba(160, 230, 100, 0.8)'
      : 'rgba(80, 140, 60, 0.55)';
    ctx.lineWidth = 2.5 * inv;
    ctx.setLineDash(done ? [] : [6 * inv, 4 * inv]);
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
        ? 'Click stage to add nodes (need 2+)'
        : 'Enter or Done path · Shift+click add · right-click remove';
    ctx.fillText(hint, wp[0]!.x + 12 * inv, wp[0]!.y - 14 * inv);
  }
  ctx.restore();
}

export function closeGrassPath(params: GrassPathParams): boolean {
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
  description: 'Spline grass ridge — draw a path, optional hill fill below the crest.',
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
    density: 0.8,
    height: 1,
    sway: 1,
    fillHill: true,
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
    'pathDrawing' in p
  );
}
