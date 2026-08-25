import type { SceneContext } from '../core/types';
import { screenToWorld } from '../core/types';
import { clampCamera } from '../core/scene';
import { getPlacedBounds, isPlacedParams, pointInBounds } from '../core/placed';
import type { EffectRuntime } from './renderer';

export interface SelectionState {
  selectedId: string | null;
  dragging: boolean;
}

export interface StageInteractionApi {
  state: SelectionState;
  setSelected: (id: string | null) => void;
  dispose: () => void;
}

/**
 * Stage pointer handling:
 * - Click a creatable VFX → select
 * - Drag selected VFX → move in world space
 * - Drag empty space → pan camera
 * - Wheel → zoom
 */
export function attachStageInteractions(
  el: HTMLElement,
  scene: SceneContext,
  runtimes: EffectRuntime[],
  onSelectionChange?: (id: string | null) => void,
): StageInteractionApi {
  const state: SelectionState = { selectedId: null, dragging: false };
  let mode: 'none' | 'pan' | 'move' = 'none';
  let lastX = 0;
  let lastY = 0;
  let moved = false;

  const setSelected = (id: string | null) => {
    state.selectedId = id;
    onSelectionChange?.(id);
  };

  const hitTest = (clientX: number, clientY: number): EffectRuntime | null => {
    const rect = el.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const world = screenToWorld(scene, sx, sy);

    // Topmost first (later runtimes draw on top)
    for (let i = runtimes.length - 1; i >= 0; i--) {
      const rt = runtimes[i]!;
      if (!rt.removable || !rt.params.enabled) continue;
      if (!isPlacedParams(rt.params)) continue;
      const bounds = getPlacedBounds(rt.module.id, rt.params as never);
      if (pointInBounds(world.x, world.y, bounds)) return rt;
    }
    return null;
  };

  const onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.tp-dfwv, #panel, .create-menu, .chrome')) return;
    moved = false;
    lastX = e.clientX;
    lastY = e.clientY;

    const hit = hitTest(e.clientX, e.clientY);
    if (hit && isPlacedParams(hit.params)) {
      setSelected(hit.id);
      mode = 'move';
      state.dragging = true;
      el.style.cursor = 'grabbing';
    } else {
      // Click empty → deselect + pan
      setSelected(null);
      mode = 'pan';
      state.dragging = true;
      el.style.cursor = 'grabbing';
    }
    el.setPointerCapture(e.pointerId);
  };

  const onMove = (e: PointerEvent) => {
    if (!state.dragging || mode === 'none') return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
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
    void moved;
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
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
