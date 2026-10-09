/** Helpers shared by the test files. Not part of the public API. */
import { createSeededRng } from './rng';
import { seedFromEntropy, type DreamSeed } from './seed';

/** `count` distinct pseudo-random seeds, the same on every run. */
export function testSeeds(count: number, key = 'test/seeds'): DreamSeed[] {
  const rng = createSeededRng(key);
  const seeds = new Set<DreamSeed>();
  while (seeds.size < count) {
    seeds.add(seedFromEntropy(Array.from({ length: 6 }, () => rng.int(0, 255))));
  }
  return [...seeds];
}
