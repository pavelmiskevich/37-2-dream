import { describe, expect, it } from 'vitest';
import { FEVER_SCALE, feverLevel } from './fever';

describe('feverLevel', () => {
  it('is 0 when calm and 1 at full fever, clamped outside', () => {
    expect(feverLevel(FEVER_SCALE.calm)).toBe(0);
    expect(feverLevel(36.0)).toBe(0);
    expect(feverLevel(FEVER_SCALE.full)).toBe(1);
    expect(feverLevel(42.0)).toBe(1);
  });

  it('barely shows at 37.2 and clearly shows at 38.5', () => {
    expect(feverLevel(37.2)).toBeLessThan(0.1);
    expect(feverLevel(38.5)).toBeGreaterThan(0.5);
    expect(feverLevel(38.5) - feverLevel(37.0)).toBeGreaterThan(0.5);
  });

  it('never decreases as the temperature rises', () => {
    let previous = -1;
    for (let t = 35; t <= 43; t += 0.05) {
      const level = feverLevel(t);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it('treats garbage as calm', () => {
    expect(feverLevel(Number.NaN)).toBe(0);
    expect(feverLevel(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
