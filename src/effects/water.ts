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
  const s = 0.0028 / Math.max(0.25, scale);
  // Uneven multi-scale swell — break perfect sine stacking with fbm-dominant mix
  let h = 0;
  h += Math.sin(x * s * 0.85 + t * 1.1 + seed * 0.3) * 0.35;
  h += Math.sin(x * s * 1.55 - z * s * 0.35 + t * 1.6 + 2.1) * 0.22;
  h += fbm2(x * s * 1.8 + t * 0.28, z * s * 1.1 + seed * 0.02, 3, seed + 9) * 0.55;
  h += fbm2(x * s * 4.2 - t * 0.4, z * s * 2.4, 2, seed + 41) * 0.28;
  return h * strength;
}

/** Build irregular row positions (fewer, unevenly spaced). */
function buildSwellRows(height: number, seed: number): number[] {
  const rows: number[] = [];
  let y = height * 0.08;
  let i = 0;
  while (y < height * 0.96 && rows.length < 9) {
    rows.push(y);
    const gap =
      height * (0.08 + 0.1 * (0.5 + 0.5 * fbm2(i * 1.7, seed * 0.01, 2, seed + 3))) +
      (i % 3 === 0 ? height * 0.04 : 0);
    y += Math.max(height * 0.07, gap);
    i++;
  }
  return rows;
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

  // Fewer, unevenly spaced swell rows — break the equal geometric stripe look
  const swellRows = buildSwellRows(H, params.seed);
  for (let r = 0; r < swellRows.length; r++) {
    const y0 = swellRows[r]!;
    const v = y0 / H;
    // Per-row amplitude + phase jitter so waves aren't clones
    const rowAmp =
      (8 + params.waveStrength * 34) *
      (0.45 + v * 0.85) *
      (0.7 + 0.55 * (0.5 + 0.5 * fbm2(r * 2.1, params.seed * 0.02, 2, params.seed + 7)));
    const rowPhase = fbm2(r * 0.9, params.seed * 0.03, 2, params.seed + 13) * 40;
    const cols = Math.max(16, Math.floor(W / 28));

    // Soft trough shade (broad, not a thin stripe)
    L.beginPath();
    L.moveTo(0, y0 + 10);
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const x = u * W;
      const h =
        waveHeight(x + left + rowPhase, y0 + top, t, params.waveScale, params.waveStrength, params.seed + r) *
        rowAmp;
      L.lineTo(x, y0 + h * 0.5 + 6);
    }
    L.lineTo(W, y0 + 18);
    L.closePath();
    L.fillStyle = withAlpha(trough, clamp(0.06 + v * 0.18, 0, 0.28) * I);
    L.fill();

    // Broken crest highlights — skip segments so it isn't one perfect continuous line
    L.lineWidth = 1.4 + (1 - v) * 1.8;
    L.lineCap = 'round';
    let drawing = false;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const x = u * W;
      const h =
        waveHeight(
          x + left + rowPhase + 9,
          y0 + top,
          t * 1.02,
          params.waveScale,
          params.waveStrength,
          params.seed + r + 3,
        ) * rowAmp;
      const y = y0 + h * 0.65;
      const peak = h / Math.max(1, rowAmp);
      const gate = fbm2(c * 0.55 + r * 1.3, t * 0.15 + params.seed * 0.01, 2, params.seed + 19);
      const show = peak > 0.05 && gate > -0.15;
      if (show) {
        const a =
          clamp(0.1 + (1 - v) * 0.22 + peak * 0.2, 0, 0.5) * I * mat.emissiveIntensity;
        L.strokeStyle = withAlpha(crest, a);
        if (!drawing) {
          L.beginPath();
          L.moveTo(x, y);
          drawing = true;
        } else {
          L.lineTo(x, y);
        }
      } else if (drawing) {
        L.stroke();
        drawing = false;
      }
    }
    if (drawing) L.stroke();

    // Sparse whitecaps only on strong irregular peaks
    if (foamAmt > 0.02) {
      for (let c = 0; c < cols; c += 3) {
        const u = (c + 0.5) / cols;
        const x = u * W;
        const h =
          waveHeight(x + left + rowPhase, y0 + top, t, params.waveScale, params.waveStrength, params.seed + r) *
          rowAmp;
        const peak = h / Math.max(1, rowAmp);
        const scatter = fbm2(c * 0.8, r * 1.1 + params.seed * 0.02, 2, params.seed + 29);
        if (peak < 0.45 + (1 - foamAmt) * 0.25 || scatter < 0.1) continue;
        const a = foamAmt * I * (0.12 + peak * 0.4) * (0.35 + v * 0.55);
        if (a < 0.04) continue;
        const rw = 5 + peak * 16;
        const rh = 1.4 + peak * 2.8;
        const cy = y0 + h * 0.6;
        const g = L.createRadialGradient(x, cy, 0, x, cy, rw);
        g.addColorStop(0, withAlpha('#f4fbff', a));
        g.addColorStop(0.5, withAlpha('#d0e8f2', a * 0.4));
        g.addColorStop(1, withAlpha('#d0e8f2', 0));
        L.fillStyle = g;
        L.beginPath();
        L.ellipse(x, cy, rw, rh, scatter * 0.4, 0, Math.PI * 2);
        L.fill();
      }
    }
  }

  // Specular glitter — fewer, more scattered
  L.globalCompositeOperation = 'lighter';
  const sunX = W * 0.5 + scene.wind.x * 40;
  for (let i = 0; i < 36; i++) {
    const n1 = fbm2(i * 1.1, t * 0.45 + params.seed * 0.01, 2, params.seed + 17);
    const n2 = fbm2(i * 1.4 + 2, t * 0.35, 2, params.seed + 29);
    if (n1 < -0.15) continue;
    const u = 0.1 + Math.abs(n1) * 0.8;
    const v = 0.08 + Math.abs(n2) * 0.7;
    const x = u * W + (sunX - W * 0.5) * (1 - v) * 0.15;
    const y = v * H;
    const spark = 0.5 + 0.5 * Math.sin(t * 7 + i * 2.1);
    const a = 0.055 * I * mat.emissiveIntensity * spark * (1 - v * 0.5);
    if (a < 0.01) continue;
    const rw = 2.5 + (1 - v) * 11 + Math.abs(n1) * 5;
    const g = L.createRadialGradient(x, y, 0, x, y, rw);
    g.addColorStop(0, withAlpha('#ffffff', a));
    g.addColorStop(0.4, withAlpha(crest, a * 0.45));
    g.addColorStop(1, withAlpha(crest, 0));
    L.fillStyle = g;
    L.beginPath();
    L.ellipse(x, y, rw, Math.max(0.6, rw * 0.2), n2 * 0.5, 0, Math.PI * 2);
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
