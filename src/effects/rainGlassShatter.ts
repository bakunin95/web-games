import type { BaseEffectParams, DrawFn, EffectModule, SceneContext } from '../core/types';
import { fbm2, mulberry32, withAlpha } from './noise';

export interface RainGlassShatterParams extends BaseEffectParams {
  rainRate: number;
  gravity: number;
  trailLength: number;
  refractionStrength: number;
  dropSize: number;
  drySpeed: number;
  wind: number;
  shardCount: number;
  explosionForce: number;
  shardGravity: number;
  bounceEnabled: boolean;
  shatterResetDelay: number;
}

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  age: number;
  id: number;
  attachedToShard?: number;
}

interface TrailSegment {
  x: number;
  y: number;
  mass: number;
  wetness: number;
  age: number;
}

interface VoronoiSite {
  x: number;
  y: number;
}

interface Shard {
  vertices: { x: number; y: number }[];
  centroid: { x: number; y: number };
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  age: number;
  bounces: number;
  settled: boolean;
  drops: Drop[];
}

type SequenceState = 'rain' | 'shattering' | 'shattered';

interface RainGlassShatterState {
  drops: Drop[];
  trails: TrailSegment[];
  wetMap: Map<string, number>;
  nextId: number;
  backgroundImage: ImageData | null;
  lastBackgroundCapture: number;
  shards: Shard[];
  sequenceState: SequenceState;
  impactPoint: { x: number; y: number } | null;
  shockRingAge: number;
  shatterTime: number;
  resetScheduled: number;
}

const states = new Map<string, RainGlassShatterState>();

function ensureState(instanceId: string): RainGlassShatterState {
  let state = states.get(instanceId);
  if (!state) {
    state = {
      drops: [],
      trails: [],
      wetMap: new Map(),
      nextId: 0,
      backgroundImage: null,
      lastBackgroundCapture: 0,
      shards: [],
      sequenceState: 'rain',
      impactPoint: null,
      shockRingAge: -1,
      shatterTime: -999,
      resetScheduled: -1,
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

function drawGlassPane(
  ctx: CanvasRenderingContext2D,
  scene: SceneContext,
  alpha: number = 1,
): void {
  const { viewportWidth: w, viewportHeight: h } = scene;
  
  ctx.save();
  ctx.globalAlpha = 0.08 * alpha;
  ctx.fillStyle = '#e8f4ff';
  ctx.fillRect(0, 0, w, h);
  
  const highlightGrad = ctx.createLinearGradient(0, 0, w * 0.4, h * 0.4);
  highlightGrad.addColorStop(0, withAlpha('#ffffff', 0.25 * alpha));
  highlightGrad.addColorStop(0.6, withAlpha('#ffffff', 0.08 * alpha));
  highlightGrad.addColorStop(1, withAlpha('#ffffff', 0));
  ctx.fillStyle = highlightGrad;
  ctx.fillRect(0, 0, w, h);
  
  ctx.restore();
}

function drawDropWithRefraction(
  ctx: CanvasRenderingContext2D,
  drop: Drop,
  params: RainGlassShatterParams,
  state: RainGlassShatterState,
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
  params: RainGlassShatterParams,
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

function generateVoronoiShards(
  params: RainGlassShatterParams,
  impactX: number,
  impactY: number,
  rand: () => number,
  scene: SceneContext,
): Shard[] {
  const width = scene.viewportWidth;
  const height = scene.viewportHeight;
  const cx = width / 2;
  const cy = height / 2;
  const count = Math.floor(params.shardCount);
  
  const sites: VoronoiSite[] = [];
  
  const impactLocalX = impactX - cx;
  const impactLocalY = impactY - cy;
  sites.push({ x: impactLocalX, y: impactLocalY });
  
  for (let i = 1; i < count; i++) {
    const angle = (i / (count - 1)) * Math.PI * 2 + rand() * 0.5;
    const dist = (0.3 + rand() * 0.7) * Math.min(width, height) * 0.5;
    sites.push({
      x: Math.cos(angle) * dist + (rand() - 0.5) * width * 0.3,
      y: Math.sin(angle) * dist + (rand() - 0.5) * height * 0.3,
    });
  }
  
  const bounds = {
    minX: -width / 2,
    maxX: width / 2,
    minY: -height / 2,
    maxY: height / 2,
  };
  
  const shards: Shard[] = [];
  
  for (let i = 0; i < sites.length; i++) {
    const site = sites[i]!;
    const vertices: { x: number; y: number }[] = [];
    
    const corners = [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
      { x: bounds.minX, y: bounds.maxY },
    ];
    
    let clippedPolygon = [...corners];
    
    for (let j = 0; j < sites.length; j++) {
      if (i === j) continue;
      const other = sites[j]!;
      
      const midX = (site.x + other.x) / 2;
      const midY = (site.y + other.y) / 2;
      
      const dx = other.x - site.x;
      const dy = other.y - site.y;
      
      const nx = -dy;
      const ny = dx;
      const len = Math.sqrt(nx * nx + ny * ny);
      if (len < 0.001) continue;
      
      const nnx = nx / len;
      const nny = ny / len;
      
      const newPolygon: { x: number; y: number }[] = [];
      
      for (let k = 0; k < clippedPolygon.length; k++) {
        const p1 = clippedPolygon[k]!;
        const p2 = clippedPolygon[(k + 1) % clippedPolygon.length]!;
        
        const d1 = (p1.x - midX) * nnx + (p1.y - midY) * nny;
        const d2 = (p2.x - midX) * nnx + (p2.y - midY) * nny;
        
        if (d1 >= -0.01) {
          newPolygon.push(p1);
        }
        
        if ((d1 >= 0 && d2 < 0) || (d1 < 0 && d2 >= 0)) {
          const t = d1 / (d1 - d2);
          const ix = p1.x + t * (p2.x - p1.x);
          const iy = p1.y + t * (p2.y - p1.y);
          newPolygon.push({ x: ix, y: iy });
        }
      }
      
      clippedPolygon = newPolygon;
      if (clippedPolygon.length < 3) break;
    }
    
    if (clippedPolygon.length >= 3) {
      for (const v of clippedPolygon) {
        vertices.push({ x: v.x, y: v.y });
      }
      
      let sumX = 0, sumY = 0;
      for (const v of vertices) {
        sumX += v.x;
        sumY += v.y;
      }
      const centroid = {
        x: sumX / vertices.length,
        y: sumY / vertices.length,
      };
      
      const dx = centroid.x - impactLocalX;
      const dy = centroid.y - impactLocalY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = Math.sqrt(width * width + height * height) / 2;
      const forceFactor = params.explosionForce * (1 - Math.min(dist / maxDist, 1) * 0.5);
      
      const angle = Math.atan2(dy, dx) + (rand() - 0.5) * 0.8;
      const speed = (80 + rand() * 120) * forceFactor;
      
      shards.push({
        vertices,
        centroid,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - rand() * 40 * forceFactor,
        rotation: rand() * Math.PI * 2,
        rotationSpeed: (rand() - 0.5) * 8 * forceFactor,
        age: 0,
        bounces: 0,
        settled: false,
        drops: [],
      });
    }
  }
  
  return shards;
}

function drawShard(
  ctx: CanvasRenderingContext2D,
  shard: Shard,
  worldX: number,
  worldY: number,
): void {
  ctx.save();
  ctx.translate(worldX, worldY);
  ctx.rotate(shard.rotation);
  
  ctx.beginPath();
  ctx.moveTo(shard.vertices[0]!.x, shard.vertices[0]!.y);
  for (let i = 1; i < shard.vertices.length; i++) {
    ctx.lineTo(shard.vertices[i]!.x, shard.vertices[i]!.y);
  }
  ctx.closePath();
  
  const avgX = shard.vertices.reduce((sum, v) => sum + v.x, 0) / shard.vertices.length;
  const avgY = shard.vertices.reduce((sum, v) => sum + v.y, 0) / shard.vertices.length;
  
  const fillGrad = ctx.createRadialGradient(avgX, avgY, 0, avgX, avgY, 50);
  fillGrad.addColorStop(0, withAlpha('#b8e8ff', 0.75));
  fillGrad.addColorStop(1, withAlpha('#b8e8ff', 0.55));
  ctx.fillStyle = fillGrad;
  ctx.fill();
  
  ctx.strokeStyle = withAlpha('#ffffff', 0.85);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  
  const highlightGrad = ctx.createLinearGradient(
    avgX - 20,
    avgY - 20,
    avgX + 20,
    avgY + 20,
  );
  highlightGrad.addColorStop(0, withAlpha('#ffffff', 0.45));
  highlightGrad.addColorStop(0.6, withAlpha('#ffffff', 0.15));
  highlightGrad.addColorStop(1, withAlpha('#ffffff', 0));
  
  ctx.fillStyle = highlightGrad;
  ctx.fill();
  
  ctx.restore();
}

function drawShockRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  age: number,
): void {
  if (age < 0 || age > 0.6) return;
  
  const radius = age * 250;
  const alpha = Math.max(0, 1 - age / 0.6);
  
  ctx.save();
  ctx.strokeStyle = withAlpha('#ffffff', alpha * 0.8);
  ctx.lineWidth = 3 * (1 - age / 0.6);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.strokeStyle = withAlpha('#e8f4ff', alpha * 0.4);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.95, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.restore();
}

export const drawRainGlassShatter: DrawFn<RainGlassShatterParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  
  const state = ensureState('rain-glass-shatter');
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
  
  if (state.sequenceState === 'rain') {
    drawGlassPane(ctx, scene);
    
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
    
  } else if (state.sequenceState === 'shattering' || state.sequenceState === 'shattered') {
    
    if (state.shockRingAge >= 0) {
      state.shockRingAge += dt;
      if (state.impactPoint) {
        drawShockRing(ctx, state.impactPoint.x, state.impactPoint.y, state.shockRingAge);
      }
    }
    
    if (!scene.paused) {
      for (const shard of state.shards) {
        if (shard.settled) continue;
        
        shard.age += dt;
        shard.vy += params.shardGravity * 400 * dt;
        
        shard.rotation += shard.rotationSpeed * dt;
        shard.rotationSpeed *= 0.98;
        
        const worldY = h / 2 + shard.centroid.y + shard.vy * dt;
        
        shard.centroid.x += shard.vx * dt;
        shard.centroid.y += shard.vy * dt;
        
        const groundY = h - 50;
        if (worldY > groundY && params.bounceEnabled) {
          shard.centroid.y = groundY - h / 2;
          shard.vy *= -0.4;
          shard.vx *= 0.7;
          shard.rotationSpeed *= 0.6;
          shard.bounces++;
          
          if (shard.bounces > 2 && Math.abs(shard.vy) < 10) {
            shard.settled = true;
          }
        } else if (worldY > groundY && !params.bounceEnabled) {
          shard.settled = true;
        }
        
        shard.vx *= 0.995;
      }
    }
    
    ctx.save();
    
    const sortedShards = [...state.shards].sort((a, b) => {
      const aY = h / 2 + a.centroid.y;
      const bY = h / 2 + b.centroid.y;
      return aY - bY;
    });
    
    for (const shard of sortedShards) {
      const worldX = w / 2 + shard.centroid.x;
      const worldY = h / 2 + shard.centroid.y;
      drawShard(ctx, shard, worldX, worldY);
    }
    
    ctx.restore();
    
    if (state.sequenceState === 'shattered' && state.resetScheduled > 0 && t >= state.resetScheduled) {
      state.sequenceState = 'rain';
      state.drops = [];
      state.trails = [];
      state.shards = [];
      state.impactPoint = null;
      state.shockRingAge = -1;
      state.resetScheduled = -1;
    }
  }
};

export function triggerShatter(impactX: number, impactY: number, seed: number, scene: SceneContext, params: RainGlassShatterParams, t: number): void {
  const state = states.get('rain-glass-shatter');
  if (!state) return;
  
  if (state.sequenceState === 'rain') {
    state.sequenceState = 'shattering';
    state.impactPoint = { x: impactX, y: impactY };
    state.shockRingAge = 0;
    state.shatterTime = t;
    const rand = mulberry32(seed);
    state.shards = generateVoronoiShards(params, impactX, impactY, rand, scene);
    
    setTimeout(() => {
      if (state.sequenceState === 'shattering') {
        state.sequenceState = 'shattered';
        state.resetScheduled = t + params.shatterResetDelay;
      }
    }, 100);
  }
}

export const rainGlassShatterEffect: EffectModule<RainGlassShatterParams> = {
  id: 'rain-glass-shatter',
  name: 'Rain on Glass → Shatter',
  description: 'Interactive sequence: rain drops on glass that shatters on click/space.',
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
    shardCount: 18,
    explosionForce: 1.2,
    shardGravity: 1,
    bounceEnabled: true,
    shatterResetDelay: 5,
  },
  draw: drawRainGlassShatter,
};

export function resetRainGlassShatter(): void {
  states.clear();
}
