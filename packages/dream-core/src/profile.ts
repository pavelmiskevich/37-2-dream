/**
 * Dream profile (spec §4): the dream's "character", drawn once per seed before
 * any scene. Scene generators read it to bias both what appears and how it
 * behaves.
 */
import { round } from './math';
import type { Rng } from './rng';

/** The temperature the hero falls asleep with. It is the premise, not a variable. */
export const DREAM_TEMPERATURE = 37.2;

/** Bounds of `DreamProfile.dreamLength`, in minutes (the first slice is a ~3-minute dream). */
export const DREAM_LENGTH_MINUTES = { min: 2.5, max: 3.5 } as const;

export interface DreamProfile {
  /** Temperature at the start of the dream, °C. Always `DREAM_TEMPERATURE`. */
  temperature: number;
  /** 0..1: how impossible the combinations get. */
  absurdity: number;
  /** 0..1: how uneasy the dream feels. */
  anxiety: number;
  /** 0..1: thermometers, monitors, ventilator. */
  medicalIntensity: number;
  /** 0..1: yards, panel blocks, swings. */
  sovietIntensity: number;
  /** 0..1: household trivia (the will, the cat, the remote). */
  domesticIntensity: number;
  /** 0..1: gravity changes, falls, viscosity. */
  physicsInstability: number;
  /** 0..1: reserved for scares (not in the first slice), drawn so the profile stays complete. */
  jumpscareIntensity: number;
  /** Nominal length of the whole dream, minutes. Scene durations add up to it. */
  dreamLength: number;
}

/** Profile fields that are uniform 0..1 intensities. */
export const PROFILE_INTENSITY_KEYS = [
  'absurdity',
  'anxiety',
  'medicalIntensity',
  'sovietIntensity',
  'domesticIntensity',
  'physicsInstability',
  'jumpscareIntensity',
] as const satisfies readonly (keyof DreamProfile)[];

export type ProfileIntensityKey = (typeof PROFILE_INTENSITY_KEYS)[number];

/**
 * Draws a profile from `rng`. Each intensity is uniform over [0, 1] and
 * independent, so every combination is reachable; the draw order is fixed and
 * part of the engine contract.
 */
export function generateProfile(rng: Rng): DreamProfile {
  const intensity = (): number => round(rng.next(), 3);
  return {
    temperature: DREAM_TEMPERATURE,
    absurdity: intensity(),
    anxiety: intensity(),
    medicalIntensity: intensity(),
    sovietIntensity: intensity(),
    domesticIntensity: intensity(),
    physicsInstability: intensity(),
    jumpscareIntensity: intensity(),
    dreamLength: round(rng.range(DREAM_LENGTH_MINUTES.min, DREAM_LENGTH_MINUTES.max), 2),
  };
}
