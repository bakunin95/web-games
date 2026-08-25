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
  let mode: 'none' | 'pan' | 'move' | 'scale' = 'none';
  let lastX = 0;
  let lastY = 0;
  let scaleStart = 1;
  let scaleDist0 = 1;

  const setSelected = (id: string | null, silent = false) => {
    state.selectedId = id;
    if (!silent) onSelectionChange?.(id);
  };

  const hitTest = (clientX: number, clientY: number): EffectRuntime | null => {
    const rect = el.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const world = screenToWorld(scene, sx, sy);

    for (let i = runtimes.length - 1; i >= 0; i--) {
      const rt = runtimes[i]!;
      if (!rt.removable || !rt.params.enabled) continue;
      if (!isPlacedParams(rt.params)) continue;
      const bounds = getPlacedBounds(rt.module.id, rt.params as never);
      if (pointInBounds(world.x, world.y, bounds)) return rt;
    }
    return null;
  };

  const hitSelectedHandle = (clientX: number, clientY: number): ScaleHandle | null => {
    if (!state.selectedId) return null;
    const rt = runtimes.find((r) => r.id === state.selectedId);
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

    const handle = hitSelectedHandle(e.clientX, e.clientY);
    if (handle && state.selectedId) {
      const rt = runtimes.find((r) => r.id === state.selectedId);
      if (rt && isPlacedParams(rt.params)) {
        mode = 'scale';
        state.dragging = true;
        scaleStart = ensureScale(rt.params);
        const rect = el.getBoundingClientRect();
        const world = screenToWorld(scene, e.clientX - rect.left, e.clientY - rect.top);
        scaleDist0 = Math.max(8, Math.hypot(world.x - rt.params.x, world.y - rt.params.y));
        el.style.cursor = 'nwse-resize';
        el.setPointerCapture(e.pointerId);
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

    if (mode === 'move' && state.selectedId) {
      const rt = runtimes.find((r) => r.id === state.selectedId);
      if (!rt || !isPlacedParams(rt.params)) return;
      rt.params.x += dx / scene.camera.zoom;
      rt.params.y += dy / scene.camera.zoom;
      return;
    }

    if (mode === 'scale' && state.selectedId) {
      const rt = runtimes.find((r) => r.id === state.selectedId);
      if (!rt || !isPlacedParams(rt.params)) return;
      const rect = el.getBoundingClientRect();
      const world = screenToWorld(scene, e.clientX - rect.left, e.clientY - rect.top);
      const dist = Math.max(8, Math.hypot(world.x - rt.params.x, world.y - rt.params.y));
      rt.params.scale = Math.max(0.2, Math.min(4.5, scaleStart * (dist / scaleDist0)));
    }
  };

  const onUp = (e: PointerEvent) => {
    state.dragging = false;
    mode = 'none';
    el.style.cursor = '';
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    // Shift+scroll scales selected VFX; otherwise camera zoom
    if (e.shiftKey && state.selectedId) {
      const rt = runtimes.find((r) => r.id === state.selectedId);
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

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });

  return {
    state,
    setSelected,
    dispose() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
    },
  };
}
