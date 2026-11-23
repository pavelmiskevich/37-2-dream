/**
 * How the dream film ends (#134, D-037). Most dreams fade into the awakening;
 * some end in a fall: the last shots of the climax are heights — the edge of
 * the roof, the gap of the stairwell, the shaft of the elevator — rushing
 * closer, then a hard cut, and he wakes with a sharp breath, the way one
 * jerks awake from falling in a dream.
 *
 * The more physics there is in the dream's profile (gravity, falls,
 * viscosity), the likelier it ends in a fall (the owner's choice, 2026-11-23).
 */
import { lerp } from '../math';
import type { DreamProfile } from '../profile';
import type { Rng } from '../rng';
import type { CameraMove } from './film';
import { isWakingFrame, type LibraryAsset } from './library';

export type FilmEnding = 'quiet' | 'fall';

export const FALL_ENDING = {
  /** A fall needs this many frames of it in the library, or the ending repeats one height. */
  minFrames: 3,
  /** The last shots of the film that are heights. */
  shots: 3,
  /** Chance of a fall at no physics and at full physics: about one dream in five on average. */
  chance: [0.02, 0.4] as const,
  /** The last height is held at least this long, ms, so the camera can fall in. */
  lastMs: 1200,
  /** Each height comes closer than the last. */
  zoom: { from: 1, to: [1.2, 1.35] as const },
  /** The final height: the camera falls in, three times closer by the cut, shaking. */
  plunge: { zoomTo: 3.2, sway: 0.7 },
  /** How deep the rest of the mix ducks under the wind of the fall. */
  duck: 0.85,
} as const;

/** Frames a fall ending can use: ordinary frames with the `fall` motif. */
export function fallFrames(assets: readonly LibraryAsset[]): LibraryAsset[] {
  return assets.filter((asset) => asset.tags.motifs.includes('fall') && asset.tags.mood !== 'scare' && !isWakingFrame(asset));
}

/** Chance that a dream of `profile` ends in a fall, given the library has the frames. */
export function fallEndingChance(profile: DreamProfile): number {
  return lerp(FALL_ENDING.chance[0], FALL_ENDING.chance[1], profile.physicsInstability);
}

/** How the film ends. Draws exactly once from `rng`, whatever the library. */
export function planEnding(profile: DreamProfile, assets: readonly LibraryAsset[], rng: Rng): FilmEnding {
  const roll = rng.next();
  if (fallFrames(assets).length < FALL_ENDING.minFrames) return 'quiet';
  return roll < fallEndingChance(profile) ? 'fall' : 'quiet';
}

/**
 * Camera of the `step`-th of the last `of` heights (0 = the first of them).
 * The heights before the last push straight in, each closer than the one
 * before; the last one is the fall itself (`fall` kind, D-037, #137).
 */
export function fallCamera(step: number, of: number): CameraMove {
  if (step >= of - 1) {
    const { zoomTo, sway } = FALL_ENDING.plunge;
    return { kind: 'fall', zoomFrom: FALL_ENDING.zoom.from, zoomTo, panFrom: [0, 0], panTo: [0, 0], sway };
  }
  const zooms = FALL_ENDING.zoom.to;
  // The height right before the fall gets the steepest push, however many heights there are.
  const at = Math.max(0, Math.min(zooms.length - 1, zooms.length - (of - 1) + step));
  const zoomTo = zooms[at] as number;
  return { kind: 'push', zoomFrom: FALL_ENDING.zoom.from, zoomTo, panFrom: [0, 0], panTo: [0, 0], sway: 0.25 };
}
