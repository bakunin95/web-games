import type { BaseEffectParams, EffectModule, SceneContext } from '../core/types';
import { drawMockScene } from './mockScene';

export interface RendererHandles {
  world: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  cssOverlay: HTMLElement;
}

export interface EffectRuntime {
  /** Unique instance id (for creatable emitters). */
  id: string;
  module: EffectModule;
  params: BaseEffectParams;
  /** User-spawned via Create VFX — can be removed from the panel. */
  removable?: boolean;
  label?: string;
}

/**
 * Full-bleed dual-canvas renderer:
 * - world canvas: mock scene + world-space FX (camera transform applied)
 * - overlay canvas: screen-space FX (identity)
 * - css overlay: optional DOM/CSS atmosphere layer
 */
export function createRenderer(handles: RendererHandles) {
  const worldCtx = handles.world.getContext('2d', { alpha: false })!;
  const overlayCtx = handles.overlay.getContext('2d', { alpha: true })!;

  const resize = (scene: SceneContext) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    scene.viewportWidth = w;
    scene.viewportHeight = h;

    for (const canvas of [handles.world, handles.overlay]) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    worldCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const applyCssOverlay = (scene: SceneContext, intensity: number, enabled: boolean) => {
    const el = handles.cssOverlay;
    if (!enabled || intensity <= 0) {
      el.style.opacity = '0';
      return;
    }
    el.style.opacity = String(0.35 * intensity);
    const wet = scene.rainWet ? 0.55 : 0.25;
    el.style.background = `
      radial-gradient(ellipse at 30% 20%, rgba(255,79,216,${0.12 * intensity}) 0%, transparent 45%),
      radial-gradient(ellipse at 70% 30%, rgba(61,231,255,${0.1 * intensity}) 0%, transparent 40%),
      linear-gradient(180deg, rgba(0,0,0,${0.15 * wet}) 0%, transparent 30%, rgba(5,8,20,${0.35 * intensity}) 100%)
    `;
  };

  const render = (scene: SceneContext, t: number, effects: EffectRuntime[], cssIntensity: number, cssEnabled: boolean) => {
    const { camera, viewportWidth: vw, viewportHeight: vh } = scene;

    // --- World layer ---
    worldCtx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    worldCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    worldCtx.fillStyle = '#05060c';
    worldCtx.fillRect(0, 0, vw, vh);

    worldCtx.save();
    worldCtx.translate(vw / 2, vh / 2);
    worldCtx.scale(camera.zoom, camera.zoom);
    worldCtx.translate(-camera.x, -camera.y);

    drawMockScene(worldCtx, scene, t);

    for (const fx of effects) {
      if (fx.module.space !== 'world') continue;
      if (!fx.params.enabled) continue;
      fx.module.draw(worldCtx, fx.params, t, scene);
    }
    worldCtx.restore();

    // --- Screen overlay layer ---
    overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    overlayCtx.clearRect(0, 0, vw, vh);
    for (const fx of effects) {
      if (fx.module.space !== 'screen') continue;
      if (!fx.params.enabled) continue;
      fx.module.draw(overlayCtx, fx.params, t, scene);
    }

    applyCssOverlay(scene, cssIntensity, cssEnabled);
  };

  return { resize, render };
}
