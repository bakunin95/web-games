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

  ctx.save();
  applyMaterial(ctx, mat);

  ctx.beginPath();
  ctx.ellipse(cx, cy, hw, hh, 0, 0, Math.PI * 2);
  ctx.clip();

  drawDepthBody(ctx, cx, cy, hw, hh, colorDeep, colorShallow, colorSky, I);

  if (reflectivity > 0.04) {
    drawSkyMirror(ctx, params, t, cx, cy, hw, hh, colorSky, colorSkyBright, reflectivity, calm, I);
  }

  if (reflectivity > 0.1) {
    drawShoreReflections(ctx, params, t, cx, cy, hw, hh, reflectivity, calm);
  }

  drawWaterlineMist(ctx, cx, cy, hw, hh, calm, I);
  drawRipples(ctx, params, t, cx, cy, hw, hh, calm);

  if (reflectivity > 0) {
    drawAnisotropicSpeculars(ctx, params, scene, t, cx, cy, hw, hh, reflectivity, calm, colorSkyBright);
  }

  ctx.restore();

  if (params.shoreFoam > 0) {
    drawShore(ctx, params, t, cx, cy, hw, hh, colorFoam, calm);
  }
};

/** Shallower/lighter near banks; clearer reflective mid band; deeper toward near shore. */
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
  const vert = ctx.createLinearGradient(cx, cy - hh, cx, cy + hh);
  vert.addColorStop(0, withAlpha(lerpColor(colorSky, colorShallow, 0.25), 0.82 * I));
  vert.addColorStop(0.22, withAlpha(lerpColor(colorShallow, colorSky, 0.55), 0.88 * I));
  vert.addColorStop(0.48, withAlpha(lerpColor(colorShallow, colorSky, 0.2), 0.84 * I));
  vert.addColorStop(0.78, withAlpha(colorDeep, 0.94 * I));
  vert.addColorStop(1, withAlpha(lerpColor(colorDeep, '#031018', 0.5), 0.98 * I));
  ctx.fillStyle = vert;
  ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 2);

  const bank = ctx.createRadialGradient(
    cx,
    cy + hh * 0.12,
    Math.min(hw, hh) * 0.12,
    cx,
    cy,
    Math.max(hw, hh) * 1.08,
  );
  bank.addColorStop(0, withAlpha(colorDeep, 0));
  bank.addColorStop(0.45, withAlpha(colorShallow, 0));
  bank.addColorStop(0.72, withAlpha(lerpColor(colorShallow, colorSky, 0.35), 0.18 * I));
  bank.addColorStop(0.9, withAlpha(lerpColor(colorShallow, '#b8dce8', 0.35), 0.32 * I));
  bank.addColorStop(1, withAlpha(lerpColor(colorShallow, '#c8e8f2', 0.4), 0.4 * I));
  ctx.fillStyle = bank;
  ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 2);

  // Soft lateral shallowing (elongated, not circular blobs)
  for (const side of [-1, 1] as const) {
    const gx = cx + side * hw * 0.88;
    const g = ctx.createRadialGradient(gx, cy + hh * 0.08, 0, gx, cy, hw * 0.7);
    g.addColorStop(0, withAlpha(lerpColor(colorShallow, '#c8e8f0', 0.3), 0.22 * I));
    g.addColorStop(0.45, withAlpha(colorShallow, 0.08 * I));
    g.addColorStop(1, withAlpha(colorShallow, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(gx, cy + hh * 0.05, hw * 0.42, hh * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const near = ctx.createLinearGradient(cx, cy + hh * 0.2, cx, cy + hh);
  near.addColorStop(0, withAlpha(colorDeep, 0));
  near.addColorStop(0.55, withAlpha(lerpColor(colorDeep, colorShallow, 0.4), 0.14 * I));
  near.addColorStop(1, withAlpha(lerpColor(colorShallow, '#6aa8b8', 0.35), 0.32 * I));
  ctx.fillStyle = near;
  ctx.fillRect(cx - hw, cy, hw * 2, hh);
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
  const bandBot = cy + hh * 0.05;
  const sky = ctx.createLinearGradient(cx, bandTop, cx, bandBot);
  const a = reflectivity * I;
  sky.addColorStop(0, withAlpha(colorSkyBright, 0.78 * a));
  sky.addColorStop(0.2, withAlpha(colorSky, 0.62 * a));
  sky.addColorStop(0.48, withAlpha(colorSky, 0.42 * a * (0.85 + calm * 0.15)));
  sky.addColorStop(0.75, withAlpha(lerpColor(colorSky, params.material.baseColor, 0.4), 0.1 * a));
  sky.addColorStop(1, withAlpha(colorSky, 0));
  ctx.fillStyle = sky;
  ctx.fillRect(cx - hw, bandTop, hw * 2, bandBot - bandTop);

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const u = i / 3;
    const y =
      cy -
      hh * 0.7 +
      u * hh * 0.48 +
      fbm2(i * 0.7, t * 0.1 + params.seed * 0.001, 2, params.seed + i) * 2.5 * params.waveStrength;
    const h = 1.2 + (1 - u) * 1.8;
    const aSheet = (0.025 + (1 - u) * 0.03) * a * calm;
    const g = ctx.createLinearGradient(cx, y - h, cx, y + h);
    g.addColorStop(0, withAlpha(colorSkyBright, 0));
    g.addColorStop(0.5, withAlpha(colorSkyBright, aSheet));
    g.addColorStop(1, withAlpha(colorSkyBright, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx + fbm2(i, t * 0.08, 1, params.seed) * hw * 0.1, y, hw * (0.55 + u * 0.25), h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Shore foliage reflections: soft waterline blur, vertical stretch, Fresnel stronger near horizon.
 * Avoids hard-cloned upright triangles.
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
  const waterline = cy - hh * 0.78;
  const stretch = 1.75 + calm * 0.4;
  const wave = params.waveStrength;
  const baseA = 0.48 * reflectivity * params.intensity;
  const canopyH = hh * 0.48 * stretch;

  ctx.save();

  // Soft canopy veil — feathered into sky mirror (no hard waterline bar)
  const canopy = ctx.createLinearGradient(cx, waterline - hh * 0.04, cx, waterline + canopyH);
  canopy.addColorStop(0, withAlpha('#081a12', 0));
  canopy.addColorStop(0.08, withAlpha('#081a12', baseA * 0.55));
  canopy.addColorStop(0.18, withAlpha('#0c2418', baseA * 0.62));
  canopy.addColorStop(0.4, withAlpha('#123024', baseA * 0.22));
  canopy.addColorStop(0.72, withAlpha('#0a1820', baseA * 0.06));
  canopy.addColorStop(1, withAlpha('#061018', 0));
  ctx.fillStyle = canopy;
  ctx.fillRect(cx - hw, waterline - hh * 0.04, hw * 2, canopyH + hh * 0.04);

  const count = 26;
  for (let i = 0; i < count; i++) {
    const u = (i + 0.3) / count;
    const x0 = cx - hw * 0.94 + u * hw * 1.88;
    const treeH = (28 + rand() * 56) * stretch * (0.6 + params.height / 260);
    const crownW = 8 + rand() * 18;
    const fresnel = Math.pow(Math.max(0, 1 - treeH / (hh * 1.05)), 0.4);

    const slices = 10;
    for (let s = 0; s < slices; s++) {
      const v = s / (slices - 1);
      const a = baseA * fresnel * (1 - v * 0.92) * (0.55 + calm * 0.35);
      if (a < 0.01) continue;
      const y = waterline + v * treeH;
      const wobble =
        fbm2(i * 0.6 + v * 2.2, t * 0.08, 2, params.seed) * (3 + wave * 12) +
        Math.sin(t * 0.4 + i + v * 6) * wave * 4;
      const halfW = crownW * (1.15 - v * 0.55) * (0.55 + (1 - v) * 0.55);
      const sliceH = (2.2 + wave * 1.5) * (1 + v * 0.35);
      const g = ctx.createRadialGradient(x0 + wobble, y, 0, x0 + wobble, y, halfW);
      g.addColorStop(0, withAlpha(v < 0.2 ? '#0a1e14' : '#143528', a));
      g.addColorStop(0.55, withAlpha('#0e281c', a * 0.4));
      g.addColorStop(1, withAlpha('#081820', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x0 + wobble, y, halfW, sliceH, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const tw = 0.9 + rand() * 1.6;
    const th = treeH * 0.9;
    const tx = x0 + fbm2(i, t * 0.05, 1, params.seed) * wave * 3;
    const tg = ctx.createLinearGradient(tx, waterline, tx, waterline + th);
    tg.addColorStop(0, withAlpha('#061410', baseA * fresnel * 0.65));
    tg.addColorStop(0.4, withAlpha('#0a2016', baseA * fresnel * 0.3));
    tg.addColorStop(1, withAlpha('#061018', 0));
    ctx.fillStyle = tg;
    ctx.fillRect(tx - tw * 0.5, waterline, tw, th);
  }

  const blur = ctx.createLinearGradient(cx, waterline - 4, cx, waterline + hh * 0.32);
  blur.addColorStop(0, withAlpha('#0a1820', 0.28 * reflectivity * params.intensity));
  blur.addColorStop(0.2, withAlpha('#0c1c24', 0.14 * reflectivity * params.intensity));
  blur.addColorStop(0.55, withAlpha('#081820', 0.05 * reflectivity));
  blur.addColorStop(1, withAlpha('#081820', 0));
  ctx.fillStyle = blur;
  ctx.fillRect(cx - hw, waterline - 6, hw * 2, hh * 0.36);

  const fres = ctx.createLinearGradient(cx, waterline, cx, waterline + hh * 0.22);
  fres.addColorStop(0, withAlpha('#04120e', 0.4 * reflectivity * params.intensity * calm));
  fres.addColorStop(0.35, withAlpha('#081820', 0.14 * reflectivity));
  fres.addColorStop(1, withAlpha('#081820', 0));
  ctx.fillStyle = fres;
  ctx.fillRect(cx - hw, waterline, hw * 2, hh * 0.22);

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
  const mist = ctx.createLinearGradient(cx, top, cx, cy - hh * 0.32);
  mist.addColorStop(0, withAlpha('#f4f8fb', 0.36 * calm * I));
  mist.addColorStop(0.3, withAlpha('#e4eef5', 0.16 * calm * I));
  mist.addColorStop(0.65, withAlpha('#d5e4ee', 0.05 * calm * I));
  mist.addColorStop(1, withAlpha('#d5e4ee', 0));
  ctx.fillStyle = mist;
  ctx.fillRect(cx - hw, top, hw * 2, hh * 0.58);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const u = (i + 0.5) / 6;
    const px = cx - hw * 0.75 + u * hw * 1.5;
    const py = top + hh * 0.07 + (i % 2) * 3;
    const rw = hw * (0.14 + (i % 3) * 0.04);
    const rh = hh * 0.055;
    const g = ctx.createRadialGradient(px, py, 0, px, py, rw);
    g.addColorStop(0, withAlpha('#ffffff', 0.09 * calm * I));
    g.addColorStop(1, withAlpha('#ffffff', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, py, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRipples(
  ctx: CanvasRenderingContext2D,
  params: WaterParams,
  t: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  calm: number,
): void {
  ctx.save();
  const strength = params.waveStrength * (0.25 + (1 - calm) * 0.75);
  if (strength < 0.02) {
    ctx.restore();
    return;
  }
  const bands = Math.max(3, Math.floor(4 + params.waveStrength * 5));
  for (let i = 0; i < bands; i++) {
    const phase = t * (0.28 + strength * 0.3) + i * 1.05 + params.seed * 0.0001;
    const n = fbm2(i * 0.4, phase, 2, params.seed);
    const yOff = Math.sin(phase) * 1.8 * strength + n * 2.5 * strength;
    const y = cy - hh * 0.5 + (i / Math.max(1, bands - 1)) * hh * 0.95 + yOff;

    ctx.beginPath();
    const steps = 20;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const x = cx - hw + u * hw * 2;
      const local =
        Math.sin(u * Math.PI * 2 * params.waveScale + phase) * 2.2 * strength +
        fbm2(u * 3 + i, phase * 0.5, 2, params.seed) * 1.8 * strength;
      if (s === 0) ctx.moveTo(x, y + local);
      else ctx.lineTo(x, y + local);
    }
    ctx.strokeStyle = withAlpha('#c8e6ff', 0.03 * params.intensity * (0.3 + strength));
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Thin elongated sky-edge sheen + anisotropic streaks.
 * Avoids soft circular glow blobs and hard straight bands.
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

  const sheenY = cy - hh * 0.68 + Math.sin(t * 0.22) * 1.0;
  const sheenH = Math.max(1.2, hh * 0.018);
  const sheen = ctx.createLinearGradient(cx - hw, sheenY, cx + hw, sheenY);
  sheen.addColorStop(0, withAlpha('#ffffff', 0));
  sheen.addColorStop(0.15, withAlpha('#d4eaff', 0.035 * aBase));
  sheen.addColorStop(0.4, withAlpha('#ffffff', 0.16 * aBase * calm));
  sheen.addColorStop(0.5, withAlpha('#eef6ff', 0.22 * aBase * calm));
  sheen.addColorStop(0.6, withAlpha('#ffffff', 0.16 * aBase * calm));
  sheen.addColorStop(0.85, withAlpha('#d4eaff', 0.035 * aBase));
  sheen.addColorStop(1, withAlpha('#ffffff', 0));
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.ellipse(cx, sheenY, hw * 0.88, sheenH, 0, 0, Math.PI * 2);
  ctx.fill();

  const sheen2Y = sheenY + hh * 0.055;
  const sheen2 = ctx.createLinearGradient(cx - hw * 0.65, sheen2Y, cx + hw * 0.65, sheen2Y);
  sheen2.addColorStop(0, withAlpha('#ffffff', 0));
  sheen2.addColorStop(0.45, withAlpha(tint, 0.06 * aBase * calm));
  sheen2.addColorStop(0.5, withAlpha('#ffffff', 0.1 * aBase * calm));
  sheen2.addColorStop(0.55, withAlpha(tint, 0.06 * aBase * calm));
  sheen2.addColorStop(1, withAlpha('#ffffff', 0));
  ctx.fillStyle = sheen2;
  ctx.beginPath();
  ctx.ellipse(cx, sheen2Y, hw * 0.62, sheenH * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  const streakCount = 16 + Math.floor(params.waveStrength * 6);
  ctx.lineCap = 'round';
  for (let i = 0; i < streakCount; i++) {
    const u = (i + 0.5) / streakCount;
    const nx = fbm2(i * 1.3, t * 0.14 + params.seed * 0.002, 2, params.seed + i);
    const ny = fbm2(i * 0.9 + 3, t * 0.11, 2, params.seed + 50 + i);
    const px = cx + (u - 0.5) * hw * 1.65 + nx * hw * 0.1;
    const py = cy - hh * 0.4 + ny * hh * 0.38 + (i % 5) * hh * 0.035;
    const len = hw * (0.06 + ((i * 17) % 5) * 0.028) * (0.75 + calm * 0.35);
    const pulse = 0.85 + Math.sin(t * 0.85 + i * 1.3) * 0.15;
    const a = (0.05 + (i % 4) * 0.012) * aBase * pulse * (0.5 + calm * 0.5);
    const ang = Math.sin(t * 0.18 + i) * 0.05;

    // Wavy anisotropic filament (not a straight ruler line)
    ctx.strokeStyle = withAlpha('#ffffff', a * 1.15);
    ctx.lineWidth = 0.85 + ((i * 13) % 3) * 0.3;
    ctx.beginPath();
    const segsH = 6;
    for (let s = 0; s <= segsH; s++) {
      const v = s / segsH;
      const x = px + Math.cos(ang) * len * (v * 2 - 1);
      const y =
        py +
        Math.sin(ang) * len * 0.12 * (v * 2 - 1) +
        Math.sin(v * Math.PI * 2 + t * 0.6 + i) * (0.6 + params.waveStrength * 1.5);
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = withAlpha('#cfe8ff', a * 0.4);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px - Math.cos(ang) * len * 0.55, py - Math.sin(ang) * len * 0.08);
    ctx.lineTo(px + Math.cos(ang) * len * 0.55, py + Math.sin(ang) * len * 0.08);
    ctx.stroke();
  }

  for (const light of scene.lights) {
    const dx = light.x - cx;
    const dy = light.y - cy;
    const dist = Math.hypot(dx, dy);
    const influence = Math.max(0, 1 - dist / (light.radius + Math.max(hw, hh) * 1.1));
    if (influence <= 0.03) continue;

    const rx = cx + dx * 0.16 + Math.sin(t * 0.35 + light.x * 0.01) * 2 * params.waveStrength;
    const ry = cy - hh * 0.22 + Math.min(hh * 0.3, Math.max(0, dy) * 0.04);
    const pulse = 0.9 + Math.sin(t * 1.2 + light.x * 0.01) * 0.1;
    const streakH = (hh * 0.32 + light.radius * 0.04) * (0.8 + calm * 0.3) * pulse;
    const a = 0.18 * influence * reflectivity * I * light.intensity * pulse;

    ctx.strokeStyle = withAlpha(light.color, a);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(rx, ry - streakH);
    const segs = 8;
    for (let s = 1; s <= segs; s++) {
      const v = s / segs;
      const xOff = Math.sin(v * Math.PI * 2 + t + light.x) * (0.6 + params.waveStrength * 2);
      ctx.lineTo(rx + xOff, ry - streakH + v * streakH * 2);
    }
    ctx.stroke();

    ctx.strokeStyle = withAlpha('#ffffff', a * 0.65);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(rx, ry - streakH * 0.55);
    ctx.lineTo(rx, ry + streakH * 0.55);
    ctx.stroke();

    const hx = 10 + light.radius * 0.04;
    ctx.strokeStyle = withAlpha('#ffffff', a * 0.4);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(rx - hx, ry);
    ctx.lineTo(rx + hx, ry);
    ctx.stroke();
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
): void {
  ctx.save();
  const foamPulse = 0.88 + Math.sin(t * 0.9) * 0.12;
  ctx.strokeStyle = withAlpha(
    colorFoam,
    0.12 * params.shoreFoam * params.intensity * foamPulse * (0.45 + calm * 0.55),
  );
  ctx.lineWidth = 1.4 + params.shoreFoam;
  ctx.beginPath();
  ctx.ellipse(cx, cy, hw + 0.5, hh + 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + t * 0.05;
    const px = cx + Math.cos(ang) * (hw - 5);
    const py = cy + Math.sin(ang) * (hh - 4);
    const rw = 6 + (i % 3) * 3;
    const rh = 2.5 + (i % 2);
    const g = ctx.createRadialGradient(px, py, 0, px, py, rw);
    g.addColorStop(0, withAlpha(colorFoam, 0.07 * params.shoreFoam * params.intensity));
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
  description: 'Clear reflective lake: sky mirror, soft shore reflections, anisotropic sheen.',
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
