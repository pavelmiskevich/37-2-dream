import { JAM_JAR, type Echo } from '@dream/core';
import type { SoundEvent } from '../../audio';

/**
 * Sound of the jam, as pure data: what is heard when. Inside the jar the
 * whole dream is muffled (a low-pass on the mix, deeper = duller), the
 * ventilator breathes through it all along, and the scene's echoes of
 * reality (`scene.echoes`) come through the jam: the ventilator takes a
 * deeper, closer breath, the monitor gives a few lone beeps.
 */

/** Muffling (`master.muffle`) just under the lid and at the bottom. */
export const JAM_MUFFLE = { top: 0.62, bottom: 0.85 } as const;
/** Smallest change of muffling worth an event. */
export const MUFFLE_STEP = 0.02;

/** How the echoes sound in the jam. */
export const JAM_ECHO = {
  /** A ventilator echo: the breath comes close (tension layer) for this long, seconds. */
  breathHold: 7,
  /** A monitor echo: this many lone beeps, this far apart, seconds. */
  beeps: 3,
  beepGap: 1.15,
} as const;

/** Muffling for eyes at height `y` in the jar. */
export function jamMuffle(y: number): number {
  const depth = Math.min(1, Math.max(0, 1 - y / JAM_JAR.height));
  return JAM_MUFFLE.top + (JAM_MUFFLE.bottom - JAM_MUFFLE.top) * depth;
}

/** A sound event due at `at` seconds into the scene. */
export interface JamCue {
  at: number;
  event: SoundEvent;
}

/** Every echo cue of a scene of `duration` seconds, in time order. */
export function jamEchoCues(echoes: readonly Echo[], duration: number): JamCue[] {
  const cues: JamCue[] = [];
  for (const echo of echoes) {
    const at = echo.at * duration;
    if (echo.motif === 'ventilator') {
      cues.push({ at, event: { type: 'sound.start', sound: 'ventilator', layer: 'tension', fade: 1.5 } });
      cues.push({
        at: at + JAM_ECHO.breathHold,
        event: { type: 'sound.start', sound: 'ventilator', layer: 'recurring', fade: 2.5 },
      });
    } else {
      for (let i = 0; i < JAM_ECHO.beeps; i++) cues.push({ at: at + i * JAM_ECHO.beepGap, event: { type: 'monitor.beep' } });
    }
  }
  return cues.sort((a, b) => a.at - b.at);
}

/** Cues due after `from` and up to `to` seconds (a frame's step), in order. */
export function cuesBetween(cues: readonly JamCue[], from: number, to: number): JamCue[] {
  return cues.filter((cue) => cue.at > from && cue.at <= to);
}
