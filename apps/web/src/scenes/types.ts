import type * as THREE from 'three';
import type { Dream, SceneId, SceneOf } from '@dream/core';
import type { AudioEngine } from '../audio';
import type { FrameView } from '../loop';

/** What a scene view gets when it is created. */
export interface SceneViewContext<Id extends SceneId = SceneId> {
  readonly dream: Dream;
  /** This scene's generated data: params, echoes, intensity, duration. */
  readonly scene: SceneOf<Id>;
  /** Sound engine; absent until the player has unlocked audio (D-010). */
  readonly audio?: AudioEngine;
}

/**
 * Visual and audible side of one dream scene. Rules that change the
 * simulation (transitions, scene variables) live in dream-core `SCENE_RULES`;
 * a view only reads the frame it is given.
 */
export interface SceneView {
  /** Drawn by the PS1 renderer, which patches its materials automatically. */
  readonly scene: THREE.Scene;
  /** Camera for the frame; usually placed with `applyPlayerCamera`. */
  readonly camera: THREE.PerspectiveCamera;
  /** Called once per rendered frame with the interpolated simulation view. */
  update(frame: FrameView): void;
  /** Frees GPU resources and stops the scene's sounds. */
  dispose(): void;
}

export type SceneViewFactory<Id extends SceneId = SceneId> = (context: SceneViewContext<Id>) => SceneView;
