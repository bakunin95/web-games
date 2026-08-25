import './styles.css';
import { createScene, clampCamera } from './core/scene';
import { createLoop } from './core/loop';
import { BUILTIN_EFFECTS } from './effects';
import { createRenderer } from './playground/renderer';
import type { EffectRuntime } from './playground/renderer';
import { attachCameraControls } from './playground/cameraControls';
import { createPlaygroundUI, makeBuiltinRuntime } from './playground/ui';

const worldCanvas = document.querySelector<HTMLCanvasElement>('#world-canvas')!;
const overlayCanvas = document.querySelector<HTMLCanvasElement>('#overlay-canvas')!;
const cssOverlay = document.querySelector<HTMLElement>('#css-overlay')!;
const panel = document.querySelector<HTMLElement>('#panel')!;
const stage = document.querySelector<HTMLElement>('#stage')!;
const createBtn = document.querySelector<HTMLButtonElement>('#create-vfx-btn');

const scene = createScene();
const runtimes: EffectRuntime[] = BUILTIN_EFFECTS.map(makeBuiltinRuntime);

const renderer = createRenderer({
  world: worldCanvas,
  overlay: overlayCanvas,
  cssOverlay,
});

const loop = createLoop((t, dt) => {
  scene.time = t;
  scene.dt = dt;
  scene.paused = loop.state.paused;
  clampCamera(scene.camera, scene);
  renderer.render(
    scene,
    t,
    runtimes,
    ui.cssOverlay.intensity,
    ui.cssOverlay.enabled,
  );
});

const ui = createPlaygroundUI(panel, scene, runtimes, loop, createBtn);

function onResize(): void {
  renderer.resize(scene);
  clampCamera(scene.camera, scene);
}

window.addEventListener('resize', onResize);
onResize();
attachCameraControls(stage, scene);
loop.start();

Object.assign(window, {
  __vfx: { scene, runtimes, loop, BUILTIN_EFFECTS, createVfx: ui.createVfx },
});
