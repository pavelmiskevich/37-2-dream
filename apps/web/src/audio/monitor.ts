import { clamp01, expLerp, lerp, smoothstep } from './math';

/** Calm heart rate: one beep per second. */
export const MONITOR_SLOWEST_PERIOD = 1.0;
/** "ПИППИППИППИП": beeps almost touch each other. */
export const MONITOR_FASTEST_PERIOD = 0.14;

/** Beep period (seconds) for intensity 0…1: "пип… пип…" → "пип-пип-пип" → "ПИППИППИП". */
export function monitorPeriod(intensity: number): number {
  return expLerp(MONITOR_SLOWEST_PERIOD, MONITOR_FASTEST_PERIOD, clamp01(intensity));
}

export interface BeepShape {
  /** Tone frequency, Hz. */
  frequency: number;
  /** Total length including attack and release, seconds. */
  duration: number;
  /** Peak gain, 0…1. */
  gain: number;
  attack: number;
  release: number;
}

/** Shortest silence between beeps, so the fastest tempo still reads as separate beeps. */
export const MIN_BEEP_GAP = 0.04;

/**
 * Shape of a single beep. Gets louder with intensity ("ПИП" in capitals) and
 * slightly lower, the way a pulse oximeter drops its pitch as saturation falls.
 */
export function beepShape(intensity: number, pitchHz: number): BeepShape {
  const i = clamp01(intensity);
  const period = monitorPeriod(i);
  return {
    frequency: pitchHz * lerp(1, 0.93, i),
    duration: Math.min(0.13, period - MIN_BEEP_GAP),
    gain: lerp(0.35, 0.85, smoothstep(0.35, 1, i)),
    attack: 0.004,
    release: 0.015,
  };
}

/**
 * Harmonic amplitudes of the beep waveform (fundamental first): mostly a sine
 * with a little edge, like a small piezo speaker.
 */
export const BEEP_HARMONICS: readonly number[] = [1, 0.18, 0.06, 0.03];
