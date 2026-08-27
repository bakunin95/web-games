import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { fbm2, mulberry32, withAlpha } from './noise';

export interface WindowGlassShatterParams extends PlacedEffectParams {
  width: number;
  height: number;
  rainRate: number;
  gravity: number;
  refractionStrength: number;
  dropSize: number;
  drySpeed: number;
  shardCount: number;
  explosionForce: number;
  shardGravity: number;
  bounceEnabled: boolean;
  resetDelay: number;
  glassThickness: number;
  frameBorder: number;
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
}

type SequenceState = 'rain' | 'shattering' | 'shattered';

interface WindowState {
  drops: Drop[];
  trails: TrailSegment[];
  nextId: number;
  shards: Shard[];
  sequenceState: SequenceState;
  impactPoint: { x: number; y: number } | null;
  shockRingAge: number;
  resetScheduled: number;
}

const states = new Map<string, WindowState>();

function ensureState(instanceId: string): WindowState {
  let state = states.get(instanceId);
  if (!state) {
    state = {
      drops: [],
      trails: [],
      nextId: 0,
      shards: [],
      sequenceState: 'rain',
      impactPoint: null,
      shockRingAge: -1,
      resetScheduled: -1,
    };
    states.set(instanceId, state);
  }
  return state;
}

function spawnDrop(x: number, y: number, mass: number, id: number): Drop {
  return {
    x,
    y,
    vx: (Math.random() - 0.5) * 3,
    vy: 0,
    mass,
    age: 0,
    id,
  };
}

function generateVoronoiShards(
  params: WindowGlassShatterParams,
  impactX: number,
  impactY: number,
  rand: () => number,
): Shard[] {
  const width = params.width;
  const height = params.height;
  const count = Math.floor(params.shardCount);
  
  const sites: { x: number; y: number }[] = [];
  
  const impactLocalX = impactX;
  const impactLocalY = impactY;
  sites.push({ x: impactLocalX, y: impactLocalY });
  
  for (let i = 1; i < count; i++) {
    const angle = (i / (count - 1)) * Math.PI * 2 + rand() * 0.5;
    const dist = (0.3 + rand() * 0.7) * Math.min(width, height) * 0.5;
    sites.push({
      x: Math.cos(angle) * dist + (rand() - 0.5) * width * 0.3 + impactLocalX,
      y: Math.sin(angle) * dist + (rand() - 0.5) * height * 0.3 + impactLocalY,
    });
  }
  
  const bounds = {
    minX: 0,
    maxX: width,
    minY: 0,
    maxY: height,
  };
  
  const shards: Shard[] = [];
  
  for (let i = 0; i < sites.length; i++) {
    const site = sites[i]!;
    
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
      let sumX = 0, sumY = 0;
      for (const v of clippedPolygon) {
        sumX += v.x;
        sumY += v.y;
      }
      const centroid = {
        x: sumX / clippedPolygon.length,
        y: sumY / clippedPolygon.length,
      };
      
      const dx = centroid.x - impactLocalX;
      const dy = centroid.y - impactLocalY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = Math.sqrt(width * width + height * height) / 2;
      const forceFactor = params.explosionForce * (1 - Math.min(dist / maxDist, 1) * 0.5);
      
      const angle = Math.atan2(dy, dx) + (rand() - 0.5) * 0.8;
      const speed = (80 + rand() * 120) * forceFactor;
      
      shards.push({
        vertices: clippedPolygon.map(v => ({ x: v.x - centroid.x, y: v.y - centroid.y })),
        centroid,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - rand() * 40 * forceFactor,
        rotation: rand() * Math.PI * 2,
        rotationSpeed: (rand() - 0.5) * 8 * forceFactor,
        age: 0,
        bounces: 0,
        settled: false,
      });
    }
  }
  
  return shards;
}

function drawWindowFrame(
  ctx: CanvasRenderingContext2D,
  params: WindowGlassShatterParams,
): void {
  const x = params.x - params.width / 2;
  const y = params.y - params.height / 2;
  const w = params.width;
  const h = params.height;
  const border = params.frameBorder;
  
  ctx.save();
  ctx.fillStyle = withAlpha('#2a2820', 0.95);
  
  ctx.fillRect(x - border, y - border, w + border * 2, border);
  ctx.fillRect(x - border, y + h, w + border * 2, border);
  ctx.fillRect(x - border, y, border, h);
  ctx.fillRect(x + w, y, border, h);
  
  ctx.strokeStyle = withAlpha('#1a1410', 0.8);
  ctx.lineWidth = 2;
  ctx.strokeRect(x - border, y - border, w + border * 2, h + border * 2);
  
  const sillHeight = border * 1.5;
  const sillGrad = ctx.createLinearGradient(x, y + h + border, x, y + h + border + sillHeight);
  sillGrad.addColorStop(0, withAlpha('#3a3428', 0.95));
  sillGrad.addColorStop(1, withAlpha('#2a2420', 0.9));
  ctx.fillStyle = sillGrad;
  ctx.fillRect(x - border - 4, y + h + border, w + border * 2 + 8, sillHeight);
  
  ctx.restore();
}

function drawGlassPane(
  ctx: CanvasRenderingContext2D,
  params: WindowGlassShatterParams,
): void {
  const x = params.x - params.width / 2;
  const y = params.y - params.height / 2;
  const w = params.width;
  const h = params.height;
  
  ctx.save();
  
  const glassGrad = ctx.createLinearGradient(x, y, x + w * 0.4, y + h * 0.4);
  glassGrad.addColorStop(0, withAlpha('#e8f4ff', 0.12));
  glassGrad.addColorStop(0.6, withAlpha('#d0e8ff', 0.08));
  glassGrad.addColorStop(1, withAlpha('#c0d8f0', 0.06));
  ctx.fillStyle = glassGrad;
  ctx.fillRect(x, y, w, h);
  
  const highlightGrad = ctx.createLinearGradient(x, y, x + w * 0.3, y + h * 0.3);
  highlightGrad.addColorStop(0, withAlpha('#ffffff', 0.28));
  highlightGrad.addColorStop(0.5, withAlpha('#ffffff', 0.12));
  highlightGrad.addColorStop(1, withAlpha('#ffffff', 0));
  ctx.fillStyle = highlightGrad;
  ctx.fillRect(x, y, w, h);
  
  ctx.strokeStyle = withAlpha('#c8e4ff', 0.25);
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  
  ctx.restore();
}

function drawDrop(
  ctx: CanvasRenderingContext2D,
  drop: Drop,
  params: WindowGlassShatterParams,
): void {
  const radius = Math.sqrt(drop.mass) * params.dropSize * 3;
  const wx = params.x - params.width / 2 + drop.x;
  const wy = params.y - params.height / 2 + drop.y;
  
  ctx.save();
  
  const dropGrad = ctx.createRadialGradient(
    wx - radius * 0.3,
    wy - radius * 0.3,
    0,
    wx,
    wy,
    radius,
  );
  dropGrad.addColorStop(0, withAlpha('#ffffff', 0.5));
  dropGrad.addColorStop(0.3, withAlpha('#e8f4ff', 0.3));
  dropGrad.addColorStop(0.6, withAlpha('#a8c8ff', 0.15));
  dropGrad.addColorStop(1, withAlpha('#6890c0', 0.05));
  
  ctx.fillStyle = dropGrad;
  ctx.beginPath();
  ctx.ellipse(wx, wy, radius, radius * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = withAlpha('#cfe8ff', 0.4);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.ellipse(wx, wy, radius, radius * 0.95, 0, 0, Math.PI * 2);
  ctx.stroke();
  
  const specX = wx - radius * 0.4;
  const specY = wy - radius * 0.35;
  ctx.fillStyle = withAlpha('#ffffff', 0.8);
  ctx.beginPath();
  ctx.arc(specX, specY, radius * 0.25, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  trail: TrailSegment,
  params: WindowGlassShatterParams,
): void {
  const radius = Math.sqrt(trail.mass) * params.dropSize * 1.5;
  const alpha = trail.wetness * 0.3;
  const wx = params.x - params.width / 2 + trail.x;
  const wy = params.y - params.height / 2 + trail.y;
  
  const grad = ctx.createRadialGradient(wx, wy, 0, wx, wy, radius);
  grad.addColorStop(0, withAlpha('#a8c8ff', alpha * 0.9));
  grad.addColorStop(0.5, withAlpha('#7890b0', alpha * 0.6));
  grad.addColorStop(1, withAlpha('#6890c0', 0));
  
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(wx, wy, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawShard(
  ctx: CanvasRenderingContext2D,
  shard: Shard,
  params: WindowGlassShatterParams,
  worldX: number,
  worldY: number,
): void {
  const mat = params.material;
  
  ctx.save();
  ctx.translate(worldX, worldY);
  ctx.rotate(shard.rotation);
  
  applyMaterial(ctx, mat);
  
  ctx.beginPath();
  ctx.moveTo(shard.vertices[0]!.x, shard.vertices[0]!.y);
  for (let i = 1; i < shard.vertices.length; i++) {
    ctx.lineTo(shard.vertices[i]!.x, shard.vertices[i]!.y);
  }
  ctx.closePath();
  
  const fillGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 40);
  fillGrad.addColorStop(0, withAlpha(mat.baseColor, 0.8));
  fillGrad.addColorStop(1, withAlpha(mat.baseColor, 0.6));
  ctx.fillStyle = fillGrad;
  ctx.fill();
  
  ctx.strokeStyle = withAlpha(mat.emissive, 0.9);
  ctx.lineWidth = 2;
  ctx.stroke();
  
  const highlightGrad = ctx.createLinearGradient(-15, -15, 15, 15);
  highlightGrad.addColorStop(0, withAlpha('#ffffff', 0.5));
  highlightGrad.addColorStop(0.6, withAlpha('#ffffff', 0.2));
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
  mat: typeof createDefaultMaterial extends (...args: any[]) => infer R ? R : never,
): void {
  if (age < 0 || age > 0.6) return;
  
  const radius = age * 180;
  const alpha = Math.max(0, 1 - age / 0.6);
  
  ctx.save();
  ctx.strokeStyle = withAlpha(mat.emissive, alpha * 0.9);
  ctx.lineWidth = 3 * (1 - age / 0.6);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.strokeStyle = withAlpha('#ffffff', alpha * 0.5);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.95, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.restore();
}

export const drawWindowGlassShatter: DrawFn<WindowGlassShatterParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  
  const state = ensureState(params.instanceId);
  const dt = scene.paused ? 0 : (scene.dt || 1/60);
  
  const w = params.width;
  const h = params.height;
  
  drawWindowFrame(ctx, params);
  
  if (state.sequenceState === 'rain') {
    drawGlassPane(ctx, params);
    
    if (!scene.paused) {
      const spawnRate = params.rainRate * params.intensity * 1.5;
      const spawnCount = Math.floor(spawnRate * dt + Math.random());
      for (let i = 0; i < spawnCount; i++) {
        const dropX = Math.random() * w;
        const dropY = -5 + Math.random() * 20;
        const mass = 0.3 + Math.random() * 0.7;
        state.drops.push(spawnDrop(dropX, dropY, mass, state.nextId++));
      }
      
      for (const drop of state.drops) {
        drop.age += dt;
        
        const terminalVelocity = Math.sqrt(drop.mass) * params.gravity * 120;
        drop.vy = Math.min(drop.vy + params.gravity * 250 * dt, terminalVelocity);
        
        drop.vx *= 0.98;
        
        const noise = fbm2(drop.x * 0.02 + t, drop.y * 0.015, 2, drop.id);
        drop.vx += noise * 12 * dt;
        
        drop.x += drop.vx * dt;
        drop.y += drop.vy * dt;
        
        if (drop.y > h - 10) {
          state.trails.push({
            x: drop.x,
            y: drop.y,
            mass: drop.mass * 0.3,
            wetness: 1.0,
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
          const minDist = (Math.sqrt(dropA.mass) + Math.sqrt(dropB.mass)) * params.dropSize * 3;
          
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
        return drop.y < h + 15 && drop.x >= -10 && drop.x < w + 10;
      });
      
      for (const trail of state.trails) {
        trail.wetness = Math.max(0, trail.wetness - params.drySpeed * dt * 0.4);
      }
      
      state.trails = state.trails.filter(trail => trail.wetness > 0.05);
    }
    
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    
    for (const trail of state.trails) {
      drawTrail(ctx, trail, params);
    }
    
    for (const drop of state.drops) {
      drawDrop(ctx, drop, params);
    }
    
    ctx.restore();
    
  } else if (state.sequenceState === 'shattering' || state.sequenceState === 'shattered') {
    
    if (state.shockRingAge >= 0 && state.shockRingAge < 0.6) {
      state.shockRingAge += dt;
      if (state.impactPoint) {
        drawShockRing(ctx, state.impactPoint.x, state.impactPoint.y, state.shockRingAge, params.material);
      }
    }
    
    if (!scene.paused) {
      for (const shard of state.shards) {
        if (shard.settled) continue;
        
        shard.age += dt;
        shard.vy += params.shardGravity * 400 * dt;
        
        shard.rotation += shard.rotationSpeed * dt;
        shard.rotationSpeed *= 0.98;
        
        const worldY = params.y - params.height / 2 + shard.centroid.y + shard.vy * dt;
        
        shard.centroid.x += shard.vx * dt;
        shard.centroid.y += shard.vy * dt;
        
        const groundY = scene.worldHeight - 50;
        if (worldY > groundY && params.bounceEnabled) {
          shard.centroid.y = groundY - (params.y - params.height / 2);
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
      const aY = params.y - params.height / 2 + a.centroid.y;
      const bY = params.y - params.height / 2 + b.centroid.y;
      return aY - bY;
    });
    
    for (const shard of sortedShards) {
      const worldX = params.x - params.width / 2 + shard.centroid.x;
      const worldY = params.y - params.height / 2 + shard.centroid.y;
      drawShard(ctx, shard, params, worldX, worldY);
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

export function hitTestWindow(params: WindowGlassShatterParams, worldX: number, worldY: number): boolean {
  const x = params.x - params.width / 2;
  const y = params.y - params.height / 2;
  const w = params.width;
  const h = params.height;
  return worldX >= x && worldX <= x + w && worldY >= y && worldY <= y + h;
}

export function triggerWindowShatter(
  instanceId: string,
  impactX: number,
  impactY: number,
  params: WindowGlassShatterParams,
  t: number,
): void {
  const state = states.get(instanceId);
  if (!state) return;
  
  if (state.sequenceState === 'rain') {
    const localX = impactX - (params.x - params.width / 2);
    const localY = impactY - (params.y - params.height / 2);
    
    state.sequenceState = 'shattering';
    state.impactPoint = { x: impactX, y: impactY };
    state.shockRingAge = 0;
    const rand = mulberry32(Date.now());
    state.shards = generateVoronoiShards(params, localX, localY, rand);
    
    setTimeout(() => {
      if (state.sequenceState === 'shattering') {
        state.sequenceState = 'shattered';
        state.resetScheduled = t + params.resetDelay;
      }
    }, 100);
  }
}

export function disposeWindowGlassShatterInstance(id: string): void {
  states.delete(id);
}

export const windowGlassShatterEffect: EffectModule<WindowGlassShatterParams> = {
  id: 'window-glass-shatter',
  name: 'Building Window (Rain→Shatter)',
  description: 'Building window with rain on glass that shatters on click. Place behind other VFX.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'window-default',
    x: 800,
    y: 450,
    seed: 42,
    width: 280,
    height: 360,
    rainRate: 4,
    gravity: 1,
    refractionStrength: 0.7,
    dropSize: 1,
    drySpeed: 0.3,
    shardCount: 18,
    explosionForce: 1.2,
    shardGravity: 1,
    bounceEnabled: true,
    resetDelay: 5,
    glassThickness: 3,
    frameBorder: 12,
    material: createDefaultMaterial({
      name: 'Glass Shards',
      baseColor: '#d0e8ff',
      emissive: '#ffffff',
      emissiveIntensity: 0.9,
      blend: 'normal',
      opacity: 0.75,
      roughness: 0.1,
      metalness: 0.9,
    }),
  },
  draw: drawWindowGlassShatter,
};
