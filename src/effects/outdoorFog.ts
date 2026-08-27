import type { BaseEffectParams, DrawFn, EffectModule, SceneContext } from '../core/types';
import { fbm2, mulberry32, withAlpha } from './noise';

export interface OutdoorFogParams extends BaseEffectParams {
  layerCount: number;
  groundMistHeight: number;
  distanceFogStart: number;
  distanceFogEnd: number;
  fogColor: string;
  hazeGlow: number;
  treeColor: string;
  animationSpeed: number;
}

interface TreeSilhouette {
  x: number;
  layer: number;
  height: number;
  width: number;
  seed: number;
}

interface FogLayer {
  y: number;
  speed: number;
  opacity: number;
  scale: number;
  phase: number;
}

interface OutdoorFogState {
  trees: TreeSilhouette[];
  fogLayers: FogLayer[];
  initialized: boolean;
}

const states = new Map<string, OutdoorFogState>();

function ensureState(instanceId: string, params: OutdoorFogParams): OutdoorFogState {
  let state = states.get(instanceId);
  if (!state || !state.initialized) {
    const rand = mulberry32(42);
    const trees: TreeSilhouette[] = [];
    
    for (let layer = 0; layer < 3; layer++) {
      const treeCount = layer === 0 ? 4 : layer === 1 ? 6 : 10;
      for (let i = 0; i < treeCount; i++) {
        trees.push({
          x: (i / treeCount) * 1600 + (rand() - 0.5) * 200,
          layer,
          height: (300 - layer * 80) * (0.8 + rand() * 0.4),
          width: (80 - layer * 15) * (0.7 + rand() * 0.6),
          seed: Math.floor(rand() * 10000),
        });
      }
    }
    
    const fogLayers: FogLayer[] = [];
    for (let i = 0; i < params.layerCount; i++) {
      fogLayers.push({
        y: 600 + (i / params.layerCount) * 200,
        speed: 5 + rand() * 10,
        opacity: 0.3 + rand() * 0.4,
        scale: 1 + i * 0.3,
        phase: rand() * 1000,
      });
    }
    
    state = { trees, fogLayers, initialized: true };
    states.set(instanceId, state);
  }
  return state;
}

function drawForestBackground(
  ctx: CanvasRenderingContext2D,
  params: OutdoorFogParams,
  scene: SceneContext,
): void {
  const w = scene.viewportWidth;
  const h = scene.viewportHeight;
  
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0, withAlpha('#304850', 1));
  skyGrad.addColorStop(0.5, withAlpha('#405860', 1));
  skyGrad.addColorStop(1, withAlpha('#506870', 1));
  
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);
  
  if (params.hazeGlow > 0) {
    const glowGrad = ctx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, w * 0.6);
    glowGrad.addColorStop(0, withAlpha('#e0f0f8', params.hazeGlow * 0.15 * params.intensity));
    glowGrad.addColorStop(0.5, withAlpha('#c0d8e8', params.hazeGlow * 0.08 * params.intensity));
    glowGrad.addColorStop(1, withAlpha(params.fogColor, 0));
    
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);
  }
  
  const groundGrad = ctx.createLinearGradient(0, h * 0.7, 0, h);
  groundGrad.addColorStop(0, withAlpha('#1a2828', 0.5));
  groundGrad.addColorStop(1, withAlpha('#0a1818', 0.9));
  
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, h * 0.7, w, h * 0.3);
}

function drawTree(
  ctx: CanvasRenderingContext2D,
  tree: TreeSilhouette,
  params: OutdoorFogParams,
  scene: SceneContext,
): void {
  const rand = mulberry32(tree.seed);
  const h = scene.viewportHeight;
  
  const baseY = h * 0.75 - tree.layer * 50;
  const fogFactor = tree.layer / 2;
  const distanceFade = 1 - fogFactor * params.intensity;
  
  const treeColor = params.treeColor;
  const alpha = (0.9 - fogFactor * 0.6) * distanceFade * params.intensity;
  
  ctx.save();
  ctx.fillStyle = withAlpha(treeColor, alpha);
  
  const trunkWidth = tree.width * 0.25;
  ctx.fillRect(tree.x - trunkWidth / 2, baseY - tree.height, trunkWidth, tree.height);
  
  const crownLayers = 3 + Math.floor(rand() * 2);
  for (let i = 0; i < crownLayers; i++) {
    const layerY = baseY - tree.height * (0.3 + i * 0.25);
    const layerWidth = tree.width * (1.2 - i * 0.2);
    const layerHeight = tree.height * (0.3 + rand() * 0.1);
    
    ctx.beginPath();
    ctx.moveTo(tree.x, layerY - layerHeight);
    ctx.lineTo(tree.x - layerWidth / 2, layerY);
    ctx.lineTo(tree.x + layerWidth / 2, layerY);
    ctx.closePath();
    ctx.fill();
    
    const branchCount = 2 + Math.floor(rand() * 2);
    for (let b = 0; b < branchCount; b++) {
      const branchX = tree.x + (rand() - 0.5) * tree.width * 0.6;
      const branchY = layerY - rand() * layerHeight * 0.5;
      const branchLen = tree.width * (0.2 + rand() * 0.3);
      
      ctx.beginPath();
      ctx.moveTo(branchX, branchY);
      ctx.lineTo(branchX - branchLen, branchY - branchLen * 0.4);
      ctx.lineTo(branchX, branchY + branchLen * 0.1);
      ctx.closePath();
      ctx.fill();
    }
  }
  
  ctx.restore();
}

function drawFogLayer(
  ctx: CanvasRenderingContext2D,
  layer: FogLayer,
  params: OutdoorFogParams,
  t: number,
  scene: SceneContext,
): void {
  const w = scene.viewportWidth;
  const alpha = layer.opacity * params.intensity;
  
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  
  const offset = (t * layer.speed + layer.phase * 10) % (w * 2);
  
  for (let pass = -1; pass <= 1; pass++) {
    const baseX = pass * w - offset;
    
    for (let i = 0; i < 5; i++) {
      const x = baseX + (i / 5) * w * 2;
      const noise = fbm2(x * 0.002 + layer.phase, layer.y * 0.003 + t * 0.1, 3, 42);
      const wobbleY = noise * 30 * layer.scale;
      const size = (80 + noise * 40) * layer.scale;
      
      const grad = ctx.createRadialGradient(x, layer.y + wobbleY, 0, x, layer.y + wobbleY, size);
      grad.addColorStop(0, withAlpha(params.fogColor, alpha * 0.6));
      grad.addColorStop(0.5, withAlpha(params.fogColor, alpha * 0.3));
      grad.addColorStop(1, withAlpha(params.fogColor, 0));
      
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, layer.y + wobbleY, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  ctx.restore();
}

function drawGroundMist(
  ctx: CanvasRenderingContext2D,
  params: OutdoorFogParams,
  t: number,
  scene: SceneContext,
): void {
  const w = scene.viewportWidth;
  const h = scene.viewportHeight;
  const mistTop = h * 0.75;
  
  ctx.save();
  
  const grad = ctx.createLinearGradient(0, mistTop, 0, h);
  grad.addColorStop(0, withAlpha(params.fogColor, 0));
  grad.addColorStop(0.3, withAlpha(params.fogColor, 0.2 * params.intensity));
  grad.addColorStop(1, withAlpha(params.fogColor, 0.4 * params.intensity));
  
  ctx.fillStyle = grad;
  ctx.fillRect(0, mistTop, w, h - mistTop);
  
  for (let i = 0; i < 8; i++) {
    const x = (i / 8) * w + Math.sin(t * 0.5 + i) * 50;
    const y = mistTop + params.groundMistHeight * (0.5 + Math.sin(t * 0.3 + i * 0.5) * 0.3);
    const size = 120 + Math.cos(t * 0.4 + i) * 30;
    
    const mistGrad = ctx.createRadialGradient(x, y, 0, x, y, size);
    mistGrad.addColorStop(0, withAlpha(params.fogColor, 0.15 * params.intensity));
    mistGrad.addColorStop(1, withAlpha(params.fogColor, 0));
    
    ctx.fillStyle = mistGrad;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.restore();
}

export const drawOutdoorFog: DrawFn<OutdoorFogParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  
  const state = ensureState('outdoor-fog', params);
  
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  
  drawForestBackground(ctx, params, scene);
  
  const treesByLayer = [
    state.trees.filter(t => t.layer === 2),
    state.trees.filter(t => t.layer === 1),
    state.trees.filter(t => t.layer === 0),
  ];
  
  for (let layerIdx = 0; layerIdx < 3; layerIdx++) {
    for (const tree of treesByLayer[layerIdx]!) {
      drawTree(ctx, tree, params, scene);
    }
    
    const fogLayersForTree = state.fogLayers.filter((_, i) => Math.floor(i / 2) === layerIdx);
    for (const fogLayer of fogLayersForTree) {
      drawFogLayer(ctx, fogLayer, params, t * params.animationSpeed, scene);
    }
  }
  
  drawGroundMist(ctx, params, t * params.animationSpeed, scene);
  
  ctx.restore();
};

export const outdoorFogEffect: EffectModule<OutdoorFogParams> = {
  id: 'outdoor-fog',
  name: 'Outdoor Fog',
  description: 'Layered teal forest with distance fog, low ground mist, and soft haze glow.',
  space: 'screen',
  defaultParams: {
    enabled: true,
    intensity: 1,
    layerCount: 6,
    groundMistHeight: 80,
    distanceFogStart: 0.3,
    distanceFogEnd: 0.9,
    fogColor: '#c0d8e0',
    hazeGlow: 1,
    treeColor: '#1a3840',
    animationSpeed: 1,
  },
  draw: drawOutdoorFog,
};
