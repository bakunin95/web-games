import { Pane, type FolderApi } from 'tweakpane';
import type { BaseEffectParams, EffectModule, SceneContext } from '../core/types';
import type { LoopState } from '../core/loop';
import type { EffectRuntime } from './renderer';

/** Tweakpane's published types omit FolderApi methods when @tweakpane/core isn't linked. */
type PaneWithFolders = Pane & {
  addFolder: (params: { title: string; expanded?: boolean }) => FolderWithBindings;
};

type FolderWithBindings = FolderApi & {
  addFolder: (params: { title: string; expanded?: boolean }) => FolderWithBindings;
  addBinding: (
    target: Record<string, unknown>,
    key: string,
    opts?: Record<string, unknown>,
  ) => unknown;
};

export interface PlaygroundControls {
  pane: Pane;
  cssOverlay: { enabled: boolean; intensity: number };
  dispose: () => void;
}

type LoopApi = {
  state: LoopState;
  setPaused: (paused: boolean) => void;
  setScrub: (seconds: number) => void;
  setSpeed: (speed: number) => void;
};

/**
 * Builds Tweakpane UI for scene globals + each effect's params.
 * Effect modules themselves stay UI-free; this layer only reads `defaultParams`.
 */
export function createPlaygroundUI(
  container: HTMLElement,
  scene: SceneContext,
  runtimes: EffectRuntime[],
  loop: LoopApi,
): PlaygroundControls {
  const pane = new Pane({ title: 'VFX Controls', container }) as PaneWithFolders;
  const cssOverlay = { enabled: true, intensity: 0.7 };

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

  for (const rt of runtimes) {
    addEffectFolder(pane, rt.module, rt.params);
  }

  return {
    pane,
    cssOverlay,
    dispose: () => pane.dispose(),
  };
}

function addEffectFolder(
  pane: PaneWithFolders,
  module: EffectModule,
  params: BaseEffectParams,
): void {
  const folder = pane.addFolder({
    title: `${module.name} (${module.space})`,
    expanded: module.id === 'rain' || module.id === 'neon-bloom',
  });

  const bag = params as unknown as Record<string, unknown>;
  folder.addBinding(bag, 'enabled');
  folder.addBinding(bag, 'intensity', { min: 0, max: 1.5, step: 0.01 });

  for (const [key, value] of Object.entries(params)) {
    if (key === 'enabled' || key === 'intensity') continue;
    if (typeof value === 'number') {
      const max =
        key === 'count' || key === 'density' || key === 'threshold'
          ? 1
          : key === 'length' ||
              key === 'size' ||
              key === 'bloomSize' ||
              key === 'rise' ||
              key === 'turbulence' ||
              key === 'glow' ||
              key === 'edgeSoftness' ||
              key === 'chromatic'
            ? 2
            : 10;
      folder.addBinding(bag, key, { min: 0, max, step: 0.01 });
    } else if (typeof value === 'boolean') {
      folder.addBinding(bag, key);
    } else if (typeof value === 'string' && value.startsWith('#')) {
      folder.addBinding(bag, key, { view: 'color' });
    }
  }
}

/** Deep-clone default params so each runtime is independent. */
export function cloneParams<P extends BaseEffectParams>(params: P): P {
  return structuredClone(params);
}
