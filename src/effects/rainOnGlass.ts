import type { BaseEffectParams, DrawFn, EffectModule, SceneContext } from '../core/types';
import { fbm2, mulberry32, withAlpha } from './noise';

export interface RainOnGlassParams extends BaseEffectParams {
  rainRate: number;
  gravity: number;
  trailLength: number;
  refractionStrength: number;
  dropSize: number;
  drySpeed: number;
  wind: number;
}

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  age: number;
  id: number;
}

interface TrailSegment {
  x: number;
  y: number;
  mass: number;
  wetness: number;
  age: number;
}

interface RainOnGlassState {
  drops: Drop[];
  trails: TrailSegment[];
  wetMap: Map<string, number>;
  nextId: number;
  lastTime: number;
  backgroundImage: ImageData | null;
  lastBackgroundCapture: number;
}

const states = new Map<string, RainOnGlassState>();

function ensureState(instanceId: string): RainOnGlassState {
  let state = states.get(instanceId);
  if (!state) {
    state = {
      drops: [],
      trails: [],
      wetMap: new Map(),
      nextId: 0,
      lastTime: 0,
      backgroundImage: null,
      lastBackgroundCapture: 0,
    };
    states.set(instanceId, state);
  }
  return state;
}

function spawnDrop(x: number, y: number, mass: number, id: number, wind: number): Drop {
  return {
    x,
    y,
    vx: wind * 10 + (Math.random() - 0.5) * 5,
    vy: 0,
    mass,
    age: 0,
    id,
  };
}

function getWetMapKey(x: number, y: number): string {
  return `${Math.floor(x / 8)},${Math.floor(y / 8)}`;
}

function drawBackground(ctx: CanvasRenderingContext2D, scene: SceneContext): void {
  const { viewportWidth: w, viewportHeight: h } = scene;
  
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, '#1a1425');
  gradient.addColorStop(0.5, '#2a1a35');
  gradient.addColorStop(1, '#1f1528');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  const rand = mulberry32(42);
  ctx.save();
  ctx.globalAlpha = 0.4;
  for (let i = 0; i < 80; i++) {
    const lx = rand() * w;
    const ly = rand() * h;
    const size = 2 + rand() * 6;
    const brightness = 0.5 + rand() * 0.5;
    
    const colors = ['#ff6b9d', '#4fc3f7', '#ffd54f', '#7c4dff', '#00e676'];
    const color = colors[Math.floor(rand() * colors.length)]!;
    
    const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, size * 8);
    grad.addColorStop(0, withAlpha(color, 0.6 * brightness));
    grad.addColorStop(0.5, withAlpha(color, 0.3 * brightness));
    grad.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(lx, ly, size * 8, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = withAlpha(color, 0.8 * brightness);
    ctx.beginPath();
    ctx.arc(lx, ly, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < 30; i++) {
    const x = rand() * w;
    const y = rand() * h * 0.6;
    const w2 = 20 + rand() * 100;
    const h2 = 60 + rand() * 120;
    
    ctx.fillStyle = withAlpha('#ffffff', 0.05 + rand() * 0.1);
    ctx.fillRect(x - w2/2, y - h2/2, w2, h2);
  }
  ctx.restore();
}

function drawDropWithRefraction(
  ctx: CanvasRenderingContext2D,
  drop: Drop,
  params: RainOnGlassParams,
  state: RainOnGlassState,
): void {
  const radius = Math.sqrt(drop.mass) * params.dropSize * 4;
  const { x, y } = drop;
  
  ctx.save();
  
  if (state.backgroundImage && params.refractionStrength > 0.05) {
    const imgData = state.backgroundImage;
    const imgW = imgData.width;
    const imgH = imgData.height;
    
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * 0.95, 0, 0, Math.PI * 2);
    ctx.clip();
    
    const distortScale = params.refractionStrength * 12;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        
        const distortAmt = (1 - dist / radius) * distortScale;
        const angle = Math.atan2(dy, dx);
        const offsetX = Math.cos(angle) * distortAmt;
        const offsetY = Math.sin(angle) * distortAmt;
        
        const srcX = Math.floor(x + dx - offsetX);
        const srcY = Math.floor(y + dy - offsetY);
        
        if (srcX >= 0 && srcX < imgW && srcY >= 0 && srcY < imgH) {
          const srcIdx = (srcY * imgW + srcX) * 4;
          const r = imgData.data[srcIdx]!;
          const g = imgData.data[srcIdx + 1]!;
          const b = imgData.data[srcIdx + 2]!;
          
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x + dx, y + dy, 1, 1);
        }
      }
    }
    ctx.restore();
  }
  
  const highlightGrad = ctx.createRadialGradient(
    x - radius * 0.3,
    y - radius * 0.3,
    0,
    x,
    y,
    radius,
  );
  highlightGrad.addColorStop(0, withAlpha('#ffffff', 0.45));
  highlightGrad.addColorStop(0.3, withAlpha('#e8f4ff', 0.25));
  highlightGrad.addColorStop(0.6, withAlpha('#a8c8ff', 0.12));
  highlightGrad.addColorStop(1, withAlpha('#6890c0', 0.05));
  
  ctx.fillStyle = highlightGrad;
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = withAlpha('#cfe8ff', 0.35);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * 0.95, 0, 0, Math.PI * 2);
  ctx.stroke();
  
  const specX = x - radius * 0.4;
  const specY = y - radius * 0.35;
  const specGrad = ctx.createRadialGradient(specX, specY, 0, specX, specY, radius * 0.3);
  specGrad.addColorStop(0, withAlpha('#ffffff', 0.75));
  specGrad.addColorStop(0.6, withAlpha('#ffffff', 0.25));
  specGrad.addColorStop(1, withAlpha('#ffffff', 0));
  
  ctx.fillStyle = specGrad;
  ctx.beginPath();
  ctx.arc(specX, specY, radius * 0.3, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  trail: TrailSegment,
  params: RainOnGlassParams,
): void {
  const radius = Math.sqrt(trail.mass) * params.dropSize * 2;
  const alpha = trail.wetness * 0.25;
  
  const grad = ctx.createRadialGradient(trail.x, trail.y, 0, trail.x, trail.y, radius);
  grad.addColorStop(0, withAlpha('#a8c8ff', alpha * 0.8));
  grad.addColorStop(0.5, withAlpha('#7890b0', alpha * 0.5));
  grad.addColorStop(1, withAlpha('#6890c0', 0));
  
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(trail.x, trail.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

export const drawRainOnGlass: DrawFn<RainOnGlassParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  
  const state = ensureState('rain-on-glass');
  const dt = scene.paused ? 0 : (scene.dt || 1/60);
  const { viewportWidth: w, viewportHeight: h } = scene;
  
  drawBackground(ctx, scene);
  
  if (t - state.lastBackgroundCapture > 0.5 || !state.backgroundImage) {
    try {
      state.backgroundImage = ctx.getImageData(0, 0, w, h);
      state.lastBackgroundCapture = t;
    } catch (e) {
    }
  }
  
  if (!scene.paused) {
    const spawnRate = params.rainRate * params.intensity * 2.5;
    const spawnCount = Math.floor(spawnRate * dt + Math.random());
    for (let i = 0; i < spawnCount; i++) {
      const x = Math.random() * w;
      const y = -10 + Math.random() * 50;
      const mass = 0.3 + Math.random() * 0.7;
      state.drops.push(spawnDrop(x, y, mass, state.nextId++, params.wind));
    }
    
    for (const drop of state.drops) {
      drop.age += dt;
      
      const terminalVelocity = Math.sqrt(drop.mass) * params.gravity * 150;
      drop.vy = Math.min(drop.vy + params.gravity * 300 * dt, terminalVelocity);
      
      drop.vx += params.wind * 5 * dt;
      drop.vx *= 0.98;
      
      const noise = fbm2(drop.x * 0.02 + t, drop.y * 0.015, 2, drop.id);
      drop.vx += noise * 15 * dt;
      
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      
      const key = getWetMapKey(drop.x, drop.y);
      state.wetMap.set(key, 1.0);
      
      if (drop.y > h - 20) {
        state.trails.push({
          x: drop.x,
          y: drop.y,
          mass: drop.mass * 0.3,
          wetness: 1.0,
          age: 0,
        });
      }
    }
    
    for (let i = 0; i < state.drops.length; i++) {
      const dropA = state.drops[i]!;
      for (let j = i + 1; j < state.drops.length; j++) {
        const dropB = state.drops[j]!;
        const dx = dropA.x - dropB.x;
        const dy = dropA.y - dropB.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = (Math.sqrt(dropA.mass) + Math.sqrt(dropB.mass)) * params.dropSize * 4;
        
        if (dist < minDist) {
          dropA.mass += dropB.mass;
          dropA.vx = (dropA.vx * dropA.mass + dropB.vx * dropB.mass) / (dropA.mass);
          dropA.vy = (dropA.vy * dropA.mass + dropB.vy * dropB.mass) / (dropA.mass);
          state.drops.splice(j, 1);
          j--;
        }
      }
    }
    
    state.drops = state.drops.filter(drop => {
      return drop.y < h + 20 && drop.x >= -20 && drop.x < w + 20;
    });
    
    for (const trail of state.trails) {
      trail.age += dt;
      trail.wetness = Math.max(0, trail.wetness - params.drySpeed * dt * 0.5);
    }
    
    state.trails = state.trails.filter(trail => trail.wetness > 0.05);
    
    for (const key of state.wetMap.keys()) {
      const wetness = state.wetMap.get(key)!;
      const newWetness = Math.max(0, wetness - params.drySpeed * dt);
      if (newWetness <= 0.01) {
        state.wetMap.delete(key);
      } else {
        state.wetMap.set(key, newWetness);
      }
    }
  }
  
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  
  for (const trail of state.trails) {
    drawTrail(ctx, trail, params);
  }
  
  for (const drop of state.drops) {
    drawDropWithRefraction(ctx, drop, params, state);
  }
  
  ctx.restore();
};

export const rainOnGlassEffect: EffectModule<RainOnGlassParams> = {
  id: 'rain-on-glass',
  name: 'Rain on Glass',
  description: 'Rain drops sliding down glass with refraction, coalescence, and wet trails.',
  space: 'screen',
  defaultParams: {
    enabled: true,
    intensity: 0.8,
    rainRate: 5,
    gravity: 1,
    trailLength: 0.7,
    refractionStrength: 0.7,
    dropSize: 1,
    drySpeed: 0.3,
    wind: 0.2,
  },
  draw: drawRainOnGlass,
};

export function resetRainOnGlass(): void {
  states.clear();
}
