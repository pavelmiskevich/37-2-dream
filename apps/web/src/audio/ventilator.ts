import { clamp } from './math';

/** Keyframe of one breath cycle: phase 0…1 and filtered-noise settings at that point. */
export interface BreathKeyframe {
  phase: number;
  /** Envelope gain, 0…1. */
  gain: number;
  /** Multiplier of the band centre: 0 = inhale band, 1 = exhale band. */
  band: number;
  /** Band-pass resonance. */
  q: number;
}

/**
 * One ventilator cycle: "ф-ф-ф…" (soft, lower, wide inhale), a short pause,
 * "шшш…" (brighter, narrower exhale), a longer pause. The filter is retuned
 * only while the envelope is silent, so the switch is inaudible. The cycle
 * starts and ends at zero gain, so consecutive cycles join without clicks.
 */
export const BREATH_CYCLE: readonly BreathKeyframe[] = [
  { phase: 0, gain: 0, band: 0, q: 0.7 },
  { phase: 0.07, gain: 0.55, band: 0.05, q: 0.7 },
  { phase: 0.3, gain: 0.7, band: 0.15, q: 0.8 },
  { phase: 0.38, gain: 0, band: 0.15, q: 0.8 },
  { phase: 0.44, gain: 0, band: 1, q: 1.6 },
  { phase: 0.48, gain: 0.9, band: 1, q: 1.6 },
  { phase: 0.68, gain: 0.5, band: 0.9, q: 1.4 },
  { phase: 0.8, gain: 0, band: 0.85, q: 1.4 },
  { phase: 0.9, gain: 0, band: 0, q: 0.7 },
  { phase: 1, gain: 0, band: 0, q: 0.7 },
];

export const MIN_BREATHS_PER_MINUTE = 6;
export const MAX_BREATHS_PER_MINUTE = 30;

/** Length of one breath cycle, seconds. */
export function breathPeriod(breathsPerMinute: number): number {
  return 60 / clamp(breathsPerMinute, MIN_BREATHS_PER_MINUTE, MAX_BREATHS_PER_MINUTE);
}

export interface BreathPoint {
  time: number;
  gain: number;
  frequency: number;
  q: number;
}

export interface BreathBands {
  /** Centre of the "ф" band, Hz. */
  inhaleHz: number;
  /** Centre of the "ш" band, Hz. */
  exhaleHz: number;
}

/**
 * Absolute automation points for one cycle starting at `start`. The band
 * centre is interpolated in the log domain between the inhale and exhale bands.
 */
export function breathCycle(start: number, period: number, bands: BreathBands): BreathPoint[] {
  return BREATH_CYCLE.map((key) => ({
    time: start + key.phase * period,
    gain: key.gain,
    frequency: bands.inhaleHz * Math.pow(bands.exhaleHz / bands.inhaleHz, key.band),
    q: key.q,
  }));
}
