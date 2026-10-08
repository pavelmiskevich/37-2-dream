/**
 * Library of dream footage (D-022): realistic AI stills and a few short
 * clips, generated ahead of time and described by a manifest. The core only
 * reads the manifest as data; files live in the web app.
 */

export const LOCATION_TAGS = [
  'yard',
  'stairwell',
  'stairs',
  'hospital_corridor',
  'thermometer_corridor',
  'jam_jar',
  'bedroom',
  'kitchen',
  'elevator',
] as const;
export type LocationTag = (typeof LOCATION_TAGS)[number];

export const MOTIF_TAGS = [
  'swing',
  'vacuum_woman',
  'ventilator',
  'monitor',
  'thermometer',
  'pigeons',
  'will_papers',
] as const;
export type MotifTag = (typeof MOTIF_TAGS)[number];

export const PEOPLE_TAGS = ['none', 'distant', 'face'] as const;
export type PeopleTag = (typeof PEOPLE_TAGS)[number];

/** How the frame feels; `scare` frames are only used as scares. */
export const MOOD_TAGS = ['calm', 'uneasy', 'dread', 'scare'] as const;
export type MoodTag = (typeof MOOD_TAGS)[number];

export const TIME_TAGS = ['night', 'dusk', 'day', 'interior'] as const;
export type TimeTag = (typeof TIME_TAGS)[number];

export interface AssetTags {
  location: LocationTag;
  motifs: readonly MotifTag[];
  people: PeopleTag;
  mood: MoodTag;
  time: TimeTag;
}

/** Where an asset came from; required so every frame can be published (AGENTS.md). */
export interface AssetGeneration {
  /** Hugging Face model id, e.g. `Tongyi-MAI/Z-Image-Turbo`. */
  model: string;
  /** SPDX id of the model licence, e.g. `Apache-2.0`. */
  license: string;
  prompt: string;
  /** Seed of the generator, not of a dream. */
  seed: number;
  /** Where it was generated, e.g. the Space id. */
  source: string;
}

export interface LibraryAsset {
  /** Stable id, referenced by dream films; never reused for another file. */
  id: string;
  kind: 'still' | 'clip';
  /** Path relative to the library root. */
  file: string;
  /** Greyscale depth map, path relative to the library root (#36). */
  depth?: string;
  width: number;
  height: number;
  /** Clips only, seconds. */
  duration?: number;
  tags: AssetTags;
  generation: AssetGeneration;
}

export interface LibraryManifest {
  version: 1;
  assets: readonly LibraryAsset[];
}
