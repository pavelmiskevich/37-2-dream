import { SEED_ENTROPY_BYTES, chooseFreshSeed, seedFromEntropy, type DreamSeed } from '@dream/core';

type PageLocation = Pick<Location, 'origin' | 'pathname' | 'search'>;

/** Candidates drawn for every new dream; a few would do, the profiles are cheap. */
export const FRESH_SEED_CANDIDATES = 16;

/**
 * Seed of the next dream ("Уснуть снова"): candidates from fresh entropy,
 * the first one unlike the last dreams of the journal (D-004, D-021).
 */
export function freshSeed(
  recent: readonly DreamSeed[],
  randomBytes: () => ArrayLike<number> = () => crypto.getRandomValues(new Uint8Array(SEED_ENTROPY_BYTES)),
): DreamSeed {
  const candidates = Array.from({ length: FRESH_SEED_CANDIDATES }, () => seedFromEntropy(randomBytes()));
  return chooseFreshSeed(candidates, recent);
}

/**
 * Link to a dream: this page with only `?seed=`. It opens the same dream from
 * the beginning on any device (D-004); playtest and sandbox parameters are
 * dropped.
 */
export function shareUrl(seed: DreamSeed, location: PageLocation): string {
  return `${location.origin}${location.pathname}?${new URLSearchParams({ seed }).toString()}`;
}

/** Where "Уснуть снова" goes: the next dream, keeping the debug overlay if it was on. */
export function nextDreamUrl(seed: DreamSeed, location: PageLocation): string {
  const debug = new URLSearchParams(location.search).get('debug');
  const url = shareUrl(seed, location);
  return debug === null ? url : `${url}&${new URLSearchParams({ debug }).toString()}`;
}
