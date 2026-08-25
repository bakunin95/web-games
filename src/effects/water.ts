import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { fbm2, withAlpha, lerpColor } from './noise';

export interface WaterParams extends PlacedEffectParams {
  width: number;
  height: number;
  waveStrength: number;
  waveScale: number;
  /** Whitecap / foam / sparkle amount 0–1 */
  shoreFoam: number;
}

/**
 * Reflective river (user baseline): sample sky/shore above the waterline,
 * flip + break with irregular flow-aligned ripples — not equal geometric
 * wave rows or vertical column strips.
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
    const c2d = canvas.getContext('2d', { willReadFrequently: false });
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

export const drawWater: DrawFn<WaterParams> = (ctx, params, t, _scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const I = clamp(params.intensity, 0, 2);
  const target = ctx.canvas;
  if (!target.width || !target.height) return;

  const W = Math.max(40, params.width);
  const H = Math.max(40, params.height);
  const worldL = params.x - W * 0.5;
  const worldT = params.y - H * 0.5;

  const m = ctx.getTransform();
  const sx = Math.abs(m.a) || 1;
  const sy = Math.abs(m.d) || 1;
  const rawL = m.a * worldL + m.e;
  const rawT = m.d * worldT + m.f;
  const fullW = W * sx;
  const fullH = H * sy;

  const devL = Math.max(0, Math.floor(rawL));
  const devT = Math.max(0, Math.floor(rawT));
  const devR = Math.min(target.width, Math.ceil(rawL + fullW));
  const devB = Math.min(target.height, Math.ceil(rawT + fullH));
  const mw = devR - devL;
  const mh = devB - devT;
  if (mw < 8 || mh < 8) return;

  const off = devT - rawT;
  const inset = devL - rawL;
  const deep = mat.baseColor || '#0a2744';
  const crest = mat.emissive || '#5ec8d8';
  const mid = lerpColor(deep, crest, 0.35);
  const strength = params.waveStrength;
  const scale = Math.max(0.25, params.waveScale);
  const foamAmt = clamp(params.shoreFoam, 0, 1);

  const layer = scratch(params.instanceId, mw, mh);
  const L = layer.ctx;

  // Absorbing body tint under the mirror
  const body = L.createLinearGradient(0, 0, 0, mh);
  body.addColorStop(0, withAlpha(lerpColor(crest, '#9ec8e0', 0.4), 0.4 * I));
  body.addColorStop(0.3, withAlpha(mid, 0.7 * I));
  body.addColorStop(1, withAlpha(deep, 0.96 * I));
  L.fillStyle = body;
  L.fillRect(0, 0, mw, mh);

  const waterlineY = Math.max(0, Math.floor(rawT));
  const sampleH = Math.min(waterlineY, Math.ceil(fullH * 1.15));
  if (sampleH > 4) {
    const srcX = Math.max(0, Math.floor(rawL));
    const srcW = Math.min(target.width - srcX, Math.ceil(fullW));
    const srcY = Math.max(0, waterlineY - sampleH);

    // Build a clean flipped mirror once (no column strips)
    const mirror = scratch(params.instanceId + ':mirror', mw, sampleH);
    const M = mirror.ctx;
    M.save();
    M.translate(0, sampleH);
    M.scale(1, -1);
    try {
      M.drawImage(target, srcX, srcY, srcW, sampleH, 0, 0, mw, sampleH);
    } catch {
      /* tainted */
    }
    M.restore();

    const fresnel =
      clamp(0.42 + 0.48 * (1 - off / Math.max(1, fullH)), 0.32, 0.95) * I * mat.metalness;

    // Base continuous mirror (no bands) — stretched into the water body
    L.save();
    L.globalAlpha = fresnel * 0.78;
    try {
      L.drawImage(mirror.canvas, 0, 0, mw, sampleH, 0, 0, mw, mh);
    } catch {
      /* skip */
    }
    L.restore();

    // Continuous flow-aligned warp: 2px rows with smooth fbm shear.
    // No stepped band gaps → avoids scanline / geometric stripe look.
    const ampX = 18 * strength * scale;
    const ampY = 3.5 * strength * scale;
    L.save();
    L.globalAlpha = fresnel * 0.55;
    for (let y = 0; y < mh; y += 1) {
      const yn = y / Math.max(1, mh);
      // Low-freq undulation + mid-freq chop + high-freq shimmer (uneven spacing feel)
      const flow =
        fbm2(yn * 3.2 + t * 0.55, params.seed * 0.03, 3, params.seed + 47) * ampX +
        fbm2(yn * 11 + t * 1.1, params.seed * 0.02, 2, params.seed + 49) * ampX * 0.35;
      const chop =
        fbm2(yn * 5.5 + t * 0.35, params.seed * 0.04, 2, params.seed + 53) * ampY;
      const srcY = clamp(yn * sampleH + chop * 0.4, 0, sampleH - 2);
      try {
        L.drawImage(mirror.canvas, 0, srcY, mw, 2, flow, y, mw, 2);
      } catch {
        break;
      }
    }
    L.restore();

    // Sparse irregular "broken mirror" patches — local re-sample with extra displace
    const patches = Math.floor(6 + strength * 8);
    for (let i = 0; i < patches; i++) {
      const n1 = fbm2(i * 2.1, t * 0.2 + params.seed * 0.01, 2, params.seed + 91);
      const n2 = fbm2(i * 1.6 + 4, t * 0.15, 2, params.seed + 97);
      if (n1 < -0.05) continue;
      const pw = 40 + Math.abs(n2) * 120;
      const ph = 8 + Math.abs(n1) * 28;
      const px = (0.05 + Math.abs(n1) * 0.85) * mw - pw * 0.5;
      const py = (0.08 + Math.abs(n2) * 0.75) * mh - ph * 0.5;
      const srcPy = clamp((py / Math.max(1, mh)) * sampleH, 0, sampleH - 2);
      const jx = n2 * 14 * strength;
      L.save();
      L.beginPath();
      L.ellipse(px + pw * 0.5, py + ph * 0.5, pw * 0.5, ph * 0.5, n1 * 0.4, 0, Math.PI * 2);
      L.clip();
      L.globalAlpha = fresnel * 0.4;
      try {
        L.drawImage(
          mirror.canvas,
          clamp(jx, -20, 20),
          srcPy,
          mw,
          Math.min(ph + 4, sampleH - srcPy),
          jx * 0.5,
          py,
          mw,
          ph + 2,
        );
      } catch {
        /* skip */
      }
      L.restore();
    }
  }

  // Dark shore / deep-water absorb — forest reflections read darker near edges + near viewer
  const absorb = L.createLinearGradient(0, 0, 0, mh);
  absorb.addColorStop(0, withAlpha(deep, 0.05 * I));
  absorb.addColorStop(0.35, withAlpha(deep, 0.12 * I));
  absorb.addColorStop(0.7, withAlpha('#061018', 0.35 * I));
  absorb.addColorStop(1, withAlpha('#03080c', 0.62 * I));
  L.fillStyle = absorb;
  L.fillRect(0, 0, mw, mh);

  // Side bank darkening (shoreline reflections denser near left/right)
  const leftBank = L.createLinearGradient(0, 0, mw * 0.28, 0);
  leftBank.addColorStop(0, withAlpha('#1a2810', 0.28 * I));
  leftBank.addColorStop(1, withAlpha('#1a2810', 0));
  L.fillStyle = leftBank;
  L.fillRect(0, 0, mw * 0.28, mh);
  const rightBank = L.createLinearGradient(mw, 0, mw * 0.72, 0);
  rightBank.addColorStop(0, withAlpha('#1a2810', 0.28 * I));
  rightBank.addColorStop(1, withAlpha('#1a2810', 0));
  L.fillStyle = rightBank;
  L.fillRect(mw * 0.72, 0, mw * 0.28, mh);

  // Soft elongated ripple patches (flow direction) — cluster/disperse, not a grid
  const ripples = Math.floor(10 + strength * 10);
  for (let i = 0; i < ripples; i++) {
    const n1 = fbm2(i * 1.7 + t * 0.15, params.seed * 0.02, 2, params.seed + 61);
    const n2 = fbm2(i * 2.3 + 2, t * 0.22, 2, params.seed + 67);
    const n3 = fbm2(i * 0.9, params.seed * 0.03, 2, params.seed + 71);
    if (n3 < -0.25) continue; // skip → irregular density
    const cx = (0.04 + Math.abs(n1) * 0.92) * mw;
    const cy = (0.06 + Math.abs(n2) * 0.88) * mh;
    const rw = (18 + Math.abs(n3) * 55) * scale; // elongated with current
    const rh = (1.5 + Math.abs(n1) * 4.5) * (0.65 + strength * 0.5);
    const a = clamp(0.03 + Math.abs(n2) * 0.08, 0.025, 0.11) * I;
    const g = L.createRadialGradient(cx, cy, 0, cx, cy, rw);
    g.addColorStop(0, withAlpha('#ffffff', a * 0.55));
    g.addColorStop(0.35, withAlpha(crest, a * 0.7));
    g.addColorStop(1, withAlpha(crest, 0));
    L.fillStyle = g;
    L.beginPath();
    L.ellipse(cx, cy, rw, rh, n2 * 0.25, 0, Math.PI * 2);
    L.fill();
  }

  // Broken sky sparkles — bright silvery patches where sky reflection shimmers
  L.globalCompositeOperation = 'lighter';
  const sparks = Math.floor(10 + foamAmt * 22);
  for (let i = 0; i < sparks; i++) {
    const n1 = fbm2(i * 1.9, t * 0.45 + params.seed * 0.01, 2, params.seed + 79);
    const n2 = fbm2(i * 1.4 + 3, t * 0.32, 2, params.seed + 83);
    if (n1 < 0.08) continue;
    const cx = (0.06 + Math.abs(n1) * 0.88) * mw;
    const cy = (0.04 + Math.abs(n2) * 0.5) * mh; // more near far shore / sky
    const pulse = 0.5 + 0.5 * Math.sin(t * 6.5 + i * 1.7);
    const a = 0.1 * I * mat.emissiveIntensity * pulse * foamAmt;
    if (a < 0.012) continue;
    const rw = 6 + Math.abs(n2) * 22;
    const g = L.createRadialGradient(cx, cy, 0, cx, cy, rw);
    g.addColorStop(0, withAlpha('#ffffff', a));
    g.addColorStop(0.4, withAlpha('#d8eef8', a * 0.45));
    g.addColorStop(1, withAlpha(crest, 0));
    L.fillStyle = g;
    L.beginPath();
    L.ellipse(cx, cy, rw, Math.max(1.2, rw * 0.18), n1 * 0.35, 0, Math.PI * 2);
    L.fill();
  }
  L.globalCompositeOperation = 'source-over';

  // Soft-rect feather
  const featherX = Math.min(fullW * 0.1, 56 * sx);
  const featherY = Math.min(fullH * 0.08, 40 * sy);
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
  const leftE = -inset;
  const topE = -off;
  edge(leftE, 0, leftE + featherX, 0, featherX, mh);
  edge(leftE + fullW, 0, leftE + fullW - featherX, 0, featherX, mh);
  edge(0, topE, 0, topE + featherY, mw, featherY);
  edge(0, topE + fullH, 0, topE + fullH - featherY * 1.3, mw, featherY * 1.3);

  ctx.save();
  applyMaterial(ctx, mat);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer.canvas, devL, devT);
  ctx.restore();
};

export function disposeWaterInstance(instanceId: string): void {
  pool.delete(instanceId);
  pool.delete(instanceId + ':mirror');
}

export const waterEffect: EffectModule<WaterParams> = {
  id: 'water',
  name: 'Water',
  description:
    'Reflective river: mirrors sky & shore with irregular flow-aligned ripples — not geometric wave rows.',
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
    waveStrength: 0.75,
    waveScale: 0.9,
    shoreFoam: 0.55,
    material: createDefaultMaterial({
      name: 'River Glass',
      baseColor: '#143a48',
      emissive: '#c8e8f8',
      emissiveIntensity: 0.7,
      opacity: 0.98,
      roughness: 0.2,
      metalness: 0.85,
      blend: 'normal',
    }),
  },
  draw: drawWater,
};
