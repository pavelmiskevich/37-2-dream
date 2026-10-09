/**
 * Random streams of the dream film (D-023). They live under `seed/film/…`, so
 * the film never shifts a number the profile draws:
 *
 *   DREAM-8F72-A19C-37B2/film/short/beats     — dramaturgy of the short film
 *   DREAM-8F72-A19C-37B2/film/long/cast       — asset picks of the long film
 *   DREAM-8F72-A19C-37B2/film/awakening       — shared by both lengths
 */
import { createSeededRng, type Rng } from '../rng';
import type { DreamSeed } from '../seed';
import { streamKey, type StreamSegment } from '../streams';
import type { DreamLength } from './film';

/** Stream of one consumer of the film of length `length`. */
export function filmRng(seed: DreamSeed, length: DreamLength, ...channel: readonly StreamSegment[]): Rng {
  return createSeededRng(streamKey(seed, 'film', length, ...channel));
}

/** Stream shared by both lengths of the same seed (e.g. how the dream ends). */
export function filmSharedRng(seed: DreamSeed, ...channel: readonly StreamSegment[]): Rng {
  return createSeededRng(streamKey(seed, 'film', ...channel));
}
