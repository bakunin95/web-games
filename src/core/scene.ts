import type { CameraState, HazardZone, Light, SceneContext, Vec2 } from './types';

export const WORLD_WIDTH = 2400;
export const WORLD_HEIGHT = 1400;

export function createDefaultLights(): Light[] {
  return [
    { id: 'neon-pink', x: 520, y: 620, radius: 220, color: '#ff4fd8', intensity: 0.95 },
    { id: 'neon-cyan', x: 1180, y: 580, radius: 260, color: '#3de7ff', intensity: 1 },
    { id: 'street-amber', x: 860, y: 780, radius: 180, color: '#ffb347', intensity: 0.7 },
    { id: 'distant-blue', x: 1760, y: 420, radius: 300, color: '#6b8cff', intensity: 0.55 },
  ];
}

export function createDefaultHazards(): HazardZone[] {
  return [
    {
      id: 'acid-pool',
      x: 700,
      y: 820,
      width: 280,
      height: 160,
      color: '#7cff4a',
      intensity: 0.85,
    },
    {
      id: 'radiation',
      x: 1450,
      y: 680,
      width: 320,
      height: 220,
      color: '#ff7a18',
      intensity: 0.7,
    },
  ];
}

export function createScene(): SceneContext {
  return {
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
    viewportWidth: 1280,
    viewportHeight: 720,
    camera: { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 + 40, zoom: 0.85 },
    lights: createDefaultLights(),
    hazardZones: createDefaultHazards(),
    rainWet: true,
    wind: { x: 0.55, y: 0.08 },
    time: 0,
    dt: 0,
    paused: false,
  };
}

export function clampCamera(camera: CameraState, scene: SceneContext): void {
  const halfW = scene.viewportWidth / (2 * camera.zoom);
  const halfH = scene.viewportHeight / (2 * camera.zoom);
  camera.x = Math.min(Math.max(camera.x, halfW), scene.worldWidth - halfW);
  camera.y = Math.min(Math.max(camera.y, halfH), scene.worldHeight - halfH);
  camera.zoom = Math.min(Math.max(camera.zoom, 0.4), 2.2);
}

export function setWind(scene: SceneContext, wind: Vec2): void {
  scene.wind.x = wind.x;
  scene.wind.y = wind.y;
}
