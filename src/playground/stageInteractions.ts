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
  hitPathPointIndex,
  isPathParams,
  worldToPathLocal,
  type PathPoint,
  pointInClosedPoly,
  pathWorldPoints,
} from '../core/path';
import { isSoilParams, closeSoilShape } from '../effects/soil';
import type { EffectRuntime } from './renderer';

export interface SelectionState {
  selectedId: string | null;
  dragging: boolean;
}

export interface StageInteractionApi {
  state: SelectionState;
  setSelected: (id: string | null, silent?: boolean) => void;
  dispose: () => void;
}

/**
 * Stage pointer handling:
 * - Click a creatable VFX → select
 * - Drag body → move
 * - Drag corner handles → scale
 * - Soil: click to add nodes (pathDrawing), drag node handles
 * - Drag empty space → pan camera
 * - Wheel → zoom (Shift+wheel scales selected)
 */
export function attachStageInteractions(
  el: HTMLElement,
  scene: SceneContext,
  runtimes: EffectRuntime[],
  onSelectionChange?: (id: string | null) => void,
): StageInteractionApi {
  const state: SelectionState = { selectedId: null, dragging: false };
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

  const appendPathPoint = (rt: EffectRuntime, wx: number, wy: number): void => {
    if (!isPathParams(rt.params)) return;
    const local = worldToPathLocal(rt.params, wx, wy);
    rt.params.points.push(local);
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

    // Path point handle on selected soil — click first node again to close shape
    const sel = selectedRuntime();
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

    if (sel && isPathParams(sel.params) && sel.params.points.length > 0) {
      const idx = hitPathPointIndex(sel.params, world.x, world.y, scene.camera.zoom);
      if (idx !== null) {
        setSelected(sel.id);
        mode = 'path-point';
        pathPointIndex = idx;
        state.dragging = true;
        el.style.cursor = 'crosshair';
        el.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
    }

    // Path drawing mode — click stage to append points
    if (sel && isPathParams(sel.params) && sel.params.pathDrawing) {
      appendPathPoint(sel, world.x, world.y);
      mode = 'none';
      state.dragging = false;
      e.preventDefault();
      return;
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

    // Hover cursor for path points
    if (!state.dragging) {
      const sel = selectedRuntime();
      if (sel && isPathParams(sel.params)) {
        const idx = hitPathPointIndex(sel.params, world.x, world.y, scene.camera.zoom);
        if (idx !== null) {
          el.style.cursor = 'crosshair';
          return;
        }
        if (sel.params.pathDrawing) {
          el.style.cursor = 'cell';
          return;
        }
      }
      if (el.style.cursor === 'crosshair' || el.style.cursor === 'cell') {
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
    if (!rt || !isSoilParams(rt.params)) return;
    if ((e.key === 'Enter' || e.key === 'NumpadEnter') && rt.params.points.length >= 3) {
      closeSoilShape(rt.params);
      e.preventDefault();
    } else if (e.key === 'Backspace' && rt.params.points.length > 0) {
      rt.params.points.pop();
      e.preventDefault();
    } else if (e.key === 'Escape') {
      if (rt.params.pathDrawing && rt.params.points.length >= 3) {
        closeSoilShape(rt.params);
      } else {
        rt.params.pathDrawing = false;
      }
      e.preventDefault();
    }
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });
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
      window.removeEventListener('keydown', onKeyDown, true);
    },
  };
}
