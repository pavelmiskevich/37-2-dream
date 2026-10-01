import { clamp01, expLerp, lerp, smoothstep } from './math';

/** Seeded character of the vacuum cleaner. */
export interface VacuumCharacter {
  /** Motor buzz ("вжж") at turbine = 0, Hz. */
  motorHz: number;
  /** Fan whine at turbine = 0, Hz. */
  whineHz: number;
  /** How fast she moves the brush back and forth, Hz. */
  wobbleHz: number;
}

export interface VacuumParams {
  motorHz: number;
  motorGain: number;
  motorFilterHz: number;
  whineHz: number;
  whineGain: number;
  /** Airflow noise band. */
  airHz: number;
  airQ: number;
  airGain: number;
  /** Deep turbine rumble. */
  rumbleGain: number;
  /** Overall low-pass: muffled "next room" at 0, wide open at 1. */
  wallHz: number;
  /** Depth of the back-and-forth brush wobble, 0…1. */
  wobbleDepth: number;
  /** Output level. */
  level: number;
}

/**
 * The whole vacuum → turbine transformation is driven by one parameter 0…1.
 * Every output is a smooth function of it, so any slider path or ramp is
 * continuous. The early part of the range mostly brings the vacuum closer
 * (wall opens, brush wobble fades); the second half grows the turbine
 * (rumble, higher whine, deeper roar).
 */
export function vacuumParams(turbine: number, character: VacuumCharacter): VacuumParams {
  const x = clamp01(turbine);
  const morph = smoothstep(0, 1, x);
  const jet = smoothstep(0.35, 1, x);
  return {
    motorHz: character.motorHz * lerp(1, 1.6, morph),
    motorGain: lerp(0.28, 0.05, jet),
    motorFilterHz: lerp(1400, 900, morph),
    whineHz: expLerp(character.whineHz, character.whineHz * 2.6, morph),
    whineGain: lerp(0.035, 0.12, jet),
    airHz: expLerp(1800, 500, morph),
    airQ: lerp(0.9, 0.4, morph),
    airGain: lerp(0.45, 0.8, morph),
    rumbleGain: lerp(0, 0.9, jet),
    wallHz: expLerp(2200, 14000, morph),
    wobbleDepth: lerp(0.35, 0, smoothstep(0, 0.5, x)),
    level: lerp(0.55, 1, morph),
  };
}

/** Motor speed at switch-on and switch-off, relative to running speed ("вжж…" spin-up). */
export const VACUUM_SPIN_FACTOR = 0.3;
