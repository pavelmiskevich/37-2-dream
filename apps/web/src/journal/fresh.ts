import { SEED_ENTROPY_BYTES, chooseFreshSeed, seedFromEntropy, type DreamSeed } from '@dream/core';

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
