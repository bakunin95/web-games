import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { mulberry32, withAlpha } from './noise';

export interface ShatterParams extends PlacedEffectParams {
  size: number;
  shardCount: number;
  explosionForce: number;
  gravity: number;
  shatterType: 'glass' | 'ceramic';
  bounceEnabled: boolean;
  autoShatter: boolean;
  autoShatterDelay: number;
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
}

interface ShatterState {
  shards: Shard[];
  shattered: boolean;
  impactPoint: { x: number; y: number } | null;
  shockRingAge: number;
  lastShatterTime: number;
  autoShatterTriggered: boolean;
}

const states = new Map<string, ShatterState>();

function ensureState(instanceId: string): ShatterState {
  let state = states.get(instanceId);
  if (!state) {
    state = {
      shards: [],
      shattered: false,
      impactPoint: null,
      shockRingAge: -1,
      lastShatterTime: -999,
      autoShatterTriggered: false,
    };
    states.set(instanceId, state);
  }
  return state;
}

function generateVoronoiShards(
  params: ShatterParams,
  impactX: number,
  impactY: number,
  rand: () => number,
): Shard[] {
  const width = 200 * params.size;
  const height = 200 * params.size;
  const cx = params.x;
  const cy = params.y;
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
      });
    }
  }
  
  return shards;
}

function drawUnshatteredObject(
  ctx: CanvasRenderingContext2D,
  params: ShatterParams,
  t: number,
): void {
  const mat = params.material;
  const width = 200 * params.size;
  const height = 200 * params.size;
  
  ctx.save();
  applyMaterial(ctx, mat);
  
  const gradient = ctx.createLinearGradient(
    params.x - width / 2,
    params.y - height / 2,
    params.x + width / 2,
    params.y + height / 2,
  );
  gradient.addColorStop(0, withAlpha(mat.baseColor, 0.85));
  gradient.addColorStop(0.5, withAlpha(mat.baseColor, 0.65));
  gradient.addColorStop(1, withAlpha(mat.baseColor, 0.75));
  
  ctx.fillStyle = gradient;
  ctx.fillRect(
    params.x - width / 2,
    params.y - height / 2,
    width,
    height,
  );
  
  ctx.strokeStyle = withAlpha(mat.emissive, 0.5);
  ctx.lineWidth = 2;
  ctx.strokeRect(
    params.x - width / 2,
    params.y - height / 2,
    width,
    height,
  );
  
  const highlightGrad = ctx.createLinearGradient(
    params.x - width / 3,
    params.y - height / 3,
    params.x + width / 3,
    params.y + height / 3,
  );
  highlightGrad.addColorStop(0, withAlpha('#ffffff', 0.35));
  highlightGrad.addColorStop(0.5, withAlpha('#ffffff', 0.12));
  highlightGrad.addColorStop(1, withAlpha('#ffffff', 0));
  
  ctx.fillStyle = highlightGrad;
  ctx.fillRect(
    params.x - width / 2,
    params.y - height / 2,
    width,
    height,
  );
  
  const pulse = 0.9 + 0.1 * Math.sin(t * 2);
  ctx.fillStyle = withAlpha('#ffffff', 0.15 * pulse);
  ctx.beginPath();
  ctx.arc(params.x - width * 0.3, params.y - height * 0.3, 15, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

function drawShard(
  ctx: CanvasRenderingContext2D,
  shard: Shard,
  params: ShatterParams,
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
  
  const avgX = shard.vertices.reduce((sum, v) => sum + v.x, 0) / shard.vertices.length;
  const avgY = shard.vertices.reduce((sum, v) => sum + v.y, 0) / shard.vertices.length;
  
  const fillGrad = ctx.createRadialGradient(avgX, avgY, 0, avgX, avgY, 50);
  fillGrad.addColorStop(0, withAlpha(mat.baseColor, 0.75));
  fillGrad.addColorStop(1, withAlpha(mat.baseColor, 0.55));
  ctx.fillStyle = fillGrad;
  ctx.fill();
  
  ctx.strokeStyle = withAlpha(mat.emissive, 0.85);
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
  params: ShatterParams,
): void {
  if (age < 0 || age > 0.6) return;
  
  const mat = params.material;
  const radius = age * 250;
  const alpha = Math.max(0, 1 - age / 0.6);
  
  ctx.save();
  ctx.strokeStyle = withAlpha(mat.emissive, alpha * 0.8);
  ctx.lineWidth = 3 * (1 - age / 0.6);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.strokeStyle = withAlpha('#ffffff', alpha * 0.4);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.95, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.restore();
}

export const drawShatter: DrawFn<ShatterParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  
  const state = ensureState(params.instanceId);
  const dt = scene.paused ? 0 : (scene.dt || 1/60);
  
  if (params.autoShatter && !state.autoShatterTriggered && t > params.autoShatterDelay) {
    state.shattered = true;
    state.autoShatterTriggered = true;
    state.impactPoint = { x: params.x, y: params.y };
    state.lastShatterTime = t;
    state.shockRingAge = 0;
    const rand = mulberry32(params.seed);
    state.shards = generateVoronoiShards(params, params.x, params.y, rand);
  }
  
  if (!state.shattered) {
    drawUnshatteredObject(ctx, params, t);
    return;
  }
  
  if (state.shockRingAge >= 0) {
    state.shockRingAge += dt;
    if (state.impactPoint) {
      drawShockRing(ctx, state.impactPoint.x, state.impactPoint.y, state.shockRingAge, params);
    }
  }
  
  if (!scene.paused) {
    for (const shard of state.shards) {
      if (shard.settled) continue;
      
      shard.age += dt;
      shard.vy += params.gravity * 400 * dt;
      
      shard.rotation += shard.rotationSpeed * dt;
      shard.rotationSpeed *= 0.98;
      
      const worldY = params.y + shard.centroid.y + shard.vy * dt;
      
      shard.centroid.x += shard.vx * dt;
      shard.centroid.y += shard.vy * dt;
      
      const groundY = scene.worldHeight - 50;
      if (worldY > groundY && params.bounceEnabled) {
        shard.centroid.y = groundY - params.y;
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
      
      if (params.shatterType === 'ceramic') {
        shard.vx *= 0.985;
      } else {
        shard.vx *= 0.995;
      }
    }
  }
  
  ctx.save();
  
  const sortedShards = [...state.shards].sort((a, b) => {
    const aY = params.y + a.centroid.y;
    const bY = params.y + b.centroid.y;
    return aY - bY;
  });
  
  for (const shard of sortedShards) {
    const worldX = params.x + shard.centroid.x;
    const worldY = params.y + shard.centroid.y;
    drawShard(ctx, shard, params, worldX, worldY);
  }
  
  ctx.restore();
};

export function resetShatter(instanceId: string): void {
  const state = states.get(instanceId);
  if (state) {
    state.shattered = false;
    state.shards = [];
    state.impactPoint = null;
    state.shockRingAge = -1;
    state.autoShatterTriggered = false;
  }
}

export function disposeShatterInstance(id: string): void {
  states.delete(id);
}

export const shatterEffect: EffectModule<ShatterParams> = {
  id: 'shatter',
  name: 'Object Shatter',
  description: 'Glass/ceramic object that shatters into Voronoi shards with physics.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'shatter-default',
    x: 1200,
    y: 400,
    seed: 42,
    size: 1,
    shardCount: 18,
    explosionForce: 1.2,
    gravity: 1,
    shatterType: 'glass',
    bounceEnabled: true,
    autoShatter: true,
    autoShatterDelay: 2,
    material: createDefaultMaterial({
      name: 'Glass Shards',
      baseColor: '#b8e8ff',
      emissive: '#ffffff',
      emissiveIntensity: 0.8,
      blend: 'normal',
      opacity: 0.75,
      roughness: 0.1,
      metalness: 0.9,
    }),
  },
  draw: drawShatter,
};
