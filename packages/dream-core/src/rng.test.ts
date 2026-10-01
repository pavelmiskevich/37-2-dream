import { describe, expect, it } from 'vitest';
import { createSeededRng, hashString, rngFromState } from './rng';

const draw = (key: string, count: number): number[] => {
  const rng = createSeededRng(key);
  return Array.from({ length: count }, () => rng.nextUint32());
};

describe('hashString', () => {
  it('returns four unsigned 32-bit words', () => {
    for (const word of hashString('DREAM-8F72-A19C-37B2')) {
      expect(Number.isInteger(word)).toBe(true);
      expect(word).toBeGreaterThanOrEqual(0);
      expect(word).toBeLessThan(2 ** 32);
    }
  });
});

describe('createSeededRng', () => {
  it('is pinned to known values (changing them requires an ENGINE_VERSION bump)', () => {
    expect(draw('DREAM-8F72-A19C-37B2', 4)).toMatchInlineSnapshot(`
      [
        794147351,
        3689483620,
        3371578960,
        2739386896,
      ]
    `);
  });

  it('repeats the sequence for the same key', () => {
    expect(draw('a key', 100)).toEqual(draw('a key', 100));
  });

  it('gives unrelated sequences for neighbouring keys', () => {
    const a = draw('DREAM-0000-0000-0000/scene/1', 100);
    const b = draw('DREAM-0000-0000-0000/scene/2', 100);
    const equal = a.filter((value, i) => value === b[i]).length;
    expect(equal).toBe(0);
  });

  it('next() is uniform in [0, 1)', () => {
    const rng = createSeededRng('uniform');
    const bins = new Array<number>(10).fill(0);
    for (let i = 0; i < 10_000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      bins[Math.floor(x * 10)]! += 1;
    }
    for (const count of bins) expect(count).toBeGreaterThan(900);
  });

  it('int() covers both bounds and nothing outside', () => {
    const rng = createSeededRng('int');
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(rng.int(-2, 3));
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2, 3]);
    expect(() => rng.int(3, 2)).toThrow(RangeError);
    expect(() => rng.int(0, 1.5)).toThrow(RangeError);
  });

  it('range(), chance() and pick() behave', () => {
    const rng = createSeededRng('misc');
    for (let i = 0; i < 1000; i++) {
      const x = rng.range(5, 7);
      expect(x).toBeGreaterThanOrEqual(5);
      expect(x).toBeLessThan(7);
    }
    expect(Array.from({ length: 100 }, () => rng.chance(0)).some(Boolean)).toBe(false);
    expect(Array.from({ length: 100 }, () => rng.chance(1)).every(Boolean)).toBe(true);
    expect(['a', 'b', 'c']).toContain(rng.pick(['a', 'b', 'c']));
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it('resumes exactly from a captured state', () => {
    const rng = createSeededRng('resume');
    for (let i = 0; i < 37; i++) rng.next();
    const resumed = rngFromState(rng.state());
    const expected = Array.from({ length: 50 }, () => rng.nextUint32());
    expect(Array.from({ length: 50 }, () => resumed.nextUint32())).toEqual(expected);
  });
});
