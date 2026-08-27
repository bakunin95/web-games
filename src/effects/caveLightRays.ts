import type { BaseEffectParams, DrawFn, EffectModule, SceneContext } from '../core/types';
import { fbm2, mulberry32, withAlpha } from './noise';

export interface CaveLightRaysParams extends BaseEffectParams {
  rayCount: number;
  rayWidth: number;
  rayLength: number;
  rayColor: string;
  mistDensity: number;
  mistColor: string;
  caveColor: string;
  animationSpeed: number;
  shimmerAmount: number;
}

interface LightRay {
  x: number;
  angle: number;
  width: number;
  length: number;
  phase: number;
}

interface MistParticle {
  x: number;
  y: number;
  size: number;
  drift: number;
  phase: number;
}

interface CaveLightRaysState {
  rays: LightRay[];
  mist: MistParticle[];
  initialized: boolean;
}

const states = new Map<string, CaveLightRaysState>();

function ensureState(instanceId: string, params: CaveLightRaysParams): CaveLightRaysState {
  let state = states.get(instanceId);
  if (!state || !state.initialized) {
    const rand = mulberry32(42);
    const rays: LightRay[] = [];
    
    for (let i = 0; i < params.rayCount; i++) {
      rays.push({
        x: 200 + i * (1200 / params.rayCount) + (rand() - 0.5) * 100,
        angle: Math.PI / 2 + (rand() - 0.5) * 0.4,
        width: params.rayWidth * (0.7 + rand() * 0.6),
        length: params.rayLength * (0.8 + rand() * 0.4),
        phase: rand() * 1000,
      });
    }
    
    const mist: MistParticle[] = [];
    for (let i = 0; i < 80; i++) {
      mist.push({
        x: rand() * 1600,
        y: rand() * 900,
        size: 40 + rand() * 80,
        drift: (rand() - 0.5) * 8,
        phase: rand() * 1000,
      });
    }
    
    state = { rays, mist, initialized: true };
    states.set(instanceId, state);
  }
  return state;
}

function drawCaveBackground(
  ctx: CanvasRenderingContext2D,
  params: CaveLightRaysParams,
  scene: SceneContext,
): void {
  const w = scene.viewportWidth;
  const h = scene.viewportHeight;
  
  const grad = ctx.createRadialGradient(w / 2, h * 0.3, 0, w / 2, h / 2, Math.max(w, h) * 0.8);
  grad.addColorStop(0, withAlpha(params.caveColor, 0.4));
  grad.addColorStop(0.6, withAlpha(params.caveColor, 0.9));
  grad.addColorStop(1, withAlpha('#000810', 1));
  
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  
  ctx.fillStyle = withAlpha('#001020', 0.6);
  for (let i = 0; i < 5; i++) {
    const rand = mulberry32(i);
    const x = rand() * w;
    const y = h * 0.7 + rand() * h * 0.3;
    const width = 100 + rand() * 200;
    const height = 60 + rand() * 80;
    
    ctx.beginPath();
    ctx.ellipse(x, y, width, height, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLightRay(
  ctx: CanvasRenderingContext2D,
  ray: LightRay,
  params: CaveLightRaysParams,
  t: number,
): void {
  const shimmer = 1 + Math.sin(t * params.animationSpeed + ray.phase) * params.shimmerAmount;
  const alpha = (0.15 + fbm2(ray.x * 0.005, t * 0.3 + ray.phase, 2, 42) * 0.1) * shimmer * params.intensity;
  
  const startX = ray.x;
  const startY = 0;
  const endX = startX + Math.cos(ray.angle) * ray.length;
  const endY = startY + Math.sin(ray.angle) * ray.length;
  
  ctx.save();
  
  for (let pass = 0; pass < 2; pass++) {
    const width = ray.width * (pass === 0 ? 1.5 : 1);
    const passAlpha = alpha * (pass === 0 ? 0.3 : 0.7);
    
    const grad = ctx.createLinearGradient(startX, startY, endX, endY);
    grad.addColorStop(0, withAlpha(params.rayColor, passAlpha * 0.9));
    grad.addColorStop(0.3, withAlpha(params.rayColor, passAlpha * 0.6));
    grad.addColorStop(0.7, withAlpha(params.rayColor, passAlpha * 0.3));
    grad.addColorStop(1, withAlpha(params.rayColor, 0));
    
    ctx.strokeStyle = grad;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    
    const segments = 8;
    for (let i = 1; i <= segments; i++) {
      const progress = i / segments;
      const segmentX = startX + (endX - startX) * progress;
      const segmentY = startY + (endY - startY) * progress;
      
      const noise = fbm2(segmentX * 0.01, segmentY * 0.01 + t * 0.2 + ray.phase, 2, 42);
      const wobbleX = noise * width * 0.3;
      const wobbleY = fbm2(segmentY * 0.01, segmentX * 0.01 + t * 0.15, 2, ray.phase) * width * 0.2;
      
      ctx.lineTo(segmentX + wobbleX, segmentY + wobbleY);
    }
    
    ctx.stroke();
  }
  
  ctx.restore();
}

function drawMist(
  ctx: CanvasRenderingContext2D,
  mist: MistParticle[],
  params: CaveLightRaysParams,
  t: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  
  for (const particle of mist) {
    const wobble = fbm2(particle.x * 0.01 + t * 0.1, particle.y * 0.01 + particle.phase, 2, 42);
    const x = particle.x + wobble * 20 + particle.drift * t * 5;
    const y = particle.y + Math.sin(t * 0.3 + particle.phase) * 15;
    
    const alpha = (0.05 + wobble * 0.03) * params.mistDensity * params.intensity;
    
    const grad = ctx.createRadialGradient(x, y, 0, x, y, particle.size);
    grad.addColorStop(0, withAlpha(params.mistColor, alpha * 0.8));
    grad.addColorStop(0.5, withAlpha(params.mistColor, alpha * 0.4));
    grad.addColorStop(1, withAlpha(params.mistColor, 0));
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.restore();
}

export const drawCaveLightRays: DrawFn<CaveLightRaysParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  
  const state = ensureState('cave-light-rays', params);
  
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  
  drawCaveBackground(ctx, params, scene);
  
  drawMist(ctx, state.mist, params, t);
  
  ctx.globalCompositeOperation = 'lighter';
  for (const ray of state.rays) {
    drawLightRay(ctx, ray, params, t);
  }
  
  drawMist(ctx, state.mist.slice().reverse(), params, t);
  
  ctx.restore();
};

export const caveLightRaysEffect: EffectModule<CaveLightRaysParams> = {
  id: 'cave-light-rays',
  name: 'Cave Light Rays',
  description: 'Volumetric pale-blue light shafts through mist in a dark teal cave, soft edges.',
  space: 'screen',
  defaultParams: {
    enabled: true,
    intensity: 1,
    rayCount: 6,
    rayWidth: 120,
    rayLength: 700,
    rayColor: '#a0c8ff',
    mistDensity: 1,
    mistColor: '#6090c0',
    caveColor: '#0a2838',
    animationSpeed: 0.8,
    shimmerAmount: 0.15,
  },
  draw: drawCaveLightRays,
};
