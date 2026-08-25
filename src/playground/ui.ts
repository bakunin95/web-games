import { Pane, type FolderApi } from 'tweakpane';
import type { BaseEffectParams, EffectModule, SceneContext } from '../core/types';
import type { LoopState } from '../core/loop';
import type { EffectRuntime } from './renderer';
import {
  CREATABLE_EFFECTS,
  createRandomizedParams,
  disposeInstancePools,
} from '../effects';
import { isPlacedParams } from '../core/placed';
import { MATERIAL_PRESETS, copyMaterial, type BlendMode } from '../core/material';

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
  selectRuntime: (id: string | null) => void;
  setMinimized: (min: boolean) => void;
}

type LoopApi = {
  state: LoopState;
  setPaused: (paused: boolean) => void;
  setScrub: (seconds: number) => void;
  setSpeed: (speed: number) => void;
};

const SKIP_KEYS = new Set(['enabled', 'intensity', 'instanceId', 'material']);

/**
 * Playground UI: globals, Create VFX, selected-instance editor (transform + material),
 * and minimizable panel shell.
 */
export function createPlaygroundUI(
  container: HTMLElement,
  scene: SceneContext,
  runtimes: EffectRuntime[],
  loop: LoopApi,
  createButton?: HTMLElement | null,
  minimizeButton?: HTMLElement | null,
  onSelectionChange?: (id: string | null) => void,
): PlaygroundControls {
  // Shell for minimize
  container.classList.add('panel-shell');
  const paneHost = document.createElement('div');
  paneHost.className = 'panel-pane-host';
  container.appendChild(paneHost);

  const pane = new Pane({ title: 'VFX Controls', container: paneHost }) as PaneWithFolders;
  const cssOverlay = { enabled: true, intensity: 0.7 };
  let spawnCounter = 0;
  let selectedId: string | null = null;
  let selectedFolder: FolderWithBindings | null = null;
  let minimized = false;

  const timeFolder = pane.addFolder({ title: 'Time', expanded: false });
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

  const sceneFolder = pane.addFolder({ title: 'Scene', expanded: false });
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

  // Builtin atmospheric FX (collapsed)
  const atmosFolder = pane.addFolder({ title: 'Atmosphere (built-in)', expanded: false });
  for (const rt of runtimes.filter((r) => !r.removable)) {
    addSimpleEffectFolder(atmosFolder, rt);
  }

  const instancesFolderHolder: { folder: FolderWithBindings } = {
    folder: pane.addFolder({ title: 'Instances', expanded: true }),
  };

  function refreshInstanceList(): void {
    instancesFolderHolder.folder.dispose();
    instancesFolderHolder.folder = pane.addFolder({ title: 'Instances', expanded: true });
    const empty = runtimes.filter((r) => r.removable).length === 0;
    if (empty) {
      instancesFolderHolder.folder.addButton({ title: '(none — create a VFX)' });
      return;
    }
    for (const rt of runtimes.filter((r) => r.removable)) {
      const mark = selectedId === rt.id ? '▸ ' : '';
      instancesFolderHolder.folder
        .addButton({ title: `${mark}${rt.label ?? rt.module.name}` })
        .on('click', () => selectRuntime(rt.id));
    }
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
    refreshInstanceList();
    selectRuntime(rt.id);
    flashCreateButton();
    return rt;
  }

  function removeRuntime(rt: EffectRuntime): void {
    const idx = runtimes.indexOf(rt);
    if (idx >= 0) runtimes.splice(idx, 1);
    const instanceId = String(
      (rt.params as unknown as Record<string, unknown>).instanceId ?? rt.id,
    );
    disposeInstancePools(rt.module.id, instanceId);
    if (selectedId === rt.id) selectRuntime(null);
    refreshInstanceList();
  }

  function selectRuntime(id: string | null): void {
    selectedId = id;
    rebuildSelectedFolder();
    refreshInstanceList();
    onSelectionChange?.(id);
  }

  function rebuildSelectedFolder(): void {
    selectedFolder?.dispose();
    selectedFolder = null;
    if (!selectedId) return;
    const rt = runtimes.find((r) => r.id === selectedId);
    if (!rt || !isPlacedParams(rt.params)) return;

    const folder = pane.addFolder({
      title: `Selected · ${rt.label ?? rt.module.name}`,
      expanded: true,
    });
    selectedFolder = folder;

    const bag = rt.params as unknown as Record<string, unknown>;
    folder.addBinding(bag, 'enabled');
    folder.addBinding(bag, 'intensity', { min: 0, max: 1.5, step: 0.01 });
    folder.addBinding(bag, 'x', { min: 0, max: 2400, step: 1 });
    folder.addBinding(bag, 'y', { min: 0, max: 1400, step: 1 });

    // Material
    const matFolder = folder.addFolder({ title: 'Material', expanded: true });
    const mat = rt.params.material;
    const presetProxy = { preset: mat.name in MATERIAL_PRESETS ? mat.name : 'Custom' };
    const presetOptions: Record<string, string> = { Custom: 'Custom' };
    for (const name of Object.keys(MATERIAL_PRESETS)) presetOptions[name] = name;
    matFolder.addBinding(presetProxy as unknown as Record<string, unknown>, 'preset', {
      options: presetOptions,
    });
    // Apply preset when changed — poll via binding isn't ideal; add Apply button
    matFolder.addButton({ title: 'Apply material preset' }).on('click', () => {
      if (presetProxy.preset === 'Custom') return;
      const preset = MATERIAL_PRESETS[presetProxy.preset];
      if (!preset) return;
      Object.assign(mat, copyMaterial(preset));
      rebuildSelectedFolder();
    });

    const matBag = mat as unknown as Record<string, unknown>;
    matFolder.addBinding(matBag, 'name');
    matFolder.addBinding(matBag, 'baseColor', { view: 'color' });
    matFolder.addBinding(matBag, 'emissive', { view: 'color' });
    matFolder.addBinding(matBag, 'emissiveIntensity', { min: 0, max: 2, step: 0.01 });
    matFolder.addBinding(matBag, 'opacity', { min: 0, max: 1, step: 0.01 });
    matFolder.addBinding(matBag, 'roughness', { min: 0, max: 1, step: 0.01 });
    matFolder.addBinding(matBag, 'metalness', { min: 0, max: 1, step: 0.01 });
    matFolder.addBinding(matBag, 'blend', {
      options: {
        additive: 'additive' satisfies BlendMode,
        normal: 'normal',
        screen: 'screen',
        multiply: 'multiply',
      },
    });

    // Type-specific params
    const shapeFolder = folder.addFolder({ title: 'Shape / Motion', expanded: true });
    for (const [key, value] of Object.entries(rt.params)) {
      if (SKIP_KEYS.has(key) || key === 'x' || key === 'y' || key === 'seed') continue;
      if (typeof value === 'number') {
        if (key === 'width' || key === 'height') {
          shapeFolder.addBinding(bag, key, { min: 40, max: 900, step: 1 });
        } else {
          shapeFolder.addBinding(bag, key, { min: 0, max: numericMax(key), step: 0.01 });
        }
      } else if (typeof value === 'boolean') {
        shapeFolder.addBinding(bag, key);
      } else if (typeof value === 'string' && value.startsWith('#')) {
        shapeFolder.addBinding(bag, key, { view: 'color' });
      }
    }

    folder.addButton({ title: 'Remove instance' }).on('click', () => removeRuntime(rt));
  }

  function addSimpleEffectFolder(host: FolderWithBindings, rt: EffectRuntime): void {
    const folder = host.addFolder({
      title: `${rt.module.name}`,
      expanded: false,
    });
    const bag = rt.params as unknown as Record<string, unknown>;
    folder.addBinding(bag, 'enabled');
    folder.addBinding(bag, 'intensity', { min: 0, max: 1.5, step: 0.01 });
    for (const [key, value] of Object.entries(rt.params)) {
      if (SKIP_KEYS.has(key)) continue;
      if (typeof value === 'number') {
        folder.addBinding(bag, key, { min: 0, max: numericMax(key), step: 0.01 });
      } else if (typeof value === 'boolean') {
        folder.addBinding(bag, key);
      } else if (typeof value === 'string' && value.startsWith('#')) {
        folder.addBinding(bag, key, { view: 'color' });
      }
    }
  }

  function setMinimized(min: boolean): void {
    minimized = min;
    container.classList.toggle('minimized', minimized);
    if (minimizeButton) {
      minimizeButton.textContent = minimized ? 'Show editor' : 'Minimize editor';
      minimizeButton.setAttribute('aria-pressed', String(minimized));
    }
  }

  if (minimizeButton) {
    minimizeButton.addEventListener('click', () => setMinimized(!minimized));
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

  refreshInstanceList();

  return {
    pane,
    cssOverlay,
    dispose: () => pane.dispose(),
    createVfx,
    selectRuntime,
    setMinimized,
  };
}

function numericMax(key: string): number {
  if (key === 'count' || key === 'density' || key === 'threshold' || key === 'embers') return 1;
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
    key === 'speed' ||
    key === 'waveStrength' ||
    key === 'waveScale' ||
    key === 'shoreFoam'
  ) {
    return 2;
  }
  return 10;
}

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
