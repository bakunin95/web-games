import type { SceneContext } from '../core/types';
import { screenToWorld } from '../core/types';
import { clampCamera } from '../core/scene';
import {
  ensureScale,
  getPlacedBounds,
  getScale,
  hitScaleHandle,
  isPlacedParams,
  pointInBounds,
  type ScaleHandle,
} from '../core/placed';
import {
  appendPathPoint,
  hitClosedPathEdge,
  hitOpenPathEdge,
  hitPathPointIndex,
  insertPathPointAfter,
  isPathParams,
  removePathPoint,
  worldToPathLocal,
  type PathPoint,
  pointInClosedPoly,
  pathWorldPoints,
} from '../core/path';
import {
  isSoilParams,
  closeSoilShape,
  removeSoilNode,
  appendSoilNode,
} from '../effects/soil';
import {
  isGrassPathParams,
  closeGrassPath,
  removeGrassPathNode,
  appendGrassPathNode,
} from '../effects/grassPath';
import type { EffectRuntime } from './renderer';

export interface SelectionState {
  selectedId: string | null;
  dragging: boolean;
  pathHoverNode: number;
  pathActiveNode: number;
}

export interface StageInteractionApi {
  state: SelectionState;
  setSelected: (id: string | null, silent?: boolean) => void;
  dispose: () => void;
}

function isSplineEffect(rt: EffectRuntime | undefined): boolean {
  return rt?.module.id === 'soil' || rt?.module.id === 'grass-path';
}

function pathSmooth(rt: EffectRuntime): number {
  return Number((rt.params as { smooth?: number }).smooth ?? 0.85);
}

function removeNodeAt(rt: EffectRuntime, index: number): void {
  if (isSoilParams(rt.params)) removeSoilNode(rt.params, index);
  else if (isGrassPathParams(rt.params)) removeGrassPathNode(rt.params, index);
  else removePathPoint(rt.params as never, index);
}

function appendNode(rt: EffectRuntime, wx: number, wy: number): void {
  if (isSoilParams(rt.params)) appendSoilNode(rt.params, wx, wy);
  else if (isGrassPathParams(rt.params)) appendGrassPathNode(rt.params, wx, wy);
  else appendPathPoint(rt.params as never, wx, wy);
}

function closePathShape(rt: EffectRuntime): boolean {
  if (isSoilParams(rt.params)) return closeSoilShape(rt.params);
  if (isGrassPathParams(rt.params)) return closeGrassPath(rt.params);
  return false;
}

function minNodesToFinish(rt: EffectRuntime): number {
  return rt.module.id === 'soil' ? 3 : 2;
}

function tryInsertOnEdge(rt: EffectRuntime, wx: number, wy: number, zoom: number): boolean {
  const wp = pathWorldPoints(rt.params as never);
  if (wp.length < 2) return false;
  const threshold = 16 / Math.max(0.35, zoom);
  const smooth = pathSmooth(rt);
  const edge =
    rt.module.id === 'soil'
      ? hitClosedPathEdge(wp, wx, wy, smooth, threshold)
      : hitOpenPathEdge(wp, wx, wy, smooth, threshold);
  if (!edge) return false;
  insertPathPointAfter(rt.params as never, edge.afterIndex, edge.x, edge.y);
  return true;
}

/**
 * Stage pointer handling:
 * - Soil / Grass Path: click add nodes, drag handles, edge click insert, right-click remove
 * - Drag empty space → pan camera
 */
export function attachStageInteractions(
  el: HTMLElement,
  scene: SceneContext,
  runtimes: EffectRuntime[],
  onSelectionChange?: (id: string | null) => void,
): StageInteractionApi {
  const state: SelectionState = {
    selectedId: null,
    dragging: false,
    pathHoverNode: -1,
    pathActiveNode: -1,
  };
  let mode: 'none' | 'pan' | 'move' | 'scale' | 'path-point' = 'none';
  let lastX = 0;
  let lastY = 0;
  let scaleStart = 1;
  let scaleDist0 = 1;
  let pathPointIndex = -1;

  const setSelected = (id: string | null, silent = false) => {
    state.selectedId = id;
    if (!silent) onSelectionChange?.(id);
  };

  const selectedRuntime = (): EffectRuntime | undefined =>
    runtimes.find((r) => r.id === state.selectedId);

  const hitTest = (clientX: number, clientY: number): EffectRuntime | null => {
    const rect = el.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const world = screenToWorld(scene, sx, sy);

    for (let i = runtimes.length - 1; i >= 0; i--) {
      const rt = runtimes[i]!;
      if (!rt.removable || !rt.params.enabled) continue;
      if (!isPlacedParams(rt.params)) continue;
      if (rt.module.id === 'soil' && isSoilParams(rt.params)) {
        const wp = pathWorldPoints(rt.params);
        const ready = rt.params.points.length >= 3 && !rt.params.pathDrawing;
        if (ready && pointInClosedPoly(wp, world.x, world.y)) return rt;
      }
      if (rt.module.id === 'grass-path' && isGrassPathParams(rt.params)) {
        const bounds = getPlacedBounds(rt.module.id, rt.params as never);
        if (pointInBounds(world.x, world.y, bounds)) return rt;
      }
      const bounds = getPlacedBounds(rt.module.id, rt.params as never);
      if (pointInBounds(world.x, world.y, bounds)) return rt;
    }
    return null;
  };

  const hitSelectedHandle = (clientX: number, clientY: number): ScaleHandle | null => {
    if (!state.selectedId) return null;
    const rt = selectedRuntime();
    if (!rt || !isPlacedParams(rt.params)) return null;
    const rect = el.getBoundingClientRect();
    const world = screenToWorld(scene, clientX - rect.left, clientY - rect.top);
    const bounds = getPlacedBounds(rt.module.id, rt.params as never);
    return hitScaleHandle(world.x, world.y, bounds, scene.camera.zoom);
  };

  const onDown = (e: PointerEvent) => {
    if (
      (e.target as HTMLElement).closest(
        '.tp-dfwv, #panel, .create-menu, .chrome, .create-btn, .ghost-btn, .reset-btn',
      )
    ) {
      return;
    }
    lastX = e.clientX;
    lastY = e.clientY;

    const rect = el.getBoundingClientRect();
    const world = screenToWorld(scene, e.clientX - rect.left, e.clientY - rect.top);
    const sel = selectedRuntime();

    // Right-click node → remove
    if (e.button === 2 && sel && isPathParams(sel.params)) {
      const idx = hitPathPointIndex(sel.params, world.x, world.y, scene.camera.zoom);
      if (idx !== null) {
        removeNodeAt(sel, idx);
        state.pathActiveNode = -1;
        e.preventDefault();
        return;
      }
    }

    const handle = hitSelectedHandle(e.clientX, e.clientY);
    if (handle && state.selectedId) {
      const rt = selectedRuntime();
      if (rt && isPlacedParams(rt.params)) {
        mode = 'scale';
        state.dragging = true;
        scaleStart = ensureScale(rt.params);
        scaleDist0 = Math.max(8, Math.hypot(world.x - rt.params.x, world.y - rt.params.y));
        el.style.cursor = 'nwse-resize';
        el.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
    }

    // Soil: click first node to close
    if (sel && isSoilParams(sel.params) && sel.params.pathDrawing && sel.params.points.length >= 3) {
      const closeIdx = hitPathPointIndex(sel.params, world.x, world.y, scene.camera.zoom);
      if (closeIdx === 0) {
        closeSoilShape(sel.params);
        mode = 'none';
        state.dragging = false;
        e.preventDefault();
        return;
      }
    }

    if (sel && isSplineEffect(sel) && isPathParams(sel.params)) {
      const nodeIdx = hitPathPointIndex(sel.params, world.x, world.y, scene.camera.zoom);
      if (nodeIdx !== null && !e.shiftKey) {
        setSelected(sel.id);
        mode = 'path-point';
        pathPointIndex = nodeIdx;
        state.pathActiveNode = nodeIdx;
        state.dragging = true;
        el.style.cursor = 'crosshair';
        el.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }

      // Shift+click or edge click → add / insert node
      if (e.shiftKey) {
        appendNode(sel, world.x, world.y);
        state.pathActiveNode = sel.params.points.length - 1;
        mode = 'none';
        state.dragging = false;
        e.preventDefault();
        return;
      }

      if (tryInsertOnEdge(sel, world.x, world.y, scene.camera.zoom)) {
        state.pathActiveNode = state.pathHoverNode >= 0 ? state.pathHoverNode : sel.params.points.length - 1;
        mode = 'none';
        state.dragging = false;
        e.preventDefault();
        return;
      }

      if (sel.params.pathDrawing) {
        appendNode(sel, world.x, world.y);
        state.pathActiveNode = sel.params.points.length - 1;
        mode = 'none';
        state.dragging = false;
        e.preventDefault();
        return;
      }
    }

    const hit = hitTest(e.clientX, e.clientY);
    if (hit && isPlacedParams(hit.params)) {
      setSelected(hit.id);
      mode = 'move';
      state.dragging = true;
      el.style.cursor = 'grabbing';
    } else {
      setSelected(null);
      mode = 'pan';
      state.dragging = true;
      el.style.cursor = 'grabbing';
    }
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onMove = (e: PointerEvent) => {
    const rect = el.getBoundingClientRect();
    const world = screenToWorld(scene, e.clientX - rect.left, e.clientY - rect.top);

    if (!state.dragging) {
      const sel = selectedRuntime();
      state.pathHoverNode = -1;
      if (sel && isPathParams(sel.params)) {
        const idx = hitPathPointIndex(sel.params, world.x, world.y, scene.camera.zoom);
        if (idx !== null) {
          state.pathHoverNode = idx;
          el.style.cursor = 'crosshair';
          return;
        }
        if (isSplineEffect(sel)) {
          const wp = pathWorldPoints(sel.params);
          const threshold = 16 / Math.max(0.35, scene.camera.zoom);
          const smooth = pathSmooth(sel);
          const onEdge =
            sel.module.id === 'soil'
              ? hitClosedPathEdge(wp, world.x, world.y, smooth, threshold)
              : hitOpenPathEdge(wp, world.x, world.y, smooth, threshold);
          if (onEdge) {
            el.style.cursor = 'copy';
            return;
          }
        }
        if (sel.params.pathDrawing) {
          el.style.cursor = 'cell';
          return;
        }
      }
      if (el.style.cursor === 'crosshair' || el.style.cursor === 'cell' || el.style.cursor === 'copy') {
        el.style.cursor = '';
      }
    }

    if (!state.dragging || mode === 'none') return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    if (mode === 'pan') {
      scene.camera.x -= dx / scene.camera.zoom;
      scene.camera.y -= dy / scene.camera.zoom;
      clampCamera(scene.camera, scene);
      return;
    }

    if (mode === 'path-point' && state.selectedId && pathPointIndex >= 0) {
      const rt = selectedRuntime();
      if (rt && isPathParams(rt.params)) {
        const pt = rt.params.points[pathPointIndex] as PathPoint | undefined;
        if (pt) {
          const local = worldToPathLocal(rt.params, world.x, world.y);
          pt.ox = local.ox;
          pt.oy = local.oy;
        }
      }
      return;
    }

    if (mode === 'move' && state.selectedId) {
      const rt = selectedRuntime();
      if (!rt || !isPlacedParams(rt.params)) return;
      rt.params.x += dx / scene.camera.zoom;
      rt.params.y += dy / scene.camera.zoom;
      return;
    }

    if (mode === 'scale' && state.selectedId) {
      const rt = selectedRuntime();
      if (!rt || !isPlacedParams(rt.params)) return;
      const dist = Math.max(8, Math.hypot(world.x - rt.params.x, world.y - rt.params.y));
      rt.params.scale = Math.max(0.2, Math.min(4.5, scaleStart * (dist / scaleDist0)));
    }
  };

  const onUp = (e: PointerEvent) => {
    state.dragging = false;
    mode = 'none';
    pathPointIndex = -1;
    el.style.cursor = '';
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (e.shiftKey && state.selectedId) {
      const rt = selectedRuntime();
      if (rt && isPlacedParams(rt.params)) {
        const cur = getScale(rt.params);
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        rt.params.scale = Math.max(0.2, Math.min(4.5, cur * factor));
        return;
      }
    }
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    scene.camera.zoom *= factor;
    clampCamera(scene.camera, scene);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target as HTMLElement).isContentEditable
    ) {
      return;
    }
    const rt = selectedRuntime();
    if (!rt || !isSplineEffect(rt)) return;
    if (!isPathParams(rt.params)) return;

    const minFinish = minNodesToFinish(rt);
    if ((e.key === 'Enter' || e.key === 'NumpadEnter') && rt.params.points.length >= minFinish) {
      closePathShape(rt);
      e.preventDefault();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const idx =
        state.pathActiveNode >= 0
          ? state.pathActiveNode
          : state.pathHoverNode >= 0
            ? state.pathHoverNode
            : rt.params.points.length - 1;
      if (idx >= 0) {
        removeNodeAt(rt, idx);
        state.pathActiveNode = -1;
      }
      e.preventDefault();
    } else if (e.key === 'Escape') {
      if (rt.params.pathDrawing && rt.params.points.length >= minFinish) {
        closePathShape(rt);
      } else {
        rt.params.pathDrawing = false;
      }
      e.preventDefault();
    }
  };

  const onContextMenu = (e: MouseEvent) => {
    const sel = selectedRuntime();
    if (!sel || !isPathParams(sel.params)) return;
    const rect = el.getBoundingClientRect();
    const world = screenToWorld(scene, e.clientX - rect.left, e.clientY - rect.top);
    const idx = hitPathPointIndex(sel.params, world.x, world.y, scene.camera.zoom);
    if (idx !== null) e.preventDefault();
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown, true);

  return {
    state,
    setSelected,
    dispose() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown, true);
    },
  };
}
