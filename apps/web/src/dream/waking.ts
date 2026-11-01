import { createSeededRng, isWakingFrame, type LibraryAsset, type LibraryManifest } from '@dream/core';
import type { SampleId, SoundEvent } from '../audio';

/**
 * The awakening of the dream film (D-020, D-027) as pure data: which frame of
 * the library is the bedroom he wakes up in, what the screen shows at a
 * moment and what is heard when. The view (`awakening.ts`) only applies it.
 *
 *   0 s     eyes open on the bedroom by day; his own breathing, the kitchen
 *   1,4 s   the microwave: three beeps (the monitor of the dream); with the
 *           recordings loaded, the recorded oven at 2,4 s (`WAKING_RECORDINGS`)
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
 * The frame he wakes up in: the first frame of the awakening (`isWakingFrame`
 * of the core: a still of the bedroom by day that is not a scare) in manifest
 * order, so it is stable. The dream itself never shows such frames (D-030).
 * Null while the library has none — the awakening then plays over a dark
 * screen.
 */
export function wakingFrame(library: LibraryManifest): LibraryAsset | null {
  return library.assets.find(isWakingFrame) ?? null;
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

/** The two room tones of the flat; which one a dream wakes up to is its seed's (D-032). */
export const ROOM_TONES = ['room-hallway', 'room-hall'] as const satisfies readonly SampleId[];
export type RoomTone = (typeof ROOM_TONES)[number];

/**
 * The room tone the dream of `seed` wakes up to: one of `ROOM_TONES`, from a
 * seeded stream of its own (`<seed>/waking/room-tone`), so dreams take turns
 * between them without any history, and the film is not touched.
 */
export function wakingRoomTone(seed: string): RoomTone {
  return createSeededRng(`${seed}/waking/room-tone`).pick(ROOM_TONES);
}

/** The recordings the awakening of `seed` plays: loaded during the dream. */
export function wakingSamples(seed: string): SampleId[] {
  return ['snore', 'microwave', 'bed-creak', 'kettle', wakingRoomTone(seed)];
}

/**
 * The recordings of the awakening (D-032): when and how loud. Times are on
 * the awakening's clock; the points "in file" are measured on the cut files
 * in `public/sounds/` and move with them.
 *
 *   0 s     room tone under everything; his own snore in the dark (the ventilator)
 *   2 s     the bed creaks: he turns over; his own breathing comes in after the snore
 *   2,4 s   the microwave stops and beeps three times, 0,6 s apart (the monitor)
 *   3 s     the kettle whistling in the kitchen; taken off the stove on the call
 *   5 s     "Ты чай будешь?"
 */
export const WAKING_RECORDINGS = {
  roomTone: { gain: 0.9, fadeIn: 1.5 },
  /** The snore sounds 0,25–2,2 s into its file and is quiet by `ends`. */
  snore: { at: 0, gain: 0.8, ends: 2.3 },
  /** The springs creak from 0,5 s into the file to about 2 s. */
  bedCreak: { at: 2, gain: 0.6 },
  /** The first of the three beeps is `beepInFile` into the file. */
  microwave: { firstBeep: 2.4, beepInFile: 1.18, gain: 0.45, fadeIn: 0.3 },
  /** Played from `from` into the file; the kettle comes off the stove `offInFile` into it, then the boil settles. */
  kettle: { from: 0.8, offInFile: 2.8, offAt: WAKING.callAt, gain: 0.35, fadeIn: 0.6 },
} as const;

/** A sound event due `at` seconds into the awakening. */
export interface WakingCue {
  at: number;
  event: SoundEvent;
}

/** Which recordings the awakening can play: the room tone of the dream and what has loaded. */
export interface WakingRecordingsAvailable {
  roomTone: RoomTone;
  /** True when the recording is loaded and will be heard. */
  has(sample: SampleId): boolean;
}

/**
 * Every sound of the awakening, in time order. The mix is opened first: the
 * film may have ended muffled or ducked. The kitchen is started whether or
 * not the film already brought it in (D-023): starting a playing sound
 * changes nothing.
 *
 * Recordings that have loaded (D-032) are laid over the synthesised flat:
 * the room tone, the snore (his breathing then starts after it), the bed,
 * the kettle, and the microwave instead of the synthesised beeps. Whatever
 * has not loaded is simply not there; with nothing loaded the awakening
 * sounds as it did before the recordings.
 */
export function wakingCues(recordings?: WakingRecordingsAvailable): WakingCue[] {
  const has = (sample: SampleId): boolean => recordings?.has(sample) ?? false;
  const rec = WAKING_RECORDINGS;
  const cues: WakingCue[] = [
    { at: 0, event: { type: 'master.volume', value: 1 } },
    { at: 0, event: { type: 'master.muffle', value: 0 } },
    { at: 0, event: { type: 'breath.rate', breathsPerMinute: WAKING.breath } },
    {
      at: has('snore') ? rec.snore.ends : 0,
      event: { type: 'sound.start', sound: 'breath', fade: WAKING.breathFade },
    },
    { at: 0, event: { type: 'sound.start', sound: 'kitchen', fade: WAKING.kitchenFade } },
  ];
  if (recordings && has(recordings.roomTone)) {
    cues.push({
      at: 0,
      event: { type: 'sample.play', sample: recordings.roomTone, gain: rec.roomTone.gain, fadeIn: rec.roomTone.fadeIn, loop: true },
    });
  }
  if (has('snore')) cues.push({ at: rec.snore.at, event: { type: 'sample.play', sample: 'snore', gain: rec.snore.gain } });
  if (has('bed-creak')) cues.push({ at: rec.bedCreak.at, event: { type: 'sample.play', sample: 'bed-creak', gain: rec.bedCreak.gain } });
  if (has('microwave')) {
    cues.push({
      at: rec.microwave.firstBeep - rec.microwave.beepInFile,
      event: { type: 'sample.play', sample: 'microwave', gain: rec.microwave.gain, fadeIn: rec.microwave.fadeIn },
    });
  } else {
    for (let i = 0; i < WAKING.microwave.beeps; i++) {
      cues.push({ at: WAKING.microwave.at + i * WAKING.microwave.gap, event: { type: 'monitor.beep' } });
    }
  }
  if (has('kettle')) {
    cues.push({
      at: rec.kettle.offAt - (rec.kettle.offInFile - rec.kettle.from),
      event: { type: 'sample.play', sample: 'kettle', offset: rec.kettle.from, gain: rec.kettle.gain, fadeIn: rec.kettle.fadeIn },
    });
  }
  // Stable: cues of one moment keep the order above.
  return cues.sort((a, b) => a.at - b.at);
}

/** Cues to fire when the awakening clock moves from `from` to `to` (`[from, to)`). */
export function dueWakingCues(cues: readonly WakingCue[], from: number, to: number): WakingCue[] {
  return cues.filter((cue) => cue.at >= from && cue.at < to);
}
