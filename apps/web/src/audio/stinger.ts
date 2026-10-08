import { clamp01, lerp } from './math';

/**
 * The scare's "удар": a stab of a dissonant cluster that screeches up into
 * pitch, a sub boom that drops away and a burst of noise, all hitting at once
 * and dying within a couple of seconds. The softened variant ("без вспышек",
 * D-009) swells in instead of hitting, has no screech or noise burst and is
 * heard as if through a wall.
 */

/** Seeded character of the stinger. */
export interface StingerCharacter {
  /** Lowest note of the cluster, Hz. */
  rootHz: number;
}

/** Cluster above the root: a minor second, a tritone, a minor ninth and a sharp twelfth. */
export const STINGER_CLUSTER: readonly (readonly [ratio: number, gain: number])[] = [
  [1, 1],
  [1.0595, 0.85],
  [1.4142, 0.7],
  [2.1189, 0.5],
  [3.0, 0.3],
];

export interface StingerTone {
  hz: number;
  gain: number;
}

export interface StingerShape {
  /** Whole stinger, seconds. */
  duration: number;
  /** Rise to the peak, seconds. */
  attack: number;
  /** Peak level, 0…1. */
  gain: number;
  /** Cluster tones; they start `bend` below their pitch and glide up. */
  cluster: StingerTone[];
  /** Share of the pitch the cluster starts below it (0 = no screech). */
  bend: number;
  /** Time of the glide, seconds. */
  bendTime: number;
  /** Sub boom: a sine dropping from `fromHz` to `toHz`. */
  boom: { fromHz: number; toHz: number; gain: number; decay: number };
  /** Noise burst at the onset (0 gain = none). */
  noise: { hz: number; gain: number; decay: number };
  /** Low-pass over the whole stinger, Hz. */
  lowpassHz: number;
}

/**
 * One stinger. `strength` 0…1 scales it (0 is silence, null); `soft` is the
 * "без вспышек" variant.
 */
export function stingerShape(strength: number, soft: boolean, character: StingerCharacter): StingerShape | null {
  const s = clamp01(strength);
  if (s === 0) return null;
  const cluster = STINGER_CLUSTER.map(([ratio, gain]) => ({ hz: character.rootHz * ratio, gain }));
  if (soft) {
    return {
      duration: 2.6,
      attack: 0.18,
      gain: lerp(0.15, 0.4, s),
      cluster,
      bend: 0,
      bendTime: 0,
      boom: { fromHz: 70, toHz: 40, gain: 0.5, decay: 0.9 },
      noise: { hz: 1200, gain: 0, decay: 0.2 },
      lowpassHz: 1500,
    };
  }
  return {
    duration: 2.2,
    attack: 0.004,
    gain: lerp(0.35, 1, s),
    cluster,
    bend: 0.22,
    bendTime: 0.09,
    boom: { fromHz: 95, toHz: 32, gain: 1, decay: 0.7 },
    noise: { hz: 2600, gain: 0.6, decay: 0.25 },
    lowpassHz: 9000,
  };
}
