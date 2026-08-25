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

  // Depth volume: shallow banks + clear mid sky-mirror (not a flat oval fill)
  drawDepthBody(ctx, params, cx, cy, hw, hh, colorDeep, colorShallow, colorSky, I);

  // Mid-water sky mirror band (Fresnel: stronger toward far shore / horizon)
  if (reflectivity > 0.04) {
    drawSkyMirror(ctx, params, t, cx, cy, hw, hh, colorSky, colorSkyBright, reflectivity, calm, I);
  }

  // Far-shore tree / foliage reflections — soft, stretched, waterline-blurred
  if (reflectivity > 0.1) {
    drawShoreReflections(ctx, params, t, cx, cy, hw, hh, reflectivity, calm);
  }

  // Soft morning mist at far waterline
  drawWaterlineMist(ctx, params, cx, cy, hw, hh, calm, I);

  // Calm micro-ripples (barely visible at default waveStrength)
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
  params: WaterParams,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  colorDeep: string,
  colorShallow: string,
  colorSky: string,
  I: number,
): void {
  // Base vertical volume: sky-tint at far, deep near viewer
  const vert = ctx.createLinearGradient(cx, cy - hh, cx, cy + hh);
  vert.addColorStop(0, withAlpha(lerpColor(colorSky, colorShallow, 0.35), 0.88 * I));
  vert.addColorStop(0.28, withAlpha(lerpColor(colorShallow, colorSky, 0.4), 0.9 * I));
  vert.addColorStop(0.55, withAlpha(colorShallow, 0.86 * I));
  vert.addColorStop(0.82, withAlpha(colorDeep, 0.94 * I));
  vert.addColorStop(1, withAlpha(lerpColor(colorDeep, '#031018', 0.45), 0.98 * I));
  ctx.fillStyle = vert;
  ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 2);

  // Bank shallowing — radial lightening toward ellipse rim (volume, not flat fill)
  const bank = ctx.createRadialGradient(
    cx,
    cy + hh * 0.08,
    Math.min(hw, hh) * 0.15,
    cx,
    cy,
    Math.max(hw, hh) * 1.05,
  );
  bank.addColorStop(0, withAlpha(colorDeep, 0));
  bank.addColorStop(0.55, withAlpha(colorShallow, 0));
  bank.addColorStop(0.82, withAlpha(lerpColor(colorShallow, colorSky, 0.35), 0.22 * I));
  bank.addColorStop(1, withAlpha(lerpColor(colorShallow, '#b8dce8', 0.4), 0.38 * I));
  ctx.fillStyle = bank;
  ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 2);

  // Left/right bank shallow wedges
  for (const side of [-1, 1] as const) {
    const gx = cx + side * hw * 0.92;
    const g = ctx.createRadialGradient(gx, cy, 0, gx, cy, hw * 0.55);
    g.addColorStop(0, withAlpha(lerpColor(colorShallow, '#c5e4f0', 0.25), 0.32 * I));
    g.addColorStop(0.55, withAlpha(colorShallow, 0.1 * I));
    g.addColorStop(1, withAlpha(colorShallow, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 2);
  }

  // Near-shore (bottom) slightly clearer/shallower teal tint
  const near = ctx.createLinearGradient(cx, cy + hh * 0.15, cx, cy + hh);
  near.addColorStop(0, withAlpha(colorDeep, 0));
  near.addColorStop(0.5, withAlpha(lerpColor(colorDeep, colorShallow, 0.35), 0.12 * I));
  near.addColorStop(1, withAlpha(lerpColor(colorShallow, '#6aa8b8', 0.3), 0.28 * I));
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
  const bandBot = cy + hh * 0.08;
  const sky = ctx.createLinearGradient(cx, bandTop, cx, bandBot);
  const a = reflectivity * I;
  sky.addColorStop(0, withAlpha(colorSkyBright, 0.72 * a));
  sky.addColorStop(0.18, withAlpha(colorSky, 0.58 * a));
  sky.addColorStop(0.45, withAlpha(colorSky, 0.38 * a * (0.85 + calm * 0.15)));
  sky.addColorStop(0.72, withAlpha(lerpColor(colorSky, params.material.baseColor, 0.35), 0.12 * a));
  sky.addColorStop(1, withAlpha(colorSky, 0));
  ctx.fillStyle = sky;
  ctx.fillRect(cx - hw, bandTop, hw * 2, bandBot - bandTop);

  // Soft horizontal shimmer sheets (not hard bands)
  ctx.globalCompositeOperation = 'lighter';
  const sheets = 5;
  for (let i = 0; i < sheets; i++) {
    const u = i / (sheets - 1);
    const y =
      cy -
      hh * 0.72 +
      u * hh * 0.55 +
      fbm2(i * 0.7, t * 0.12 + params.seed * 0.001, 2, params.seed + i) * 3 * params.waveStrength;
    const h = hh * (0.035 + (1 - u) * 0.04);
    const aSheet = (0.04 + (1 - u) * 0.06) * a * calm;
    const g = ctx.createLinearGradient(cx, y - h, cx, y + h);
    g.addColorStop(0, withAlpha(colorSkyBright, 0));
    g.addColorStop(0.5, withAlpha(colorSkyBright, aSheet));
    g.addColorStop(1, withAlpha(colorSkyBright, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - hw * 0.98, y - h, hw * 1.96, h * 2);
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
  const stretch = 1.55 + calm * 0.35;
  const wave = params.waveStrength;

  ctx.save();

  // Soft mass canopy band (blurred silhouette, not triangles)
  const canopyH = hh * 0.42 * stretch;
  const canopy = ctx.createLinearGradient(cx, waterline, cx, waterline + canopyH);
  const baseA = 0.42 * reflectivity * params.intensity;
  canopy.addColorStop(0, withAlpha('#0a1e14', baseA * 0.95));
  canopy.addColorStop(0.12, withAlpha('#0d281c', baseA * 0.75));
  canopy.addColorStop(0.4, withAlpha('#122e22', baseA * 0.35));
  canopy.addColorStop(0.75, withAlpha('#0a1820', baseA * 0.1));
  canopy.addColorStop(1, withAlpha('#061018', 0));
  ctx.fillStyle = canopy;
  ctx.fillRect(cx - hw, waterline, hw * 2, canopyH);

  // Soft elongated foliage masses (vertically stretched, horizontally rippled)
  const count = 22;
  for (let i = 0; i < count; i++) {
    const u = (i + 0.35) / count;
    const x0 = cx - hw * 0.94 + u * hw * 1.88;
    const trunkH = (22 + rand() * 48) * stretch * (0.65 + params.height / 280);
    const crownW = 10 + rand() * 22;
    const crownH = trunkH * (0.55 + rand() * 0.35);
    const wobble =
      fbm2(i * 0.55, t * 0.07, 2, params.seed) * (4 + wave * 10) +
      Math.sin(t * 0.35 + i * 1.1) * wave * 3;

    // Fresnel: denser near waterline (far shore), fades toward viewer
    const fresnel = Math.pow(1 - Math.min(1, trunkH / (hh * 0.85)), 0.55);

    for (const layer of [0, 1, 2] as const) {
      const ly = waterline + trunkH * (0.08 + layer * 0.18);
      const lw = crownW * (1.1 - layer * 0.15);
      const lh = crownH * (0.55 + layer * 0.2);
      const lx = x0 + wobble * (0.4 + layer * 0.25) + (layer - 1) * 3;
      const a = baseA * fresnel * (0.55 - layer * 0.12) * (0.7 + calm * 0.3);
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(lw, lh));
      g.addColorStop(0, withAlpha(layer === 0 ? '#0c2418' : '#143528', a));
      g.addColorStop(0.55, withAlpha('#0e281c', a * 0.45));
      g.addColorStop(1, withAlpha('#081820', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(lx, ly, lw, lh, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Soft trunk streak — thin vertical, feathered (not a triangle)
    const tw = 1.2 + rand() * 2.4;
    const th = trunkH * (0.85 + rand() * 0.2);
    const tx = x0 + wobble * 0.35;
    const tg = ctx.createLinearGradient(tx, waterline, tx, waterline + th);
    const ta = baseA * fresnel * 0.55;
    tg.addColorStop(0, withAlpha('#071810', ta));
    tg.addColorStop(0.35, withAlpha('#0a2016', ta * 0.55));
    tg.addColorStop(1, withAlpha('#061018', 0));
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.ellipse(tx, waterline + th * 0.45, tw, th * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Horizontal ripple shear — soft overpaint breakup (painterly, not hard cuts)
  const cuts = 7 + Math.floor(wave * 5);
  for (let i = 0; i < cuts; i++) {
    const uy = i / Math.max(1, cuts - 1);
    const y =
      waterline + uy * canopyH * 0.9 + Math.sin(t * 0.5 + i * 1.7) * wave * 2.5;
    const h = 1.1 + wave * 1.4 + Math.abs(fbm2(i, t * 0.2, 1, params.seed)) * 0.8;
    const aCut = (0.06 + uy * 0.1) * reflectivity * params.intensity * (0.4 + wave * 0.8);
    const g = ctx.createLinearGradient(cx, y, cx, y + h);
    g.addColorStop(0, withAlpha('#1a4a68', 0));
    g.addColorStop(0.5, withAlpha('#2a6a88', aCut));
    g.addColorStop(1, withAlpha('#1a4a68', 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - hw, y - 1, hw * 2, h + 2);
  }

  // Soft waterline blur — dissolve hard edge at far shore
  const blur = ctx.createLinearGradient(cx, waterline - 2, cx, waterline + hh * 0.28);
  blur.addColorStop(0, withAlpha('#0a1820', 0.22 * reflectivity * params.intensity));
  blur.addColorStop(0.25, withAlpha('#0c1c24', 0.12 * reflectivity * params.intensity));
  blur.addColorStop(0.65, withAlpha('#081820', 0.04 * reflectivity));
  blur.addColorStop(1, withAlpha('#081820', 0));
  ctx.fillStyle = blur;
  ctx.fillRect(cx - hw, waterline - 4, hw * 2, hh * 0.32);

  // Extra Fresnel darkening right at horizon waterline
  const fres = ctx.createLinearGradient(cx, waterline, cx, waterline + hh * 0.18);
  fres.addColorStop(0, withAlpha('#051410', 0.35 * reflectivity * params.intensity * calm));
  fres.addColorStop(0.4, withAlpha('#081820', 0.12 * reflectivity));
  fres.addColorStop(1, withAlpha('#081820', 0));
  ctx.fillStyle = fres;
  ctx.fillRect(cx - hw, waterline, hw * 2, hh * 0.2);

  ctx.restore();
}

function drawWaterlineMist(
  ctx: CanvasRenderingContext2D,
  params: WaterParams,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  calm: number,
  I: number,
): void {
  const top = cy - hh * 0.88;
  const mist = ctx.createLinearGradient(cx, top, cx, cy - hh * 0.35);
  mist.addColorStop(0, withAlpha('#f4f8fb', 0.32 * calm * I));
  mist.addColorStop(0.35, withAlpha('#e4eef5', 0.14 * calm * I));
  mist.addColorStop(0.7, withAlpha('#d5e4ee', 0.05 * calm * I));
  mist.addColorStop(1, withAlpha('#d5e4ee', 0));
  ctx.fillStyle = mist;
  ctx.fillRect(cx - hw, top, hw * 2, hh * 0.55);

  // Soft mist patches along waterline (morning haze)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const u = (i + 0.5) / 6;
    const px = cx - hw * 0.75 + u * hw * 1.5;
    const py = top + hh * 0.08 + (i % 2) * 4;
    const rw = hw * (0.12 + (i % 3) * 0.04);
    const rh = hh * 0.06;
    const g = ctx.createRadialGradient(px, py, 0, px, py, rw);
    g.addColorStop(0, withAlpha('#ffffff', 0.08 * calm * I));
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
    ctx.strokeStyle = withAlpha('#c8e6ff', 0.035 * params.intensity * (0.3 + strength));
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

  // Thin sky-edge sheen (far shore) — elongated horizontal, feathered ends
  const sheenY = cy - hh * 0.62 + Math.sin(t * 0.25) * 1.2;
  const sheenH = hh * (0.028 + calm * 0.012);
  const sheen = ctx.createLinearGradient(cx - hw, sheenY, cx + hw, sheenY);
  sheen.addColorStop(0, withAlpha('#ffffff', 0));
  sheen.addColorStop(0.12, withAlpha('#d4eaff', 0.04 * aBase));
  sheen.addColorStop(0.35, withAlpha('#ffffff', 0.14 * aBase * calm));
  sheen.addColorStop(0.5, withAlpha('#e8f4ff', 0.2 * aBase * calm));
  sheen.addColorStop(0.65, withAlpha('#ffffff', 0.14 * aBase * calm));
  sheen.addColorStop(0.88, withAlpha('#d4eaff', 0.04 * aBase));
  sheen.addColorStop(1, withAlpha('#ffffff', 0));
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.ellipse(cx, sheenY, hw * 0.92, sheenH, 0, 0, Math.PI * 2);
  ctx.fill();

  // Secondary thinner silver line slightly below
  const sheen2Y = sheenY + hh * 0.06;
  const sheen2 = ctx.createLinearGradient(cx - hw * 0.7, sheen2Y, cx + hw * 0.7, sheen2Y);
  sheen2.addColorStop(0, withAlpha('#ffffff', 0));
  sheen2.addColorStop(0.4, withAlpha(tint, 0.08 * aBase * calm));
  sheen2.addColorStop(0.5, withAlpha('#ffffff', 0.11 * aBase * calm));
  sheen2.addColorStop(0.6, withAlpha(tint, 0.08 * aBase * calm));
  sheen2.addColorStop(1, withAlpha('#ffffff', 0));
  ctx.fillStyle = sheen2;
  ctx.beginPath();
  ctx.ellipse(cx, sheen2Y, hw * 0.7, sheenH * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  // Anisotropic micro-streaks (thin, long, slightly wavy)
  const streakCount = 14 + Math.floor(params.waveStrength * 8);
  for (let i = 0; i < streakCount; i++) {
    const u = (i + 0.5) / streakCount;
    const nx = fbm2(i * 1.3, t * 0.15 + params.seed * 0.002, 2, params.seed + i);
    const ny = fbm2(i * 0.9 + 3, t * 0.12, 2, params.seed + 50 + i);
    const px = cx + (u - 0.5) * hw * 1.7 + nx * hw * 0.08;
    const py = cy - hh * 0.35 + ny * hh * 0.35 + (i % 5) * hh * 0.04;
    const len = hw * (0.08 + ((i * 17) % 5) * 0.035) * (0.7 + calm * 0.4);
    const thick = 0.6 + ((i * 13) % 3) * 0.35;
    const pulse = 0.85 + Math.sin(t * 0.9 + i * 1.4) * 0.15;
    const a = (0.045 + (i % 4) * 0.015) * aBase * pulse * (0.55 + calm * 0.45);

    const g = ctx.createLinearGradient(px - len, py, px + len, py);
    g.addColorStop(0, withAlpha('#ffffff', 0));
    g.addColorStop(0.35, withAlpha('#dcefff', a * 0.5));
    g.addColorStop(0.5, withAlpha('#ffffff', a));
    g.addColorStop(0.65, withAlpha('#dcefff', a * 0.5));
    g.addColorStop(1, withAlpha('#ffffff', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, py, len, thick, Math.sin(t * 0.2 + i) * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }

  // Scene light anisotropic reflections (vertical thin streaks, not circular blobs)
  for (const light of scene.lights) {
    const dx = light.x - cx;
    const dy = light.y - cy;
    const dist = Math.hypot(dx, dy);
    const influence = Math.max(0, 1 - dist / (light.radius + Math.max(hw, hh) * 1.1));
    if (influence <= 0.03) continue;

    const rx = cx + dx * 0.18 + Math.sin(t * 0.4 + light.x * 0.01) * 2 * params.waveStrength;
    const ry = cy - hh * 0.15 + Math.min(hh * 0.35, Math.max(0, dy) * 0.05);
    const pulse = 0.88 + Math.sin(t * 1.3 + light.x * 0.01) * 0.12;
    const streakW = (3.5 + light.radius * 0.015) * (0.7 + reflectivity * 0.4);
    const streakH = (hh * 0.28 + light.radius * 0.08) * (0.75 + calm * 0.35) * pulse;
    const a = 0.22 * influence * reflectivity * I * light.intensity * pulse;

    const g = ctx.createLinearGradient(rx, ry - streakH, rx, ry + streakH);
    g.addColorStop(0, withAlpha(light.color, 0));
    g.addColorStop(0.35, withAlpha(light.color, a * 0.55));
    g.addColorStop(0.5, withAlpha('#ffffff', a * 0.75));
    g.addColorStop(0.65, withAlpha(light.color, a * 0.45));
    g.addColorStop(1, withAlpha(light.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(rx, ry, streakW, streakH, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tiny horizontal sparkle cross at peak (elongated, not circular)
    const sparkA = a * 0.45;
    const hx = streakW * 4.5;
    const hy = 1.1;
    const hg = ctx.createLinearGradient(rx - hx, ry, rx + hx, ry);
    hg.addColorStop(0, withAlpha('#ffffff', 0));
    hg.addColorStop(0.5, withAlpha('#ffffff', sparkA));
    hg.addColorStop(1, withAlpha('#ffffff', 0));
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.ellipse(rx, ry, hx, hy, 0, 0, Math.PI * 2);
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
): void {
  ctx.save();
  const foamPulse = 0.88 + Math.sin(t * 0.9) * 0.12;
  ctx.strokeStyle = withAlpha(
    colorFoam,
    0.14 * params.shoreFoam * params.intensity * foamPulse * (0.45 + calm * 0.55),
  );
  ctx.lineWidth = 1.5 + params.shoreFoam;
  ctx.beginPath();
  ctx.ellipse(cx, cy, hw + 0.5, hh + 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + t * 0.05;
    const px = cx + Math.cos(ang) * (hw - 5);
    const py = cy + Math.sin(ang) * (hh - 4);
    const rw = 6 + (i % 3) * 3;
    const rh = 3 + (i % 2);
    const g = ctx.createRadialGradient(px, py, 0, px, py, rw);
    g.addColorStop(0, withAlpha(colorFoam, 0.08 * params.shoreFoam * params.intensity));
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
