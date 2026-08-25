import type { DrawFn, EffectModule, SceneContext } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { fbm2, mulberry32, withAlpha, lerpColor } from './noise';

export interface WaterParams extends PlacedEffectParams {
  width: number;
  height: number;
  waveStrength: number;
  waveScale: number;
  shoreFoam: number;
}

/** Reused scratch canvas so soft-edge masking stays allocation-light. */
let softMaskCanvas: HTMLCanvasElement | null = null;
let softMaskCtx: CanvasRenderingContext2D | null = null;

function getSoftMaskCtx(w: number, h: number): CanvasRenderingContext2D {
  const cw = Math.max(1, Math.ceil(w));
  const ch = Math.max(1, Math.ceil(h));
  if (!softMaskCanvas) {
    softMaskCanvas = document.createElement('canvas');
    softMaskCtx = softMaskCanvas.getContext('2d');
  }
  if (!softMaskCtx) {
    throw new Error('water soft-mask canvas unavailable');
  }
  if (softMaskCanvas.width !== cw || softMaskCanvas.height !== ch) {
    softMaskCanvas.width = cw;
    softMaskCanvas.height = ch;
  } else {
    softMaskCtx.setTransform(1, 0, 0, 1, 0, 0);
    softMaskCtx.globalCompositeOperation = 'source-over';
    softMaskCtx.clearRect(0, 0, cw, ch);
  }
  softMaskCtx.setTransform(1, 0, 0, 1, 0, 0);
  softMaskCtx.globalCompositeOperation = 'source-over';
  return softMaskCtx;
}

/**
 * Soft elliptical body: draw into a scratch layer, then destination-in with a
 * feathered radial mask (scaled to the ellipse) so the silhouette is not a hard clip sticker.
 */
function drawWithFeatheredEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  feather: number,
  paint: (layer: CanvasRenderingContext2D) => void,
): void {
  const pad = Math.ceil(Math.max(feather * 2, 8));
  const left = Math.floor(cx - hw - pad);
  const top = Math.floor(cy - hh - pad);
  const width = Math.ceil(hw * 2 + pad * 2);
  const height = Math.ceil(hh * 2 + pad * 2);
  const layer = getSoftMaskCtx(width, height);
  const ox = -left;
  const oy = -top;

  layer.save();
  layer.translate(ox, oy);
  paint(layer);
  layer.restore();

  // Soft elliptical alpha: solid interior → feathered rim
  // Ellipse center in layer pixels is (cx - left, cy - top).
  layer.save();
  layer.globalCompositeOperation = 'destination-in';
  layer.setTransform(hw, 0, 0, hh, cx - left, cy - top);
  const inset = Math.max(0.05, Math.min(0.32, feather / Math.min(hw, hh)));
  const g = layer.createRadialGradient(0, 0, Math.max(0, 1 - inset), 0, 0, 1);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.5, 'rgba(0,0,0,1)');
  g.addColorStop(0.78, 'rgba(0,0,0,0.78)');
  g.addColorStop(0.9, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  layer.fillStyle = g;
  layer.beginPath();
  layer.arc(0, 0, 1.04, 0, Math.PI * 2);
  layer.fill();
  layer.restore();

  ctx.drawImage(layer.canvas, left, top);
}

export const drawWater: DrawFn<WaterParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const colorDeep = mat.baseColor;
  const colorShallow = mat.emissive;
  const colorSky = lerpColor(mat.emissive, '#8ec4ef', 0.62);
  const colorSkyBright = lerpColor(colorSky, '#d8eefc', 0.45);
  const colorFoam = '#e8f4ff';
  const reflectivity = Math.max(0, Math.min(1.6, mat.metalness * (1.25 - mat.roughness * 0.85)));
  const calm = 1 - Math.min(1, params.waveStrength * 0.9);
  const I = params.intensity;

  const hw = Math.max(20, params.width * 0.5);
  const hh = Math.max(12, params.height * 0.5);
  const cx = params.x;
  const cy = params.y;
  const feather = Math.max(10, Math.min(hw, hh) * 0.14);

  ctx.save();
  applyMaterial(ctx, mat);

  drawWithFeatheredEllipse(ctx, cx, cy, hw, hh, feather, (layer) => {
    drawDepthBody(layer, cx, cy, hw, hh, colorDeep, colorShallow, colorSky, I);
    drawFresnelField(layer, cx, cy, hw, hh, colorSky, colorSkyBright, colorDeep, reflectivity, calm, I);

    if (reflectivity > 0.04) {
      drawSkyMirror(layer, params, t, cx, cy, hw, hh, colorSky, colorSkyBright, reflectivity, calm, I);
    }

    if (reflectivity > 0.08) {
      drawShoreReflections(layer, params, t, cx, cy, hw, hh, reflectivity, calm);
    }

    drawWaterlineMist(layer, cx, cy, hw, hh, calm, I);
    drawMicroRipples(layer, params, t, cx, cy, hw, hh, calm);

    if (reflectivity > 0) {
      drawAnisotropicSpeculars(layer, params, scene, t, cx, cy, hw, hh, reflectivity, calm, colorSkyBright);
    }
  });

  ctx.restore();

  if (params.shoreFoam > 0) {
    drawShore(ctx, params, t, cx, cy, hw, hh, colorFoam, calm, feather);
  }
};

/** Shallower near banks; deeper nadir; soft lateral shallowing. */
function drawDepthBody(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  colorDeep: string,
  colorShallow: string,
  colorSky: string,
  I: number,
): void {
  // Base fill oversized slightly; soft mask handles silhouette
  const pad = 4;
  const vert = ctx.createLinearGradient(cx, cy - hh, cx, cy + hh);
  vert.addColorStop(0, withAlpha(lerpColor(colorSky, colorShallow, 0.35), 0.78 * I));
  vert.addColorStop(0.18, withAlpha(lerpColor(colorShallow, colorSky, 0.5), 0.86 * I));
  vert.addColorStop(0.42, withAlpha(lerpColor(colorShallow, colorDeep, 0.35), 0.9 * I));
  vert.addColorStop(0.72, withAlpha(colorDeep, 0.96 * I));
  vert.addColorStop(1, withAlpha(lerpColor(colorDeep, '#021018', 0.55), 0.99 * I));
  ctx.fillStyle = vert;
  ctx.fillRect(cx - hw - pad, cy - hh - pad, hw * 2 + pad * 2, hh * 2 + pad * 2);

  const bank = ctx.createRadialGradient(
    cx,
    cy + hh * 0.1,
    Math.min(hw, hh) * 0.1,
    cx,
    cy,
    Math.max(hw, hh) * 1.05,
  );
  bank.addColorStop(0, withAlpha(colorDeep, 0));
  bank.addColorStop(0.5, withAlpha(colorShallow, 0));
  bank.addColorStop(0.78, withAlpha(lerpColor(colorShallow, colorSky, 0.3), 0.16 * I));
  bank.addColorStop(0.92, withAlpha(lerpColor(colorShallow, '#b8dce8', 0.3), 0.28 * I));
  bank.addColorStop(1, withAlpha(lerpColor(colorShallow, '#c8e8f2', 0.35), 0.34 * I));
  ctx.fillStyle = bank;
  ctx.fillRect(cx - hw - pad, cy - hh - pad, hw * 2 + pad * 2, hh * 2 + pad * 2);

  for (const side of [-1, 1] as const) {
    const gx = cx + side * hw * 0.86;
    const g = ctx.createRadialGradient(gx, cy + hh * 0.06, 0, gx, cy, hw * 0.68);
    g.addColorStop(0, withAlpha(lerpColor(colorShallow, '#c8e8f0', 0.28), 0.2 * I));
    g.addColorStop(0.5, withAlpha(colorShallow, 0.07 * I));
    g.addColorStop(1, withAlpha(colorShallow, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(gx, cy + hh * 0.04, hw * 0.4, hh * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Fresnel: bright grazing reflection near the far waterline / horizon;
 * darker absorption toward nadir (near bank / looking down into the lake).
 */
function drawFresnelField(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  colorSky: string,
  colorSkyBright: string,
  colorDeep: string,
  reflectivity: number,
  calm: number,
  I: number,
): void {
  const a = reflectivity * I;
  // Horizon graze — bright sheet along far waterline
  const horizon = ctx.createLinearGradient(cx, cy - hh, cx, cy - hh * 0.15);
  horizon.addColorStop(0, withAlpha(colorSkyBright, 0.55 * a * (0.7 + calm * 0.3)));
  horizon.addColorStop(0.25, withAlpha(colorSky, 0.38 * a));
  horizon.addColorStop(0.55, withAlpha(colorSky, 0.14 * a));
  horizon.addColorStop(1, withAlpha(colorSky, 0));
  ctx.fillStyle = horizon;
  ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 0.85);

  // Nadir darkening — looking down into water absorbs reflection
  const nadir = ctx.createLinearGradient(cx, cy - hh * 0.05, cx, cy + hh);
  nadir.addColorStop(0, withAlpha(colorDeep, 0));
  nadir.addColorStop(0.35, withAlpha(lerpColor(colorDeep, '#031018', 0.4), 0.18 * I * (0.5 + (1 - calm) * 0.2)));
  nadir.addColorStop(0.7, withAlpha(lerpColor(colorDeep, '#020c14', 0.55), 0.42 * I));
  nadir.addColorStop(1, withAlpha('#01060c', 0.62 * I));
  ctx.fillStyle = nadir;
  ctx.fillRect(cx - hw, cy - hh * 0.05, hw * 2, hh * 1.05);

  // Extra graze rim along top ellipse edge (Fresnel peak)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const graze = ctx.createRadialGradient(cx, cy - hh * 0.55, 0, cx, cy - hh * 0.2, hw * 0.95);
  graze.addColorStop(0, withAlpha('#ffffff', 0.12 * a * calm));
  graze.addColorStop(0.35, withAlpha(colorSkyBright, 0.08 * a));
  graze.addColorStop(0.7, withAlpha(colorSky, 0.03 * a));
  graze.addColorStop(1, withAlpha(colorSky, 0));
  ctx.fillStyle = graze;
  ctx.beginPath();
  ctx.ellipse(cx, cy - hh * 0.42, hw * 0.92, hh * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSkyMirror(
  ctx: CanvasRenderingContext2D,
  params: WaterParams,
  t: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  colorSky: string,
  colorSkyBright: string,
  reflectivity: number,
  calm: number,
  I: number,
): void {
  ctx.save();
  const bandTop = cy - hh * 0.92;
  const bandBot = cy + hh * 0.02;
  const sky = ctx.createLinearGradient(cx, bandTop, cx, bandBot);
  const a = reflectivity * I;
  sky.addColorStop(0, withAlpha(colorSkyBright, 0.72 * a));
  sky.addColorStop(0.18, withAlpha(colorSky, 0.58 * a));
  sky.addColorStop(0.45, withAlpha(colorSky, 0.32 * a * (0.85 + calm * 0.15)));
  sky.addColorStop(0.72, withAlpha(lerpColor(colorSky, params.material.baseColor, 0.45), 0.06 * a));
  sky.addColorStop(1, withAlpha(colorSky, 0));
  ctx.fillStyle = sky;
  ctx.fillRect(cx - hw, bandTop, hw * 2, bandBot - bandTop);

  // Soft sky sheets — filled ellipses, no stroked bands
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const u = i / 4;
    const y =
      cy -
      hh * 0.72 +
      u * hh * 0.42 +
      fbm2(i * 0.7, t * 0.1 + params.seed * 0.001, 2, params.seed + i) * 2.2 * params.waveStrength;
    const h = 1.4 + (1 - u) * 2.4;
    const aSheet = (0.02 + (1 - u) * 0.035) * a * calm;
    const g = ctx.createLinearGradient(cx, y - h, cx, y + h);
    g.addColorStop(0, withAlpha(colorSkyBright, 0));
    g.addColorStop(0.5, withAlpha(colorSkyBright, aSheet));
    g.addColorStop(1, withAlpha(colorSkyBright, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(
      cx + fbm2(i, t * 0.08, 1, params.seed) * hw * 0.08,
      y,
      hw * (0.5 + u * 0.28),
      h,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Shore foliage reflections: soft vertical stretch from the waterline,
 * stronger near horizon (Fresnel), fading into depth. No upright triangles.
 */
function drawShoreReflections(
  ctx: CanvasRenderingContext2D,
  params: WaterParams,
  t: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  reflectivity: number,
  calm: number,
): void {
  const rand = mulberry32((params.seed | 0) ^ 0x51a2);
  const waterline = cy - hh * 0.76;
  const stretch = 2.15 + calm * 0.55;
  const wave = params.waveStrength;
  const baseA = 0.62 * reflectivity * params.intensity;
  const canopyH = hh * 0.58 * stretch;

  ctx.save();

  // Continuous mirrored canopy veil — soft vertical stretch from waterline
  const canopy = ctx.createLinearGradient(cx, waterline - hh * 0.02, cx, waterline + canopyH);
  canopy.addColorStop(0, withAlpha('#061410', 0));
  canopy.addColorStop(0.04, withAlpha('#081a12', baseA * 0.72));
  canopy.addColorStop(0.12, withAlpha('#0c2418', baseA * 0.78));
  canopy.addColorStop(0.28, withAlpha('#123024', baseA * 0.38));
  canopy.addColorStop(0.5, withAlpha('#0e281c', baseA * 0.14));
  canopy.addColorStop(0.78, withAlpha('#0a1820', baseA * 0.04));
  canopy.addColorStop(1, withAlpha('#061018', 0));
  ctx.fillStyle = canopy;
  ctx.fillRect(cx - hw, waterline - hh * 0.02, hw * 2, canopyH + hh * 0.02);

  // Soft vertical trunks/crowns — elongated ellipses + gradients (mirrored stretch)
  const count = 32;
  for (let i = 0; i < count; i++) {
    const u = (i + 0.25) / count;
    const x0 = cx - hw * 0.96 + u * hw * 1.92;
    const treeH = (36 + rand() * 72) * stretch * (0.55 + params.height / 280);
    const crownW = 10 + rand() * 22;
    // Fresnel: reflections strongest near waterline (horizon graze)
    const fresnel = Math.pow(Math.max(0, 1 - treeH / (hh * 1.35)), 0.35);

    // Soft stretched crown as stacked soft ellipses (vertical blur, not triangles)
    const slices = 14;
    for (let s = 0; s < slices; s++) {
      const v = s / (slices - 1);
      const depthFade = 1 - v * 0.94;
      const a = baseA * fresnel * depthFade * (0.6 + calm * 0.4);
      if (a < 0.012) continue;
      const y = waterline + v * treeH;
      const wobble =
        fbm2(i * 0.55 + v * 2.4, t * 0.07, 2, params.seed) * (2.5 + wave * 10) +
        Math.sin(t * 0.35 + i + v * 5) * wave * 3.5;
      // Wider near waterline, gently taper — soft stretch, not cone triangles
      const halfW = crownW * (1.05 - v * 0.35) * (0.7 + (1 - v) * 0.45);
      const sliceH = (3.2 + wave * 1.8) * (1 + v * 0.55);
      const g = ctx.createRadialGradient(x0 + wobble, y, 0, x0 + wobble, y, halfW);
      g.addColorStop(0, withAlpha(v < 0.15 ? '#0a1c14' : '#143528', a));
      g.addColorStop(0.5, withAlpha('#0e281c', a * 0.45));
      g.addColorStop(1, withAlpha('#081820', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x0 + wobble, y, halfW, sliceH, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Soft trunk reflection — vertical gradient, feathered sides
    const tw = 1.1 + rand() * 2.0;
    const th = treeH * 0.92;
    const tx = x0 + fbm2(i, t * 0.05, 1, params.seed) * wave * 2.5;
    const tg = ctx.createLinearGradient(tx, waterline, tx, waterline + th);
    tg.addColorStop(0, withAlpha('#061410', baseA * fresnel * 0.75));
    tg.addColorStop(0.35, withAlpha('#0a2016', baseA * fresnel * 0.35));
    tg.addColorStop(1, withAlpha('#061018', 0));
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.ellipse(tx, waterline + th * 0.45, tw, th * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Waterline blur — soft mirror seam (no hard bar)
  const blur = ctx.createLinearGradient(cx, waterline - 6, cx, waterline + hh * 0.36);
  blur.addColorStop(0, withAlpha('#0a1820', 0.32 * reflectivity * params.intensity));
  blur.addColorStop(0.18, withAlpha('#0c1c24', 0.16 * reflectivity * params.intensity));
  blur.addColorStop(0.5, withAlpha('#081820', 0.06 * reflectivity));
  blur.addColorStop(1, withAlpha('#081820', 0));
  ctx.fillStyle = blur;
  ctx.fillRect(cx - hw, waterline - 8, hw * 2, hh * 0.4);

  // Extra Fresnel darkening just below waterline (mirrored canopy density)
  const fres = ctx.createLinearGradient(cx, waterline, cx, waterline + hh * 0.28);
  fres.addColorStop(0, withAlpha('#04120e', 0.48 * reflectivity * params.intensity * calm));
  fres.addColorStop(0.3, withAlpha('#081820', 0.16 * reflectivity));
  fres.addColorStop(1, withAlpha('#081820', 0));
  ctx.fillStyle = fres;
  ctx.fillRect(cx - hw, waterline, hw * 2, hh * 0.28);

  ctx.restore();
}

function drawWaterlineMist(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  calm: number,
  I: number,
): void {
  const top = cy - hh * 0.9;
  const mist = ctx.createLinearGradient(cx, top, cx, cy - hh * 0.28);
  mist.addColorStop(0, withAlpha('#f4f8fb', 0.32 * calm * I));
  mist.addColorStop(0.28, withAlpha('#e4eef5', 0.14 * calm * I));
  mist.addColorStop(0.65, withAlpha('#d5e4ee', 0.04 * calm * I));
  mist.addColorStop(1, withAlpha('#d5e4ee', 0));
  ctx.fillStyle = mist;
  ctx.fillRect(cx - hw, top, hw * 2, hh * 0.62);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const u = (i + 0.5) / 6;
    const px = cx - hw * 0.75 + u * hw * 1.5;
    const py = top + hh * 0.07 + (i % 2) * 3;
    const rw = hw * (0.14 + (i % 3) * 0.04);
    const rh = hh * 0.05;
    const g = ctx.createRadialGradient(px, py, 0, px, py, rw);
    g.addColorStop(0, withAlpha('#ffffff', 0.07 * calm * I));
    g.addColorStop(1, withAlpha('#ffffff', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, py, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Micro surface variation only — soft filled lobes, no stroked ripple lines.
 */
function drawMicroRipples(
  ctx: CanvasRenderingContext2D,
  params: WaterParams,
  t: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  calm: number,
): void {
  const strength = params.waveStrength * (0.2 + (1 - calm) * 0.8);
  if (strength < 0.015) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const lobes = Math.max(4, Math.floor(5 + params.waveStrength * 6));
  for (let i = 0; i < lobes; i++) {
    const phase = t * (0.22 + strength * 0.25) + i * 1.15 + params.seed * 0.0001;
    const n = fbm2(i * 0.45, phase, 2, params.seed);
    const u = (i + 0.4) / lobes;
    const px =
      cx -
      hw * 0.72 +
      u * hw * 1.44 +
      fbm2(u * 2, phase * 0.4, 2, params.seed) * hw * 0.06 * strength;
    const py =
      cy -
      hh * 0.35 +
      (i / Math.max(1, lobes - 1)) * hh * 0.7 +
      Math.sin(phase) * 2.2 * strength +
      n * 2.8 * strength;
    const rw = hw * (0.08 + ((i * 7) % 5) * 0.018) * (0.7 + params.waveScale * 0.35);
    const rh = 1.1 + strength * 1.6 + ((i * 3) % 3) * 0.4;
    const a = (0.012 + (i % 3) * 0.006) * params.intensity * (0.35 + strength);
    const g = ctx.createRadialGradient(px, py, 0, px, py, rw);
    g.addColorStop(0, withAlpha('#d8eefc', a));
    g.addColorStop(0.45, withAlpha('#b8d8ef', a * 0.35));
    g.addColorStop(1, withAlpha('#a0c8e0', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, py, rw, rh, Math.sin(phase + i) * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle mid-band micro shimmer patches (fills only)
  for (let i = 0; i < 8; i++) {
    const phase = t * 0.18 + i * 0.9;
    const px = cx + fbm2(i * 1.1, phase, 2, params.seed) * hw * 0.7;
    const py = cy + fbm2(i * 0.8 + 2, phase * 0.7, 2, params.seed + 9) * hh * 0.45;
    const rw = 4 + (i % 4) * 3;
    const rh = 0.8 + strength * 1.2;
    const a = 0.01 * params.intensity * strength * (0.5 + calm * 0.5);
    if (a < 0.002) continue;
    const g = ctx.createRadialGradient(px, py, 0, px, py, rw);
    g.addColorStop(0, withAlpha('#cfe8ff', a));
    g.addColorStop(1, withAlpha('#cfe8ff', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, py, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Thin elongated sky-edge sheen + anisotropic streaks (soft fills preferred).
 */
function drawAnisotropicSpeculars(
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
  tint: string,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const I = params.intensity;
  const aBase = reflectivity * I;

  // Horizon graze sheen — brighter at far waterline (Fresnel)
  const sheenY = cy - hh * 0.7 + Math.sin(t * 0.22) * 1.0;
  const sheenH = Math.max(1.4, hh * 0.022);
  const sheen = ctx.createLinearGradient(cx - hw, sheenY, cx + hw, sheenY);
  sheen.addColorStop(0, withAlpha('#ffffff', 0));
  sheen.addColorStop(0.12, withAlpha('#d4eaff', 0.04 * aBase));
  sheen.addColorStop(0.38, withAlpha('#ffffff', 0.2 * aBase * calm));
  sheen.addColorStop(0.5, withAlpha('#eef6ff', 0.28 * aBase * calm));
  sheen.addColorStop(0.62, withAlpha('#ffffff', 0.2 * aBase * calm));
  sheen.addColorStop(0.88, withAlpha('#d4eaff', 0.04 * aBase));
  sheen.addColorStop(1, withAlpha('#ffffff', 0));
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.ellipse(cx, sheenY, hw * 0.9, sheenH, 0, 0, Math.PI * 2);
  ctx.fill();

  const sheen2Y = sheenY + hh * 0.05;
  const sheen2 = ctx.createLinearGradient(cx - hw * 0.65, sheen2Y, cx + hw * 0.65, sheen2Y);
  sheen2.addColorStop(0, withAlpha('#ffffff', 0));
  sheen2.addColorStop(0.45, withAlpha(tint, 0.07 * aBase * calm));
  sheen2.addColorStop(0.5, withAlpha('#ffffff', 0.12 * aBase * calm));
  sheen2.addColorStop(0.55, withAlpha(tint, 0.07 * aBase * calm));
  sheen2.addColorStop(1, withAlpha('#ffffff', 0));
  ctx.fillStyle = sheen2;
  ctx.beginPath();
  ctx.ellipse(cx, sheen2Y, hw * 0.64, sheenH * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  // Soft anisotropic glints as elongated ellipses (avoid hard stroke filaments)
  const streakCount = 14 + Math.floor(params.waveStrength * 5);
  for (let i = 0; i < streakCount; i++) {
    const u = (i + 0.5) / streakCount;
    const nx = fbm2(i * 1.3, t * 0.14 + params.seed * 0.002, 2, params.seed + i);
    const ny = fbm2(i * 0.9 + 3, t * 0.11, 2, params.seed + 50 + i);
    const px = cx + (u - 0.5) * hw * 1.6 + nx * hw * 0.1;
    // Bias toward horizon band; fade toward nadir
    const py = cy - hh * 0.48 + ny * hh * 0.32 + (i % 5) * hh * 0.028;
    const nadirFade = Math.max(0.15, 1 - (py - (cy - hh * 0.7)) / (hh * 1.1));
    const len = hw * (0.05 + ((i * 17) % 5) * 0.024) * (0.75 + calm * 0.35);
    const pulse = 0.85 + Math.sin(t * 0.85 + i * 1.3) * 0.15;
    const a = (0.035 + (i % 4) * 0.01) * aBase * pulse * (0.5 + calm * 0.5) * nadirFade;
    const ang = Math.sin(t * 0.18 + i) * 0.06;
    const g = ctx.createRadialGradient(px, py, 0, px, py, len);
    g.addColorStop(0, withAlpha('#ffffff', a));
    g.addColorStop(0.45, withAlpha('#d4eaff', a * 0.35));
    g.addColorStop(1, withAlpha('#ffffff', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, py, len, 0.7 + ((i * 13) % 3) * 0.25, ang, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const light of scene.lights) {
    const dx = light.x - cx;
    const dy = light.y - cy;
    const dist = Math.hypot(dx, dy);
    const influence = Math.max(0, 1 - dist / (light.radius + Math.max(hw, hh) * 1.1));
    if (influence <= 0.03) continue;

    const rx = cx + dx * 0.16 + Math.sin(t * 0.35 + light.x * 0.01) * 2 * params.waveStrength;
    const ry = cy - hh * 0.28 + Math.min(hh * 0.25, Math.max(0, dy) * 0.04);
    const pulse = 0.9 + Math.sin(t * 1.2 + light.x * 0.01) * 0.1;
    const streakH = (hh * 0.28 + light.radius * 0.035) * (0.8 + calm * 0.3) * pulse;
    const a = 0.16 * influence * reflectivity * I * light.intensity * pulse;

    const g = ctx.createLinearGradient(rx, ry - streakH, rx, ry + streakH);
    g.addColorStop(0, withAlpha(light.color, 0));
    g.addColorStop(0.45, withAlpha(light.color, a));
    g.addColorStop(0.55, withAlpha('#ffffff', a * 0.55));
    g.addColorStop(1, withAlpha(light.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(rx, ry, 1.6 + light.radius * 0.01, streakH, 0, 0, Math.PI * 2);
    ctx.fill();

    const hx = 8 + light.radius * 0.035;
    const hg = ctx.createRadialGradient(rx, ry, 0, rx, ry, hx);
    hg.addColorStop(0, withAlpha('#ffffff', a * 0.35));
    hg.addColorStop(1, withAlpha('#ffffff', 0));
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.ellipse(rx, ry, hx, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawShore(
  ctx: CanvasRenderingContext2D,
  params: WaterParams,
  t: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  colorFoam: string,
  calm: number,
  feather: number,
): void {
  ctx.save();
  const foamPulse = 0.88 + Math.sin(t * 0.9) * 0.12;
  const a = 0.1 * params.shoreFoam * params.intensity * foamPulse * (0.45 + calm * 0.55);

  // Soft foam ring — filled annular feather, not a hard stroked ellipse
  for (let k = 0; k < 3; k++) {
    const inset = k * 2.2;
    const rw = hw - inset + feather * 0.15;
    const rh = hh - inset * 0.85 + feather * 0.1;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw + 3, rh + 3, 0, 0, Math.PI * 2);
    ctx.ellipse(cx, cy, Math.max(4, rw - 4 - k), Math.max(3, rh - 3 - k * 0.8), 0, 0, Math.PI * 2);
    ctx.clip('evenodd');
    ctx.translate(cx, cy);
    ctx.scale(rw, rh);
    const rg = ctx.createRadialGradient(0, 0, 0.82, 0, 0, 1.05);
    rg.addColorStop(0, withAlpha(colorFoam, 0));
    rg.addColorStop(0.7, withAlpha(colorFoam, a * (0.55 - k * 0.12)));
    rg.addColorStop(1, withAlpha(colorFoam, 0));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, 1.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + t * 0.05;
    const px = cx + Math.cos(ang) * (hw - 6);
    const py = cy + Math.sin(ang) * (hh - 5);
    const rw = 6 + (i % 3) * 3;
    const rh = 2.5 + (i % 2);
    const g = ctx.createRadialGradient(px, py, 0, px, py, rw);
    g.addColorStop(0, withAlpha(colorFoam, 0.06 * params.shoreFoam * params.intensity));
    g.addColorStop(1, withAlpha(colorFoam, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, py, rw, rh, ang, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function disposeWaterInstance(_instanceId: string): void {}

export const waterEffect: EffectModule<WaterParams> = {
  id: 'water',
  name: 'Water',
  description: 'Clear reflective lake: feathered shore, sky mirror, Fresnel graze, micro ripples.',
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
    shoreFoam: 0.35,
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
