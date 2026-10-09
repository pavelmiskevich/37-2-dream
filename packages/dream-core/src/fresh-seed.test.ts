import { describe, expect, it } from 'vitest';
import { generateFilm } from './film/generate';
import { TEST_LIBRARY } from './film/test-library';
import {
  MIN_PROFILE_DISTANCE,
  RECENT_DREAMS,
  chooseFreshSeed,
  profileDistance,
  profileOfSeed,
} from './fresh-seed';
import { createSeededRng } from './rng';
import { seedFromEntropy, type DreamSeed } from './seed';
import { testSeeds } from './test-utils';

/** A seed source the way the app has it: fresh entropy every call, here reproducible. */
function entropy(key: string): () => DreamSeed {
  const rng = createSeededRng(key);
  return () => seedFromEntropy(Array.from({ length: 6 }, () => rng.int(0, 255)));
}

const draw = (source: () => DreamSeed, count: number) => Array.from({ length: count }, source);

describe('profileDistance', () => {
  const seeds = testSeeds(400, 'fresh/pairs');
  const profiles = seeds.map(profileOfSeed);

  it('is the profile generateFilm draws', () => {
    for (const seed of seeds.slice(0, 20)) {
      expect(profileOfSeed(seed)).toEqual(generateFilm(seed, 'short', TEST_LIBRARY).profile);
    }
  });

  it('is 0 for the same profile, symmetric and within [0, 1]', () => {
    for (let i = 0; i + 1 < profiles.length; i++) {
      const a = profiles[i]!;
      const b = profiles[i + 1]!;
      expect(profileDistance(a, a)).toBe(0);
      expect(profileDistance(a, b)).toBe(profileDistance(b, a));
      expect(profileDistance(a, b)).toBeGreaterThan(0);
      expect(profileDistance(a, b)).toBeLessThanOrEqual(1);
    }
  });

  it('rejects only a small share of random pairs at the default threshold', () => {
    const distances: number[] = [];
    for (let i = 0; i + 1 < profiles.length; i += 2) distances.push(profileDistance(profiles[i]!, profiles[i + 1]!));
    const mean = distances.reduce((sum, d) => sum + d, 0) / distances.length;
    const close = distances.filter((d) => d < MIN_PROFILE_DISTANCE).length / distances.length;
    expect(mean).toBeGreaterThan(0.36);
    expect(mean).toBeLessThan(0.46);
    expect(close).toBeLessThan(0.1);
  });
});

describe('chooseFreshSeed', () => {
  it('takes the first candidate when there is no history', () => {
    const candidates = testSeeds(4, 'fresh/empty');
    expect(chooseFreshSeed(candidates, [])).toBe(candidates[0]);
  });

  it('never returns a seed of the last dreams, even when offered first', () => {
    const recent = testSeeds(RECENT_DREAMS, 'fresh/recent');
    const candidates = [...recent, ...draw(entropy('fresh/repeat'), 12)];
    const chosen = chooseFreshSeed(candidates, recent);
    expect(recent).not.toContain(chosen);
  });

  it('a new seed does not repeat the profile of the last N dreams', () => {
    // A journal growing dream by dream, every new seed chosen from fresh entropy.
    const source = entropy('fresh/journal');
    const journal: DreamSeed[] = [];
    for (let dream = 0; dream < 200; dream++) {
      const chosen = chooseFreshSeed(draw(source, 16), journal);
      const chosenProfile = profileOfSeed(chosen);
      for (const earlier of journal.slice(-RECENT_DREAMS)) {
        expect(profileDistance(chosenProfile, profileOfSeed(earlier))).toBeGreaterThanOrEqual(MIN_PROFILE_DISTANCE);
      }
      journal.push(chosen);
    }
  });

  it('only looks at the last recentCount dreams', () => {
    const [old, ...rest] = testSeeds(RECENT_DREAMS + 1, 'fresh/window');
    const recent = [old!, ...rest];
    // The oldest dream is out of the window: its own seed is welcome again.
    expect(chooseFreshSeed([old!], recent)).toBe(old);
    expect(chooseFreshSeed([old!, ...testSeeds(8, 'fresh/other')], recent, { recentCount: recent.length })).not.toBe(old);
  });

  it('falls back to the candidate farthest from the recent dreams', () => {
    const recent = testSeeds(RECENT_DREAMS, 'fresh/fallback');
    const candidates = testSeeds(6, 'fresh/fallback-candidates');
    const nearest = (seed: DreamSeed) =>
      Math.min(...recent.map((other) => profileDistance(profileOfSeed(seed), profileOfSeed(other))));
    const farthest = candidates.reduce((best, seed) => (nearest(seed) > nearest(best) ? seed : best));
    // Nobody can be 2 apart: the fallback decides.
    expect(chooseFreshSeed(candidates, recent, { minDistance: 2 })).toBe(farthest);
  });

  it('is pure', () => {
    const recent = testSeeds(3, 'fresh/pure');
    const candidates = testSeeds(10, 'fresh/pure-candidates');
    expect(chooseFreshSeed(candidates, recent)).toBe(chooseFreshSeed([...candidates], [...recent]));
  });

  it('needs a candidate', () => {
    expect(() => chooseFreshSeed([], [])).toThrow(RangeError);
  });
});
