import { FilmAssetError } from '../film';
import { DREAM_BROKEN_TEXT, SLEEP_FAILED, SLEEP_FRAMES_UNAVAILABLE, SLEEP_NO_WEBGL, SLEEP_UNAVAILABLE } from './lines';

/**
 * What went wrong when a dream failed, and what the viewer is told (#81).
 * There are no controls after the click, so every failure ends in words —
 * never in a silent black screen.
 */

/** Which step of falling asleep failed. */
export type StartStep = 'library' | 'webgl';

/** A failure of a known step before the film starts. */
export class DreamStartError extends Error {
  constructor(
    readonly step: StartStep,
    cause: unknown,
  ) {
    super(`The dream did not start: ${step}`, { cause });
    this.name = 'DreamStartError';
  }
}

/**
 * The line shown for `error`: before the film (`started` false) on the
 * falling-asleep screen, after it over the broken dream.
 */
export function failureMessage(error: unknown, started: boolean): string {
  if (started) return DREAM_BROKEN_TEXT;
  if (error instanceof DreamStartError) return error.step === 'webgl' ? SLEEP_NO_WEBGL : SLEEP_UNAVAILABLE;
  if (error instanceof FilmAssetError) return SLEEP_FRAMES_UNAVAILABLE;
  return SLEEP_FAILED;
}

/**
 * True when the audio context stopped on its own (a call on a phone, the
 * output device gone): the film runs on its clock (D-024), so the dream must
 * show the pause instead of standing still on a frame.
 */
export function soundStoppedBySystem(state: string, pausedByUs: boolean): boolean {
  return !pausedByUs && state !== 'running' && state !== 'closed';
}
