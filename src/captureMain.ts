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
  // Soft dusk sky that continues into water — less "sticker on sky"
  if (kind === 'water') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#7eb6e0');
    g.addColorStop(0.38, '#5a96c0');
    g.addColorStop(0.55, '#2a5a78');
    g.addColorStop(1, '#0a1828');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Soft far shore (no hard triangles)
    ctx.fillStyle = 'rgba(12,40,22,0.85)';
    ctx.fillRect(0, H * 0.36, W, 18);
    for (let i = 0; i < 60; i++) {
      const x = (i / 60) * W;
      const h = 12 + ((i * 19) % 28);
      const grd = ctx.createLinearGradient(x, H * 0.36 + 18 - h, x, H * 0.36 + 18);
      grd.addColorStop(0, 'rgba(14,48,28,0)');
      grd.addColorStop(1, 'rgba(14,48,28,0.9)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(x, H * 0.36 + 18);
      ctx.quadraticCurveTo(x + 6, H * 0.36 + 18 - h, x + 12, H * 0.36 + 18);
      ctx.fill();
    }
    return;
  }
  if (kind === 'smoke') {
    // Dusk industrial sky so dark smoke mass reads (matches plume ref mood)
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#5a6a7e');
    g.addColorStop(0.35, '#3a4558');
    g.addColorStop(0.65, '#1e2634');
    g.addColorStop(1, '#0c1018');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Warm horizon haze
    const haze = ctx.createLinearGradient(0, H * 0.35, 0, H * 0.7);
    haze.addColorStop(0, 'rgba(200,160,100,0)');
    haze.addColorStop(0.5, 'rgba(180,130,70,0.18)');
    haze.addColorStop(1, 'rgba(20,16,12,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, H * 0.35, W, H * 0.4);
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, H * 0.72, W, H * 0.28);
    ctx.fillRect(W * 0.78, H * 0.32, 42, H * 0.42);
    ctx.fillRect(W * 0.84, H * 0.22, 16, H * 0.52);
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
  fx === 'smoke' ? makeScene(-1.45) : fx === 'water' ? makeScene(0.05) : makeScene(0.12);

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
    x: W * 0.88,
    y: H * 0.26,
    size: 1.55,
    spread: 0.9,
    rise: 0.25,
    density: 1.25,
    turbulence: 1.1,
    intensity: 1.15,
    material: createDefaultMaterial({
      name: 'Plume',
      baseColor: '#3a424c',
      emissive: '#d8c9a8',
      emissiveIntensity: 0.5,
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
    y: H * 0.62,
    width: 980,
    height: 420,
    waveStrength: 0.08,
    waveScale: 0.55,
    shoreFoam: 0.15,
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
