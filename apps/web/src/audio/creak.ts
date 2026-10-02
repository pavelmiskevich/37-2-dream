import { clamp, clamp01, lerp, smoothstep } from './math';

/**
 * The swing's "скрип… скрип…": a dry rubbing of the chain hooks on the bar.
 * Synthesised as a buzzy stick-slip tone (a sawtooth whose rate glides up
 * and back down as the hook speeds up and slows) ringing through a few
 * narrow metal resonances. One creak per pass of the seat through the bottom.
 * In reality it is the bed creaking as the hero turns over (vision,
 * "Реальность → сон").
 */

/** Seeded character of the swing. */
export interface CreakCharacter {
  /** Stick-slip rate of a middling creak, Hz. */
  rubHz: number;
  /** Lowest resonance of the hook, Hz; the others sit above it at fixed ratios. */
  ringHz: number;
}

/** A metal resonance the rubbing excites. */
export interface CreakBand {
  hz: number;
  q: number;
  gain: number;
}

export interface CreakShape {
  /** Whole creak, seconds. */
  duration: number;
  /** Peak level, 0…1. */
  gain: number;
  /** Share of the duration spent rising to the peak. */
  attack: number;
  /** Rubbing rate at the start, at the peak and at the end, Hz. */
  rubStartHz: number;
  rubPeakHz: number;
  rubEndHz: number;
  bands: CreakBand[];
}

/** Below this strength the swing is silent: a barely moving swing does not creak. */
export const CREAK_SILENT_BELOW = 0.04;

/** Resonances of the hook relative to `ringHz`: inharmonic, like a bent piece of steel. */
const RING_RATIOS: readonly [number, number, number][] = [
  // [ratio, q, gain]
  [1, 9, 1],
  [1.83, 12, 0.6],
  [2.97, 14, 0.35],
];

/**
 * One creak. `strength` 0…1 follows the swing's amplitude: a higher swing
 * creaks louder, longer and higher (the hook turns faster). `pitch` is the
 * scene's `swingCreakPitch` (1 = nominal), possibly nudged per direction.
 * Null when the swing is too still to creak.
 */
export function creakShape(strength: number, pitch: number, character: CreakCharacter): CreakShape | null {
  const s = clamp01(strength);
  if (s < CREAK_SILENT_BELOW) return null;
  const p = clamp(Number.isFinite(pitch) ? pitch : 1, 0.5, 2);
  const rub = character.rubHz * p * lerp(0.75, 1.3, s);
  return {
    duration: lerp(0.28, 0.62, s),
    gain: lerp(0.18, 0.9, smoothstep(0, 1, s)),
    attack: lerp(0.45, 0.3, s),
    rubStartHz: rub * 0.7,
    rubPeakHz: rub,
    rubEndHz: rub * 0.55,
    bands: RING_RATIOS.map(([ratio, q, gain]) => ({ hz: character.ringHz * p * ratio, q, gain })),
  };
}
