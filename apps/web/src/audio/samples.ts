import type { LayerName } from './layers';

/**
 * Recordings the engine can play (D-031, D-032): files in `public/sounds/`,
 * all CC0 1.0 from Freesound, each credited in `assets/CREDITS.md`. They are
 * the flat of the awakening — what the dream's synthesised sounds turn out to
 * be. Inside the dream the synthesiser stays the sound (D-011).
 */
export const SAMPLES = {
  /** One heavy snore: the dream's ventilator (`ventilator → snoring`, D-020). */
  snore: { file: 'snore.mp3', source: 'https://freesound.org/people/mattyharm/sounds/432997' },
  /** The oven stops and beeps three times: the dream's monitor (`monitor → microwave`). */
  microwave: { file: 'microwave.mp3', source: 'https://freesound.org/people/Filmscore/sounds/268525' },
  /** Old bed springs, somebody turning over: he wakes up. */
  'bed-creak': { file: 'bed-creak.mp3', source: 'https://freesound.org/people/kyles/sounds/635480' },
  /** The kettle whistles and is taken off the stove: the tea is coming. */
  kettle: { file: 'kettle.mp3', source: 'https://freesound.org/people/sethlind/sounds/265017' },
  /** Room tone: a block of flats, hallway at night, a fluorescent lamp. A seamless loop. */
  'room-hallway': { file: 'room-hallway.mp3', source: 'https://freesound.org/people/kyles/sounds/635718' },
  /** Room tone: the hall of a block of flats, concrete, distant hum. A seamless loop. */
  'room-hall': { file: 'room-hall.mp3', source: 'https://freesound.org/people/Kostrava/sounds/333960' },
} as const satisfies Record<string, { file: string; source: string }>;

export type SampleId = keyof typeof SAMPLES;
export const SAMPLE_IDS = Object.keys(SAMPLES) as SampleId[];

/** Layer a recording plays in unless its event says otherwise: room tone at the bottom, the flat above it. */
export const DEFAULT_SAMPLE_LAYER: Readonly<Record<SampleId, LayerName>> = {
  snore: 'location',
  microwave: 'location',
  'bed-creak': 'location',
  kettle: 'location',
  'room-hallway': 'ambient',
  'room-hall': 'ambient',
};

/** Where a recording is served from, under `root` (the app's `sounds/`). */
export function sampleUrl(root: string, id: SampleId): string {
  return `${root}${SAMPLES[id].file}`;
}

/** How one play of a recording is shaped, in seconds; all already clamped to the buffer. */
export interface SamplePlayShape {
  /** Where in the file the play starts. */
  offset: number;
  /** How long it plays; `Infinity` for a loop. */
  duration: number;
  fadeIn: number;
  /** Fade at the end of `duration`; 0 for a loop (it stops only by `sample.stop`). */
  fadeOut: number;
}

const clampTo = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Pure shape of a play of a recording `bufferDuration` long. A loop plays
 * until stopped; a one-shot plays to the end of the file or `duration`,
 * whichever comes first, and its fades never overlap.
 */
export function samplePlayShape(
  bufferDuration: number,
  play: { offset?: number; duration?: number; fadeIn?: number; fadeOut?: number; loop?: boolean },
): SamplePlayShape {
  const length = Math.max(0, bufferDuration);
  const offset = play.loop ? 0 : clampTo(play.offset ?? 0, 0, length);
  const rest = length - offset;
  const duration = play.loop ? Infinity : clampTo(play.duration ?? rest, 0, rest);
  const fadeIn = Math.max(0, play.fadeIn ?? 0);
  const fadeOut = play.loop ? 0 : Math.max(0, play.fadeOut ?? 0);
  if (!play.loop && fadeIn + fadeOut > duration) {
    const scale = duration / (fadeIn + fadeOut || 1);
    return { offset, duration, fadeIn: fadeIn * scale, fadeOut: fadeOut * scale };
  }
  return { offset, duration, fadeIn, fadeOut };
}
