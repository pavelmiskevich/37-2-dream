import type { SoundEvent } from './events';
import { DEFAULT_LAYER_VOLUMES } from './layers';
import { clamp01, lerp } from './math';

/**
 * Sound side of the fever (spec §20): as the temperature rises the dream gets
 * louder and more tense, as it falls the sounds are muffled. Pure numbers;
 * the runtime decides when to send them to the engine.
 */
export interface FeverSoundMix {
  /** Master volume factor, before the player's own volume. */
  readonly master: number;
  /** Volume of the tension layer. */
  readonly tension: number;
  /**
   * Suggested monitor urgency (`monitor.intensity`) for scenes that have a
   * monitor and no reason of their own to set it.
   */
  readonly monitorIntensity: number;
}

/** Bounds of the mix: at no fever the dream is muffled, at full fever it is loud. */
export const FEVER_SOUND = {
  master: [0.7, 1],
  tension: [0.35, DEFAULT_LAYER_VOLUMES.tension],
  monitorIntensity: [0.1, 0.9],
} as const;

/** Mix values are rounded to hundredths, so an unchanged mix can be skipped by comparison. */
const quantize = (value: number) => Math.round(value * 100) / 100;

/** Sound mix for fever level `fever` (0..1, see `feverLevel`). */
export function feverSoundMix(fever: number): FeverSoundMix {
  const level = clamp01(fever);
  return {
    master: quantize(lerp(...FEVER_SOUND.master, level)),
    tension: quantize(lerp(...FEVER_SOUND.tension, level)),
    monitorIntensity: quantize(lerp(...FEVER_SOUND.monitorIntensity, level)),
  };
}

/**
 * Engine events applying `mix`. `playerVolume` (0..1) is the player's own
 * master volume, which the fever scales. The engine ramps every change, so
 * sending these a few times a second is enough; compare mixes to skip repeats.
 */
export function feverSoundEvents(mix: FeverSoundMix, playerVolume = 1): SoundEvent[] {
  return [
    { type: 'master.volume', value: clamp01(mix.master * clamp01(playerVolume)) },
    { type: 'layer.volume', layer: 'tension', value: mix.tension },
  ];
}
