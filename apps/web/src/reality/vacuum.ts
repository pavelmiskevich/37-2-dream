import { SCENE_MOTIFS, type AwakeningPhase, type Dream } from '@dream/core';
import { clamp01, lerp } from '../audio/math';

/**
 * The vacuum behind the whole dream (vision, slice item 5; D-020): somebody
 * is cleaning the next room while the hero is "dying". In the yard it is a
 * vacuum cleaner behind the wall; scene by scene it comes closer and turns
 * into a turbine; in the jam it is a hum heard through the jam (the jam's
 * muffling filter sits on the whole mix). On awakening it is an ordinary
 * vacuum cleaner in the next room again, and it is switched off.
 *
 * Everything here is a pure function of the dream, the scene and the time in
 * it, so the same seed and run always sound the same. The scenes it plays in
 * are those whose motif schedule in the core has the vacuum
 * (`SCENE_MOTIFS`), so the journal reveals exactly what was heard.
 */

/** Tunable numbers of the layer. Placeholders until the playtest. */
export const VACUUM_LAYER = {
  /** Where the dream starts: a vacuum cleaner behind the wall. */
  start: { turbine: 0, volume: 0.3 },
  /** Turbine at the end of the last dreaming scene, for `domesticIntensity` 0 and 1. */
  peakTurbine: [0.8, 1] as const,
  /** Volume at the end of the last dreaming scene. */
  peakVolume: 0.9,
  /** Growth of the turbine: progress to this power, so it stays a vacuum for a while. */
  curve: 1.6,
  /** A sighting of the source brings it this much closer. */
  sighting: { turbine: 0.08, volume: 0.3 },
  /** Awake: an ordinary vacuum cleaner in the next room, until it is switched off. */
  awake: { turbine: 0, volume: 0.55 },
  /** Fades, seconds: in at the start of the dream, out when switched off (it spins down). */
  fadeIn: 4,
  fadeOut: 2.2,
} as const;

/** What the vacuum does at one moment. */
export interface VacuumMix {
  on: boolean;
  /** 0..1, see `vacuumParams`. */
  turbine: number;
  /** 0..1, the `vacuum.volume` event. */
  volume: number;
}

export const VACUUM_OFF: VacuumMix = { on: false, turbine: 0, volume: 0 };

/** Phases of the awakening while the vacuum is still on. */
const AWAKE_VACUUM: readonly AwakeningPhase[] = ['waking', 'listening'];

/** Indices of the scenes the vacuum plays in, in dream order. */
export function vacuumScenes(dream: Dream): number[] {
  return dream.scenes.filter((scene) => SCENE_MOTIFS[scene.id].includes('vacuum')).map((scene) => scene.index);
}

/**
 * Progress through the scenes the vacuum plays in, 0..1: each of them is an
 * equal share, filled by the time spent in it against its nominal duration.
 * Before the first one it is 0, after the last one 1.
 */
export function vacuumProgress(dream: Dream, sceneIndex: number, sceneTime: number): number {
  const scenes = vacuumScenes(dream);
  if (scenes.length === 0) return 0;
  const k = scenes.indexOf(sceneIndex);
  if (k < 0) return scenes.filter((index) => index < sceneIndex).length / scenes.length;
  const duration = dream.scenes[sceneIndex]!.duration;
  return (k + clamp01(sceneTime / duration)) / scenes.length;
}

/**
 * The vacuum at `sceneTime` in scene `sceneIndex`. `phase` is the
 * awakening's phase (needed only there); `sighting` 0..1 says how much the
 * source is in sight right now.
 */
export function vacuumMixAt(
  dream: Dream,
  sceneIndex: number,
  sceneTime: number,
  phase: AwakeningPhase | null,
  sighting: number,
): VacuumMix {
  const scene = dream.scenes[sceneIndex];
  if (!scene) return VACUUM_OFF;
  if (scene.id === 'awakening') {
    return phase !== null && AWAKE_VACUUM.includes(phase) ? { on: true, ...VACUUM_LAYER.awake } : VACUUM_OFF;
  }
  if (!SCENE_MOTIFS[scene.id].includes('vacuum')) return VACUUM_OFF;

  const p = vacuumProgress(dream, sceneIndex, sceneTime);
  const peak = lerp(...VACUUM_LAYER.peakTurbine, clamp01(dream.profile.domesticIntensity));
  const s = clamp01(sighting);
  return {
    on: true,
    turbine: clamp01(lerp(VACUUM_LAYER.start.turbine, peak, p ** VACUUM_LAYER.curve) + VACUUM_LAYER.sighting.turbine * s),
    volume: clamp01(lerp(VACUUM_LAYER.start.volume, VACUUM_LAYER.peakVolume, p) + VACUUM_LAYER.sighting.volume * s),
  };
}
