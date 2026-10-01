/**
 * Derived random streams (spec §18.1–18.3). Every consumer of randomness gets
 * its own stream, keyed by a path under the dream seed, so adding draws to one
 * consumer never shifts the numbers another consumer sees:
 *
 *   DREAM-8F72-A19C-37B2/profile
 *   DREAM-8F72-A19C-37B2/scene/1              — scene seed (§18.2)
 *   DREAM-8F72-A19C-37B2/scene/1/echoes       — named channel inside a scene
 *   DREAM-8F72-A19C-37B2/scene/1/event/3      — event seed (§18.3)
 *
 * Keys depend only on the seed and indices — never on history or time (D-004).
 */
import { createSeededRng, type Rng } from './rng';
import type { DreamSeed } from './seed';

export type StreamSegment = string | number;

/** Joins a root key and path segments into a stream key. */
export function streamKey(root: string, ...path: readonly StreamSegment[]): string {
  return path.length === 0 ? root : `${root}/${path.join('/')}`;
}

/** Key of the stream the dream profile is drawn from. */
export function profileSeed(seed: DreamSeed): string {
  return streamKey(seed, 'profile');
}

/** Scene seed: `DreamSeed + SceneIndex` (§18.2). */
export function sceneSeed(seed: DreamSeed, sceneIndex: number): string {
  return streamKey(seed, 'scene', sceneIndex);
}

/** Event seed: `DreamSeed + SceneIndex + EventIndex` (§18.3). */
export function eventSeed(seed: DreamSeed, sceneIndex: number, eventIndex: number): string {
  return streamKey(sceneSeed(seed, sceneIndex), 'event', eventIndex);
}

export function profileRng(seed: DreamSeed): Rng {
  return createSeededRng(profileSeed(seed));
}

/**
 * Stream of scene `sceneIndex`. Without `channel` it is the scene's own
 * stream; a channel (e.g. `'echoes'`, `'simulation'`) gives an independent
 * sub-stream of the same scene.
 */
export function sceneRng(seed: DreamSeed, sceneIndex: number, ...channel: readonly StreamSegment[]): Rng {
  return createSeededRng(streamKey(sceneSeed(seed, sceneIndex), ...channel));
}

export function eventRng(seed: DreamSeed, sceneIndex: number, eventIndex: number): Rng {
  return createSeededRng(eventSeed(seed, sceneIndex, eventIndex));
}
