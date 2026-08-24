import type { BaseEffectParams, DrawFn, EffectModule } from '../core/types';

export interface HazardAtmosphereParams extends BaseEffectParams {
  turbulence: number;
  glow: number;
  edgeSoftness: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const c = hex.replace('#', '');
  return {
    r: parseInt(c.slice(0, 2), 16),
    g: parseInt(c.slice(2, 4), 16),
    b: parseInt(c.slice(4, 6), 16),
  };
}

/**
 * World-space volumetric-ish hazard fog: soft radial blobs that drift with wind
 * and pulse inside each hazard zone.
 */
export const drawHazardAtmosphere: DrawFn<HazardAtmosphereParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;

  ctx.save();
  for (const zone of scene.hazardZones) {
    const rgb = hexToRgb(zone.color);
    const cx = zone.x + zone.width / 2;
    const cy = zone.y + zone.height / 2;
    const driftX = Math.sin(t * (0.6 + params.turbulence) + zone.x * 0.01) * 18 * params.turbulence;
    const driftY = Math.cos(t * (0.45 + params.turbulence * 0.5) + zone.y * 0.01) * 12 * params.turbulence;
    const windPushX = scene.wind.x * 30;
    const windPushY = scene.wind.y * 20;

    const radius =
      Math.max(zone.width, zone.height) *
      (0.55 + params.edgeSoftness * 0.35) *
      (0.9 + Math.sin(t * 1.3 + zone.intensity) * 0.08);

    const g = ctx.createRadialGradient(
      cx + driftX + windPushX,
      cy + driftY + windPushY,
      radius * 0.1,
      cx + driftX + windPushX,
      cy + driftY + windPushY,
      radius,
    );

    const a = params.intensity * zone.intensity;
    g.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${0.45 * a})`);
    g.addColorStop(0.45, `rgba(${rgb.r},${rgb.g},${rgb.b},${0.18 * a})`);
    g.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);

    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(
      cx + driftX + windPushX,
      cy + driftY + windPushY,
      zone.width * (0.7 + params.edgeSoftness * 0.3),
      zone.height * (0.55 + params.edgeSoftness * 0.25),
      Math.sin(t * 0.2) * 0.15,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Spark / mote accents
    if (params.glow > 0) {
      ctx.globalAlpha = 0.35 * a * params.glow;
      for (let i = 0; i < 12; i++) {
        const px =
          zone.x +
          ((Math.sin(t * 1.1 + i * 1.7 + zone.x) * 0.5 + 0.5) * zone.width);
        const py =
          zone.y +
          ((Math.cos(t * 0.9 + i * 2.1 + zone.y) * 0.5 + 0.5) * zone.height);
        ctx.fillStyle = zone.color;
        ctx.beginPath();
        ctx.arc(px, py, 1.5 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
};

export const hazardAtmosphereEffect: EffectModule<HazardAtmosphereParams> = {
  id: 'hazard-atmosphere',
  name: 'Hazard Atmosphere',
  description: 'World-space colored fog and motes inside hazard zones, wind-reactive.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 0.85,
    turbulence: 0.7,
    glow: 0.8,
    edgeSoftness: 0.65,
  },
  draw: drawHazardAtmosphere,
};
