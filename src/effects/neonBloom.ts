import type { BaseEffectParams, DrawFn, EffectModule } from '../core/types';
import { worldToScreen } from '../core/types';

export interface NeonBloomParams extends BaseEffectParams {
  threshold: number;
  bloomSize: number;
  tint: string;
  chromatic: number;
}

/**
 * Screen-space neon bloom / wet-lens overlay.
 * Samples scene lights projected to viewport and draws soft additive glows +
 * optional chromatic fringing — portable Canvas 2D, no WebGL.
 */
export const drawNeonBloom: DrawFn<NeonBloomParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;

  const { viewportWidth: w, viewportHeight: h } = scene;
  ctx.save();

  // Darken edges slightly for cinematic wet look
  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, `rgba(4, 6, 14, ${0.35 * params.intensity})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = 'lighter';

  for (const light of scene.lights) {
    if (light.intensity < params.threshold) continue;
    const p = worldToScreen(scene, light.x, light.y);
    const pulse = 0.85 + Math.sin(t * 2 + light.x * 0.02) * 0.15;
    const radius = light.radius * scene.camera.zoom * params.bloomSize * 0.55 * pulse;

    // Chromatic split
    const split = params.chromatic * 6 * params.intensity;
    const layers = [
      { color: light.color, ox: 0, oy: 0, a: 0.28 },
      { color: '#ff4d6d', ox: -split, oy: split * 0.3, a: 0.12 * params.chromatic },
      { color: '#4df0ff', ox: split, oy: -split * 0.3, a: 0.12 * params.chromatic },
    ];

    for (const layer of layers) {
      if (layer.a <= 0) continue;
      const g = ctx.createRadialGradient(p.x + layer.ox, p.y + layer.oy, 0, p.x + layer.ox, p.y + layer.oy, radius);
      g.addColorStop(0, withAlpha(layer.color, layer.a * light.intensity * params.intensity));
      g.addColorStop(0.4, withAlpha(layer.color, layer.a * 0.45 * params.intensity));
      g.addColorStop(1, withAlpha(layer.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x + layer.ox, p.y + layer.oy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Tint wash
  if (params.tint && params.intensity > 0) {
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.08 * params.intensity;
    ctx.fillStyle = params.tint;
    ctx.fillRect(0, 0, w, h);
  }

  // Rain on lens streaks (screen-space)
  if (scene.rainWet) {
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = withAlpha('#cfe8ff', 0.12 * params.intensity);
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const x = ((Math.sin(i * 12.1 + t * 0.2) * 0.5 + 0.5) * w);
      const y = ((i * 97 + t * 40 * (0.5 + scene.wind.x)) % (h + 40)) - 20;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + scene.wind.x * 14, y + 28);
      ctx.stroke();
    }
  }

  ctx.restore();
};

function withAlpha(hex: string, alpha: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

export const neonBloomEffect: EffectModule<NeonBloomParams> = {
  id: 'neon-bloom',
  name: 'Neon Bloom Overlay',
  description: 'Screen-space bloom, chromatic fringe, vignette, and wet-lens streaks.',
  space: 'screen',
  defaultParams: {
    enabled: true,
    intensity: 0.8,
    threshold: 0.2,
    bloomSize: 1.1,
    tint: '#6b8cff',
    chromatic: 0.55,
  },
  draw: drawNeonBloom,
};
