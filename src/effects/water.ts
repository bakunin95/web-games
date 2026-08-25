import type { DrawFn, EffectModule, SceneContext } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { fbm2, withAlpha, lerpColor } from './noise';

export interface WaterParams extends PlacedEffectParams {
  width: number;
  height: number;
  waveStrength: number;
  waveScale: number;
  shoreFoam: number;
}

/** Scratch canvases for soft lake masking (allocation-light). */
let softMaskCanvas: HTMLCanvasElement | null = null;
let softMaskCtx: CanvasRenderingContext2D | null = null;
let alphaMaskCanvas: HTMLCanvasElement | null = null;
let alphaMaskCtx: CanvasRenderingContext2D | null = null;
let cachedMaskKey = '';

function ensureCanvas(
  existing: HTMLCanvasElement | null,
  existingCtx: CanvasRenderingContext2D | null,
  w: number,
  h: number,
  clear: boolean,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const cw = Math.max(1, Math.ceil(w));
  const ch = Math.max(1, Math.ceil(h));
  let canvas = existing;
  let ctx = existingCtx;
  if (!canvas) {
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
  }
  if (!ctx) {
    throw new Error('water soft-mask canvas unavailable');
  }
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  } else if (clear) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cw, ch);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  return { canvas, ctx };
}

/**
 * Soft lake SURFACE mask — rectangular region with independent edge feathers.
 * Avoids radial elliptical alpha (that reads as a floating oval / UI lens).
 * Builds a full ImageData alpha mask (cached by size), then destination-in once.
 */
function drawWithSoftLakeMask(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  feather: number,
  paint: (layer: CanvasRenderingContext2D) => void,
): void {
  const pad = Math.ceil(Math.max(feather * 2, 20));
  const left = Math.floor(cx - hw - pad);
  const top = Math.floor(cy - hh - pad);
  const width = Math.ceil(hw * 2 + pad * 2);
  const height = Math.ceil(hh * 2 + pad * 2);

  const layerBundle = ensureCanvas(softMaskCanvas, softMaskCtx, width, height, true);
  softMaskCanvas = layerBundle.canvas;
  softMaskCtx = layerBundle.ctx;
  const layer = layerBundle.ctx;

  const maskKey = `${width}x${height}:${hw.toFixed(1)}:${hh.toFixed(1)}:${feather.toFixed(1)}`;
  const maskBundle = ensureCanvas(alphaMaskCanvas, alphaMaskCtx, width, height, maskKey !== cachedMaskKey);
  alphaMaskCanvas = maskBundle.canvas;
  alphaMaskCtx = maskBundle.ctx;
  const mask = maskBundle.ctx;

  layer.save();
  layer.translate(-left, -top);
  paint(layer);
  layer.restore();

  if (maskKey !== cachedMaskKey) {
    cachedMaskKey = maskKey;
    const fx = Math.max(8, Math.min(feather, hw * 0.28));
    const fyTop = Math.max(8, Math.min(feather * 0.7, hh * 0.18));
    const fyBot = Math.max(8, Math.min(feather, hh * 0.28));
    const x0 = cx - left - hw;
    const y0 = cy - top - hh;
    const x1 = cx - left + hw;
    const y1 = cy - top + hh;

    const img = mask.createImageData(width, height);
    const data = img.data;
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        if (px < x0 || px > x1 || py < y0 || py > y1) continue;
        const dl = px - x0;
        const dr = x1 - px;
        const dt = py - y0;
        const db = y1 - py;
        let a = 1;
        if (dl < fx) a = Math.min(a, dl / fx);
        if (dr < fx) a = Math.min(a, dr / fx);
        if (dt < fyTop) a = Math.min(a, dt / fyTop);
        if (db < fyBot) a = Math.min(a, db / fyBot);
        a = a * a * (3 - 2 * a);
        if (a <= 0.001) continue;
        const i = (py * width + px) * 4;
        const v = Math.round(a * 255);
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = v;
      }
    }
    mask.putImageData(img, 0, 0);
  }

  layer.save();
  layer.globalCompositeOperation = 'destination-in';
  layer.drawImage(mask.canvas, 0, 0);
  layer.restore();

  ctx.drawImage(layer.canvas, left, top);
}

export const drawWater: DrawFn<WaterParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const colorDeep = mat.baseColor;
  const colorShallow = mat.emissive;
  const colorSky = lerpColor(mat.emissive, '#8ec4e8', 0.5);
  const colorHorizon = lerpColor(colorSky, '#d4e8f5', 0.55);
  const reflectivity = Math.max(0, Math.min(1.6, mat.metalness * (1.25 - mat.roughness * 0.85)));
  const calm = 1 - Math.min(1, params.waveStrength * 0.9);
  const I = params.intensity;

  const hw = Math.max(20, params.width * 0.5);
  const hh = Math.max(12, params.height * 0.5);
  const cx = params.x;
  const cy = params.y;
  const feather = Math.max(36, Math.min(hw, hh) * 0.22);

  ctx.save();
  applyMaterial(ctx, mat);

  drawWithSoftLakeMask(ctx, cx, cy, hw, hh, feather, (layer) => {
    drawLakeBody(layer, cx, cy, hw, hh, colorDeep, colorShallow, colorSky, colorHorizon, I);
    drawFresnel(layer, cx, cy, hw, hh, colorHorizon, colorSky, colorDeep, reflectivity, calm, I);

    if (reflectivity > 0.04) {
      drawContinuousMirror(layer, params, t, cx, cy, hw, hh, colorSky, colorHorizon, reflectivity, calm, I);
    }

    drawMicroSurface(layer, params, t, cx, cy, hw, hh, calm, reflectivity);

    if (reflectivity > 0.05 && params.waveStrength > 0.12) {
      drawSoftLightKiss(layer, params, scene, t, cx, cy, hw, hh, reflectivity, calm);
    }
  });

  ctx.restore();

  if (params.shoreFoam > 0.02) {
    drawFarShoreContact(ctx, params, cx, cy, hw, hh, calm, feather);
  }
};

/** Depth body: pale near far shore, deep navy toward viewer. Soft rect fills. */
function drawLakeBody(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  colorDeep: string,
  colorShallow: string,
  colorSky: string,
  colorHorizon: string,
  I: number,
): void {
  const pad = 10;
  const vert = ctx.createLinearGradient(cx, cy - hh, cx, cy + hh);
  vert.addColorStop(0, withAlpha(lerpColor(colorHorizon, colorShallow, 0.4), 0.78 * I));
  vert.addColorStop(0.16, withAlpha(lerpColor(colorSky, colorShallow, 0.45), 0.85 * I));
  vert.addColorStop(0.38, withAlpha(lerpColor(colorShallow, colorDeep, 0.3), 0.9 * I));
  vert.addColorStop(0.68, withAlpha(colorDeep, 0.96 * I));
  vert.addColorStop(1, withAlpha(lerpColor(colorDeep, '#010810', 0.7), 0.99 * I));
  ctx.fillStyle = vert;
  ctx.fillRect(cx - hw - pad, cy - hh - pad, hw * 2 + pad * 2, hh * 2 + pad * 2);
}

/**
 * Fresnel: brighter near far shore (graze), darker in nadir toward viewer.
 * No bright elliptical rim — pure vertical field.
 */
function drawFresnel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  colorHorizon: string,
  colorSky: string,
  colorDeep: string,
  reflectivity: number,
  calm: number,
  I: number,
): void {
  const a = reflectivity * I;

  const graze = ctx.createLinearGradient(cx, cy - hh, cx, cy - hh * 0.1);
  graze.addColorStop(0, withAlpha(colorHorizon, 0.38 * a * (0.7 + calm * 0.3)));
  graze.addColorStop(0.3, withAlpha(colorSky, 0.28 * a));
  graze.addColorStop(0.65, withAlpha(colorSky, 0.1 * a));
  graze.addColorStop(1, withAlpha(colorSky, 0));
  ctx.fillStyle = graze;
  ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 0.9);

  const nadir = ctx.createLinearGradient(cx, cy - hh * 0.2, cx, cy + hh);
  nadir.addColorStop(0, withAlpha(colorDeep, 0));
  nadir.addColorStop(0.35, withAlpha(lerpColor(colorDeep, '#021018', 0.4), 0.28 * I));
  nadir.addColorStop(0.7, withAlpha(lerpColor(colorDeep, '#010c14', 0.55), 0.55 * I));
  nadir.addColorStop(1, withAlpha('#00060c', 0.75 * I));
  ctx.fillStyle = nadir;
  ctx.fillRect(cx - hw, cy - hh * 0.2, hw * 2, hh * 1.2);
}

/**
 * Continuous sky + treeline mirror — one vertically flipped soft band.
 * No triangle stamps, no discrete glitch/oval streaks.
 */
function drawContinuousMirror(
  ctx: CanvasRenderingContext2D,
  params: WaterParams,
  t: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  colorSky: string,
  colorHorizon: string,
  reflectivity: number,
  calm: number,
  I: number,
): void {
  const a = reflectivity * I;
  const waterline = cy - hh * 0.92;
  const mirrorH = hh * 1.65;

  ctx.save();

  // Sky mirror — continuous vertical flip of sky (muted; no bright rim)
  const sky = ctx.createLinearGradient(cx, waterline, cx, waterline + mirrorH);
  sky.addColorStop(0, withAlpha(colorHorizon, 0.55 * a));
  sky.addColorStop(0.08, withAlpha(colorSky, 0.58 * a));
  sky.addColorStop(0.25, withAlpha(colorSky, 0.35 * a * (0.85 + calm * 0.15)));
  sky.addColorStop(0.5, withAlpha(lerpColor(colorSky, params.material.baseColor, 0.4), 0.12 * a));
  sky.addColorStop(1, withAlpha(colorSky, 0));
  ctx.fillStyle = sky;
  ctx.fillRect(cx - hw, waterline, hw * 2, mirrorH);

  drawContinuousTreelineMirror(ctx, params, t, cx, waterline, hw, hh, a, calm);

  ctx.restore();
}

/**
 * One continuous canopy silhouette stretched downward — a soft mirrored band.
 * No jagged polygons / triangle stamps / glitch streaks.
 */
function drawContinuousTreelineMirror(
  ctx: CanvasRenderingContext2D,
  params: WaterParams,
  t: number,
  cx: number,
  waterline: number,
  hw: number,
  hh: number,
  a: number,
  calm: number,
): void {
  const stretch = 2.1 + calm * 0.3;
  const canopyH = hh * 0.5 * stretch;
  const wave = params.waveStrength;

  // Core continuous mirrored forest — solid soft band (not discrete stamps)
  const core = ctx.createLinearGradient(cx, waterline, cx, waterline + canopyH);
  core.addColorStop(0, withAlpha('#06140e', 0.92 * a));
  core.addColorStop(0.12, withAlpha('#0a1c14', 0.88 * a));
  core.addColorStop(0.28, withAlpha('#0e281c', 0.55 * a));
  core.addColorStop(0.5, withAlpha('#123024', 0.22 * a));
  core.addColorStop(0.72, withAlpha('#0c2018', 0.06 * a));
  core.addColorStop(1, withAlpha('#081820', 0));
  ctx.fillStyle = core;
  ctx.fillRect(cx - hw, waterline, hw * 2, canopyH);

  // Soft rolling bottom of canopy — overlapping soft lobes (continuous, not triangles)
  const lobes = Math.max(24, Math.floor(hw / 14));
  for (let i = 0; i < lobes; i++) {
    const u = (i + 0.5) / lobes;
    const x = cx - hw + u * hw * 2;
    const n =
      fbm2(u * 2.2, params.seed * 0.001, 3, params.seed) * 0.5 +
      fbm2(u * 4.5, 0.1, 2, params.seed + 2) * 0.25;
    const localH = canopyH * (0.42 + n * 0.22);
    const wobble =
      fbm2(u * 3, t * 0.04, 2, params.seed) * (1 + wave * 3) +
      Math.sin(t * 0.18 + u * 5) * wave * 1.2;
    const rw = (hw * 2) / lobes * 1.35;
    const ry = waterline + localH + wobble;
    const g = ctx.createRadialGradient(x, waterline + localH * 0.35, 0, x, ry, rw);
    g.addColorStop(0, withAlpha('#0c2418', 0.35 * a * calm));
    g.addColorStop(0.55, withAlpha('#0a1c14', 0.12 * a));
    g.addColorStop(1, withAlpha('#081820', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, waterline + localH * 0.55, rw, localH * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft waterline seam — muted contact, not a bright rim
  const seam = ctx.createLinearGradient(cx, waterline - 2, cx, waterline + hh * 0.12);
  seam.addColorStop(0, withAlpha('#04120c', 0.18 * a));
  seam.addColorStop(0.5, withAlpha('#0a1814', 0.06 * a));
  seam.addColorStop(1, withAlpha('#081820', 0));
  ctx.fillStyle = seam;
  ctx.fillRect(cx - hw, waterline - 2, hw * 2, hh * 0.14);
}

/**
 * Micro surface variation — soft filled mottling only.
 * No cartoon ripple strokes, no white horizontal motion-blur bands.
 */
function drawMicroSurface(
  ctx: CanvasRenderingContext2D,
  params: WaterParams,
  t: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  calm: number,
  reflectivity: number,
): void {
  const strength = params.waveStrength * (0.15 + (1 - calm) * 0.7);
  if (strength < 0.012) return;

  ctx.save();
  const patches = Math.max(4, Math.floor(5 + params.waveStrength * 4));
  for (let i = 0; i < patches; i++) {
    const phase = t * (0.1 + strength * 0.12) + i * 1.5 + params.seed * 0.0001;
    const u = (i + 0.3) / patches;
    const px =
      cx -
      hw * 0.65 +
      u * hw * 1.3 +
      fbm2(u * 2, phase * 0.3, 2, params.seed) * hw * 0.04 * strength;
    const py =
      cy -
      hh * 0.2 +
      (i / Math.max(1, patches - 1)) * hh * 0.6 +
      Math.sin(phase) * 1.2 * strength;
    const rw = hw * (0.12 + ((i * 5) % 4) * 0.035) * (0.6 + params.waveScale * 0.3);
    const rh = 2.5 + strength * 2.8;
    const a = (0.015 + (i % 3) * 0.006) * params.intensity * strength;
    const g = ctx.createRadialGradient(px, py, 0, px, py, rw);
    g.addColorStop(0, withAlpha('#163848', a * 0.65));
    g.addColorStop(0.55, withAlpha('#0c2430', a * 0.2));
    g.addColorStop(1, withAlpha('#0a1820', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, py, rw, rh, Math.sin(phase + i) * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tiny Fresnel-region glints only (no horizontal bands)
  if (reflectivity > 0.12 && strength > 0.02) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const phase = t * 0.18 + i * 1.2;
      const px = cx + fbm2(i * 1.1, phase, 2, params.seed) * hw * 0.5;
      const py = cy - hh * 0.55 + fbm2(i * 0.8, phase * 0.5, 2, params.seed + 7) * hh * 0.1;
      const rw = 4 + (i % 3) * 3;
      const a = 0.012 * params.intensity * reflectivity * calm * strength;
      if (a < 0.002) continue;
      const g = ctx.createRadialGradient(px, py, 0, px, py, rw);
      g.addColorStop(0, withAlpha('#c8e0f0', a));
      g.addColorStop(1, withAlpha('#c8e0f0', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(px, py, rw, 0.6 + strength * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Soft light kisses — vertical only, never horizontal white bands. */
function drawSoftLightKiss(
  ctx: CanvasRenderingContext2D,
  params: WaterParams,
  scene: SceneContext,
  t: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  reflectivity: number,
  calm: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const I = params.intensity;

  for (const light of scene.lights) {
    const dx = light.x - cx;
    const dy = light.y - cy;
    const dist = Math.hypot(dx, dy);
    const influence = Math.max(0, 1 - dist / (light.radius + Math.max(hw, hh) * 1.1));
    if (influence <= 0.05) continue;

    const rx = cx + dx * 0.1 + Math.sin(t * 0.28 + light.x * 0.01) * params.waveStrength;
    const ry = cy - hh * 0.32 + Math.min(hh * 0.15, Math.max(0, dy) * 0.02);
    const pulse = 0.94 + Math.sin(t * 0.9 + light.x * 0.01) * 0.06;
    const streakH = (hh * 0.18 + light.radius * 0.015) * (0.7 + calm * 0.3) * pulse;
    const a = 0.05 * influence * reflectivity * I * light.intensity * pulse;

    const g = ctx.createLinearGradient(rx, ry - streakH, rx, ry + streakH);
    g.addColorStop(0, withAlpha(light.color, 0));
    g.addColorStop(0.5, withAlpha(light.color, a));
    g.addColorStop(1, withAlpha(light.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(rx, ry, 1.0 + light.radius * 0.006, streakH, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Far-shore contact mist only — never a full oval foam ring.
 */
function drawFarShoreContact(
  ctx: CanvasRenderingContext2D,
  params: WaterParams,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  calm: number,
  feather: number,
): void {
  const a = 0.08 * params.shoreFoam * params.intensity * (0.5 + calm * 0.5);
  if (a < 0.003) return;

  const waterline = cy - hh * 0.92;
  ctx.save();
  const mist = ctx.createLinearGradient(cx, waterline - 6, cx, waterline + hh * 0.08);
  mist.addColorStop(0, withAlpha('#e8f0f5', 0));
  mist.addColorStop(0.4, withAlpha('#dce8f0', a * 0.4));
  mist.addColorStop(1, withAlpha('#c8d8e0', 0));
  ctx.fillStyle = mist;
  const bandW = Math.max(8, hw * 2 - feather * 1.5);
  ctx.fillRect(cx - bandW * 0.5, waterline - 4, bandW, hh * 0.1);
  ctx.restore();
}

export function disposeWaterInstance(_instanceId: string): void {}

export const waterEffect: EffectModule<WaterParams> = {
  id: 'water',
  name: 'Water',
  description:
    'Clear reflective lake: soft surface region, continuous sky/treeline mirror, Fresnel graze, micro ripples.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'water-default',
    x: 1000,
    y: 880,
    seed: 4,
    width: 520,
    height: 200,
    waveStrength: 0.16,
    waveScale: 0.7,
    shoreFoam: 0.15,
    material: createDefaultMaterial({
      name: 'Clear Water',
      baseColor: '#071e36',
      emissive: '#2a7a9c',
      emissiveIntensity: 0.55,
      opacity: 0.95,
      roughness: 0.08,
      metalness: 0.92,
      blend: 'normal',
    }),
  },
  draw: drawWater,
};
