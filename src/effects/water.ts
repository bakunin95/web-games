import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { fbm2, withAlpha, lerpColor } from './noise';

export interface WaterParams extends PlacedEffectParams {
  width: number;
  height: number;
  waveStrength: number;
  waveScale: number;
  /** Whitecap / foam amount 0–1 */
  shoreFoam: number;
}

/**
 * Open-ocean water (user bar): choppy swell, whitecap foam, specular shimmer,
 * deep navy troughs / cyan crests, sharp horizon under pale sky.
 * Not an oval lake lens.
 */

interface Scratch {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

const pool = new Map<string, Scratch>();

function scratch(key: string, w: number, h: number): Scratch {
  const cw = Math.max(1, Math.ceil(w));
  const ch = Math.max(1, Math.ceil(h));
  let s = pool.get(key);
  if (!s) {
    const canvas = document.createElement('canvas');
    const c2d = canvas.getContext('2d');
    if (!c2d) throw new Error('water: scratch 2D context unavailable');
    s = { canvas, ctx: c2d };
    pool.set(key, s);
  }
  if (s.canvas.width !== cw || s.canvas.height !== ch) {
    s.canvas.width = cw;
    s.canvas.height = ch;
  }
  s.ctx.setTransform(1, 0, 0, 1, 0, 0);
  s.ctx.globalCompositeOperation = 'source-over';
  s.ctx.globalAlpha = 1;
  s.ctx.clearRect(0, 0, cw, ch);
  return s;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function waveHeight(x: number, z: number, t: number, scale: number, strength: number, seed: number): number {
  const s = 0.004 / Math.max(0.25, scale);
  let h = 0;
  h += Math.sin(x * s * 1.1 + t * 1.4 + seed) * 0.45;
  h += Math.sin(x * s * 2.3 - z * s * 0.8 + t * 2.1) * 0.28;
  h += Math.sin(x * s * 4.7 + z * s * 1.6 + t * 3.3 + 1.7) * 0.14;
  h += fbm2(x * s * 3.2 + t * 0.35, z * s * 2.1, 3, seed + 9) * 0.35;
  return h * strength;
}

export const drawWater: DrawFn<WaterParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const I = clamp(params.intensity, 0, 2);
  const W = Math.max(40, params.width);
  const H = Math.max(40, params.height);
  const left = params.x - W * 0.5;
  const top = params.y - H * 0.5;
  const foamAmt = clamp(params.shoreFoam, 0, 1);
  const deep = mat.baseColor || '#0a2744';
  const crest = mat.emissive || '#5ec8d8';
  const trough = '#061428';
  const mid = lerpColor(deep, crest, 0.35);

  const layer = scratch(params.instanceId, W, H);
  const L = layer.ctx;

  // Base depth fill
  const body = L.createLinearGradient(0, 0, 0, H);
  body.addColorStop(0, withAlpha(lerpColor(crest, '#a8d8f0', 0.35), 0.95 * I));
  body.addColorStop(0.12, withAlpha(mid, 0.98 * I));
  body.addColorStop(0.45, withAlpha(deep, I));
  body.addColorStop(1, withAlpha(trough, I));
  L.fillStyle = body;
  L.fillRect(0, 0, W, H);

  // Horizon bright band
  const horizon = L.createLinearGradient(0, 0, 0, H * 0.22);
  horizon.addColorStop(0, withAlpha('#d8eef8', 0.55 * I));
  horizon.addColorStop(0.35, withAlpha('#8ec8e0', 0.28 * I));
  horizon.addColorStop(1, withAlpha(deep, 0));
  L.fillStyle = horizon;
  L.fillRect(0, 0, W, H * 0.22);

  const rows = Math.max(18, Math.floor(H / 10));
  for (let r = 0; r < rows; r++) {
    const v = r / (rows - 1);
    const y0 = v * H;
    const amp = (6 + params.waveStrength * 28) * (0.35 + v * 0.9);
    const cols = Math.max(24, Math.floor(W / 18));

    L.beginPath();
    L.moveTo(0, y0 + 8);
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const x = u * W;
      const h = waveHeight(x + left, y0 + top, t, params.waveScale, params.waveStrength, params.seed) * amp;
      L.lineTo(x, y0 + h * 0.55 + 4);
    }
    L.lineTo(W, y0 + 14);
    L.closePath();
    L.fillStyle = withAlpha(trough, clamp(0.08 + v * 0.22, 0, 0.35) * I);
    L.fill();

    L.beginPath();
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const x = u * W;
      const h =
        waveHeight(x + left + 11, y0 + top, t * 1.05, params.waveScale, params.waveStrength, params.seed + 3) *
        amp;
      const y = y0 + h * 0.7;
      if (c === 0) L.moveTo(x, y);
      else L.lineTo(x, y);
    }
    L.strokeStyle = withAlpha(
      crest,
      clamp(0.12 + (1 - v) * 0.25, 0, 0.45) * I * mat.emissiveIntensity,
    );
    L.lineWidth = 1.2 + (1 - v) * 1.4;
    L.stroke();

    if (foamAmt > 0.02) {
      for (let c = 0; c < cols; c += 2) {
        const u = (c + 0.5) / cols;
        const x = u * W;
        const h = waveHeight(x + left, y0 + top, t, params.waveScale, params.waveStrength, params.seed) * amp;
        const peak = h / Math.max(1, amp);
        if (peak < 0.35 + (1 - foamAmt) * 0.4) continue;
        const a = foamAmt * I * (0.15 + peak * 0.45) * (0.4 + v * 0.6);
        if (a < 0.04) continue;
        const rw = 4 + peak * 14;
        const rh = 1.2 + peak * 2.5;
        const cy = y0 + h * 0.65;
        const g = L.createRadialGradient(x, cy, 0, x, cy, rw);
        g.addColorStop(0, withAlpha('#f4fbff', a));
        g.addColorStop(0.45, withAlpha('#d0e8f2', a * 0.45));
        g.addColorStop(1, withAlpha('#d0e8f2', 0));
        L.fillStyle = g;
        L.beginPath();
        L.ellipse(x, cy, rw, rh, 0, 0, Math.PI * 2);
        L.fill();
      }
    }
  }

  // Specular glitter
  L.globalCompositeOperation = 'lighter';
  const sunX = W * 0.5 + scene.wind.x * 40;
  for (let i = 0; i < 70; i++) {
    const n1 = fbm2(i * 0.7, t * 0.55 + params.seed * 0.01, 2, params.seed + 17);
    const n2 = fbm2(i * 1.1 + 2, t * 0.4, 2, params.seed + 29);
    const u = 0.08 + Math.abs(n1) * 0.84;
    const v = 0.05 + Math.abs(n2) * 0.75;
    const x = u * W + (sunX - W * 0.5) * (1 - v) * 0.15;
    const y = v * H;
    const spark = 0.5 + 0.5 * Math.sin(t * 9 + i * 1.7);
    const a = 0.05 * I * mat.emissiveIntensity * spark * (1 - v * 0.55);
    if (a < 0.008) continue;
    const rw = 2 + (1 - v) * 10 + Math.abs(n1) * 6;
    const g = L.createRadialGradient(x, y, 0, x, y, rw);
    g.addColorStop(0, withAlpha('#ffffff', a));
    g.addColorStop(0.4, withAlpha(crest, a * 0.5));
    g.addColorStop(1, withAlpha(crest, 0));
    L.fillStyle = g;
    L.beginPath();
    L.ellipse(x, y, rw, Math.max(0.6, rw * 0.18), n2 * 0.5, 0, Math.PI * 2);
    L.fill();
  }
  L.globalCompositeOperation = 'source-over';

  // Soft-rect feather
  const featherX = Math.min(W * 0.08, 48);
  const featherY = Math.min(H * 0.06, 36);
  L.globalCompositeOperation = 'destination-out';
  const edge = (x0: number, y0: number, x1: number, y1: number, w: number, h: number) => {
    if (w <= 0 || h <= 0) return;
    const g = L.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    L.fillStyle = g;
    L.fillRect(Math.min(x0, x1), Math.min(y0, y1), w, h);
  };
  edge(0, 0, featherX, 0, featherX, H);
  edge(W, 0, W - featherX, 0, featherX, H);
  edge(0, 0, 0, featherY, W, featherY);
  edge(0, H, 0, H - featherY * 1.4, W, featherY * 1.4);

  ctx.save();
  applyMaterial(ctx, mat);
  ctx.drawImage(layer.canvas, left, top);
  ctx.restore();
};

export function disposeWaterInstance(instanceId: string): void {
  pool.delete(instanceId);
}

export const waterEffect: EffectModule<WaterParams> = {
  id: 'water',
  name: 'Water',
  description:
    'Open ocean: choppy swell, whitecap foam, specular glitter, deep troughs / cyan crests.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'water-default',
    x: 1000,
    y: 900,
    seed: 4,
    width: 720,
    height: 280,
    waveStrength: 0.85,
    waveScale: 0.9,
    shoreFoam: 0.65,
    material: createDefaultMaterial({
      name: 'Ocean Deep',
      baseColor: '#0a2744',
      emissive: '#5ec8d8',
      emissiveIntensity: 0.85,
      opacity: 1,
      roughness: 0.25,
      metalness: 0.75,
      blend: 'normal',
    }),
  },
  draw: drawWater,
};
