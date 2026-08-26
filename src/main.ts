import './styles.css';
import { createScene, clampCamera } from './core/scene';
import { createLoop } from './core/loop';
import { BUILTIN_EFFECTS } from './effects';
import { createRenderer } from './playground/renderer';
import type { EffectRuntime } from './playground/renderer';
import { attachStageInteractions } from './playground/stageInteractions';
import { createPlaygroundUI, makeBuiltinRuntime } from './playground/ui';

const worldCanvas = document.querySelector<HTMLCanvasElement>('#world-canvas')!;
const overlayCanvas = document.querySelector<HTMLCanvasElement>('#overlay-canvas')!;
const cssOverlay = document.querySelector<HTMLElement>('#css-overlay')!;
const panel = document.querySelector<HTMLElement>('#panel')!;
const stage = document.querySelector<HTMLElement>('#stage')!;
const createBtn = document.querySelector<HTMLButtonElement>('#create-vfx-btn');
const minimizeBtn = document.querySelector<HTMLButtonElement>('#minimize-panel-btn');
const resetBtn = document.querySelector<HTMLButtonElement>('#reset-vfx-btn');

const scene = createScene();
const runtimes: EffectRuntime[] = BUILTIN_EFFECTS.map(makeBuiltinRuntime);

const renderer = createRenderer({
  world: worldCanvas,
  overlay: overlayCanvas,
  cssOverlay,
});

/** Single source of truth for the selection gizmo. */
let selectedId: string | null = null;
let interactions: ReturnType<typeof attachStageInteractions>;

const loop = createLoop((t, dt) => {
  scene.time = t;
  scene.dt = dt;
  scene.paused = loop.state.paused;
  clampCamera(scene.camera, scene);
  renderer.render(scene, t, runtimes, {
    selectedId,
    cssIntensity: ui.cssOverlay.intensity,
    cssEnabled: ui.cssOverlay.enabled,
    pathHoverNode: interactions?.state.pathHoverNode ?? -1,
    pathHoverTangent: interactions?.state.pathHoverTangent ?? null,
  });
});

const ui = createPlaygroundUI(
  panel,
  scene,
  runtimes,
  loop,
  createBtn,
  minimizeBtn,
  (id) => {
    selectedId = id;
    interactions.setSelected(id, true);
  },
  resetBtn,
);

interactions = attachStageInteractions(stage, scene, runtimes, (id) => {
  selectedId = id;
  ui.selectRuntime(id);
});

function onResize(): void {
  renderer.resize(scene);
  clampCamera(scene.camera, scene);
}

window.addEventListener('resize', onResize);
onResize();
loop.start();

Object.assign(window, {
  __vfx: {
    scene,
    runtimes,
    loop,
    BUILTIN_EFFECTS,
    createVfx: ui.createVfx,
    selectRuntime: ui.selectRuntime,
    resetAll: ui.resetAll,
    get selectedId() {
      return selectedId;
    },
  },
});
