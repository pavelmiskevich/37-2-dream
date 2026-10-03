import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SCENE_IDS, createInitialState, generateDream, normalizeSeed, type SceneId, type SimState } from '@dream/core';
import type { AudioEngine } from '../audio';
import { interpolateFrame, type FrameView } from '../loop';
import type { SCENE_VIEWS, SceneView, SceneViewContext } from '../scenes';
import { PLACEHOLDER_COLORS, createPlaceholderView } from './placeholder';
import { createSceneRuntime, type DrawScene } from './scene-runtime';

const dream = generateDream(normalizeSeed('DREAM-8F72-A19C-37B2'));
const indexOf = (id: SceneId) => dream.scenes.findIndex((scene) => scene.id === id);

function frameIn(sceneIndex: number): FrameView {
  const state = createInitialState(dream, undefined, { startScene: sceneIndex });
  return interpolateFrame(state, state, 0);
}

function fakeView(name: string) {
  const scene = new THREE.Scene();
  scene.name = name;
  const view = {
    scene,
    camera: new THREE.PerspectiveCamera(),
    update: vi.fn<(frame: FrameView) => void>(),
    dispose: vi.fn<() => void>(),
  } satisfies SceneView;
  return view;
}

function recorder() {
  const drawn: string[] = [];
  const draw: DrawScene = (scene) => drawn.push(scene.name || 'blank');
  return { drawn, draw };
}

describe('createSceneRuntime', () => {
  it('draws the placeholder of the current scene when it has no view', () => {
    const { drawn, draw } = recorder();
    const runtime = createSceneRuntime({ dream, draw, views: {} });
    runtime.render(frameIn(indexOf('yard')));
    expect(runtime.status).toEqual({ sceneIndex: indexOf('yard'), sceneId: 'yard', kind: 'placeholder' });
    expect(drawn).toEqual(['placeholder:yard']);
  });

  it('gives every scene placeholder its own colour', () => {
    const colours = new Set(SCENE_IDS.map((id) => PLACEHOLDER_COLORS[id]));
    expect(colours.size).toBe(SCENE_IDS.length);
    for (const scene of dream.scenes) {
      const view = createPlaceholderView({ dream, scene });
      expect((view.scene.background as THREE.Color).getHex()).toBe(PLACEHOLDER_COLORS[scene.id]);
      view.dispose();
    }
  });

  it('puts the placeholder camera at the hero eyes, swaying only with fever', () => {
    const state = createInitialState(dream);
    const player = { position: [2, 1.6, -3] as const, yaw: 0.5, pitch: 0.1 };
    const view = createPlaceholderView({ dream, scene: dream.scenes[0]! });
    const at = (temperature: number) => {
      const moved = { ...state, tick: 300, temperature, player };
      view.update(interpolateFrame(moved, moved, 0));
      return { position: view.camera.position.toArray(), yaw: view.camera.rotation.y };
    };

    expect(at(37)).toEqual({ position: [2, 1.6, -3], yaw: 0.5 });
    const feverish = at(39.5);
    expect(feverish.position).not.toEqual([2, 1.6, -3]);
    expect(feverish.position[1]).toBeCloseTo(1.6, 1);
    expect(feverish.yaw).toBeCloseTo(0.5, 1);
    view.dispose();
  });

  it('loads a registered view lazily, with the scene context and audio, and shows blank meanwhile', async () => {
    const { drawn, draw } = recorder();
    const yardView = fakeView('yard-view');
    const contexts: SceneViewContext[] = [];
    const audio = { seed: 'test', handle: vi.fn() } as unknown as AudioEngine;
    const views: typeof SCENE_VIEWS = {
      yard: async () => (context) => (contexts.push(context), yardView),
    };
    const runtime = createSceneRuntime({ dream, draw, audio, views });
    const frame = frameIn(indexOf('yard'));

    runtime.render(frame);
    expect(runtime.status?.kind).toBe('loading');
    await runtime.ready();
    runtime.render(frame);

    expect(drawn).toEqual(['blank', 'yard-view']);
    expect(runtime.status?.kind).toBe('view');
    expect(yardView.update).toHaveBeenCalledWith(frame);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({ dream, scene: dream.scenes[indexOf('yard')], audio });
  });

  it('omits audio from the context while sound is locked', async () => {
    const contexts: SceneViewContext[] = [];
    const runtime = createSceneRuntime({
      dream,
      draw: () => {},
      views: { yard: async () => (context) => (contexts.push(context), fakeView('yard')) },
    });
    runtime.render(frameIn(indexOf('yard')));
    await runtime.ready();
    expect(contexts[0]).not.toHaveProperty('audio');
  });

  it('disposes the old view when the scene changes', async () => {
    const yardView = fakeView('yard-view');
    const runtime = createSceneRuntime({ dream, draw: () => {}, views: { yard: async () => () => yardView } });
    runtime.render(frameIn(indexOf('yard')));
    await runtime.ready();
    runtime.render(frameIn(indexOf('yard')));
    expect(yardView.dispose).not.toHaveBeenCalled();

    runtime.render(frameIn(indexOf('fall')));
    expect(yardView.dispose).toHaveBeenCalledTimes(1);
    expect(runtime.status).toMatchObject({ sceneId: 'fall', kind: 'placeholder' });
  });

  it('drops a view that finished loading after the dream moved on', async () => {
    let resolve: (() => void) | undefined;
    const factory = vi.fn(() => fakeView('late'));
    const views: typeof SCENE_VIEWS = {
      yard: () =>
        new Promise((done) => {
          resolve = () => done(factory);
        }),
    };
    const runtime = createSceneRuntime({ dream, draw: () => {}, views });
    runtime.render(frameIn(indexOf('yard')));
    const pending = runtime.ready();
    runtime.render(frameIn(indexOf('fall')));
    resolve?.();
    await pending;
    expect(factory).not.toHaveBeenCalled();
    expect(runtime.status).toMatchObject({ sceneId: 'fall', kind: 'placeholder' });
  });

  it('falls back to the placeholder when a view fails to load or to start', async () => {
    const onError = vi.fn();
    const runtime = createSceneRuntime({
      dream,
      draw: () => {},
      onError,
      views: {
        yard: () => Promise.reject(new Error('chunk missing')),
        fall: async () => () => {
          throw new Error('bad view');
        },
      },
    });
    runtime.render(frameIn(indexOf('yard')));
    await runtime.ready();
    expect(runtime.status).toMatchObject({ sceneId: 'yard', kind: 'placeholder' });
    runtime.render(frameIn(indexOf('fall')));
    await runtime.ready();
    expect(runtime.status).toMatchObject({ sceneId: 'fall', kind: 'placeholder' });
    expect(onError.mock.calls.map((call) => call[1])).toEqual(['yard', 'fall']);
  });

  it('disposes the current view and stops drawing after dispose()', async () => {
    const { drawn, draw } = recorder();
    const yardView = fakeView('yard-view');
    const runtime = createSceneRuntime({ dream, draw, views: { yard: async () => () => yardView } });
    runtime.render(frameIn(indexOf('yard')));
    await runtime.ready();
    runtime.dispose();
    expect(yardView.dispose).toHaveBeenCalledTimes(1);
    runtime.render(frameIn(indexOf('yard')));
    expect(drawn).toEqual(['blank']);
  });

  it('runs the cross-scene layers every frame, only with sound, and stops them on dispose', () => {
    const layer = { update: vi.fn<(frame: FrameView) => void>(), dispose: vi.fn<() => void>() };
    const audio = { seed: 'test', handle: vi.fn() } as unknown as AudioEngine;
    const silent = createSceneRuntime({ dream, draw: () => {}, views: {}, layers: () => [layer] });
    silent.render(frameIn(indexOf('yard')));
    expect(layer.update).not.toHaveBeenCalled();

    const runtime = createSceneRuntime({ dream, draw: () => {}, views: {}, audio, layers: () => [layer] });
    runtime.render(frameIn(indexOf('yard')));
    runtime.render(frameIn(indexOf('fall')));
    expect(layer.update).toHaveBeenCalledTimes(2);
    runtime.dispose();
    expect(layer.dispose).toHaveBeenCalledTimes(1);
  });

  it('reports the end of the dream once, with the final state', () => {
    const onDreamEnd = vi.fn<(state: SimState) => void>();
    const runtime = createSceneRuntime({ dream, draw: () => {}, views: {}, onDreamEnd });
    const awakening = frameIn(indexOf('awakening'));
    runtime.render(awakening);
    expect(onDreamEnd).not.toHaveBeenCalled();
    const finished = { ...awakening.state, finished: true };
    runtime.render(interpolateFrame(finished, finished, 0));
    runtime.render(interpolateFrame(finished, finished, 0));
    expect(onDreamEnd).toHaveBeenCalledTimes(1);
    expect(onDreamEnd).toHaveBeenCalledWith(finished);
  });
});
