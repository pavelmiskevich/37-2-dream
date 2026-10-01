import { SEED_ENTROPY_BYTES, parseSeed, seedFromEntropy, type DreamSeed } from '@dream/core';

/**
 * Seed of the dream to play: `?seed=DREAM-8F72-A19C-37B2` (any form
 * `parseSeed` accepts) or, without a valid one, a fresh random seed.
 */
export function seedFromQuery(
  search: string,
  randomBytes: () => ArrayLike<number> = () => crypto.getRandomValues(new Uint8Array(SEED_ENTROPY_BYTES)),
): DreamSeed {
  const fromUrl = parseSeed(new URLSearchParams(search).get('seed') ?? '');
  return fromUrl ?? seedFromEntropy(randomBytes());
}
