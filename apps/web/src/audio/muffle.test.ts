import { describe, expect, it } from 'vitest';
import { MUFFLE, muffleCutoff } from './muffle';

describe('muffleCutoff', () => {
  it('is open at 0 and closed at 1', () => {
    expect(muffleCutoff(0)).toBeCloseTo(MUFFLE.open, 6);
    expect(muffleCutoff(1)).toBeCloseTo(MUFFLE.closed, 6);
  });

  it('closes steadily, evenly in the log domain', () => {
    let previous = Infinity;
    for (let step = 0; step <= 10; step++) {
      const cutoff = muffleCutoff(step / 10);
      expect(cutoff).toBeLessThan(previous);
      previous = cutoff;
    }
    expect(muffleCutoff(0.5)).toBeCloseTo(Math.sqrt(MUFFLE.open * MUFFLE.closed), 6);
  });

  it('stays within its range whatever comes in', () => {
    expect(muffleCutoff(-1)).toBeCloseTo(MUFFLE.open, 6);
    expect(muffleCutoff(2)).toBeCloseTo(MUFFLE.closed, 6);
    expect(muffleCutoff(Number.NaN)).toBeCloseTo(MUFFLE.open, 6);
    expect(muffleCutoff(Infinity)).toBeCloseTo(MUFFLE.open, 6);
  });
});
