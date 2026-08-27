import type { BaseEffectParams, DrawFn, EffectModule } from '../core/types';
import { fbm2, mulberry32, withAlpha } from './noise';

export interface ManholeSteamParams extends BaseEffectParams {
  coverX: number;
  coverY: number;
  ventCount: number;
  steamRate: number;
  riseSpeed: number;
  drift: number;
  opacity: number;
  steamColor: string;
}

interface SteamPlume {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
  size: number;
  phase: number;
}

interface ManholeSteamState {
  plumes: SteamPlume[];
  nextSpawn: number;
}

const states = new Map<string, ManholeSteamState>();

function ensureState(instanceId: string): ManholeSteamState {
  let state = states.get(instanceId);
  if (!state) {
    state = {
      plumes: [],
      nextSpawn: 0,
    };
    states.set(instanceId, state);
  }
  return state;
}

function drawManholeCover(
  ctx: CanvasRenderingContext2D,
  params: ManholeSteamParams,
): void {
  const x = params.coverX;
  const y = params.coverY;
  const radius = 60;
  
  ctx.save();
  
  const asphaltGrad = ctx.createRadialGradient(x, y, 0, x, y, radius * 2);
  asphaltGrad.addColorStop(0, withAlpha('#2a2a2a', 0.9));
  asphaltGrad.addColorStop(0.7, withAlpha('#1a1a1a', 0.95));
  asphaltGrad.addColorStop(1, withAlpha('#0a0a0a', 0));
  ctx.fillStyle = asphaltGrad;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
  ctx.fill();
  
  const coverGrad = ctx.createRadialGradient(x - 10, y - 10, 0, x, y, radius);
  coverGrad.addColorStop(0, withAlpha('#4a4440', 1));
  coverGrad.addColorStop(0.5, withAlpha('#2a2420', 1));
  coverGrad.addColorStop(1, withAlpha('#1a1410', 1));
  
  ctx.fillStyle = coverGrad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = withAlpha('#5a5450', 0.8);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.strokeStyle = withAlpha('#1a1410', 0.9);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, radius - 5, 0, Math.PI * 2);
  ctx.stroke();
  
  const ventAngles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  for (const angle of ventAngles) {
    const ventX = x + Math.cos(angle) * radius * 0.6;
    const ventY = y + Math.sin(angle) * radius * 0.6;
    
    ctx.fillStyle = withAlpha('#0a0a0a', 0.95);
    ctx.beginPath();
    ctx.arc(ventX, ventY, 6, 0, Math.PI * 2);
    ctx.fill();
    
    for (let i = 0; i < 3; i++) {
      const holeAngle = angle + (i - 1) * 0.3;
      const holeX = ventX + Math.cos(holeAngle) * 8;
      const holeY = ventY + Math.sin(holeAngle) * 8;
      
      ctx.fillStyle = withAlpha('#0a0a0a', 0.9);
      ctx.beginPath();
      ctx.arc(holeX, holeY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  ctx.fillStyle = withAlpha('#6a6460', 0.3);
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NYC', x, y - 25);
  ctx.fillText('SEWER', x, y + 25);
  
  ctx.restore();
}

function drawSteamPlume(
  ctx: CanvasRenderingContext2D,
  plume: SteamPlume,
  params: ManholeSteamParams,
  t: number,
): void {
  const progress = plume.age / plume.maxAge;
  const alpha = (1 - progress) * params.opacity * params.intensity;
  
  if (alpha < 0.02) return;
  
  const expandedSize = plume.size * (1 + progress * 2);
  
  const noise = fbm2(plume.x * 0.02 + t, plume.y * 0.015 + plume.phase, 3, 42);
  const wobbleX = noise * 15;
  const wobbleY = fbm2(plume.y * 0.02, plume.x * 0.015 + t + plume.phase, 2, 24) * 8;
  
  const drawX = plume.x + wobbleX;
  const drawY = plume.y + wobbleY;
  
  ctx.save();
  
  for (let layer = 0; layer < 3; layer++) {
    const layerAlpha = alpha * (layer === 0 ? 0.15 : layer === 1 ? 0.25 : 0.35);
    const layerSize = expandedSize * (1 + layer * 0.3);
    
    const grad = ctx.createRadialGradient(drawX, drawY, 0, drawX, drawY, layerSize);
    grad.addColorStop(0, withAlpha(params.steamColor, layerAlpha * 0.8));
    grad.addColorStop(0.5, withAlpha(params.steamColor, layerAlpha * 0.5));
    grad.addColorStop(1, withAlpha(params.steamColor, 0));
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(drawX, drawY, layerSize, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.restore();
}

export const drawManholeSteam: DrawFn<ManholeSteamParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  
  const state = ensureState('manhole-steam');
  const dt = scene.paused ? 0 : (scene.dt || 1/60);
  
  drawManholeCover(ctx, params);
  
  if (!scene.paused) {
    if (t >= state.nextSpawn) {
      const spawnRate = params.steamRate * params.intensity;
      state.nextSpawn = t + (0.3 + Math.random() * 0.5) / spawnRate;
      
      const rand = mulberry32(Date.now());
      const ventAngles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
      const ventAngle = ventAngles[Math.floor(rand() * ventAngles.length)]!;
      
      const ventRadius = 60 * 0.6;
      const ventX = params.coverX + Math.cos(ventAngle) * ventRadius;
      const ventY = params.coverY + Math.sin(ventAngle) * ventRadius;
      
      const holeOffset = (rand() - 0.5) * 16;
      const spawnX = ventX + Math.cos(ventAngle + Math.PI / 2) * holeOffset;
      const spawnY = ventY + Math.sin(ventAngle + Math.PI / 2) * holeOffset;
      
      state.plumes.push({
        x: spawnX,
        y: spawnY,
        vx: params.drift * (rand() - 0.5) * 10,
        vy: -params.riseSpeed * (30 + rand() * 20),
        age: 0,
        maxAge: 3 + rand() * 2,
        size: 15 + rand() * 10,
        phase: rand() * 1000,
      });
    }
    
    for (const plume of state.plumes) {
      plume.age += dt;
      
      const turbulence = fbm2(plume.x * 0.03 + t, plume.y * 0.02, 2, plume.phase);
      plume.vx += turbulence * params.drift * 5 * dt;
      plume.vy *= 0.99;
      
      plume.x += plume.vx * dt;
      plume.y += plume.vy * dt;
    }
    
    state.plumes = state.plumes.filter(plume => plume.age < plume.maxAge);
  }
  
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  
  const sortedPlumes = [...state.plumes].sort((a, b) => a.y - b.y);
  
  for (const plume of sortedPlumes) {
    drawSteamPlume(ctx, plume, params, t);
  }
  
  ctx.restore();
};

export const manholeSteamEffect: EffectModule<ManholeSteamParams> = {
  id: 'manhole-steam',
  name: 'Manhole Steam',
  description: 'Cast-iron manhole cover with steam venting from holes, wispy translucent plumes.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 0.9,
    coverX: 900,
    coverY: 750,
    ventCount: 4,
    steamRate: 1.5,
    riseSpeed: 1,
    drift: 0.5,
    opacity: 0.7,
    steamColor: '#e8f0f8',
  },
  draw: drawManholeSteam,
};
