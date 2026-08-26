import type { PlacedEffectParams } from './placed';
import { getScale } from './placed';

/**
 * Spline node with left/right Bezier handles (offsets from the node).
 * Left handle = incoming tangent; right handle = outgoing tangent.
 */
export interface PathPoint {
  ox: number;
  oy: number;
  /** Left handle offset (local). */
  lx: number;
  ly: number;
  /** Right handle offset (local). */
  rx: number;
  ry: number;
  /** If true, left/right are independent (sharp corner). */
  broken?: boolean;
}

export interface WorldPathPoint {
  x: number;
  y: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  broken?: boolean;
}

export function createPathPoint(ox: number, oy: number, hx = 40, hy = 0): PathPoint {
  return {
    ox,
    oy,
    lx: -hx,
    ly: -hy,
    rx: hx,
    ry: hy,
    broken: false,
  };
}

/** Ensure legacy points (ox/oy only) get default handles. */
export function normalizePathPoint(p: PathPoint | { ox: number; oy: number }): PathPoint {
  const pt = p as PathPoint;
  if (typeof pt.lx === 'number' && typeof pt.rx === 'number') return pt;
  return createPathPoint(pt.ox, pt.oy, 36, 0);
}

export function normalizePathPoints(points: PathPoint[]): void {
  for (let i = 0; i < points.length; i++) {
    points[i] = normalizePathPoint(points[i]!);
  }
}

export function pathWorldPoints(
  params: PlacedEffectParams & { points: PathPoint[] },
): { x: number; y: number }[] {
  const s = getScale(params);
  return params.points.map((p) => ({
    x: params.x + p.ox * s,
    y: params.y + p.oy * s,
  }));
}

export function pathWorldPointsFull(
  params: PlacedEffectParams & { points: PathPoint[] },
): WorldPathPoint[] {
  const s = getScale(params);
  normalizePathPoints(params.points);
  return params.points.map((p) => {
    const pt = normalizePathPoint(p);
    return {
      x: params.x + pt.ox * s,
      y: params.y + pt.oy * s,
      lx: pt.lx * s,
      ly: pt.ly * s,
      rx: pt.rx * s,
      ry: pt.ry * s,
      broken: pt.broken,
    };
  });
}

export function worldToPathLocal(
  params: PlacedEffectParams,
  wx: number,
  wy: number,
): { ox: number; oy: number } {
  const s = getScale(params);
  return { ox: (wx - params.x) / s, oy: (wy - params.y) / s };
}

/** Auto-fit left/right handles from neighbors (Catmull–Rom ≈ Bezier /6). */
export function autoFitHandles(points: PathPoint[], closed: boolean): void {
  normalizePathPoints(points);
  const n = points.length;
  if (n < 2) return;
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    if (p.broken) continue;
    const prev = closed
      ? points[(i - 1 + n) % n]!
      : points[Math.max(0, i - 1)]!;
    const next = closed
      ? points[(i + 1) % n]!
      : points[Math.min(n - 1, i + 1)]!;
    let dx = (next.ox - prev.ox) / 6;
    let dy = (next.oy - prev.oy) / 6;
    if (!closed) {
      if (i === 0) {
        dx = (next.ox - p.ox) / 3;
        dy = (next.oy - p.oy) / 3;
      } else if (i === n - 1) {
        dx = (p.ox - prev.ox) / 3;
        dy = (p.oy - prev.oy) / 3;
      }
    }
    p.rx = dx;
    p.ry = dy;
    p.lx = -dx;
    p.ly = -dy;
  }
}

/** Append a node and seed handles from the last segment. */
export function appendPathPoint(
  params: PlacedEffectParams & { points: PathPoint[] },
  wx: number,
  wy: number,
): void {
  normalizePathPoints(params.points);
  const local = worldToPathLocal(params, wx, wy);
  const pts = params.points;
  if (pts.length === 0) {
    pts.push(createPathPoint(local.ox, local.oy, 40, 0));
    return;
  }
  const prev = pts[pts.length - 1]!;
  const dx = local.ox - prev.ox;
  const dy = local.oy - prev.oy;
  const len = Math.hypot(dx, dy) || 1;
  const hl = Math.min(70, Math.max(24, len * 0.33));
  const hx = (dx / len) * hl;
  const hy = (dy / len) * hl;
  if (!prev.broken) {
    prev.rx = hx;
    prev.ry = hy;
    if (Math.hypot(prev.lx, prev.ly) < 1) {
      prev.lx = -hx;
      prev.ly = -hy;
    }
  }
  pts.push(createPathPoint(local.ox, local.oy, hx, hy));
}

export function insertPathPointAfter(
  params: PlacedEffectParams & { points: PathPoint[] },
  afterIndex: number,
  wx: number,
  wy: number,
): void {
  normalizePathPoints(params.points);
  const local = worldToPathLocal(params, wx, wy);
  const a = params.points[afterIndex]!;
  const b = params.points[afterIndex + 1] ?? a;
  const dx = b.ox - a.ox;
  const dy = b.oy - a.oy;
  const len = Math.hypot(dx, dy) || 1;
  const hl = Math.min(55, Math.max(20, len * 0.25));
  const hx = (dx / len) * hl;
  const hy = (dy / len) * hl;
  params.points.splice(afterIndex + 1, 0, createPathPoint(local.ox, local.oy, hx, hy));
}

export function removePathPoint(
  params: PlacedEffectParams & { points: PathPoint[] },
  index: number,
): void {
  if (index < 0 || index >= params.points.length) return;
  params.points.splice(index, 1);
}

function bezier(
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  p3x: number,
  p3y: number,
  u: number,
): { x: number; y: number; dx: number; dy: number } {
  const o = 1 - u;
  const o2 = o * o;
  const o3 = o2 * o;
  const u2 = u * u;
  const u3 = u2 * u;
  const x = o3 * p0x + 3 * o2 * u * p1x + 3 * o * u2 * p2x + u3 * p3x;
  const y = o3 * p0y + 3 * o2 * u * p1y + 3 * o * u2 * p2y + u3 * p3y;
  const dx =
    3 * o2 * (p1x - p0x) + 6 * o * u * (p2x - p1x) + 3 * u2 * (p3x - p2x);
  const dy =
    3 * o2 * (p1y - p0y) + 6 * o * u * (p2y - p1y) + 3 * u2 * (p3y - p2y);
  return { x, y, dx, dy };
}

function sampleBezierSeg(a: WorldPathPoint, b: WorldPathPoint, u: number) {
  return bezier(a.x, a.y, a.x + a.rx, a.y + a.ry, b.x + b.lx, b.y + b.ly, b.x, b.y, u);
}

/** Sample open Bezier path; t ∈ [0,1]. */
export function samplePath(
  points: WorldPathPoint[] | { x: number; y: number }[],
  t: number,
  _smooth = 1,
): { x: number; y: number; tx: number; ty: number; nx: number; ny: number } | null {
  const n = points.length;
  if (n < 2) return null;
  const full = ensureWorldHandles(points);
  const tt = Math.max(0, Math.min(1, t));
  const f = tt * (n - 1);
  const seg = Math.min(n - 2, Math.max(0, Math.floor(f)));
  const u = f - seg;
  const s = sampleBezierSeg(full[seg]!, full[seg + 1]!, u);
  const len = Math.hypot(s.dx, s.dy) || 1;
  const tx = s.dx / len;
  const ty = s.dy / len;
  let nx = -ty;
  let ny = tx;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: s.x, y: s.y, tx, ty, nx, ny };
}

function ensureWorldHandles(
  points: WorldPathPoint[] | { x: number; y: number }[],
): WorldPathPoint[] {
  if (points.length === 0) return [];
  const first = points[0] as WorldPathPoint;
  if (typeof first.rx === 'number' && typeof first.lx === 'number') {
    return points as WorldPathPoint[];
  }
  // Legacy {x,y} only — invent temporary handles
  const n = points.length;
  const out: WorldPathPoint[] = [];
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(n - 1, i + 1)]!;
    let dx = (next.x - prev.x) / 6;
    let dy = (next.y - prev.y) / 6;
    if (i === 0) {
      dx = (next.x - p.x) / 3;
      dy = (next.y - p.y) / 3;
    } else if (i === n - 1) {
      dx = (p.x - prev.x) / 3;
      dy = (p.y - prev.y) / 3;
    }
    out.push({ x: p.x, y: p.y, lx: -dx, ly: -dy, rx: dx, ry: dy });
  }
  return out;
}

/** Sample closed Bezier loop; t ∈ [0,1). */
export function sampleClosedPath(
  points: WorldPathPoint[] | { x: number; y: number }[],
  t: number,
  _smooth = 1,
): { x: number; y: number } | null {
  const n = points.length;
  if (n < 2) return null;
  if (n < 3) {
    const a = points[0]!;
    const b = points[1]!;
    const u = ((t % 1) + 1) % 1;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  }
  const full = ensureWorldHandles(points);
  const tt = ((t % 1) + 1) % 1;
  const f = tt * n;
  const seg = Math.min(n - 1, Math.floor(f));
  const u = f - seg;
  const a = full[seg]!;
  const b = full[(seg + 1) % n]!;
  const s = sampleBezierSeg(a, b, u);
  return { x: s.x, y: s.y };
}

/** @deprecated kept for callers that still pass plain points + smooth */
export function sampleClosedSegment(
  points: { x: number; y: number }[],
  seg: number,
  u: number,
  _smooth: number,
): { x: number; y: number } {
  const full = ensureWorldHandles(points);
  const n = full.length;
  const s = sampleBezierSeg(full[seg % n]!, full[(seg + 1) % n]!, u);
  return { x: s.x, y: s.y };
}

export function traceClosedPath(
  ctx: CanvasRenderingContext2D,
  points: WorldPathPoint[] | { x: number; y: number }[],
  _smooth = 1,
  stepsPerEdge = 14,
): boolean {
  const n = points.length;
  if (n < 3) return false;
  const full = ensureWorldHandles(points);
  const total = n * stepsPerEdge;
  const s0 = sampleClosedPath(full, 0)!;
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i <= total; i++) {
    const s = sampleClosedPath(full, i / total)!;
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  return true;
}

export function traceOpenPath(
  ctx: CanvasRenderingContext2D,
  points: WorldPathPoint[] | { x: number; y: number }[],
  _smooth = 1,
  stepsPerEdge = 14,
): void {
  if (points.length < 2) {
    if (points.length === 1) ctx.moveTo(points[0]!.x, points[0]!.y);
    return;
  }
  const full = ensureWorldHandles(points);
  const n = full.length;
  const total = (n - 1) * stepsPerEdge;
  const s0 = samplePath(full, 0)!;
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i <= total; i++) {
    const s = samplePath(full, i / total)!;
    ctx.lineTo(s.x, s.y);
  }
}

export function pathBounds(
  params: PlacedEffectParams & { points: PathPoint[] },
  margin = 40,
): { x: number; y: number; w: number; h: number } {
  const wp = pathWorldPointsFull(params);
  if (wp.length === 0) {
    return { x: params.x - margin, y: params.y - margin, w: margin * 2, h: margin * 2 };
  }
  let minX = wp[0]!.x;
  let maxX = wp[0]!.x;
  let minY = wp[0]!.y;
  let maxY = wp[0]!.y;
  for (const p of wp) {
    minX = Math.min(minX, p.x, p.x + p.lx, p.x + p.rx);
    maxX = Math.max(maxX, p.x, p.x + p.lx, p.x + p.rx);
    minY = Math.min(minY, p.y, p.y + p.ly, p.y + p.ry);
    maxY = Math.max(maxY, p.y, p.y + p.ly, p.y + p.ry);
  }
  return {
    x: minX - margin,
    y: minY - margin,
    w: maxX - minX + margin * 2,
    h: maxY - minY + margin * 2,
  };
}

export function hitPathPointIndex(
  params: PlacedEffectParams & { points: PathPoint[] },
  wx: number,
  wy: number,
  zoom: number,
): number | null {
  const r = 14 / Math.max(0.35, zoom);
  const wp = pathWorldPoints(params);
  for (let i = wp.length - 1; i >= 0; i--) {
    const p = wp[i]!;
    if (Math.hypot(wx - p.x, wy - p.y) <= r) return i;
  }
  return null;
}

export type TangentSide = 'left' | 'right';

export function hitPathTangentHandle(
  params: PlacedEffectParams & { points: PathPoint[] },
  wx: number,
  wy: number,
  zoom: number,
): { index: number; side: TangentSide } | null {
  const r = 12 / Math.max(0.35, zoom);
  const wp = pathWorldPointsFull(params);
  for (let i = wp.length - 1; i >= 0; i--) {
    const p = wp[i]!;
    if (Math.hypot(wx - (p.x + p.rx), wy - (p.y + p.ry)) <= r) {
      return { index: i, side: 'right' };
    }
    if (Math.hypot(wx - (p.x + p.lx), wy - (p.y + p.ly)) <= r) {
      return { index: i, side: 'left' };
    }
  }
  return null;
}

/** Set a tangent handle in world space; mirrors opposite unless broken/Alt. */
export function setPathTangentWorld(
  params: PlacedEffectParams & { points: PathPoint[] },
  index: number,
  side: TangentSide,
  wx: number,
  wy: number,
  mirror: boolean,
): void {
  normalizePathPoints(params.points);
  const pt = params.points[index];
  if (!pt) return;
  const s = getScale(params);
  const dx = (wx - (params.x + pt.ox * s)) / s;
  const dy = (wy - (params.y + pt.oy * s)) / s;
  if (side === 'right') {
    pt.rx = dx;
    pt.ry = dy;
    if (mirror && !pt.broken) {
      pt.lx = -dx;
      pt.ly = -dy;
    }
  } else {
    pt.lx = dx;
    pt.ly = dy;
    if (mirror && !pt.broken) {
      pt.rx = -dx;
      pt.ry = -dy;
    }
  }
}

export function hitClosedPathEdge(
  points: WorldPathPoint[] | { x: number; y: number }[],
  wx: number,
  wy: number,
  _smooth: number,
  threshold: number,
): { afterIndex: number; x: number; y: number } | null {
  const full = ensureWorldHandles(points);
  const n = full.length;
  if (n < 2) return null;
  const steps = 16;
  let best: { afterIndex: number; x: number; y: number; d: number } | null = null;
  for (let seg = 0; seg < n; seg++) {
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const p = sampleBezierSeg(full[seg]!, full[(seg + 1) % n]!, u);
      const d = Math.hypot(wx - p.x, wy - p.y);
      if (d <= threshold && (!best || d < best.d)) {
        best = { afterIndex: seg, x: p.x, y: p.y, d };
      }
    }
  }
  return best ? { afterIndex: best.afterIndex, x: best.x, y: best.y } : null;
}

export function hitOpenPathEdge(
  points: WorldPathPoint[] | { x: number; y: number }[],
  wx: number,
  wy: number,
  _smooth: number,
  threshold: number,
): { afterIndex: number; x: number; y: number } | null {
  const full = ensureWorldHandles(points);
  const n = full.length;
  if (n < 2) return null;
  let best: { afterIndex: number; x: number; y: number; d: number } | null = null;
  const steps = 16;
  for (let seg = 0; seg < n - 1; seg++) {
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const p = sampleBezierSeg(full[seg]!, full[seg + 1]!, u);
      const d = Math.hypot(wx - p.x, wy - p.y);
      if (d <= threshold && (!best || d < best.d)) {
        best = { afterIndex: seg, x: p.x, y: p.y, d };
      }
    }
  }
  return best ? { afterIndex: best.afterIndex, x: best.x, y: best.y } : null;
}

export function pointInClosedPoly(
  points: { x: number; y: number }[],
  px: number,
  py: number,
): boolean {
  const n = points.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i]!.x;
    const yi = points[i]!.y;
    const xj = points[j]!.x;
    const yj = points[j]!.y;
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isPathParams(p: unknown): p is PlacedEffectParams & {
  points: PathPoint[];
  pathDrawing?: boolean;
} {
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof (p as PlacedEffectParams).x === 'number' &&
    Array.isArray((p as { points?: unknown }).points)
  );
}

/** Draw left/right tangent handle lines + knobs for selected path. */
export function drawPathTangentGizmo(
  ctx: CanvasRenderingContext2D,
  params: PlacedEffectParams & { points: PathPoint[] },
  zoom: number,
  color = 'rgba(200, 220, 255, 0.85)',
  hover: { index: number; side: TangentSide } | null = null,
): void {
  const wp = pathWorldPointsFull(params);
  if (wp.length === 0) return;
  const inv = 1 / Math.max(0.35, zoom);
  const knobR = 5.5 * inv;

  ctx.save();
  for (let i = 0; i < wp.length; i++) {
    const p = wp[i]!;
    const lx = p.x + p.lx;
    const ly = p.y + p.ly;
    const rx = p.x + p.rx;
    const ry = p.y + p.ry;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25 * inv;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(p.x, p.y);
    ctx.lineTo(rx, ry);
    ctx.stroke();

    const drawKnob = (kx: number, ky: number, side: TangentSide) => {
      const hot = hover?.index === i && hover.side === side;
      ctx.beginPath();
      ctx.arc(kx, ky, knobR, 0, Math.PI * 2);
      ctx.fillStyle = hot ? 'rgba(255, 255, 200, 0.98)' : 'rgba(230, 240, 255, 0.95)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(20, 30, 50, 0.85)';
      ctx.lineWidth = 1.2 * inv;
      ctx.stroke();
    };
    drawKnob(lx, ly, 'left');
    drawKnob(rx, ry, 'right');
  }
  ctx.restore();
}
