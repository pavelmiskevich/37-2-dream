import { SWING_RELEASE, swingAmplitude } from '@dream/core';

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

/**
 * A creak is due when the seat passes the bottom (the angle changes sign)
 * between two consecutive ticks: that is when the hooks turn fastest. A pure
 * function of two simulation states, so a replay creaks exactly the same.
 */
export function creakCue(previous: SwingSample, current: SwingSample): CreakCue | null {
  const crossed = (previous.angle < 0 && current.angle >= 0) || (previous.angle > 0 && current.angle <= 0);
  if (!crossed) return null;
  const strength = Math.min(1, swingAmplitude(current.angle, current.speed) / SWING_RELEASE.amplitude);
  return { strength, pitch: current.angle >= 0 ? 1 : BACKWARD_PITCH };
}
