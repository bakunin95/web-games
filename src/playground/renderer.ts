import type { BaseEffectParams, EffectModule, SceneContext } from '../core/types';
import { drawMockScene } from './mockScene';
import { getPlacedBounds, isPlacedParams } from '../core/placed';
import type { EffectMaterial } from '../core/material';

export interface RendererHandles {
  world: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  cssOverlay: HTMLElement;
}

export interface EffectRuntime {
  id: string;
  module: EffectModule;
  params: BaseEffectParams;
  removable?: boolean;
  label?: string;
}

export interface RenderOptions {
  selectedId: string | null;
  cssIntensity: number;
  cssEnabled: boolean;
}

/**
 * Full-bleed dual-canvas renderer with selection gizmo for placed VFX.
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

  const drawSelectionGizmo = (ctx: CanvasRenderingContext2D, rt: EffectRuntime, t: number) => {
    if (!isPlacedParams(rt.params)) return;
    const b = getPlacedBounds(rt.module.id, rt.params as never);
    const pulse = 0.55 + Math.sin(t * 4) * 0.2;
    ctx.save();
    ctx.strokeStyle = `rgba(61, 231, 255, ${0.55 + pulse * 0.35})`;
    ctx.lineWidth = 2 / Math.max(0.4, 1); // world space; camera zoom applied already
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([]);

    // Corner handles
    const hs = 6;
    ctx.fillStyle = 'rgba(61, 231, 255, 0.95)';
    const corners = [
      [b.x, b.y],
      [b.x + b.w, b.y],
      [b.x, b.y + b.h],
      [b.x + b.w, b.y + b.h],
    ];
    for (const [hx, hy] of corners) {
      ctx.fillRect(hx! - hs / 2, hy! - hs / 2, hs, hs);
    }

    // Center crosshair
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    ctx.strokeStyle = 'rgba(255, 79, 216, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx, cy + 10);
    ctx.stroke();

    // Label
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(232, 238, 252, 0.95)';
    ctx.fillText(rt.label ?? rt.module.name, b.x, b.y - 8);
    ctx.restore();
  };

  const render = (
    scene: SceneContext,
    t: number,
    effects: EffectRuntime[],
    opts: RenderOptions,
  ) => {
    const { camera, viewportWidth: vw, viewportHeight: vh } = scene;
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

    if (opts.selectedId) {
      const selected = effects.find((e) => e.id === opts.selectedId);
      if (selected) drawSelectionGizmo(worldCtx, selected, t);
    }
    worldCtx.restore();

    overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    overlayCtx.clearRect(0, 0, vw, vh);
    for (const fx of effects) {
      if (fx.module.space !== 'screen') continue;
      if (!fx.params.enabled) continue;
      fx.module.draw(overlayCtx, fx.params, t, scene);
    }

    applyCssOverlay(scene, opts.cssIntensity, opts.cssEnabled);
  };

  return { resize, render };
}

export type { EffectMaterial };
