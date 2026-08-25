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
// Smoke needs a long settle so the wind-sheared plume fills the frame
const settleMs = Number(params.get('settle') || (fx === 'smoke' ? 7500 : 2800));

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
    // Open ocean sky → horizon → sea (user bar: Unity-like swell under pale sky)
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#6eb4e8');
    g.addColorStop(0.28, '#9ecceb');
    g.addColorStop(0.38, '#c8e0f0');
    g.addColorStop(0.42, '#dceaf4');
    g.addColorStop(0.45, '#3a6a88');
    g.addColorStop(0.55, '#0e3558');
    g.addColorStop(0.75, '#0a2744');
    g.addColorStop(1, '#061428');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Soft sun glitter cue in sky
    const sun = ctx.createRadialGradient(W * 0.72, H * 0.22, 4, W * 0.72, H * 0.22, 160);
    sun.addColorStop(0, 'rgba(255,255,255,0.55)');
    sun.addColorStop(0.25, 'rgba(255,240,200,0.2)');
    sun.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(W * 0.4, 0, W * 0.55, H * 0.45);
    return;
  }
  if (kind === 'smoke') {
    // Dusk industrial sky — cool upper, warm horizon (matches plume ref mood)
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#4a5a70');
    g.addColorStop(0.28, '#3a4658');
    g.addColorStop(0.52, '#2a3344');
    g.addColorStop(0.72, '#1a2030');
    g.addColorStop(1, '#0a0e14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Warm dusk band along horizon
    const haze = ctx.createLinearGradient(0, H * 0.38, 0, H * 0.78);
    haze.addColorStop(0, 'rgba(210,155,85,0)');
    haze.addColorStop(0.4, 'rgba(190,125,55,0.22)');
    haze.addColorStop(0.7, 'rgba(140,90,45,0.12)');
    haze.addColorStop(1, 'rgba(20,14,10,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, H * 0.38, W, H * 0.42);
    // Soft warm glow near stack (low sun from right)
    const sun = ctx.createRadialGradient(W * 0.92, H * 0.48, 10, W * 0.85, H * 0.5, 220);
    sun.addColorStop(0, 'rgba(255,200,120,0.14)');
    sun.addColorStop(0.45, 'rgba(200,140,70,0.06)');
    sun.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(W * 0.55, H * 0.25, W * 0.45, H * 0.45);
    // Ground + chimney (plume spawns at tall stack mouth, top-right)
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, H * 0.72, W, H * 0.28);
    ctx.fillRect(W * 0.78, H * 0.34, 40, H * 0.4);
    ctx.fillRect(W * 0.845, H * 0.2, 14, H * 0.54);
    return;
  }
  // Fire: soft night dirt so the luminous soft mass reads clearly
  {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#080a10');
    sky.addColorStop(0.45, '#0c0a08');
    sky.addColorStop(0.7, '#16100a');
    sky.addColorStop(1, '#1c140e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const groundY = H * 0.58;
    const dirt = ctx.createLinearGradient(0, groundY, 0, H);
    dirt.addColorStop(0, '#2a1c12');
    dirt.addColorStop(0.5, '#1a120c');
    dirt.addColorStop(1, '#100c08');
    ctx.fillStyle = dirt;
    ctx.fillRect(0, groundY, W, H - groundY);
  }
}

const scene =
  fx === 'smoke' ? makeScene(-1.5) : fx === 'water' ? makeScene(0.05) : makeScene(0.85);

let t = 0;
let drawing: (tt: number) => void = () => {};

if (fx === 'fire') {
  const p: FireParams = {
    ...fireEffect.defaultParams,
    instanceId: 'cap-fire',
    x: W * 0.5,
    y: H * 0.82,
    size: 2.7,
    spread: 1.35,
    rise: 1.05,
    intensity: 1.2,
    embers: 0.9,
    turbulence: 1.0,
  };
  drawing = (tt) => fireEffect.draw(ctx, p, tt, scene);
} else if (fx === 'smoke') {
  // Spawn at tall chimney mouth (top-right); wind −1.5 drives long leftward plume
  const p: SmokeParams = {
    ...smokeEffect.defaultParams,
    instanceId: 'cap-smoke',
    x: W * 0.852,
    y: H * 0.205,
    size: 1.25,
    spread: 0.7,
    rise: 0.32,
    density: 1.5,
    turbulence: 1.2,
    intensity: 1.3,
    material: createDefaultMaterial({
      name: 'Plume',
      baseColor: '#2c343e',
      emissive: '#d8c9a8',
      emissiveIntensity: 0.42,
      opacity: 0.97,
      roughness: 0.94,
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
    y: H * 0.72,
    width: 1600,
    height: 520,
    waveStrength: 1.05,
    waveScale: 0.85,
    shoreFoam: 0.75,
    intensity: 1,
    material: createDefaultMaterial({
      name: 'Ocean Deep',
      baseColor: '#0a2744',
      emissive: '#5ec8d8',
      emissiveIntensity: 0.9,
      opacity: 1,
      roughness: 0.25,
      metalness: 0.75,
      blend: 'normal',
    }),
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
