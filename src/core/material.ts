/** Shared material model for creatable VFX — portable to other Canvas games. */

export type BlendMode = 'additive' | 'normal' | 'screen' | 'multiply';

export interface EffectMaterial {
  /** Display name / preset label */
  name: string;
  /** Albedo / body color */
  baseColor: string;
  /** Glow / heat color */
  emissive: string;
  emissiveIntensity: number;
  /** 0–1 overall alpha multiplier */
  opacity: number;
  /** 0 = mirror-smooth, 1 = diffuse/soft (drives water reflectivity & smoke softness) */
  roughness: number;
  /** 0–1 specular / reflection strength */
  metalness: number;
  blend: BlendMode;
}

export function createDefaultMaterial(partial?: Partial<EffectMaterial>): EffectMaterial {
  return {
    name: partial?.name ?? 'Default',
    baseColor: partial?.baseColor ?? '#ffffff',
    emissive: partial?.emissive ?? '#ffffff',
    emissiveIntensity: partial?.emissiveIntensity ?? 1,
    opacity: partial?.opacity ?? 1,
    roughness: partial?.roughness ?? 0.5,
    metalness: partial?.metalness ?? 0.2,
    blend: partial?.blend ?? 'additive',
  };
}

export const MATERIAL_PRESETS: Record<string, EffectMaterial> = {
  'Fire / Magma': createDefaultMaterial({
    name: 'Fire / Magma',
    baseColor: '#ff3b10',
    emissive: '#fff1c1',
    emissiveIntensity: 1.2,
    opacity: 1,
    roughness: 0.35,
    metalness: 0.1,
    blend: 'additive',
  }),
  'Cold Plasma': createDefaultMaterial({
    name: 'Cold Plasma',
    baseColor: '#3d7cff',
    emissive: '#b8f0ff',
    emissiveIntensity: 1.35,
    opacity: 1,
    roughness: 0.25,
    metalness: 0.4,
    blend: 'additive',
  }),
  'Toxic Green': createDefaultMaterial({
    name: 'Toxic Green',
    baseColor: '#2cff6a',
    emissive: '#c8ff7a',
    emissiveIntensity: 1.1,
    opacity: 0.95,
    roughness: 0.4,
    metalness: 0.15,
    blend: 'additive',
  }),
  'Ash Smoke': createDefaultMaterial({
    name: 'Ash Smoke',
    baseColor: '#2a303a',
    emissive: '#8b95a8',
    emissiveIntensity: 0.35,
    opacity: 0.85,
    roughness: 0.85,
    metalness: 0.05,
    blend: 'normal',
  }),
  'Oil Smoke': createDefaultMaterial({
    name: 'Oil Smoke',
    baseColor: '#1a1410',
    emissive: '#5c4a42',
    emissiveIntensity: 0.25,
    opacity: 0.9,
    roughness: 0.9,
    metalness: 0.08,
    blend: 'normal',
  }),
  'Clear Water': createDefaultMaterial({
    name: 'Clear Water',
    baseColor: '#1a6b8c',
    emissive: '#c8f0ff',
    emissiveIntensity: 0.45,
    opacity: 0.92,
    roughness: 0.15,
    metalness: 0.85,
    blend: 'normal',
  }),
  'Murky Water': createDefaultMaterial({
    name: 'Murky Water',
    baseColor: '#1e3a2f',
    emissive: '#6a8f6a',
    emissiveIntensity: 0.2,
    opacity: 0.95,
    roughness: 0.55,
    metalness: 0.35,
    blend: 'normal',
  }),
  'Neon Sparks': createDefaultMaterial({
    name: 'Neon Sparks',
    baseColor: '#ff4fd8',
    emissive: '#ffe29a',
    emissiveIntensity: 1.4,
    opacity: 1,
    roughness: 0.2,
    metalness: 0.5,
    blend: 'additive',
  }),
  'Bee Gold': createDefaultMaterial({
    name: 'Bee Gold',
    baseColor: '#e8a020',
    emissive: '#ffe08a',
    emissiveIntensity: 0.65,
    opacity: 1,
    roughness: 0.45,
    metalness: 0.25,
    blend: 'normal',
  }),
  Mosquito: createDefaultMaterial({
    name: 'Mosquito',
    baseColor: '#3a322c',
    emissive: '#8a7a68',
    emissiveIntensity: 0.35,
    opacity: 0.95,
    roughness: 0.7,
    metalness: 0.15,
    blend: 'normal',
  }),
  'Fur Brown': createDefaultMaterial({
    name: 'Fur Brown',
    baseColor: '#6b4a2e',
    emissive: '#c4a06a',
    emissiveIntensity: 0.35,
    opacity: 1,
    roughness: 0.8,
    metalness: 0.05,
    blend: 'normal',
  }),
  'Feather Soft': createDefaultMaterial({
    name: 'Feather Soft',
    baseColor: '#d8dde8',
    emissive: '#ffffff',
    emissiveIntensity: 0.4,
    opacity: 1,
    roughness: 0.75,
    metalness: 0.08,
    blend: 'normal',
  }),
  'Frog Green': createDefaultMaterial({
    name: 'Frog Green',
    baseColor: '#3d8f3a',
    emissive: '#b8e87a',
    emissiveIntensity: 0.4,
    opacity: 1,
    roughness: 0.55,
    metalness: 0.2,
    blend: 'normal',
  }),
  'Carapace Dark': createDefaultMaterial({
    name: 'Carapace Dark',
    baseColor: '#1c1814',
    emissive: '#6a5848',
    emissiveIntensity: 0.45,
    opacity: 1,
    roughness: 0.35,
    metalness: 0.55,
    blend: 'normal',
  }),
};

export function blendToComposite(blend: BlendMode): GlobalCompositeOperation {
  switch (blend) {
    case 'additive':
      return 'lighter';
    case 'screen':
      return 'screen';
    case 'multiply':
      return 'multiply';
    default:
      return 'source-over';
  }
}

/** Apply material opacity + blend mode to a canvas context. */
export function applyMaterial(ctx: CanvasRenderingContext2D, mat: EffectMaterial): void {
  ctx.globalAlpha = Math.max(0, Math.min(1, mat.opacity));
  ctx.globalCompositeOperation = blendToComposite(mat.blend);
}

export function copyMaterial(mat: EffectMaterial): EffectMaterial {
  return { ...mat };
}
