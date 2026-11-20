import { describe, expect, it } from 'vitest';
import { FilmAssetError } from '../film';
import { DreamStartError, failureMessage, soundStoppedBySystem } from './failure';
import {
  DREAM_BROKEN_TEXT,
  SLEEP_FAILED,
  SLEEP_FRAMES_UNAVAILABLE,
  SLEEP_NO_WEBGL,
  SLEEP_UNAVAILABLE,
} from './lines';

describe('failureMessage', () => {
  it('names what failed before the film started (#81)', () => {
    expect(failureMessage(new DreamStartError('library', new TypeError('Failed to fetch')), false)).toBe(SLEEP_UNAVAILABLE);
    expect(failureMessage(new DreamStartError('webgl', new Error('Error creating WebGL context.')), false)).toBe(SLEEP_NO_WEBGL);
    expect(failureMessage(new FilmAssetError('yard-day-laundry'), false)).toBe(SLEEP_FRAMES_UNAVAILABLE);
    expect(failureMessage(new Error('anything else'), false)).toBe(SLEEP_FAILED);
    expect(failureMessage('not even an error', false)).toBe(SLEEP_FAILED);
  });

  it('no longer blames the library for a missing WebGL', () => {
    expect(failureMessage(new DreamStartError('webgl', null), false)).not.toBe(SLEEP_UNAVAILABLE);
  });

  it('says the dream broke once it had started, whatever the error', () => {
    for (const error of [new DreamStartError('library', null), new FilmAssetError('x'), new Error('render')]) {
      expect(failureMessage(error, true)).toBe(DREAM_BROKEN_TEXT);
    }
  });

  it('keeps every line dry: a statement and a way on, no exclamation', () => {
    for (const line of [SLEEP_UNAVAILABLE, SLEEP_FRAMES_UNAVAILABLE, SLEEP_NO_WEBGL, SLEEP_FAILED, DREAM_BROKEN_TEXT]) {
      expect(line).toMatch(/\.$/);
      expect(line).not.toMatch(/[!?)]|\.\.\./);
    }
  });
});

describe('soundStoppedBySystem', () => {
  it('pauses the dream when the system stops the sound, not when we did', () => {
    expect(soundStoppedBySystem('suspended', false)).toBe(true);
    // iOS reports a call as "interrupted".
    expect(soundStoppedBySystem('interrupted', false)).toBe(true);
    expect(soundStoppedBySystem('suspended', true)).toBe(false);
    expect(soundStoppedBySystem('running', false)).toBe(false);
    expect(soundStoppedBySystem('closed', false)).toBe(false);
  });
});
