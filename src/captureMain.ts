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
const settleMs = Number(params.get('settle') || (fx === 'smoke' ? 5200 : 2800));

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
    // Sky gradient continues through horizon into the water region
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#8ec4e8');
    g.addColorStop(0.32, '#6aa8d0');
    g.addColorStop(0.42, '#4a88b0');
    g.addColorStop(0.52, '#2a5a78');
    g.addColorStop(0.7, '#143848');
    g.addColorStop(1, '#081820');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Soft continuous treeline (rolling silhouette, not hard triangles)
    const shoreY = H * 0.38;
    const groundH = 22;
    ctx.fillStyle = 'rgba(10,36,20,0.88)';
    ctx.fillRect(0, shoreY, W, groundH);

    ctx.beginPath();
    ctx.moveTo(0, shoreY + groundH);
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = u * W;
      // Low-frequency rolling canopy — continuous soft band
      const n =
        Math.sin(u * Math.PI * 5.2) * 10 +
        Math.sin(u * Math.PI * 11.7 + 0.7) * 6 +
        Math.sin(u * Math.PI * 23.3 + 1.3) * 3;
      const h = 18 + n + ((i * 17) % 7) * 0.6;
      ctx.lineTo(x, shoreY + groundH - Math.max(10, h));
    }
    ctx.lineTo(W, shoreY + groundH);
    ctx.closePath();
    const canopy = ctx.createLinearGradient(0, shoreY - 30, 0, shoreY + groundH);
    canopy.addColorStop(0, 'rgba(12,44,24,0)');
    canopy.addColorStop(0.35, 'rgba(12,44,24,0.55)');
    canopy.addColorStop(1, 'rgba(8,32,18,0.95)');
    ctx.fillStyle = canopy;
    ctx.fill();

    // Soft mist veil along shore so contact isn't a hard cut
    const mist = ctx.createLinearGradient(0, shoreY + groundH - 8, 0, shoreY + groundH + 28);
    mist.addColorStop(0, 'rgba(200,220,230,0)');
    mist.addColorStop(0.4, 'rgba(180,210,225,0.12)');
    mist.addColorStop(1, 'rgba(140,180,200,0)');
    ctx.fillStyle = mist;
    ctx.fillRect(0, shoreY + groundH - 8, W, 36);
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
  // Fire: night dirt ground (not a pure black void) so spill + fuel bed read
  {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0a0c12');
    sky.addColorStop(0.45, '#0c0a08');
    sky.addColorStop(1, '#1a140e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Dirt / mulch ground plane
    const groundY = H * 0.62;
    const dirt = ctx.createLinearGradient(0, groundY, 0, H);
    dirt.addColorStop(0, '#2a1e14');
    dirt.addColorStop(0.35, '#1e160f');
    dirt.addColorStop(1, '#120e0a');
    ctx.fillStyle = dirt;
    ctx.fillRect(0, groundY, W, H - groundY);

    // Soft dirt noise patches (deterministic grain)
    for (let i = 0; i < 420; i++) {
      const x = ((i * 97) % W) + ((i * 13) % 17) - 8;
      const y = groundY + ((i * 53) % (H - groundY));
      const s = 1.2 + (i % 5) * 0.9;
      const shade = 18 + (i % 7) * 6;
      const a = 0.08 + (i % 4) * 0.04;
      ctx.fillStyle = `rgba(${shade + 20},${shade + 10},${shade},${a})`;
      ctx.beginPath();
      ctx.ellipse(x, y, s * 2.2, s * 0.9, ((i * 19) % 10) * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // Darker mulch flecks
    for (let i = 0; i < 180; i++) {
      const x = ((i * 131) % W) + ((i * 7) % 11);
      const y = groundY + 8 + ((i * 89) % (H - groundY - 8));
      ctx.fillStyle = `rgba(8,6,4,${0.15 + (i % 3) * 0.08})`;
      ctx.fillRect(x, y, 1 + (i % 3), 1 + (i % 2));
    }
    // Warm campfire pit depression
    const pit = ctx.createRadialGradient(W * 0.5, H * 0.82, 10, W * 0.5, H * 0.82, 200);
    pit.addColorStop(0, 'rgba(40,24,12,0.55)');
    pit.addColorStop(0.55, 'rgba(22,14,8,0.35)');
    pit.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pit;
    ctx.beginPath();
    ctx.ellipse(W * 0.5, H * 0.82, 210, 48, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

const scene =
  fx === 'smoke' ? makeScene(-1.5) : fx === 'water' ? makeScene(0.05) : makeScene(0.12);

let t = 0;
let drawing: (tt: number) => void = () => {};

if (fx === 'fire') {
  const p: FireParams = {
    ...fireEffect.defaultParams,
    instanceId: 'cap-fire',
    x: W * 0.5,
    y: H * 0.86,
    size: 3.05,
    spread: 1.35,
    rise: 0.72,
    intensity: 1.2,
    embers: 1.0,
    turbulence: 1.1,
  };
  drawing = (tt) => fireEffect.draw(ctx, p, tt, scene);
} else if (fx === 'smoke') {
  // Spawn at tall chimney mouth (top-right); wind −1.5 drives long leftward plume
  const p: SmokeParams = {
    ...smokeEffect.defaultParams,
    instanceId: 'cap-smoke',
    x: W * 0.852,
    y: H * 0.205,
    size: 1.35,
    spread: 0.7,
    rise: 0.22,
    density: 1.35,
    turbulence: 1.05,
    intensity: 1.2,
    material: createDefaultMaterial({
      name: 'Plume',
      baseColor: '#323842',
      emissive: '#d8c9a8',
      emissiveIntensity: 0.42,
      opacity: 0.97,
      roughness: 0.93,
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
    y: H * 0.64,
    width: 1100,
    height: 460,
    waveStrength: 0.06,
    waveScale: 0.5,
    shoreFoam: 0.08,
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
