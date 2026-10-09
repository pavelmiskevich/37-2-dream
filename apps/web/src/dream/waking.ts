import type { LibraryAsset, LibraryManifest } from '@dream/core';
import type { SoundEvent } from '../audio';

/**
 * The awakening of the dream film (D-020, D-027) as pure data: which frame of
 * the library is the bedroom he wakes up in, what the screen shows at a
 * moment and what is heard when. The view (`awakening.ts`) only applies it.
 *
 *   0 s     eyes open on the bedroom by day; his own breathing, the kitchen
 *   1,4 s   the microwave: three beeps (the monitor of the dream)
 *   3,2 s   the thermometer: 36,9
 *   5 s     "Ты чай будешь?" from the kitchen
 *   8,6 s   the reason of the awakening
 *   13 s    over: the journal
 */
export const WAKING = {
  /** The eyes open over this long. */
  eyes: 2,
  /** His awake breathing, breaths a minute. */
  breath: 13,
  breathFade: 2.5,
  kitchenFade: 1,
  microwave: { at: 1.4, gap: 0.6, beeps: 3 },
  thermometerAt: 3.2,
  thermometerFade: 1.2,
  callAt: 5,
  callSeconds: 3,
  callFade: 0.3,
  verdictAt: 8.6,
  verdictFade: 1.5,
  /** The awakening is over; the journal takes the screen. */
  end: 13,
} as const;

/**
 * The frame he wakes up in: a still of the bedroom by day that is not a
 * scare. Null while the library has none — the awakening then plays over a
 * dark screen. The first match in manifest order, so it is stable.
 */
export function wakingFrame(library: LibraryManifest): LibraryAsset | null {
  return (
    library.assets.find(
      (asset) =>
        asset.kind === 'still' && asset.tags.location === 'bedroom' && asset.tags.time === 'day' && asset.tags.mood !== 'scare',
    ) ?? null
  );
}

/** What the awakening shows at a moment, each opacity 0…1. */
export interface WakingView {
  /** The room coming out of the dark: 0 shut eyes, 1 open. */
  eyes: number;
  thermometer: number;
  call: number;
  verdict: number;
  over: boolean;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const ease = (value: number): number => {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
};

export function wakingView(time: number): WakingView {
  const t = Math.max(0, time);
  const sinceCall = t - WAKING.callAt;
  const call =
    sinceCall < 0 || sinceCall > WAKING.callSeconds
      ? 0
      : Math.min(clamp01(sinceCall / WAKING.callFade), clamp01((WAKING.callSeconds - sinceCall) / WAKING.callFade));
  return {
    eyes: ease(t / WAKING.eyes),
    thermometer: ease((t - WAKING.thermometerAt) / WAKING.thermometerFade),
    call,
    verdict: ease((t - WAKING.verdictAt) / WAKING.verdictFade),
    over: t >= WAKING.end,
  };
}

/** A sound event due `at` seconds into the awakening. */
export interface WakingCue {
  at: number;
  event: SoundEvent;
}

/**
 * Every sound of the awakening, in time order. The mix is opened first: the
 * film may have ended muffled or ducked. The kitchen is started whether or
 * not the film already brought it in (D-023): starting a playing sound
 * changes nothing.
 */
export function wakingCues(): WakingCue[] {
  const cues: WakingCue[] = [
    { at: 0, event: { type: 'master.volume', value: 1 } },
    { at: 0, event: { type: 'master.muffle', value: 0 } },
    { at: 0, event: { type: 'breath.rate', breathsPerMinute: WAKING.breath } },
    { at: 0, event: { type: 'sound.start', sound: 'breath', fade: WAKING.breathFade } },
    { at: 0, event: { type: 'sound.start', sound: 'kitchen', fade: WAKING.kitchenFade } },
  ];
  for (let i = 0; i < WAKING.microwave.beeps; i++) {
    cues.push({ at: WAKING.microwave.at + i * WAKING.microwave.gap, event: { type: 'monitor.beep' } });
  }
  return cues;
}

/** Cues to fire when the awakening clock moves from `from` to `to` (`[from, to)`). */
export function dueWakingCues(cues: readonly WakingCue[], from: number, to: number): WakingCue[] {
  return cues.filter((cue) => cue.at >= from && cue.at < to);
}
