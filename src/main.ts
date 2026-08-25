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

const scene = createScene();
const runtimes: EffectRuntime[] = BUILTIN_EFFECTS.map(makeBuiltinRuntime);

const renderer = createRenderer({
  world: worldCanvas,
  overlay: overlayCanvas,
  cssOverlay,
});

let selectedId: string | null = null;

const loop = createLoop((t, dt) => {
  scene.time = t;
  scene.dt = dt;
  scene.paused = loop.state.paused;
  clampCamera(scene.camera, scene);
  renderer.render(scene, t, runtimes, {
    selectedId,
    cssIntensity: ui.cssOverlay.intensity,
    cssEnabled: ui.cssOverlay.enabled,
  });
});

const ui = createPlaygroundUI(panel, scene, runtimes, loop, createBtn, minimizeBtn);

const interactions = attachStageInteractions(stage, scene, runtimes, (id) => {
  selectedId = id;
  ui.selectRuntime(id);
});

// Keep selectedId in sync when UI selects from instance list
const origSelect = ui.selectRuntime.bind(ui);
ui.selectRuntime = (id: string | null) => {
  selectedId = id;
  interactions.setSelected(id);
  origSelect(id);
};

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
  },
});
