/**
 * Dream film contract (D-022): what the core hands to the player. The film is
 * a pure function of the seed, the chosen length and the library manifest;
 * the player only plays it back (D-004, D-005).
 */
import type { DreamProfile } from '../profile';
import type { AwakeningReason, DreamMotif } from '../scenes';
import type { DreamSeed } from '../seed';
import type { LibraryManifest } from './library';

export type DreamLength = 'short' | 'long';

/** Target film length, seconds: `short` is exact, `long` is a range. */
export const DREAM_LENGTH_SECONDS = {
  short: { min: 37, max: 37 },
  long: { min: 120, max: 180 },
} as const satisfies Record<DreamLength, { min: number; max: number }>;

/** Camera motion over one shot, in frame-relative units. */
export interface CameraMove {
  kind: 'still' | 'push' | 'pull' | 'drift' | 'sway';
  /** Zoom at the start and end of the shot; 1 shows the whole frame. */
  zoomFrom: number;
  zoomTo: number;
  /** Centre offset at the start and end, −1…1 of the frame half-size. */
  panFrom: readonly [number, number];
  panTo: readonly [number, number];
  /** Hand-held sway on top of the move, 0…1. */
  sway: number;
}

/** Look of the image over one shot, each 0…1. */
export interface FilmLook {
  grain: number;
  flicker: number;
  blur: number;
  vignette: number;
  /** Fever distortion (colour fringes, warping). */
  fever: number;
}

/** How a shot hands over to the next one. */
export type CutKind = 'hard' | 'fade' | 'flash' | 'blink';

export interface Shot {
  index: number;
  /** `LibraryAsset.id`. */
  assetId: string;
  /** Start and duration, seconds from the film start. */
  start: number;
  duration: number;
  camera: CameraMove;
  /** Strength of the depth parallax, 0…1; ignored without a depth map. */
  parallax: number;
  look: FilmLook;
  cutOut: CutKind;
  /** Length of the transition at the end of the shot, seconds (0 for `hard`). */
  cutDuration: number;
  /** A scare frame: very short, loud, preceded by build-up (spec §16). */
  scare: boolean;
}

/** Sounds the film can ask for; the player maps them to the audio engine. */
export const FILM_SOUNDS = [
  'monitor',
  'ventilator',
  'vacuum',
  'hum',
  'breath',
  'kitchen',
  'swing_creak',
  'stinger',
  'silence',
] as const;
export type FilmSound = (typeof FILM_SOUNDS)[number];

export interface SoundCue {
  /** Seconds from the film start. */
  at: number;
  sound: FilmSound;
  action: 'start' | 'stop' | 'set' | 'hit';
  /** Sound-specific parameters, each 0…1 (e.g. `volume`, `tempo`, `turbine`, `muffle`). */
  params?: Readonly<Record<string, number>>;
}

/** A reality intrusion heard in the film, revealed on waking (D-020). */
export interface FilmIntrusion {
  motif: DreamMotif;
  /** Seconds from the film start. */
  at: number;
}

export interface DreamFilm {
  engineVersion: number;
  seed: DreamSeed;
  length: DreamLength;
  /** Total length, seconds; the sum of shot durations. */
  duration: number;
  profile: DreamProfile;
  shots: readonly Shot[];
  sounds: readonly SoundCue[];
  intrusions: readonly FilmIntrusion[];
  awakening: { reason: AwakeningReason; temperature: number };
}

/** Builds the film for a seed and length from the library (#37). Pure. */
export type GenerateFilm = (seed: DreamSeed, length: DreamLength, library: LibraryManifest) => DreamFilm;
