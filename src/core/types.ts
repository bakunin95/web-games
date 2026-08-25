/** Portable VFX module contract — keep effects free of playground UI code. */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Light {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  intensity: number;
}

export interface HazardZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** CSS color used by atmosphere FX */
  color: string;
  intensity: number;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface SceneContext {
  worldWidth: number;
  worldHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  camera: CameraState;
  lights: Light[];
  hazardZones: HazardZone[];
  rainWet: boolean;
  wind: Vec2;
  /** Elapsed seconds (or scrubbed time) */
  time: number;
  /** Frame delta seconds */
  dt: number;
  paused: boolean;
}

export interface BaseEffectParams {
  enabled: boolean;
  intensity: number;
}

export type DrawSpace = 'world' | 'screen';

/**
 * Consistent draw API for every effect module.
 * World-space effects receive a ctx already transformed to world coords.
 * Screen-space effects receive a ctx in viewport pixels (identity transform).
 */
export type DrawFn<P extends BaseEffectParams = BaseEffectParams> = (
  ctx: CanvasRenderingContext2D,
  params: P,
  t: number,
  scene: SceneContext,
) => void;

export interface EffectModule<P extends BaseEffectParams = BaseEffectParams> {
  id: string;
  name: string;
  description: string;
  space: DrawSpace;
  defaultParams: P;
  draw: DrawFn<P>;
}

/** Convert world point to screen (viewport) coordinates. */
export function worldToScreen(scene: SceneContext, wx: number, wy: number): Vec2 {
  const { camera, viewportWidth, viewportHeight } = scene;
  return {
    x: (wx - camera.x) * camera.zoom + viewportWidth / 2,
    y: (wy - camera.y) * camera.zoom + viewportHeight / 2,
  };
}

/** Convert screen point to world coordinates. */
export function screenToWorld(scene: SceneContext, sx: number, sy: number): Vec2 {
  const { camera, viewportWidth, viewportHeight } = scene;
  return {
    x: (sx - viewportWidth / 2) / camera.zoom + camera.x,
    y: (sy - viewportHeight / 2) / camera.zoom + camera.y,
  };
}
