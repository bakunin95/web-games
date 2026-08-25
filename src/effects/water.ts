import type { BaseEffectParams, DrawFn, EffectModule, SceneContext } from '../core/types';
import { fbm2, withAlpha } from './noise';

export interface WaterParams extends BaseEffectParams {
  instanceId: string;
  x: number;
  y: number;
  seed: number;
  /** Half-extents of the water body. */
  width: number;
  height: number;
  colorDeep: string;
  colorShallow: string;
  colorFoam: string;
  waveStrength: number;
  waveScale: number;
  reflectivity: number;
  shoreFoam: number;
}

/**
 * Animated body of water: depth gradient, Gerstner-ish ripples via fbm,
 * light reflections from scene lights, and shore foam.
 */
export const drawWater: DrawFn<WaterParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;

  const hw = Math.max(20, params.width * 0.5);
  const hh = Math.max(12, params.height * 0.5);
  const cx = params.x;
  const cy = params.y;

  ctx.save();

  // Clip to elliptical lake / pond shape
  ctx.beginPath();
  ctx.ellipse(cx, cy, hw, hh, 0, 0, Math.PI * 2);
  ctx.clip();

  // Depth fill
  const depth = ctx.createRadialGradient(cx, cy - hh * 0.15, 4, cx, cy, Math.max(hw, hh));
  depth.addColorStop(0, withAlpha(params.colorShallow, 0.92 * params.intensity));
  depth.addColorStop(0.55, withAlpha(params.colorDeep, 0.88 * params.intensity));
  depth.addColorStop(1, withAlpha(params.colorDeep, 0.95 * params.intensity));
  ctx.fillStyle = depth;
  ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 2);

  // Animated ripple bands
  drawRipples(ctx, params, t, cx, cy, hw, hh);

  // Specular / light reflections from scene lights
  if (params.reflectivity > 0) {
    drawReflections(ctx, params, scene, t, cx, cy, hw, hh);
  }

  // Caustic-ish shimmer
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const px =
      cx +
      fbm2(i * 1.7, t * 0.35 + params.seed * 0.001, 2, params.seed + i) * hw * 0.7;
    const py =
      cy +
      fbm2(i * 2.3 + 4, t * 0.28, 2, params.seed + 40 + i) * hh * 0.55;
    const r = (10 + (i % 3) * 8) * (0.6 + params.waveScale * 0.4);
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, withAlpha('#c8f0ff', 0.08 * params.intensity * params.waveStrength));
    g.addColorStop(1, withAlpha('#c8f0ff', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // Shore foam + edge ring (outside clip so it sits on the rim)
  if (params.shoreFoam > 0) {
    drawShore(ctx, params, t, cx, cy, hw, hh);
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
  ctx.globalCompositeOperation = 'source-over';
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
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const light of scene.lights) {
    // Project light onto water as elongated shimmer
    const dx = light.x - cx;
    const dy = light.y - cy;
    // Soft falloff if light is far from water
    const dist = Math.hypot(dx, dy);
    const influence = Math.max(0, 1 - dist / (light.radius + Math.max(hw, hh)));
    if (influence <= 0.02) continue;

    const rx = cx + dx * 0.15;
    const ry = cy + Math.min(hh * 0.5, Math.abs(dy) * 0.08 + 8);
    const pulse = 0.85 + Math.sin(t * 2.2 + light.x * 0.01) * 0.15;
    const rw = (40 + light.radius * 0.25) * params.reflectivity * pulse;
    const rh = rw * 0.22;

    const g = ctx.createRadialGradient(rx, ry, 0, rx, ry, rw);
    const a = 0.22 * influence * params.reflectivity * params.intensity * light.intensity;
    g.addColorStop(0, withAlpha(light.color, a));
    g.addColorStop(0.45, withAlpha(light.color, a * 0.35));
    g.addColorStop(1, withAlpha(light.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(rx, ry, rw, rh, Math.sin(t * 0.7) * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sky strip reflection
  const sky = ctx.createLinearGradient(cx, cy - hh, cx, cy);
  sky.addColorStop(0, withAlpha('#6b8cff', 0.1 * params.reflectivity * params.intensity));
  sky.addColorStop(1, withAlpha('#6b8cff', 0));
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
): void {
  ctx.save();
  const foamPulse = 0.75 + Math.sin(t * 1.8) * 0.25;
  ctx.strokeStyle = withAlpha(params.colorFoam, 0.35 * params.shoreFoam * params.intensity * foamPulse);
  ctx.lineWidth = 3 + params.shoreFoam * 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, hw + 1, hh + 1, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Soft foam blobs along near shore
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + t * 0.15;
    const px = cx + Math.cos(ang) * (hw - 4);
    const py = cy + Math.sin(ang) * (hh - 3);
    const r = 4 + (i % 3) * 2;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2);
    g.addColorStop(0, withAlpha(params.colorFoam, 0.2 * params.shoreFoam * params.intensity));
    g.addColorStop(1, withAlpha(params.colorFoam, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function disposeWaterInstance(_instanceId: string): void {
  // Stateless per frame — reserved for future ripple particle pools.
}

export const waterEffect: EffectModule<WaterParams> = {
  id: 'water',
  name: 'Water',
  description: 'Body of water with ripples, light reflections, and shore foam.',
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
    colorDeep: '#0b2a44',
    colorShallow: '#1a6b8c',
    colorFoam: '#d7f1ff',
    waveStrength: 0.85,
    waveScale: 1,
    reflectivity: 0.8,
    shoreFoam: 0.7,
  },
  draw: drawWater,
};
