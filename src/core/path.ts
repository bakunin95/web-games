import type { PlacedEffectParams } from './placed';
import { getScale } from './placed';

/** Control point offset from effect anchor (world = anchor + offset * scale). */
export interface PathPoint {
  ox: number;
  oy: number;
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

export function worldToPathLocal(
  params: PlacedEffectParams,
  wx: number,
  wy: number,
): PathPoint {
  const s = getScale(params);
  return { ox: (wx - params.x) / s, oy: (wy - params.y) / s };
}

function wrapPoint<T extends { x: number; y: number }>(points: T[], i: number): T {
  const n = points.length;
  return points[((i % n) + n) % n]!;
}

/** Catmull–Rom on one segment of a closed loop (seg = edge from point seg → seg+1). */
function sampleClosedSegment(
  points: { x: number; y: number }[],
  seg: number,
  u: number,
  smooth: number,
): { x: number; y: number } {
  const n = points.length;
  if (n < 3) {
    const a = points[seg]!;
    const b = points[(seg + 1) % n]!;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  }
  const p0 = wrapPoint(points, seg - 1);
  const p1 = wrapPoint(points, seg);
  const p2 = wrapPoint(points, seg + 1);
  const p3 = wrapPoint(points, seg + 2);

  if (smooth <= 0.05) {
    return { x: p1.x + (p2.x - p1.x) * u, y: p1.y + (p2.y - p1.y) * u };
  }

  const t2 = u * u;
  const t3 = t2 * u;
  const cx =
    0.5 *
    (2 * p1.x +
      (-p0.x + p2.x) * u +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  const cy =
    0.5 *
    (2 * p1.y +
      (-p0.y + p2.y) * u +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  const px = p1.x + (p2.x - p1.x) * u;
  const py = p1.y + (p2.y - p1.y) * u;
  return {
    x: px * (1 - smooth) + cx * smooth,
    y: py * (1 - smooth) + cy * smooth,
  };
}

/** Sample closed loop; t ∈ [0,1) — one full revolution. */
export function sampleClosedPath(
  points: { x: number; y: number }[],
  t: number,
  smooth: number,
): { x: number; y: number } | null {
  const n = points.length;
  if (n < 2) return null;
  const tt = ((t % 1) + 1) % 1;
  const f = tt * n;
  const seg = Math.min(n - 1, Math.max(0, Math.floor(f)));
  const u = f - seg;
  if (n >= 3) return sampleClosedSegment(points, seg, u, smooth);
  const a = points[0]!;
  const b = points[1]!;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

/** Open path sample (legacy / grass along line). */
export function samplePath(
  points: { x: number; y: number }[],
  t: number,
  smooth: number,
): { x: number; y: number; tx: number; ty: number; nx: number; ny: number } | null {
  if (points.length < 2) return null;
  const n = points.length;
  const seg = Math.min(n - 1, Math.max(0, Math.floor(t * (n - 1))));
  const u = t * (n - 1) - seg;
  const p0 = points[Math.max(0, seg - 1)]!;
  const p1 = points[seg]!;
  const p2 = points[Math.min(n - 1, seg + 1)]!;
  const p3 = points[Math.min(n - 1, seg + 2)]!;

  let x: number;
  let y: number;
  let dx: number;
  let dy: number;

  if (smooth > 0.05 && n >= 3) {
    const t2 = u * u;
    const t3 = t2 * u;
    x =
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * u +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
    y =
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * u +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
    const du = 0.001;
    const tA = Math.max(0, Math.min(1, t - du));
    const tB = Math.min(1, t + du);
    const a = samplePathPoly(points, tA);
    const b = samplePathPoly(points, tB);
    dx = b.x - a.x;
    dy = b.y - a.y;
    const blend = smooth;
    const px = samplePathPoly(points, t);
    x = px.x * (1 - blend) + x * blend;
    y = px.y * (1 - blend) + y * blend;
  } else {
    const q = samplePathPoly(points, t);
    x = q.x;
    y = q.y;
    const t2 = Math.min(1, t + 0.002);
    const q2 = samplePathPoly(points, t2);
    dx = q2.x - q.x;
    dy = q2.y - q.y;
  }

  const len = Math.hypot(dx, dy) || 1;
  const tx = dx / len;
  const ty = dy / len;
  let nx = -ty;
  let ny = tx;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x, y, tx, ty, nx, ny };
}

function samplePathPoly(
  points: { x: number; y: number }[],
  t: number,
): { x: number; y: number } {
  const n = points.length;
  if (n === 1) return points[0]!;
  const f = t * (n - 1);
  const seg = Math.min(n - 2, Math.max(0, Math.floor(f)));
  const u = f - seg;
  const a = points[seg]!;
  const b = points[seg + 1]!;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

/** Trace a closed spline into the current path (does not stroke/fill). */
export function traceClosedPath(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  smooth: number,
  stepsPerEdge = 14,
): boolean {
  const n = points.length;
  if (n < 3) return false;
  const total = n * stepsPerEdge;
  const s0 = sampleClosedPath(points, 0, smooth)!;
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i <= total; i++) {
    const s = sampleClosedPath(points, i / total, smooth)!;
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  return true;
}

/** Trace open polyline (while still drawing nodes). */
export function traceOpenPath(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  smooth: number,
  stepsPerEdge = 14,
): void {
  if (points.length < 2) {
    if (points.length === 1) ctx.moveTo(points[0]!.x, points[0]!.y);
    return;
  }
  const n = points.length;
  if (smooth <= 0.05 || n < 3) {
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < n; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
    return;
  }
  const total = (n - 1) * stepsPerEdge;
  const s0 = samplePath(points, 0, smooth)!;
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i <= total; i++) {
    const s = samplePath(points, i / total, smooth)!;
    ctx.lineTo(s.x, s.y);
  }
}

export function pathBounds(
  params: PlacedEffectParams & { points: PathPoint[] },
  margin = 40,
): { x: number; y: number; w: number; h: number } {
  const wp = pathWorldPoints(params);
  if (wp.length === 0) {
    return { x: params.x - margin, y: params.y - margin, w: margin * 2, h: margin * 2 };
  }
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
  const r = 18 / Math.max(0.35, zoom);
  const wp = pathWorldPoints(params);
  for (let i = wp.length - 1; i >= 0; i--) {
    const p = wp[i]!;
    if (Math.hypot(wx - p.x, wy - p.y) <= r) return i;
  }
  return null;
}

/** Nearest point on closed spline edge for inserting a node. */
export function hitClosedPathEdge(
  points: { x: number; y: number }[],
  wx: number,
  wy: number,
  smooth: number,
  threshold: number,
): { afterIndex: number; x: number; y: number } | null {
  const n = points.length;
  if (n < 2) return null;
  const steps = 14;
  let best: { afterIndex: number; x: number; y: number; d: number } | null = null;
  for (let seg = 0; seg < n; seg++) {
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const p =
        n >= 3
          ? sampleClosedSegment(points, seg, u, smooth)
          : {
              x: points[seg]!.x + (points[(seg + 1) % n]!.x - points[seg]!.x) * u,
              y: points[seg]!.y + (points[(seg + 1) % n]!.y - points[seg]!.y) * u,
            };
      const d = Math.hypot(wx - p.x, wy - p.y);
      if (d <= threshold && (!best || d < best.d)) {
        best = { afterIndex: seg, x: p.x, y: p.y, d };
      }
    }
  }
  return best ? { afterIndex: best.afterIndex, x: best.x, y: best.y } : null;
}

/** Nearest point on open spline edge for inserting a node. */
export function hitOpenPathEdge(
  points: { x: number; y: number }[],
  wx: number,
  wy: number,
  smooth: number,
  threshold: number,
): { afterIndex: number; x: number; y: number } | null {
  const n = points.length;
  if (n < 2) return null;
  let best: { afterIndex: number; x: number; y: number; d: number } | null = null;
  const steps = 14;
  for (let seg = 0; seg < n - 1; seg++) {
    for (let s = 0; s <= steps; s++) {
      const t = (seg + s / steps) / (n - 1);
      const sp = samplePath(points, t, smooth);
      if (!sp) continue;
      const d = Math.hypot(wx - sp.x, wy - sp.y);
      if (d <= threshold && (!best || d < best.d)) {
        best = { afterIndex: seg, x: sp.x, y: sp.y, d };
      }
    }
  }
  return best ? { afterIndex: best.afterIndex, x: best.x, y: best.y } : null;
}

export function insertPathPointAfter(
  params: PlacedEffectParams & { points: PathPoint[] },
  afterIndex: number,
  wx: number,
  wy: number,
): void {
  const local = worldToPathLocal(params, wx, wy);
  params.points.splice(afterIndex + 1, 0, local);
}

export function appendPathPoint(
  params: PlacedEffectParams & { points: PathPoint[] },
  wx: number,
  wy: number,
): void {
  params.points.push(worldToPathLocal(params, wx, wy));
}

export function removePathPoint(
  params: PlacedEffectParams & { points: PathPoint[] },
  index: number,
): void {
  if (index < 0 || index >= params.points.length) return;
  params.points.splice(index, 1);
}

/** Ray-cast point-in-polygon (closed polyline of control points). */
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
