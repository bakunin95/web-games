import type { SceneContext } from '../core/types';
import { clampCamera } from '../core/scene';

/** Mouse/touch pan + wheel zoom for the mock camera. */
export function attachCameraControls(
  el: HTMLElement,
  scene: SceneContext,
): () => void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.tp-dfwv')) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    el.setPointerCapture(e.pointerId);
  };

  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    scene.camera.x -= dx / scene.camera.zoom;
    scene.camera.y -= dy / scene.camera.zoom;
    clampCamera(scene.camera, scene);
  };

  const onUp = (e: PointerEvent) => {
    dragging = false;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
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

  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    el.removeEventListener('wheel', onWheel);
  };
}
