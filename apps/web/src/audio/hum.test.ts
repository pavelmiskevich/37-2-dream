import { describe, expect, it } from 'vitest';
import { humHarmonics } from './hum';

describe('humHarmonics', () => {
  it('is dominated by twice the mains frequency, like a transformer', () => {
    const harmonics = humHarmonics(0.5);
    const loudest = harmonics.indexOf(Math.max(...harmonics));
    expect(loudest).toBe(1);
  });

  it('is normalised regardless of brightness', () => {
    for (const brightness of [0, 0.5, 1]) {
      const sum = humHarmonics(brightness).reduce((acc, v) => acc + v, 0);
      expect(sum).toBeCloseTo(1, 9);
    }
  });

  it('brightness only adds upper harmonics', () => {
    const dull = humHarmonics(0);
    const bright = humHarmonics(1);
    const upper = (h: number[]) => h.slice(2).reduce((acc, v) => acc + v, 0);
    expect(upper(bright)).toBeGreaterThan(upper(dull));
  });
});
