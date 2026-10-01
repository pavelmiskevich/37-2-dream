import { describe, expect, it } from 'vitest';
import { createRng, deriveRng, hashString, seedToUint32 } from './rng';

const take = (rng: () => number, n: number) => Array.from({ length: n }, rng);

describe('audio rng', () => {
  it('repeats the same sequence for the same seed', () => {
    expect(take(createRng(42), 8)).toEqual(take(createRng(42), 8));
  });

  it('gives different sequences for different seeds', () => {
    expect(take(createRng(1), 8)).not.toEqual(take(createRng(2), 8));
  });

  it('stays in [0, 1)', () => {
    for (const value of take(createRng(7), 10_000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('hashes string seeds stably', () => {
    expect(hashString('DREAM-8F72-A19C-37B2')).toBe(hashString('DREAM-8F72-A19C-37B2'));
    expect(seedToUint32('DREAM-8F72-A19C-37B2')).not.toBe(seedToUint32('DREAM-0000-0000-0000'));
    expect(seedToUint32(Number.NaN)).toBe(0);
  });

  it('derives independent streams that do not depend on request order', () => {
    const a1 = take(deriveRng('seed', 'noise:white'), 4);
    const b = take(deriveRng('seed', 'profile'), 4);
    const a2 = take(deriveRng('seed', 'noise:white'), 4);
    expect(a1).toEqual(a2);
    expect(a1).not.toEqual(b);
  });
});
