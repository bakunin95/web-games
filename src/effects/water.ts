import type { DrawFn, EffectModule, SceneContext } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { fbm2, withAlpha } from './noise';

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
  const colorFoam = '#d7f1ff';
  const reflectivity = Math.max(0, Math.min(1.5, mat.metalness * (1.15 - mat.roughness * 0.7)));

  const hw = Math.max(20, params.width * 0.5);
  const hh = Math.max(12, params.height * 0.5);
  const cx = params.x;
  const cy = params.y;

  ctx.save();
  applyMaterial(ctx, mat);

  ctx.beginPath();
  ctx.ellipse(cx, cy, hw, hh, 0, 0, Math.PI * 2);
  ctx.clip();

  const depth = ctx.createRadialGradient(cx, cy - hh * 0.15, 4, cx, cy, Math.max(hw, hh));
  depth.addColorStop(0, withAlpha(colorShallow, 0.92 * params.intensity));
  depth.addColorStop(0.55, withAlpha(colorDeep, 0.88 * params.intensity));
  depth.addColorStop(1, withAlpha(colorDeep, 0.95 * params.intensity));
  ctx.fillStyle = depth;
  ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 2);

  drawRipples(ctx, params, t, cx, cy, hw, hh);

  if (reflectivity > 0) {
    drawReflections(ctx, params, scene, t, cx, cy, hw, hh, reflectivity, colorShallow);
  }

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const px = cx + fbm2(i * 1.7, t * 0.35 + params.seed * 0.001, 2, params.seed + i) * hw * 0.7;
    const py = cy + fbm2(i * 2.3 + 4, t * 0.28, 2, params.seed + 40 + i) * hh * 0.55;
    const r = (10 + (i % 3) * 8) * (0.6 + params.waveScale * 0.4);
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, withAlpha(mat.emissive, 0.08 * params.intensity * params.waveStrength * mat.emissiveIntensity));
    g.addColorStop(1, withAlpha(mat.emissive, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  if (params.shoreFoam > 0) {
    drawShore(ctx, params, t, cx, cy, hw, hh, colorFoam);
  }
};

function drawRipples(
  ctx: CanvasRenderingContext2D,
  params: WaterParams,
  t: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
): void {
  ctx.save();
  const bands = 10;
  for (let i = 0; i < bands; i++) {
    const phase = t * (0.7 + params.waveStrength * 0.5) + i * 0.85 + params.seed * 0.0001;
    const n = fbm2(i * 0.4, phase, 2, params.seed);
    const yOff = Math.sin(phase) * 4 * params.waveStrength + n * 6 * params.waveStrength;
    const y = cy - hh * 0.65 + (i / (bands - 1)) * hh * 1.3 + yOff;
    const wobble = Math.sin(phase * 1.3 + i) * 10 * params.waveScale;

    ctx.beginPath();
    ctx.moveTo(cx - hw, y);
    const steps = 14;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const x = cx - hw + u * hw * 2;
      const local =
        Math.sin(u * Math.PI * 2 * params.waveScale + phase) * 5 * params.waveStrength +
        fbm2(u * 3 + i, phase * 0.5, 2, params.seed) * 4;
      ctx.lineTo(x + wobble * (u - 0.5), y + local);
    }
    ctx.strokeStyle = withAlpha('#b8e0ff', 0.07 * params.intensity * params.waveStrength);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
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

    const rx = cx + dx * 0.15;
    const ry = cy + Math.min(hh * 0.5, Math.abs(dy) * 0.08 + 8);
    const pulse = 0.85 + Math.sin(t * 2.2 + light.x * 0.01) * 0.15;
    const rw = (40 + light.radius * 0.25) * reflectivity * pulse;
    const rh = rw * 0.22;
    const g = ctx.createRadialGradient(rx, ry, 0, rx, ry, rw);
    const a = 0.22 * influence * reflectivity * params.intensity * light.intensity;
    g.addColorStop(0, withAlpha(light.color, a));
    g.addColorStop(0.45, withAlpha(light.color, a * 0.35));
    g.addColorStop(1, withAlpha(light.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(rx, ry, rw, rh, Math.sin(t * 0.7) * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  const sky = ctx.createLinearGradient(cx, cy - hh, cx, cy);
  sky.addColorStop(0, withAlpha(tint, 0.1 * reflectivity * params.intensity));
  sky.addColorStop(1, withAlpha(tint, 0));
  ctx.fillStyle = sky;
  ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 0.55);
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
): void {
  ctx.save();
  const foamPulse = 0.75 + Math.sin(t * 1.8) * 0.25;
  ctx.strokeStyle = withAlpha(colorFoam, 0.35 * params.shoreFoam * params.intensity * foamPulse);
  ctx.lineWidth = 3 + params.shoreFoam * 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, hw + 1, hh + 1, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + t * 0.15;
    const px = cx + Math.cos(ang) * (hw - 4);
    const py = cy + Math.sin(ang) * (hh - 3);
    const r = 4 + (i % 3) * 2;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2);
    g.addColorStop(0, withAlpha(colorFoam, 0.2 * params.shoreFoam * params.intensity));
    g.addColorStop(1, withAlpha(colorFoam, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function disposeWaterInstance(_instanceId: string): void {}

export const waterEffect: EffectModule<WaterParams> = {
  id: 'water',
  name: 'Water',
  description: 'Body of water driven by material (color, roughness, metalness).',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'water-default',
    x: 1000,
    y: 880,
    seed: 4,
    width: 420,
    height: 160,
    waveStrength: 0.85,
    waveScale: 1,
    shoreFoam: 0.7,
    material: createDefaultMaterial({
      name: 'Clear Water',
      baseColor: '#0b2a44',
      emissive: '#1a6b8c',
      emissiveIntensity: 0.45,
      opacity: 0.92,
      roughness: 0.15,
      metalness: 0.85,
      blend: 'normal',
    }),
  },
  draw: drawWater,
};
