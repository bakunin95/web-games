import { Pane, type FolderApi } from 'tweakpane';
import type { BaseEffectParams, EffectModule, SceneContext } from '../core/types';
import type { LoopState } from '../core/loop';
import type { EffectRuntime } from './renderer';
import {
  CREATABLE_EFFECTS,
  createRandomizedParams,
  disposeInstancePools,
} from '../effects';

/** Tweakpane's published types omit FolderApi methods when @tweakpane/core isn't linked. */
type PaneWithFolders = Pane & {
  addFolder: (params: { title: string; expanded?: boolean }) => FolderWithBindings;
  addButton: (params: { title: string }) => { on: (event: 'click', cb: () => void) => void };
};

type FolderWithBindings = FolderApi & {
  addFolder: (params: { title: string; expanded?: boolean }) => FolderWithBindings;
  addBinding: (
    target: Record<string, unknown>,
    key: string,
    opts?: Record<string, unknown>,
  ) => unknown;
  addButton: (params: { title: string }) => { on: (event: 'click', cb: () => void) => void };
  dispose: () => void;
};

export interface PlaygroundControls {
  pane: Pane;
  cssOverlay: { enabled: boolean; intensity: number };
  dispose: () => void;
  createVfx: (typeId: string) => EffectRuntime | null;
}

type LoopApi = {
  state: LoopState;
  setPaused: (paused: boolean) => void;
  setScrub: (seconds: number) => void;
  setSpeed: (speed: number) => void;
};

/**
 * Builds Tweakpane UI for scene globals + effect instances.
 * Includes Create VFX actions that spawn randomized fire/smoke/sparks.
 */
export function createPlaygroundUI(
  container: HTMLElement,
  scene: SceneContext,
  runtimes: EffectRuntime[],
  loop: LoopApi,
  createButton?: HTMLElement | null,
): PlaygroundControls {
  const pane = new Pane({ title: 'VFX Controls', container }) as PaneWithFolders;
  const cssOverlay = { enabled: true, intensity: 0.7 };
  let spawnCounter = 0;
  const instanceFolders = new Map<string, FolderWithBindings>();

  const timeFolder = pane.addFolder({ title: 'Time', expanded: true });
  const timeProxy: Record<string, unknown> = {
    get paused() {
      return loop.state.paused;
    },
    set paused(v: unknown) {
      loop.setPaused(Boolean(v));
      scene.paused = Boolean(v);
    },
    get scrub() {
      return loop.state.time;
    },
    set scrub(v: unknown) {
      loop.setScrub(Number(v));
    },
    get speed() {
      return loop.state.speed;
    },
    set speed(v: unknown) {
      loop.setSpeed(Number(v));
    },
  };
  timeFolder.addBinding(timeProxy, 'paused');
  timeFolder.addBinding(timeProxy, 'speed', { min: 0, max: 3, step: 0.05 });
  timeFolder.addBinding(timeProxy, 'scrub', { min: 0, max: 60, step: 0.01, label: 'time (s)' });

  const sceneFolder = pane.addFolder({ title: 'Scene', expanded: true });
  sceneFolder.addBinding(scene as unknown as Record<string, unknown>, 'rainWet', {
    label: 'rain / wet',
  });
  sceneFolder.addBinding(scene.wind as unknown as Record<string, unknown>, 'x', {
    min: -1.5,
    max: 1.5,
    step: 0.01,
    label: 'wind X',
  });
  sceneFolder.addBinding(scene.wind as unknown as Record<string, unknown>, 'y', {
    min: -1,
    max: 1,
    step: 0.01,
    label: 'wind Y',
  });

  const cssFolder = pane.addFolder({ title: 'CSS Overlay', expanded: false });
  cssFolder.addBinding(cssOverlay as unknown as Record<string, unknown>, 'enabled');
  cssFolder.addBinding(cssOverlay as unknown as Record<string, unknown>, 'intensity', {
    min: 0,
    max: 1,
    step: 0.01,
  });

  const createFolder = pane.addFolder({ title: 'Create VFX', expanded: true });
  const createProxy = { type: 'fire' };
  createFolder.addBinding(createProxy as unknown as Record<string, unknown>, 'type', {
    label: 'type',
    options: Object.fromEntries(CREATABLE_EFFECTS.map((e) => [e.name, e.id])),
  });
  createFolder.addButton({ title: '+ Create new VFX' }).on('click', () => {
    createVfx(createProxy.type);
  });

  for (const rt of runtimes.filter((r) => !r.removable)) {
    addEffectFolder(pane, rt, false);
  }
  for (const rt of runtimes.filter((r) => r.removable)) {
    addEffectFolder(pane, rt, true);
  }

  function createVfx(typeId: string): EffectRuntime | null {
    const module = CREATABLE_EFFECTS.find((e) => e.id === typeId);
    if (!module) return null;
    spawnCounter += 1;
    const params = createRandomizedParams(module, scene, spawnCounter);
    const instanceId = String((params as unknown as Record<string, unknown>).instanceId);
    const label = `${module.name} #${spawnCounter}`;
    const rt: EffectRuntime = {
      id: instanceId,
      module,
      params,
      removable: true,
      label,
    };
    runtimes.push(rt);
    addEffectFolder(pane, rt, true);
    flashCreateButton();
    return rt;
  }

  function removeRuntime(rt: EffectRuntime): void {
    const idx = runtimes.indexOf(rt);
    if (idx >= 0) runtimes.splice(idx, 1);
    const folder = instanceFolders.get(rt.id);
    folder?.dispose();
    instanceFolders.delete(rt.id);
    const instanceId = String((rt.params as unknown as Record<string, unknown>).instanceId ?? rt.id);
    disposeInstancePools(rt.module.id, instanceId);
  }

  function addEffectFolder(host: PaneWithFolders, rt: EffectRuntime, removable: boolean): void {
    const title = rt.label ?? `${rt.module.name} (${rt.module.space})`;
    const folder = host.addFolder({
      title,
      expanded: removable || rt.module.id === 'rain' || rt.module.id === 'neon-bloom',
    });
    if (removable) instanceFolders.set(rt.id, folder);
    bindParams(folder, rt.params);
    if (removable) {
      folder.addButton({ title: 'Remove' }).on('click', () => removeRuntime(rt));
    }
  }

  if (createButton) {
    createButton.addEventListener('click', () => {
      openCreateMenu(createButton, (typeId) => createVfx(typeId));
    });
  }

  function flashCreateButton(): void {
    if (!createButton) return;
    createButton.classList.add('just-created');
    window.setTimeout(() => createButton.classList.remove('just-created'), 450);
  }

  return {
    pane,
    cssOverlay,
    dispose: () => pane.dispose(),
    createVfx,
  };
}

function bindParams(folder: FolderWithBindings, params: BaseEffectParams): void {
  const bag = params as unknown as Record<string, unknown>;
  folder.addBinding(bag, 'enabled');
  folder.addBinding(bag, 'intensity', { min: 0, max: 1.5, step: 0.01 });

  for (const [key, value] of Object.entries(params)) {
    if (key === 'enabled' || key === 'intensity' || key === 'instanceId') continue;
    if (typeof value === 'number') {
      if (key === 'x') {
        folder.addBinding(bag, key, { min: 0, max: 2400, step: 1 });
      } else if (key === 'y') {
        folder.addBinding(bag, key, { min: 0, max: 1400, step: 1 });
      } else if (key === 'seed') {
        folder.addBinding(bag, key, { min: 0, max: 1e9, step: 1 });
      } else {
        folder.addBinding(bag, key, { min: 0, max: numericMax(key), step: 0.01 });
      }
    } else if (typeof value === 'boolean') {
      folder.addBinding(bag, key);
    } else if (typeof value === 'string' && value.startsWith('#')) {
      folder.addBinding(bag, key, { view: 'color' });
    }
  }
}

function numericMax(key: string): number {
  if (key === 'count' || key === 'density' || key === 'threshold') return 1;
  if (
    key === 'length' ||
    key === 'size' ||
    key === 'bloomSize' ||
    key === 'rise' ||
    key === 'turbulence' ||
    key === 'glow' ||
    key === 'edgeSoftness' ||
    key === 'chromatic' ||
    key === 'spread' ||
    key === 'speed'
  ) {
    return 2;
  }
  return 10;
}

/** Lightweight popover menu for the header Create button. */
function openCreateMenu(anchor: HTMLElement, onPick: (typeId: string) => void): void {
  document.querySelector('.create-menu')?.remove();

  const menu = document.createElement('div');
  menu.className = 'create-menu';
  menu.setAttribute('role', 'menu');

  for (const effect of CREATABLE_EFFECTS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'create-menu-item';
    btn.textContent = effect.name;
    btn.title = effect.description;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onPick(effect.id);
      menu.remove();
    });
    menu.appendChild(btn);
  }

  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 8}px`;
  menu.style.left = `${Math.max(8, rect.left)}px`;
  document.body.appendChild(menu);

  const close = (ev: MouseEvent) => {
    if (ev.target === anchor || menu.contains(ev.target as Node)) return;
    menu.remove();
    document.removeEventListener('mousedown', close);
  };
  window.setTimeout(() => document.addEventListener('mousedown', close), 0);
}

export function cloneParams<P extends BaseEffectParams>(params: P): P {
  return structuredClone(params);
}

export function makeBuiltinRuntime(module: EffectModule): EffectRuntime {
  return {
    id: `builtin-${module.id}`,
    module,
    params: cloneParams(module.defaultParams),
    removable: false,
  };
}
