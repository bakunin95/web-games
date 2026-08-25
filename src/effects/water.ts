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
  const colorSky = lerpColor(mat.emissive, '#7eb6e8', 0.55);
  const colorFoam = '#e8f4ff';
  const reflectivity = Math.max(0, Math.min(1.6, mat.metalness * (1.25 - mat.roughness * 0.85)));
  const calm = 1 - Math.min(1, params.waveStrength * 0.85);

  const hw = Math.max(20, params.width * 0.5);
  const hh = Math.max(12, params.height * 0.5);
  const cx = params.x;
  const cy = params.y;

  ctx.save();
  applyMaterial(ctx, mat);

  ctx.beginPath();
  ctx.ellipse(cx, cy, hw, hh, 0, 0, Math.PI * 2);
  ctx.clip();

  // Depth body: navy foreground → lighter mid (lake photo)
  const depth = ctx.createLinearGradient(cx, cy - hh, cx, cy + hh);
  depth.addColorStop(0, withAlpha(colorSky, 0.95 * params.intensity));
  depth.addColorStop(0.35, withAlpha(colorShallow, 0.92 * params.intensity));
  depth.addColorStop(0.7, withAlpha(colorDeep, 0.94 * params.intensity));
  depth.addColorStop(1, withAlpha(lerpColor(colorDeep, '#020810', 0.4), 0.98 * params.intensity));
  ctx.fillStyle = depth;
  ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 2);

  // Mirror sky band (upper half of water)
  if (reflectivity > 0.05) {
    const sky = ctx.createLinearGradient(cx, cy - hh, cx, cy);
    sky.addColorStop(0, withAlpha(colorSky, 0.55 * reflectivity * params.intensity));
    sky.addColorStop(0.55, withAlpha(colorShallow, 0.22 * reflectivity * params.intensity));
    sky.addColorStop(1, withAlpha(colorDeep, 0));
    ctx.fillStyle = sky;
    ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 0.62);
  }

  // Far-shore tree reflection: dark mirrored silhouettes
  if (reflectivity > 0.15) {
    drawTreeReflection(ctx, params, t, cx, cy, hw, hh, reflectivity);
  }

  // Soft morning mist at far waterline
  const mist = ctx.createLinearGradient(cx, cy - hh * 0.85, cx, cy - hh * 0.35);
  mist.addColorStop(0, withAlpha('#f2f7fb', 0.28 * calm * params.intensity));
  mist.addColorStop(0.6, withAlpha('#dfeaf2', 0.1 * calm * params.intensity));
  mist.addColorStop(1, withAlpha('#dfeaf2', 0));
  ctx.fillStyle = mist;
  ctx.fillRect(cx - hw, cy - hh * 0.9, hw * 2, hh * 0.45);

  drawRipples(ctx, params, t, cx, cy, hw, hh, calm);

  if (reflectivity > 0) {
    drawReflections(ctx, params, scene, t, cx, cy, hw, hh, reflectivity, colorSky);
    drawSpecularSheen(ctx, params, t, cx, cy, hw, hh, reflectivity);
  }

  // Subtle subsurface / caustic glints (very soft on calm water)
  ctx.globalCompositeOperation = 'lighter';
  const glints = 4 + Math.floor(params.waveStrength * 4);
  for (let i = 0; i < glints; i++) {
    const px = cx + fbm2(i * 1.7, t * 0.22 + params.seed * 0.001, 2, params.seed + i) * hw * 0.65;
    const py = cy + fbm2(i * 2.3 + 4, t * 0.18, 2, params.seed + 40 + i) * hh * 0.45;
    const r = (8 + (i % 3) * 6) * (0.5 + params.waveScale * 0.35);
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    const a = 0.045 * params.intensity * (0.35 + params.waveStrength) * mat.emissiveIntensity;
    g.addColorStop(0, withAlpha(mat.emissive, a));
    g.addColorStop(1, withAlpha(mat.emissive, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  if (params.shoreFoam > 0) {
    drawShore(ctx, params, t, cx, cy, hw, hh, colorFoam, calm);
  }
};

function drawTreeReflection(
  ctx: CanvasRenderingContext2D,
  params: WaterParams,
  t: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  reflectivity: number,
): void {
  const rand = mulberry32(params.seed | 0);
  ctx.save();
  ctx.globalAlpha = 0.55 * reflectivity * params.intensity;
  const baseY = cy - hh * 0.42;
  const count = 18;
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) / count;
    const x = cx - hw * 0.92 + u * hw * 1.84;
    const h = (18 + rand() * 42) * (0.7 + params.height / 200);
    const w = 6 + rand() * 14;
    const wobble = fbm2(i * 0.5, t * 0.08, 2, params.seed) * 3 * params.waveStrength;
    const g = ctx.createLinearGradient(x, baseY, x, baseY + h);
    g.addColorStop(0, withAlpha('#0c2418', 0.85));
    g.addColorStop(0.45, withAlpha('#163528', 0.55));
    g.addColorStop(1, withAlpha('#0a1a28', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + wobble, baseY);
    ctx.lineTo(x + w * 0.55 + wobble, baseY + h * 0.55);
    ctx.lineTo(x + wobble * 0.5, baseY + h);
    ctx.lineTo(x - w * 0.55 + wobble, baseY + h * 0.55);
    ctx.closePath();
    ctx.fill();
  }
  // Soft blur band so silhouettes read as reflections not stamps
  const soft = ctx.createLinearGradient(cx, baseY, cx, baseY + hh * 0.5);
  soft.addColorStop(0, withAlpha('#081820', 0.15 * reflectivity));
  soft.addColorStop(1, withAlpha('#081820', 0));
  ctx.globalAlpha = 1;
  ctx.fillStyle = soft;
  ctx.fillRect(cx - hw, baseY, hw * 2, hh * 0.5);
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
  const bands = Math.max(4, Math.floor(6 + params.waveStrength * 6));
  const strength = params.waveStrength * (0.35 + (1 - calm) * 0.65);
  for (let i = 0; i < bands; i++) {
    const phase = t * (0.35 + strength * 0.35) + i * 0.9 + params.seed * 0.0001;
    const n = fbm2(i * 0.4, phase, 2, params.seed);
    const yOff = Math.sin(phase) * 2.5 * strength + n * 3.5 * strength;
    const y = cy - hh * 0.55 + (i / Math.max(1, bands - 1)) * hh * 1.05 + yOff;
    const wobble = Math.sin(phase * 1.1 + i) * 6 * params.waveScale * strength;

    ctx.beginPath();
    ctx.moveTo(cx - hw, y);
    const steps = 18;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const x = cx - hw + u * hw * 2;
      const local =
        Math.sin(u * Math.PI * 2 * params.waveScale + phase) * 3 * strength +
        fbm2(u * 3 + i, phase * 0.5, 2, params.seed) * 2.5 * strength;
      ctx.lineTo(x + wobble * (u - 0.5), y + local);
    }
    ctx.strokeStyle = withAlpha('#c8e6ff', 0.045 * params.intensity * (0.4 + strength));
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawSpecularSheen(
  ctx: CanvasRenderingContext2D,
  params: WaterParams,
  t: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  reflectivity: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const y = cy - hh * 0.15 + Math.sin(t * 0.4) * 2;
  const g = ctx.createLinearGradient(cx - hw, y, cx + hw, y);
  const a = 0.12 * reflectivity * params.intensity;
  g.addColorStop(0, withAlpha('#ffffff', 0));
  g.addColorStop(0.35, withAlpha('#d7ecff', a * 0.35));
  g.addColorStop(0.5, withAlpha('#ffffff', a));
  g.addColorStop(0.65, withAlpha('#d7ecff', a * 0.35));
  g.addColorStop(1, withAlpha('#ffffff', 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, y, hw * 0.85, hh * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawReflections(
  ctx: CanvasRenderingContext2D,
  params: WaterParams,
  scene: SceneContext,
  t: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  reflectivity: number,
  tint: string,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const light of scene.lights) {
    const dx = light.x - cx;
    const dy = light.y - cy;
    const dist = Math.hypot(dx, dy);
    const influence = Math.max(0, 1 - dist / (light.radius + Math.max(hw, hh)));
    if (influence <= 0.02) continue;

    // Vertical mirrored streak under light (dock-post style)
    const rx = cx + dx * 0.2;
    const ry = cy + Math.min(hh * 0.55, Math.abs(dy) * 0.1 + 10);
    const pulse = 0.9 + Math.sin(t * 1.6 + light.x * 0.01) * 0.1;
    const rw = (28 + light.radius * 0.2) * reflectivity * pulse;
    const rh = rw * (0.55 + (1 - params.waveStrength) * 0.35);
    const g = ctx.createRadialGradient(rx, ry, 0, rx, ry, rw);
    const a = 0.28 * influence * reflectivity * params.intensity * light.intensity;
    g.addColorStop(0, withAlpha(light.color, a));
    g.addColorStop(0.35, withAlpha(light.color, a * 0.4));
    g.addColorStop(1, withAlpha(light.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(rx, ry, rw * 0.35, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const sky = ctx.createLinearGradient(cx, cy - hh, cx, cy);
  sky.addColorStop(0, withAlpha(tint, 0.12 * reflectivity * params.intensity));
  sky.addColorStop(1, withAlpha(tint, 0));
  ctx.fillStyle = sky;
  ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 0.5);
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
  const foamPulse = 0.85 + Math.sin(t * 1.2) * 0.15;
  ctx.strokeStyle = withAlpha(colorFoam, 0.22 * params.shoreFoam * params.intensity * foamPulse * (0.5 + calm * 0.5));
  ctx.lineWidth = 2 + params.shoreFoam * 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, hw + 1, hh + 1, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Soft misty foam patches near edge (not hard ring)
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2 + t * 0.08;
    const px = cx + Math.cos(ang) * (hw - 6);
    const py = cy + Math.sin(ang) * (hh - 5);
    const r = 5 + (i % 3) * 3;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2.2);
    g.addColorStop(0, withAlpha(colorFoam, 0.12 * params.shoreFoam * params.intensity));
    g.addColorStop(1, withAlpha(colorFoam, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function disposeWaterInstance(_instanceId: string): void {}

export const waterEffect: EffectModule<WaterParams> = {
  id: 'water',
  name: 'Water',
  description: 'Reflective lake body: sky mirror, shore silhouettes, calm sheen.',
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
    waveStrength: 0.28,
    waveScale: 0.85,
    shoreFoam: 0.45,
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
