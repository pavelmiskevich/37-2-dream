import { TICK_DT, type PlayerState, type SimState } from '@dream/core';

/** What the renderer draws in one frame: a blend of the last two ticks. */
export interface FrameView {
  /** Interpolation factor used, 0..1. */
  alpha: number;
  /** Dream time, seconds, between the last two ticks. */
  time: number;
  /** Time in the current scene, seconds. */
  sceneTime: number;
  sceneIndex: number;
  player: PlayerState;
  /** The latest simulated state, for everything that is not interpolated. */
  state: SimState;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function interpolatePlayer(a: PlayerState, b: PlayerState, alpha: number): PlayerState {
  return {
    position: [
      lerp(a.position[0], b.position[0], alpha),
      lerp(a.position[1], b.position[1], alpha),
      lerp(a.position[2], b.position[2], alpha),
    ],
    // Yaw is not wrapped by the core, so a plain lerp never spins the long way.
    yaw: lerp(a.yaw, b.yaw, alpha),
    pitch: lerp(a.pitch, b.pitch, alpha),
  };
}

/**
 * Blends `previous` and `current` (one tick apart). Across a scene change
 * nothing is blended: the new scene is drawn as is, so a teleport between
 * scenes never smears through the world.
 */
export function interpolateFrame(previous: SimState, current: SimState, alpha: number): FrameView {
  const a = Math.min(1, Math.max(0, alpha));
  const sameScene = previous.sceneIndex === current.sceneIndex;
  const t = sameScene ? a : 1;
  return {
    alpha: a,
    time: lerp(previous.tick, current.tick, a) * TICK_DT,
    sceneTime: (sameScene ? lerp(previous.sceneTick, current.sceneTick, a) : current.sceneTick) * TICK_DT,
    sceneIndex: current.sceneIndex,
    player: interpolatePlayer(previous.player, current.player, t),
    state: current,
  };
}
