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

/** Scratch canvas for feathered lake masking (allocation-light). */
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
 * Soft lake body mask: wide feather so silhouette reads as a surface region,
 * not a floating oval sticker / UI lens. No bright rim in the mask itself.
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
  const pad = Math.ceil(Math.max(feather * 2.5, 16));
  const left = Math.floor(cx - hw - pad);
  const top = Math.floor(cy - hh - pad);
  const width = Math.ceil(hw * 2 + pad * 2);
  const height = Math.ceil(hh * 2 + pad * 2);
  const layer = getSoftMaskCtx(width, height);

  layer.save();
  layer.translate(-left, -top);
  paint(layer);
  layer.restore();

  // Destination-in with a heavily feathered elliptical alpha.
  // Interior stays opaque; rim fades to 0 over a wide band — no hard shore stroke.
  layer.save();
  layer.globalCompositeOperation = 'destination-in';
  layer.setTransform(hw, 0, 0, hh, cx - left, cy - top);
  const inset = Math.max(0.18, Math.min(0.48, feather / Math.min(hw, hh)));
  const g = layer.createRadialGradient(0, 0, Math.max(0, 1 - inset), 0, 0, 1.02);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.35, 'rgba(0,0,0,1)');
  g.addColorStop(0.62, 'rgba(0,0,0,0.92)');
  g.addColorStop(0.78, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.9, 'rgba(0,0,0,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  layer.fillStyle = g;
  layer.beginPath();
  layer.arc(0, 0, 1.02, 0, Math.PI * 2);
  layer.fill();
  layer.restore();

  ctx.drawImage(layer.canvas, left, top);
}

export const drawWater: DrawFn<WaterParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  const mat = params.material;
  const colorDeep = mat.baseColor;
  const colorShallow = mat.emissive;
  const colorSky = lerpColor(mat.emissive, '#9ecceb', 0.55);
  const colorHorizon = lerpColor(colorSky, '#e8f4fc', 0.72);
  const reflectivity = Math.max(0, Math.min(1.6, mat.metalness * (1.25 - mat.roughness * 0.85)));
  const calm = 1 - Math.min(1, params.waveStrength * 0.9);
  const I = params.intensity;

  const hw = Math.max(20, params.width * 0.5);
  const hh = Math.max(12, params.height * 0.5);
  const cx = params.x;
  const cy = params.y;
  // Wide feather kills oval-bubble silhouette
  const feather = Math.max(28, Math.min(hw, hh) * 0.28);

  ctx.save();
  applyMaterial(ctx, mat);

  drawWithSoftLakeMask(ctx, cx, cy, hw, hh, feather, (layer) => {
    drawLakeBody(layer, cx, cy, hw, hh, colorDeep, colorShallow, colorSky, colorHorizon, I);
    drawFresnel(layer, cx, cy, hw, hh, colorHorizon, colorSky, colorDeep, reflectivity, calm, I);

    if (reflectivity > 0.04) {
      drawContinuousMirror(layer, params, t, cx, cy, hw, hh, colorSky, colorHorizon, reflectivity, calm, I);
    }

    drawMicroSurface(layer, params, t, cx, cy, hw, hh, calm, reflectivity);

    if (reflectivity > 0.05) {
      drawSoftLightKiss(layer, params, scene, t, cx, cy, hw, hh, reflectivity, calm);
    }
  });

  ctx.restore();

  // Far-shore contact only — never a full oval foam ring (that reads as UI lens).
  if (params.shoreFoam > 0.02) {
    drawFarShoreContact(ctx, params, cx, cy, hw, hh, calm, feather);
  }
};

/**
 * Depth body: pale near far shore, deep navy toward viewer (nadir).
 * Soft rectangular fills — silhouette comes from the feathered mask.
 */
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
  const pad = 8;
  const vert = ctx.createLinearGradient(cx, cy - hh, cx, cy + hh);
  // Far shore / graze: sky-tinted shallow water
  vert.addColorStop(0, withAlpha(lerpColor(colorHorizon, colorShallow, 0.25), 0.72 * I));
  vert.addColorStop(0.14, withAlpha(lerpColor(colorSky, colorShallow, 0.35), 0.82 * I));
  vert.addColorStop(0.34, withAlpha(lerpColor(colorShallow, colorDeep, 0.25), 0.88 * I));
  vert.addColorStop(0.62, withAlpha(colorDeep, 0.94 * I));
  vert.addColorStop(1, withAlpha(lerpColor(colorDeep, '#010810', 0.65), 0.99 * I));
  ctx.fillStyle = vert;
  ctx.fillRect(cx - hw - pad, cy - hh - pad, hw * 2 + pad * 2, hh * 2 + pad * 2);

  // Gentle lateral bank shallowing (very soft, no circular blobs)
  for (const side of [-1, 1] as const) {
    const gx = cx + side * hw * 0.92;
    const g = ctx.createLinearGradient(gx, cy, cx + side * hw * 0.2, cy);
    g.addColorStop(0, withAlpha(lerpColor(colorShallow, colorSky, 0.4), 0.14 * I));
    g.addColorStop(1, withAlpha(colorShallow, 0));
    ctx.fillStyle = g;
    ctx.fillRect(
      side < 0 ? cx - hw - pad : cx,
      cy - hh,
      hw + pad,
      hh * 2,
    );
  }
}

/**
 * Fresnel: brighter near far shore (graze), darker in nadir toward viewer.
 * Pure vertical field — no bright elliptical rim.
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

  // Grazing reflection sheet along far shore
  const graze = ctx.createLinearGradient(cx, cy - hh, cx, cy - hh * 0.05);
  graze.addColorStop(0, withAlpha(colorHorizon, 0.62 * a * (0.75 + calm * 0.25)));
  graze.addColorStop(0.22, withAlpha(colorSky, 0.42 * a));
  graze.addColorStop(0.55, withAlpha(colorSky, 0.14 * a));
  graze.addColorStop(1, withAlpha(colorSky, 0));
  ctx.fillStyle = graze;
  ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 0.95);

  // Nadir absorption — looking down into the lake
  const nadir = ctx.createLinearGradient(cx, cy - hh * 0.15, cx, cy + hh);
  nadir.addColorStop(0, withAlpha(colorDeep, 0));
  nadir.addColorStop(0.4, withAlpha(lerpColor(colorDeep, '#021018', 0.35), 0.22 * I));
  nadir.addColorStop(0.75, withAlpha(lerpColor(colorDeep, '#010c14', 0.55), 0.5 * I));
  nadir.addColorStop(1, withAlpha('#00060c', 0.7 * I));
  ctx.fillStyle = nadir;
  ctx.fillRect(cx - hw, cy - hh * 0.15, hw * 2, hh * 1.15);
}

/**
 * Continuous sky + treeline mirror: one vertically flipped soft band.
 * No triangle stamps, no discrete glitch streaks.
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
  const waterline = cy - hh * 0.78;
  const mirrorH = hh * 1.55;

  ctx.save();

  // --- Sky mirror (continuous vertical flip of sky gradient) ---
  const sky = ctx.createLinearGradient(cx, waterline, cx, waterline + mirrorH);
  sky.addColorStop(0, withAlpha(colorHorizon, 0.78 * a));
  sky.addColorStop(0.08, withAlpha(colorSky, 0.68 * a));
  sky.addColorStop(0.28, withAlpha(colorSky, 0.4 * a * (0.85 + calm * 0.15)));
  sky.addColorStop(0.55, withAlpha(lerpColor(colorSky, params.material.baseColor, 0.4), 0.12 * a));
  sky.addColorStop(1, withAlpha(colorSky, 0));
  ctx.fillStyle = sky;
  ctx.fillRect(cx - hw, waterline, hw * 2, mirrorH);

  // Soft horizon haze just below waterline (sky brightening, not a rim stroke)
  const haze = ctx.createLinearGradient(cx, waterline - 2, cx, waterline + hh * 0.18);
  haze.addColorStop(0, withAlpha('#f2f7fb', 0.28 * a * calm));
  haze.addColorStop(0.35, withAlpha(colorHorizon, 0.12 * a));
  haze.addColorStop(1, withAlpha(colorHorizon, 0));
  ctx.fillStyle = haze;
  ctx.fillRect(cx - hw, waterline - 2, hw * 2, hh * 0.2);

  // --- Continuous treeline mirror (one soft canopy silhouette, stretched down) ---
  drawContinuousTreelineMirror(ctx, params, t, cx, waterline, hw, hh, a, calm);

  ctx.restore();
}

/**
 * Build one continuous soft canopy silhouette along the waterline and stretch
 * it downward as a vertically flipped reflection band.
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
  const rand = mulberry32((params.seed | 0) ^ 0x71c3);
  const stretch = 1.9 + calm * 0.4;
  const canopyH = hh * 0.55 * stretch;
  const wave = params.waveStrength;
  const samples = Math.max(64, Math.floor(hw / 5));

  // Continuous canopy height profile (low-frequency — rolling forest, not spikes)
  const heights: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const n =
      fbm2(u * 2.8, params.seed * 0.001, 3, params.seed) * 0.5 +
      fbm2(u * 6.5, 0.15, 2, params.seed + 3) * 0.28 +
      (rand() - 0.5) * 0.06;
    heights.push(Math.max(canopyH * 0.28, (0.48 + n * 0.35) * canopyH));
  }

  // Base continuous canopy veil (density peaks at waterline, fades into depth)
  const veil = ctx.createLinearGradient(cx, waterline, cx, waterline + canopyH);
  veil.addColorStop(0, withAlpha('#061410', 0));
  veil.addColorStop(0.04, withAlpha('#0a1c14', 0.78 * a));
  veil.addColorStop(0.14, withAlpha('#10281c', 0.72 * a));
  veil.addColorStop(0.32, withAlpha('#143024', 0.28 * a));
  veil.addColorStop(0.58, withAlpha('#0c2018', 0.08 * a));
  veil.addColorStop(1, withAlpha('#061018', 0));
  ctx.fillStyle = veil;
  ctx.fillRect(cx - hw, waterline, hw * 2, canopyH);

  // Single filled canopy polygon: waterline → height profile → back along waterline+fade
  // Soft micro-warp on the far edge keeps it continuous (not glitch streaks).
  ctx.beginPath();
  ctx.moveTo(cx - hw, waterline);
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const x = cx - hw + u * hw * 2;
    const wobble =
      fbm2(u * 3.5, t * 0.05 + params.seed * 0.001, 2, params.seed) * (1.5 + wave * 5) +
      Math.sin(t * 0.25 + u * 8) * wave * 2;
    ctx.lineTo(x, waterline + heights[i]! + wobble);
  }
  ctx.lineTo(cx + hw, waterline);
  ctx.closePath();

  const canopyFill = ctx.createLinearGradient(cx, waterline, cx, waterline + canopyH);
  canopyFill.addColorStop(0, withAlpha('#0a1a12', 0.7 * a * (0.7 + calm * 0.3)));
  canopyFill.addColorStop(0.2, withAlpha('#143528', 0.45 * a));
  canopyFill.addColorStop(0.55, withAlpha('#0e281c', 0.12 * a));
  canopyFill.addColorStop(1, withAlpha('#081820', 0));
  ctx.fillStyle = canopyFill;
  ctx.fill();

  // Soft vertical stretch layers — same silhouette, progressively more transparent
  for (let k = 1; k <= 4; k++) {
    const kT = k / 4;
    const extra = canopyH * 0.12 * kT;
    const layerA = 0.22 * a * (1 - kT) * calm;
    if (layerA < 0.01) continue;
    ctx.beginPath();
    ctx.moveTo(cx - hw, waterline);
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const x = cx - hw + u * hw * 2;
      const wobble =
        fbm2(u * 3.5 + k * 0.2, t * 0.05, 2, params.seed + k) * (1 + wave * 4);
      ctx.lineTo(x, waterline + heights[i]! * (1 + 0.08 * k) + extra + wobble);
    }
    ctx.lineTo(cx + hw, waterline);
    ctx.closePath();
    const lg = ctx.createLinearGradient(cx, waterline, cx, waterline + canopyH + extra);
    lg.addColorStop(0, withAlpha('#0c2018', layerA));
    lg.addColorStop(0.4, withAlpha('#102820', layerA * 0.4));
    lg.addColorStop(1, withAlpha('#081820', 0));
    ctx.fillStyle = lg;
    ctx.fill();
  }

  // Soft mid-frequency darkening ribbons (trunk mass) — wide soft ellipses, not stamps
  for (let i = 0; i < 16; i++) {
    const u = (i + 0.4) / 16;
    const idx = Math.min(samples, Math.floor(u * samples));
    const x =
      cx - hw * 0.94 + u * hw * 1.88 + fbm2(i * 0.6, t * 0.04, 1, params.seed) * wave * 2.5;
    const th = heights[idx]! * 0.88;
    const tw = 6 + (i % 5) * 2.5;
    const tg = ctx.createLinearGradient(x, waterline, x, waterline + th);
    tg.addColorStop(0, withAlpha('#061410', 0.32 * a * calm));
    tg.addColorStop(0.35, withAlpha('#0a1c14', 0.12 * a));
    tg.addColorStop(1, withAlpha('#061018', 0));
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.ellipse(x, waterline + th * 0.4, tw, th * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft waterline seam (no hard bar)
  const seam = ctx.createLinearGradient(cx, waterline - 3, cx, waterline + hh * 0.2);
  seam.addColorStop(0, withAlpha('#0a1814', 0.28 * a));
  seam.addColorStop(0.3, withAlpha('#0c1c18', 0.1 * a));
  seam.addColorStop(1, withAlpha('#081820', 0));
  ctx.fillStyle = seam;
  ctx.fillRect(cx - hw, waterline - 3, hw * 2, hh * 0.22);
}

/**
 * Micro surface variation only — soft filled mottling, no cartoon ripples,
 * no white horizontal motion-blur bands.
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
  // Soft dark/light mottling (source-over, very low alpha) — not lighter streaks
  const patches = Math.max(5, Math.floor(6 + params.waveStrength * 5));
  for (let i = 0; i < patches; i++) {
    const phase = t * (0.12 + strength * 0.15) + i * 1.4 + params.seed * 0.0001;
    const u = (i + 0.3) / patches;
    const px =
      cx -
      hw * 0.7 +
      u * hw * 1.4 +
      fbm2(u * 2, phase * 0.35, 2, params.seed) * hw * 0.05 * strength;
    const py =
      cy -
      hh * 0.25 +
      (i / Math.max(1, patches - 1)) * hh * 0.65 +
      Math.sin(phase) * 1.6 * strength;
    const rw = hw * (0.1 + ((i * 5) % 4) * 0.03) * (0.65 + params.waveScale * 0.3);
    const rh = 2.2 + strength * 2.5 + ((i * 3) % 3) * 0.6;
    const a = (0.018 + (i % 3) * 0.008) * params.intensity * strength;
    const g = ctx.createRadialGradient(px, py, 0, px, py, rw);
    g.addColorStop(0, withAlpha('#1a4060', a * 0.7));
    g.addColorStop(0.5, withAlpha('#0e2838', a * 0.25));
    g.addColorStop(1, withAlpha('#0a1820', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, py, rw, rh, Math.sin(phase + i) * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tiny sky-kiss glints near far shore only (Fresnel region) — micro, not bands
  if (reflectivity > 0.1) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const phase = t * 0.2 + i * 1.1;
      const px = cx + fbm2(i * 1.2, phase, 2, params.seed) * hw * 0.55;
      const py = cy - hh * 0.62 + fbm2(i * 0.9, phase * 0.6, 2, params.seed + 7) * hh * 0.12;
      const rw = 5 + (i % 3) * 4;
      const rh = 0.7 + strength * 0.8;
      const a = 0.018 * params.intensity * reflectivity * calm * strength;
      if (a < 0.002) continue;
      const g = ctx.createRadialGradient(px, py, 0, px, py, rw);
      g.addColorStop(0, withAlpha('#d8eefc', a));
      g.addColorStop(1, withAlpha('#d8eefc', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(px, py, rw, rh, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Soft light caustic kisses — vertical soft ellipses only, no horizontal white bands. */
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
    if (influence <= 0.04) continue;

    const rx = cx + dx * 0.12 + Math.sin(t * 0.3 + light.x * 0.01) * 1.5 * params.waveStrength;
    // Bias toward mid-far band; fade toward nadir
    const ry = cy - hh * 0.35 + Math.min(hh * 0.2, Math.max(0, dy) * 0.03);
    const pulse = 0.92 + Math.sin(t * 1.0 + light.x * 0.01) * 0.08;
    const streakH = (hh * 0.22 + light.radius * 0.02) * (0.75 + calm * 0.25) * pulse;
    const a = 0.08 * influence * reflectivity * I * light.intensity * pulse;

    const g = ctx.createLinearGradient(rx, ry - streakH, rx, ry + streakH);
    g.addColorStop(0, withAlpha(light.color, 0));
    g.addColorStop(0.5, withAlpha(light.color, a));
    g.addColorStop(1, withAlpha(light.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(rx, ry, 1.2 + light.radius * 0.008, streakH, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Far-shore contact mist only — soft horizontal fade at the waterline.
 * Never draws a full oval foam ring (that creates the bubble/UI-lens rim).
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
  const a = 0.12 * params.shoreFoam * params.intensity * (0.5 + calm * 0.5);
  if (a < 0.004) return;

  const waterline = cy - hh * 0.78;
  ctx.save();

  // Soft mist band along far shore — fades at sides with the lake feather
  const mist = ctx.createLinearGradient(cx, waterline - 10, cx, waterline + hh * 0.12);
  mist.addColorStop(0, withAlpha('#eef6fb', 0));
  mist.addColorStop(0.35, withAlpha('#e8f2f8', a * 0.55));
  mist.addColorStop(0.6, withAlpha('#d8e8f0', a * 0.2));
  mist.addColorStop(1, withAlpha('#d0e0e8', 0));
  ctx.fillStyle = mist;

  // Horizontal band clipped softly so it doesn't form a bright oval rim
  const bandW = hw * 2 - feather * 1.2;
  const bandH = Math.max(8, hh * 0.1);
  ctx.beginPath();
  ctx.ellipse(cx, waterline + bandH * 0.2, bandW * 0.5, bandH, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function disposeWaterInstance(_instanceId: string): void {}

export const waterEffect: EffectModule<WaterParams> = {
  id: 'water',
  name: 'Water',
  description:
    'Clear reflective lake: feathered surface region, continuous sky/treeline mirror, Fresnel graze, micro ripples.',
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
    shoreFoam: 0.2,
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
