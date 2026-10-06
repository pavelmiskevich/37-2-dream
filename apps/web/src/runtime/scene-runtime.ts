import * as THREE from 'three';
import type { Dream, SceneId, SimState } from '@dream/core';
import type { AudioEngine } from '../audio';
import type { FrameView } from '../loop';
import { createVacuumLayer } from '../reality';
import { SCENE_VIEWS, type SceneView, type SceneViewContext, type SceneViewFactory } from '../scenes';
import { createPlaceholderView } from './placeholder';

/** Draws one three.js scene; in the game this is the PS1 renderer's `render`. */
export type DrawScene = (scene: THREE.Scene, camera: THREE.Camera) => void;

export interface SceneRuntimeOptions {
  dream: Dream;
  draw: DrawScene;
  /** Passed to every view; absent while sound is locked (D-010). */
  audio?: AudioEngine;
  /** Lazy view loaders by scene id. Default: `SCENE_VIEWS`. */
  views?: typeof SCENE_VIEWS;
  /** View for scenes without one, or whose view failed to load. */
  placeholder?: SceneViewFactory;
  /** Reports a view that failed to load or to start. Default: `console.error`. */
  onError?: (error: unknown, sceneId: SceneId) => void;
  /**
   * Called once, on the first frame whose state is `finished`: the dream is
   * over (the awakening has stated its reason). The final state carries what
   * the dream journal (#13) needs: `wakeReason`, `temperature`, `intrusions`.
   */
  onDreamEnd?: (state: SimState) => void;
  /** Layers that sound across every scene; default: the vacuum (D-020). Only with `audio`. */
  layers?: (dream: Dream, audio: AudioEngine) => readonly DreamLayer[];
}

/** Sound (or anything) that runs across every scene of the dream, beside the scene views. */
export interface DreamLayer {
  /** Called once per rendered frame, after the scene's view. */
  update(frame: FrameView): void;
  dispose(): void;
}

export type SceneViewKind = 'loading' | 'view' | 'placeholder';

export interface SceneRuntimeStatus {
  sceneIndex: number;
  sceneId: SceneId;
  kind: SceneViewKind;
}

export interface SceneRuntime {
  /**
   * Draws one frame. When `frame.sceneIndex` differs from the scene on screen,
   * the old view is disposed and the new one is created: the scene's view
   * from `views` (loaded lazily, the screen stays black meanwhile) or the
   * placeholder.
   */
  render(frame: FrameView): void;
  /** What is on screen now; null before the first frame. */
  readonly status: SceneRuntimeStatus | null;
  /** Resolves when the current scene's view has loaded (or fell back to the placeholder). */
  ready(): Promise<void>;
  dispose(): void;
}

type AnyViewLoader = () => Promise<SceneViewFactory>;

interface Active extends SceneRuntimeStatus {
  view: SceneView | null;
}

/**
 * Connects the simulation to the scene views (#4): the simulation decides
 * which scene the dream is in, the runtime keeps the matching view on screen.
 */
export function createSceneRuntime({
  dream,
  draw,
  audio,
  views = SCENE_VIEWS,
  placeholder = createPlaceholderView,
  onError = (error, sceneId) => console.error(`Scene view "${sceneId}" failed`, error),
  onDreamEnd,
  layers = (d, a) => [createVacuumLayer(d, a)],
}: SceneRuntimeOptions): SceneRuntime {
  // Reality leaking into the dream (D-020): sounds that belong to no single scene.
  const crossLayers = audio ? layers(dream, audio) : [];
  let ended = false;

  // Drawn while a view is loading, so a scene change never flashes the placeholder.
  const blank = new THREE.Scene();
  blank.background = new THREE.Color(0x000000);
  const blankCamera = new THREE.PerspectiveCamera();

  let active: Active | null = null;
  let loading: Promise<void> = Promise.resolve();
  /** Bumped on every scene change; a load that finishes for an older one is dropped. */
  let generation = 0;
  let disposed = false;

  const startPlaceholder = (context: SceneViewContext, index: number) => {
    active = { sceneIndex: index, sceneId: context.scene.id, kind: 'placeholder', view: placeholder(context) };
  };

  const enter = (index: number) => {
    active?.view?.dispose();
    active = null;
    const scene = dream.scenes[index];
    if (scene === undefined) throw new RangeError(`Dream has no scene ${index}.`);
    const context: SceneViewContext = audio ? { dream, scene, audio } : { dream, scene };
    const current = ++generation;
    // The registry types each loader by its own scene id; here any scene goes.
    const loader = views[scene.id] as AnyViewLoader | undefined;

    if (!loader) {
      startPlaceholder(context, index);
      loading = Promise.resolve();
      return;
    }

    active = { sceneIndex: index, sceneId: scene.id, kind: 'loading', view: null };
    loading = loader()
      .then((factory) => {
        if (current !== generation || disposed) return;
        active = { sceneIndex: index, sceneId: scene.id, kind: 'view', view: factory(context) };
      })
      .catch((error: unknown) => {
        if (current !== generation || disposed) return;
        onError(error, scene.id);
        startPlaceholder(context, index);
      });
  };

  return {
    render(frame) {
      if (disposed) return;
      if (active?.sceneIndex !== frame.sceneIndex) enter(frame.sceneIndex);
      const view = active?.view;
      if (view) {
        view.update(frame);
        draw(view.scene, view.camera);
      } else {
        draw(blank, blankCamera);
      }
      for (const layer of crossLayers) layer.update(frame);
      if (frame.state.finished && !ended) {
        ended = true;
        onDreamEnd?.(frame.state);
      }
    },
    get status() {
      if (!active) return null;
      const { sceneIndex, sceneId, kind } = active;
      return { sceneIndex, sceneId, kind };
    },
    ready: () => loading,
    dispose() {
      disposed = true;
      active?.view?.dispose();
      active = null;
      for (const layer of crossLayers) layer.dispose();
    },
  };
}
