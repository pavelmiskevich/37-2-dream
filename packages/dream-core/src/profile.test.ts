import { describe, expect, it } from 'vitest';
import { DREAM_LENGTH_MINUTES, DREAM_TEMPERATURE, PROFILE_INTENSITY_KEYS, generateProfile } from './profile';
import { createSeededRng } from './rng';
import { profileRng } from './streams';
import { testSeeds } from './test-utils';

const profiles = testSeeds(1000).map((seed) => generateProfile(profileRng(seed)));

describe('generateProfile', () => {
  it('is reproducible for the same stream', () => {
    expect(generateProfile(createSeededRng('p'))).toEqual(generateProfile(createSeededRng('p')));
  });

  it('starts every dream at 37.2', () => {
    for (const profile of profiles) expect(profile.temperature).toBe(DREAM_TEMPERATURE);
  });

  describe.each(PROFILE_INTENSITY_KEYS)('%s over 1000 seeds', (key) => {
    const values = profiles.map((profile) => profile[key]);

    it('stays in [0, 1] and reaches both ends', () => {
      expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...values)).toBeLessThanOrEqual(1);
      expect(Math.min(...values)).toBeLessThan(0.02);
      expect(Math.max(...values)).toBeGreaterThan(0.98);
    });

    it('fills every tenth of the range (no degeneration)', () => {
      const bins = new Array<number>(10).fill(0);
      for (const value of values) bins[Math.min(9, Math.floor(value * 10))]! += 1;
      for (const count of bins) {
        expect(count).toBeGreaterThan(60);
        expect(count).toBeLessThan(140);
      }
    });
  });

  it('spreads dreamLength over its whole range', () => {
    const lengths = profiles.map((profile) => profile.dreamLength);
    const { min, max } = DREAM_LENGTH_MINUTES;
    expect(Math.min(...lengths)).toBeGreaterThanOrEqual(min);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(max);
    expect(Math.min(...lengths)).toBeLessThan(min + 0.05);
    expect(Math.max(...lengths)).toBeGreaterThan(max - 0.05);
  });

  it('gives a different profile to every seed', () => {
    expect(new Set(profiles.map((profile) => JSON.stringify(profile))).size).toBe(profiles.length);
  });

  it('keeps traits uncorrelated', () => {
    const xs = profiles.map((p) => p.absurdity);
    const ys = profiles.map((p) => p.physicsInstability);
    const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
    const mx = mean(xs);
    const my = mean(ys);
    const cov = mean(xs.map((x, i) => (x - mx) * (ys[i]! - my)));
    const sd = (a: number[], m: number): number => Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
    expect(Math.abs(cov / (sd(xs, mx) * sd(ys, my)))).toBeLessThan(0.1);
  });
});
