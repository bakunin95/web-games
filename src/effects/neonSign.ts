import type { DrawFn, EffectModule } from '../core/types';
import type { PlacedEffectParams } from '../core/placed';
import { applyMaterial, createDefaultMaterial } from '../core/material';
import { fbm2, withAlpha } from './noise';

export interface NeonSignParams extends PlacedEffectParams {
  textLine1: string;
  textLine2: string;
  outlineColor: string;
  fillColor: string;
  tubeWidth: number;
  line1Density: number;
  line2Density: number;
  letterSpacing: number;
  lineSpacing: number;
  cycleEnabled: boolean;
  cyclePeriod: number;
  flickerAmount: number;
  brokenChance: number;
  fontSize: number;
}

interface NeonSignState {
  cycleTime: number;
  brokenLetters: Set<string>;
  flickerOffsets: Map<string, number>;
}

const states = new Map<string, NeonSignState>();

function ensureState(instanceId: string): NeonSignState {
  let state = states.get(instanceId);
  if (!state) {
    state = {
      cycleTime: 0,
      brokenLetters: new Set(),
      flickerOffsets: new Map(),
    };
    states.set(instanceId, state);
  }
  return state;
}

function getCyclePhase(t: number, period: number): { line1: boolean; line2: boolean } {
  const phase = (t % period) / period;
  
  if (phase < 0.18) {
    return { line1: true, line2: false };
  } else if (phase < 0.36) {
    return { line1: true, line2: true };
  } else if (phase < 0.45) {
    return { line1: false, line2: false };
  } else if (phase < 0.64) {
    return { line1: true, line2: false };
  } else if (phase < 0.82) {
    return { line1: true, line2: true };
  } else if (phase < 0.91) {
    return { line1: false, line2: false };
  } else {
    return { line1: true, line2: true };
  }
}

function getLetterKey(lineIdx: number, charIdx: number): string {
  return `${lineIdx}-${charIdx}`;
}

function drawNeonLetter(
  ctx: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  params: NeonSignParams,
  state: NeonSignState,
  t: number,
  letterKey: string,
  density: number,
  isOn: boolean,
): void {
  if (char === ' ') return;
  
  const isBroken = state.brokenLetters.has(letterKey);
  if (isBroken) return;
  
  if (!state.flickerOffsets.has(letterKey)) {
    state.flickerOffsets.set(letterKey, Math.random() * 1000);
  }
  const flickerOffset = state.flickerOffsets.get(letterKey)!;
  
  const flickerNoise = fbm2(t * 3 + flickerOffset, letterKey.charCodeAt(0) * 0.1, 2, 42);
  const flicker = 1 - Math.abs(flickerNoise) * params.flickerAmount * 0.3;
  
  let alpha = isOn ? flicker : 0;
  
  if (alpha < 0.1) return;
  
  ctx.save();
  ctx.translate(x, y);
  
  ctx.font = `bold ${params.fontSize}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  for (let tubeIdx = 0; tubeIdx < density; tubeIdx++) {
    const tubeOffset = (tubeIdx - (density - 1) / 2) * (params.tubeWidth * 1.2);
    
    ctx.save();
    ctx.translate(tubeOffset, 0);
    
    const mat = params.material;
    const glowSize = params.tubeWidth * 3;
    
    for (let glowPass = 0; glowPass < 3; glowPass++) {
      const glowAlpha = alpha * (glowPass === 0 ? 0.15 : glowPass === 1 ? 0.25 : 0.4) * mat.emissiveIntensity;
      const glowWidth = params.tubeWidth + glowSize * (3 - glowPass) / 3;
      
      ctx.strokeStyle = withAlpha(params.fillColor, glowAlpha);
      ctx.lineWidth = glowWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeText(char, 0, 0);
    }
    
    ctx.strokeStyle = withAlpha(params.outlineColor, alpha * 0.9);
    ctx.lineWidth = params.tubeWidth * 0.3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeText(char, 0, 0);
    
    const coreGrad = ctx.createRadialGradient(0, -params.fontSize * 0.15, 0, 0, 0, params.tubeWidth * 2);
    coreGrad.addColorStop(0, withAlpha('#ffffff', alpha * 0.9 * mat.emissiveIntensity));
    coreGrad.addColorStop(0.5, withAlpha(params.fillColor, alpha * 0.7 * mat.emissiveIntensity));
    coreGrad.addColorStop(1, withAlpha(params.fillColor, 0));
    
    ctx.fillStyle = coreGrad;
    ctx.fillText(char, 0, 0);
    
    ctx.restore();
  }
  
  ctx.restore();
}

function drawTextLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  params: NeonSignParams,
  state: NeonSignState,
  t: number,
  lineIdx: number,
  density: number,
  isOn: boolean,
): void {
  if (!text || text.trim().length === 0) return;
  
  ctx.font = `bold ${params.fontSize}px Arial, sans-serif`;
  
  let totalWidth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    const charWidth = ctx.measureText(char).width;
    totalWidth += charWidth;
    if (i < text.length - 1) {
      totalWidth += params.letterSpacing;
    }
  }
  
  let currentX = centerX - totalWidth / 2;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    const charWidth = ctx.measureText(char).width;
    const letterKey = getLetterKey(lineIdx, i);
    
    drawNeonLetter(
      ctx,
      char,
      currentX + charWidth / 2,
      y,
      params,
      state,
      t,
      letterKey,
      density,
      isOn,
    );
    
    currentX += charWidth + params.letterSpacing;
  }
}

export const drawNeonSign: DrawFn<NeonSignParams> = (ctx, params, t, scene) => {
  if (!params.enabled || params.intensity <= 0) return;
  
  const state = ensureState(params.instanceId);
  
  if (!scene.paused) {
    state.cycleTime = t;
    
    const totalLetters = (params.textLine1?.length || 0) + (params.textLine2?.length || 0);
    const targetBroken = Math.floor(totalLetters * params.brokenChance);
    
    if (state.brokenLetters.size < targetBroken && Math.random() < 0.01) {
      let attempts = 0;
      while (attempts < 20) {
        const lineIdx = Math.random() < 0.5 ? 0 : 1;
        const text = lineIdx === 0 ? params.textLine1 : params.textLine2;
        if (!text || text.length === 0) {
          attempts++;
          continue;
        }
        const charIdx = Math.floor(Math.random() * text.length);
        const key = getLetterKey(lineIdx, charIdx);
        if (!state.brokenLetters.has(key)) {
          state.brokenLetters.add(key);
          break;
        }
        attempts++;
      }
    } else if (state.brokenLetters.size > targetBroken && Math.random() < 0.005) {
      const keys = Array.from(state.brokenLetters);
      if (keys.length > 0) {
        const keyToFix = keys[Math.floor(Math.random() * keys.length)]!;
        state.brokenLetters.delete(keyToFix);
      }
    }
  }
  
  let line1On = true;
  let line2On = true;
  
  if (params.cycleEnabled) {
    const phase = getCyclePhase(state.cycleTime, params.cyclePeriod);
    line1On = phase.line1;
    line2On = phase.line2;
  }
  
  ctx.save();
  applyMaterial(ctx, params.material);
  
  const line1Y = params.y - params.lineSpacing / 2;
  const line2Y = params.y + params.lineSpacing / 2;
  
  drawTextLine(
    ctx,
    params.textLine1,
    params.x,
    line1Y,
    params,
    state,
    t,
    0,
    Math.max(1, Math.round(params.line1Density)),
    line1On,
  );
  
  drawTextLine(
    ctx,
    params.textLine2,
    params.x,
    line2Y,
    params,
    state,
    t,
    1,
    Math.max(1, Math.round(params.line2Density)),
    line2On,
  );
  
  ctx.restore();
};

export function disposeNeonSignInstance(id: string): void {
  states.delete(id);
}

export const neonSignEffect: EffectModule<NeonSignParams> = {
  id: 'neon-sign',
  name: 'Neon Sign (Text)',
  description: 'Real neon tube text sign with Montreal Five Roses mill cycle pattern.',
  space: 'world',
  defaultParams: {
    enabled: true,
    intensity: 1,
    instanceId: 'neon-sign-default',
    x: 900,
    y: 300,
    seed: 42,
    textLine1: 'FARINE',
    textLine2: 'FIVE ROSES',
    outlineColor: '#ffffff',
    fillColor: '#ff2040',
    tubeWidth: 3,
    line1Density: 1,
    line2Density: 3,
    letterSpacing: 8,
    lineSpacing: 120,
    cycleEnabled: true,
    cyclePeriod: 22,
    flickerAmount: 0.15,
    brokenChance: 0.02,
    fontSize: 72,
    material: createDefaultMaterial({
      name: 'Neon Red',
      baseColor: '#ff2040',
      emissive: '#ff6080',
      emissiveIntensity: 1.8,
      blend: 'additive',
      opacity: 1,
      roughness: 0.2,
      metalness: 0.3,
    }),
  },
  draw: drawNeonSign,
};
