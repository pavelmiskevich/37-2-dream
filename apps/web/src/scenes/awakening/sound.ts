import type { AwakeningTimeline } from '@dream/core';
import type { SoundEvent } from '../../audio';

/**
 * Sound of the awakening, as pure data: what is heard when. His breathing is
 * his own again (the ventilator was his snore); the vacuum next door goes
 * quiet (the vacuum layer of the runtime does that); then the kitchen: a cup,
 * a spoon, and the microwave beeping three times — the monitor of the dream.
 */

/** A sound event due at `at` seconds into the scene. */
export interface AwakeningCue {
  at: number;
  event: SoundEvent;
}

/** Moments of the kitchen after the vacuum goes quiet, seconds after `quietAt`. */
export const KITCHEN_AFTER_QUIET = 0.3;
/** The microwave: three beeps, the first one this long after `quietAt`, this far apart. */
export const MICROWAVE = { after: 0.9, gap: 0.6, beeps: 3 } as const;
/** Fades, seconds. */
export const AWAKENING_FADES = { breathIn: 2.5, kitchenIn: 1, out: 1.2 } as const;

/** Every cue of the awakening, in time order. `breath` is his awake breathing tempo, per minute. */
export function awakeningCues(timeline: AwakeningTimeline, tickDt: number, breath: number): AwakeningCue[] {
  const quiet = timeline.quietAt * tickDt;
  const cues: AwakeningCue[] = [
    { at: 0, event: { type: 'breath.rate', breathsPerMinute: breath } },
    { at: 0, event: { type: 'sound.start', sound: 'breath', fade: AWAKENING_FADES.breathIn } },
    { at: quiet + KITCHEN_AFTER_QUIET, event: { type: 'sound.start', sound: 'kitchen', fade: AWAKENING_FADES.kitchenIn } },
  ];
  for (let i = 0; i < MICROWAVE.beeps; i++) {
    cues.push({ at: quiet + MICROWAVE.after + i * MICROWAVE.gap, event: { type: 'monitor.beep' } });
  }
  return cues;
}

/** Events for leaving the scene (a view rebuilt by a playtest): the room goes quiet. */
export function awakeningExitEvents(): SoundEvent[] {
  return [
    { type: 'sound.stop', sound: 'breath', fade: AWAKENING_FADES.out },
    { type: 'sound.stop', sound: 'kitchen', fade: AWAKENING_FADES.out },
  ];
}
