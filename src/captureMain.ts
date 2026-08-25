/**
 * Isolated FX capture page for gauntlet A/B stills.
 * URL: /capture.html?fx=fire|smoke|water
 * Exposes window.__VFX_CAPTURE__ = { ready, dataUrl, fx }
 */
import { fireEffect, type FireParams } from './effects/fire';
import { smokeEffect, type SmokeParams } from './effects/smoke';
import { waterEffect, type WaterParams } from './effects/water';
import type { SceneContext } from './core/types';
import { createDefaultMaterial } from './core/material';

declare global {
  interface Window {
    __VFX_CAPTURE__: {
      ready: boolean;
      fx: string;
      dataUrl: string;
      dump: () => string;
    };
  }
}

const params = new URLSearchParams(location.search);
const fx = (params.get('fx') || 'fire').toLowerCase();
const settleMs = Number(params.get('settle') || 2800);

const canvas = document.querySelector<HTMLCanvasElement>('#c')!;
const ctx = canvas.getContext('2d', { alpha: false })!;

const W = 960;
const H = 640;
canvas.width = W;
canvas.height = H;

function makeScene(windX: number): SceneContext {
  return {
    worldWidth: W,
    worldHeight: H,
    viewportWidth: W,
    viewportHeight: H,
    camera: { x: W / 2, y: H / 2, zoom: 1 },
    lights: [
      { id: 'fill', x: W * 0.35, y: H * 0.25, radius: 280, color: '#a8d4ff', intensity: 0.85 },
      { id: 'warm', x: W * 0.55, y: H * 0.55, radius: 200, color: '#ffb060', intensity: 0.7 },
      { id: 'sky', x: W * 0.5, y: H * 0.1, radius: 400, color: '#6eb0e8', intensity: 0.9 },
    ],
    hazardZones: [],
    rainWet: false,
    wind: { x: windX, y: 0.05 },
    time: 0,
    dt: 1 / 60,
    paused: false,
  };
}

function paintBg(kind: string) {
  if (kind === 'water') {
    // Soft dawn sky behind lake body
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#6fa8d8');
    g.addColorStop(0.45, '#3d6a8c');
    g.addColorStop(1, '#0c1520');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Fake far shore band for reflection context
    ctx.fillStyle = '#0e2a18';
    ctx.fillRect(0, H * 0.28, W, 28);
    ctx.fillStyle = '#143820';
    for (let i = 0; i < 40; i++) {
      const x = (i / 40) * W;
      const h = 20 + ((i * 17) % 35);
      ctx.beginPath();
      ctx.moveTo(x, H * 0.28 + 28);
      ctx.lineTo(x + 8, H * 0.28 + 28 - h);
      ctx.lineTo(x + 16, H * 0.28 + 28);
      ctx.fill();
    }
    return;
  }
  if (kind === 'smoke') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2a3344');
    g.addColorStop(0.5, '#1a2030');
    g.addColorStop(1, '#0a0c12');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Industrial silhouette base
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, H * 0.72, W, H * 0.28);
    ctx.fillRect(W * 0.72, H * 0.35, 36, H * 0.4);
    ctx.fillRect(W * 0.78, H * 0.28, 18, H * 0.45);
    return;
  }
  // Fire: night ground
  const g = ctx.createRadialGradient(W * 0.5, H * 0.7, 20, W * 0.5, H * 0.5, H * 0.85);
  g.addColorStop(0, '#1a1008');
  g.addColorStop(0.5, '#0a0806');
  g.addColorStop(1, '#020204');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#14100c';
  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.78, 220, 40, 0, 0, Math.PI * 2);
  ctx.fill();
}

const scene =
  fx === 'smoke' ? makeScene(1.35) : fx === 'water' ? makeScene(0.05) : makeScene(0.12);

let t = 0;
let drawing: (tt: number) => void = () => {};

if (fx === 'fire') {
  const p: FireParams = {
    ...fireEffect.defaultParams,
    instanceId: 'cap-fire',
    x: W * 0.5,
    y: H * 0.78,
    size: 2.4,
    spread: 1.25,
    rise: 0.75,
    intensity: 1.15,
    embers: 0.9,
    turbulence: 1.05,
  };
  drawing = (tt) => fireEffect.draw(ctx, p, tt, scene);
} else if (fx === 'smoke') {
  const p: SmokeParams = {
    ...smokeEffect.defaultParams,
    instanceId: 'cap-smoke',
    x: W * 0.82,
    y: H * 0.62,
    size: 1.85,
    spread: 1.6,
    rise: 0.45,
    density: 1.15,
    turbulence: 1.05,
    intensity: 1.1,
    material: createDefaultMaterial({
      name: 'Plume',
      baseColor: '#1a1e24',
      emissive: '#f0e4c8',
      emissiveIntensity: 0.85,
      opacity: 0.98,
      roughness: 0.92,
      metalness: 0.05,
      blend: 'normal',
    }),
  };
  drawing = (tt) => smokeEffect.draw(ctx, p, tt, scene);
} else {
  const p: WaterParams = {
    ...waterEffect.defaultParams,
    instanceId: 'cap-water',
    x: W * 0.5,
    y: H * 0.58,
    width: 920,
    height: 380,
    waveStrength: 0.12,
    waveScale: 0.65,
    shoreFoam: 0.25,
    intensity: 1,
  };
  drawing = (tt) => waterEffect.draw(ctx, p, tt, scene);
}

window.__VFX_CAPTURE__ = {
  ready: false,
  fx,
  dataUrl: '',
  dump: () => {
    window.__VFX_CAPTURE__.dataUrl = canvas.toDataURL('image/png');
    return window.__VFX_CAPTURE__.dataUrl;
  },
};

const start = performance.now();
function frame(now: number) {
  (frame as unknown as { _l?: number })._l = now;
  scene.dt = 1 / 60;
  scene.time = t;
  t += 1 / 60;

  paintBg(fx);
  drawing(t);

  if (now - start < settleMs) {
    requestAnimationFrame(frame);
  } else {
    // Freeze a few frames then dump
    scene.paused = true;
    paintBg(fx);
    drawing(t);
    const dataUrl = canvas.toDataURL('image/png');
    window.__VFX_CAPTURE__.dataUrl = dataUrl;
    window.__VFX_CAPTURE__.ready = true;
    document.getElementById('meta')!.textContent = 'ready:' + fx;
  }
}
requestAnimationFrame(frame);
