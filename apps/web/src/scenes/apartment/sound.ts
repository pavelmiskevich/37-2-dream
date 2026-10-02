import type { ApartmentPhase } from '@dream/core';
import type { SoundEvent } from '../../audio';

/**
 * Sound of the apartment as a function of the prologue's state: his own
 * breathing and the kitchen behind the door while he is awake; as he falls
 * asleep the kitchen goes away, the breathing slows to the ventilator's tempo
 * and gives way to it — "ф-ф-ф… шшш…" is his own snore (vision, "Реальность →
 * сон"). Pure: the view sends whatever this returns to the engine.
 */
export interface ApartmentSound {
  phase: ApartmentPhase;
  /** 0..1 progress of falling asleep. */
  sleep: number;
}

export interface BreathTempo {
  /** The hero's breathing while awake, breaths per minute. */
  breath: number;
  /** The ventilator it turns into. */
  ventilator: number;
}

/** Fades, seconds. The crossfade spans most of falling asleep (7 s). */
export const APARTMENT_FADES = {
  roomIn: 1.5,
  kitchenIn: 2.5,
  kitchenOut: 3,
  breathOut: 6,
  ventilatorIn: 5,
  /** On leaving the scene: the ventilator lingers into the dream. */
  ventilatorOut: 3,
  roomOut: 0.6,
} as const;

/** Smallest change of the breathing tempo worth an event, breaths per minute. */
const TEMPO_STEP = 0.25;

const isFallingAsleep = (phase: ApartmentPhase) => phase === 'falling_asleep' || phase === 'asleep';

/** Tempo of his breathing while falling asleep: from his own towards the ventilator's. */
export function breathTempo(tempo: BreathTempo, sleep: number): number {
  const s = Math.min(1, Math.max(0, sleep));
  return tempo.breath + (tempo.ventilator - tempo.breath) * s;
}

/**
 * Events that take the sound from `previous` (null: the view has just
 * started) to `next`. `lastTempo` is the breathing tempo last sent, if any.
 */
export function apartmentSoundEvents(
  previous: ApartmentSound | null,
  next: ApartmentSound,
  tempo: BreathTempo,
  lastTempo: number | null,
): { events: SoundEvent[]; tempo: number | null } {
  const events: SoundEvent[] = [];
  const asleep = isFallingAsleep(next.phase);
  const wasAsleep = previous !== null && isFallingAsleep(previous.phase);

  if (previous === null && !asleep) {
    events.push({ type: 'breath.rate', breathsPerMinute: tempo.breath });
    events.push({ type: 'sound.start', sound: 'breath', fade: APARTMENT_FADES.roomIn });
    events.push({ type: 'sound.start', sound: 'kitchen', fade: APARTMENT_FADES.kitchenIn });
    return { events, tempo: tempo.breath };
  }

  if (asleep && !wasAsleep) {
    events.push({ type: 'ventilator.rate', breathsPerMinute: tempo.ventilator });
    events.push({ type: 'sound.start', sound: 'ventilator', fade: APARTMENT_FADES.ventilatorIn });
    events.push({ type: 'sound.stop', sound: 'kitchen', fade: APARTMENT_FADES.kitchenOut });
    events.push({ type: 'sound.stop', sound: 'breath', fade: APARTMENT_FADES.breathOut });
  }

  let sent = lastTempo;
  if (asleep) {
    const value = breathTempo(tempo, next.sleep);
    if (sent === null || Math.abs(value - sent) >= TEMPO_STEP) {
      events.push({ type: 'breath.rate', breathsPerMinute: value });
      sent = value;
    }
  }
  return { events, tempo: sent };
}

/** Events for leaving the scene: the room goes quiet, the ventilator lingers into the dream. */
export function apartmentExitEvents(): SoundEvent[] {
  return [
    { type: 'sound.stop', sound: 'breath', fade: APARTMENT_FADES.roomOut },
    { type: 'sound.stop', sound: 'kitchen', fade: APARTMENT_FADES.roomOut },
    { type: 'sound.stop', sound: 'ventilator', fade: APARTMENT_FADES.ventilatorOut },
  ];
}
