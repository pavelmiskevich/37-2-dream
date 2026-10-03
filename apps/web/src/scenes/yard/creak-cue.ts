import { SWING_HINT_MAX, SWING_RELEASE, swingAmplitude } from '@dream/core';

/** The swing as the view sees it in one simulation tick. */
export interface SwingSample {
  angle: number;
  speed: number;
}

export interface CreakCue {
  /** 0…1, the swing's amplitude against the release amplitude. */
  strength: number;
  /** Multiplier on the scene's creak pitch: the backward pass creaks a little lower. */
  pitch: number;
}

/** The two hooks do not sound alike: forward and back differ by this much. */
export const BACKWARD_PITCH = 0.9;

/** At the top of a swing the hooks squeak higher and shorter. */
export const TURN_PITCH = 1.15;
/** Share of the bottom creak's strength a squeak at the top has. */
export const TURN_STRENGTH = 0.7;
/** The calling swing squeaks at the top of every swing too from this insistence level on. */
export const TURN_CREAK_FROM = 2;
/** Each level of insistence makes the creak this much louder (a share of its strength). */
export const HINT_CREAK_BOOST = 0.2;

/**
 * A creak is due when the seat passes the bottom (the angle changes sign)
 * between two consecutive ticks: that is when the hooks turn fastest. A pure
 * function of two simulation states, so a replay creaks exactly the same.
 *
 * `hint` is the swing's insistence (`sceneVars.hint`): a swing calling the
 * hero creaks louder and, from `TURN_CREAK_FROM` on, also squeaks at the top
 * of each swing (the speed changes sign) — twice as often.
 */
export function creakCue(previous: SwingSample, current: SwingSample, hint = 0): CreakCue | null {
  const level = Math.min(SWING_HINT_MAX, Math.max(0, hint));
  const amplitude = Math.min(1, swingAmplitude(current.angle, current.speed) / SWING_RELEASE.amplitude);
  const strength = Math.min(1, amplitude * (1 + HINT_CREAK_BOOST * level));
  const crossed = (previous.angle < 0 && current.angle >= 0) || (previous.angle > 0 && current.angle <= 0);
  if (crossed) return { strength, pitch: current.angle >= 0 ? 1 : BACKWARD_PITCH };
  const turned = (previous.speed > 0 && current.speed <= 0) || (previous.speed < 0 && current.speed >= 0);
  if (turned && level >= TURN_CREAK_FROM) return { strength: strength * TURN_STRENGTH, pitch: TURN_PITCH };
  return null;
}
