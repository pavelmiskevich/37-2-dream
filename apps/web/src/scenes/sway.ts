import type * as THREE from 'three';

/**
 * Fever sway of the first-person camera: a small offset of the pose on top of
 * the player's own (`applyPlayerCamera`). Purely visual — the simulation never
 * sees it, so it cannot change a replay.
 */
export interface CameraSway {
  /** Eye offset, metres, in world axes. */
  readonly position: readonly [number, number, number];
  /** Added to the heading, radians. */
  readonly yaw: number;
  /** Added to the pitch, radians. */
  readonly pitch: number;
  /** Head tilt around the view axis, radians; positive tilts left. */
  readonly roll: number;
}

export const NO_SWAY: CameraSway = { position: [0, 0, 0], yaw: 0, pitch: 0, roll: 0 };

/** Largest sway at full fever. A sick, heavy head — not a ship in a storm. */
export const MAX_SWAY = {
  /** Vertical bob of the eyes, metres. */
  bob: 0.04,
  /** Sideways drift of the eyes, metres. */
  drift: 0.03,
  yaw: 0.035,
  pitch: 0.025,
  roll: 0.06,
} as const;

/**
 * Each motion is a sum of two slow sines with unrelated periods, so the sway
 * never visibly repeats; the weights add up to 1, so `MAX_SWAY` is the bound.
 */
function wave(time: number, a: number, b: number, phase: number): number {
  return 0.65 * Math.sin(time * a + phase) + 0.35 * Math.sin(time * b + phase * 1.7);
}

/**
 * Sway for fever level `fever` (0..1, see `feverLevel`) at `time` seconds.
 * Amplitude grows with the square of the level: at 37.2 the head is still,
 * at 38.5 it clearly rolls, near 39 it is hard to look straight. Continuous
 * in both arguments.
 */
export function feverSway(fever: number, time: number): CameraSway {
  const level = Math.min(1, Math.max(0, Number.isFinite(fever) ? fever : 0));
  const k = level * level;
  if (k === 0) return NO_SWAY;
  return {
    position: [MAX_SWAY.drift * k * wave(time, 0.37, 0.91, 2.1), MAX_SWAY.bob * k * wave(time, 0.83, 1.31, 0.4), 0],
    yaw: MAX_SWAY.yaw * k * wave(time, 0.29, 0.67, 4.2),
    pitch: MAX_SWAY.pitch * k * wave(time, 0.53, 1.13, 1.3),
    roll: MAX_SWAY.roll * k * wave(time, 0.41, 0.77, 0),
  };
}

/** Adds `sway` to a camera already placed by `applyPlayerCamera` (rotation order YXZ). */
export function applyCameraSway(camera: THREE.Camera, sway: CameraSway): void {
  camera.position.x += sway.position[0];
  camera.position.y += sway.position[1];
  camera.position.z += sway.position[2];
  camera.rotation.y += sway.yaw;
  camera.rotation.x += sway.pitch;
  camera.rotation.z += sway.roll;
}
