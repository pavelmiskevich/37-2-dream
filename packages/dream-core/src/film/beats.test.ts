import { describe, expect, it } from 'vitest';
import { generateProfile } from '../profile';
import { profileRng } from '../streams';
import { testSeeds } from '../test-utils';
import { BEAT_MS, SCARE_COUNT, filmLengthMs, planBeats, scareCount, type Beat } from './beats';
import type { DreamLength } from './film';
import { filmRng } from './streams';

const LENGTHS: readonly DreamLength[] = ['short', 'long'];

function beatsOf(seed: ReturnType<typeof testSeeds>[number], length: DreamLength, hasScares = true): Beat[] {
  const profile = generateProfile(profileRng(seed));
  const rng = filmRng(seed, length, 'beats');
  const scares = scareCount(length, profile, hasScares, rng);
  return planBeats(length, filmLengthMs(length, profile), scares, profile, rng);
}

describe.each(LENGTHS)('planBeats: %s', (length) => {
  const seeds = testSeeds(500, `test/beats/${length}`);
  const plans = seeds.map((seed) => ({ seed, beats: beatsOf(seed, length) }));

  it('tiles the film exactly, in whole milliseconds', () => {
    for (const { seed, beats } of plans) {
      const total = filmLengthMs(length, generateProfile(profileRng(seed)));
      let at = 0;
      for (const beat of beats) {
        expect(beat.start).toBe(at);
        expect(Number.isInteger(beat.duration)).toBe(true);
        expect(beat.duration).toBeGreaterThan(0);
        at += beat.duration;
      }
      expect(at).toBe(total);
    }
  });

  it('opens on an opening and ends on the climax', () => {
    for (const { beats } of plans) {
      expect(beats[0]?.role).toBe('opening');
      expect(beats[beats.length - 1]?.role).toBe('climax');
    }
  });

  it('keeps the number of scares in bounds and uses both ends of the range', () => {
    const counts = plans.map(({ beats }) => beats.filter((b) => b.role === 'scare').length);
    for (const count of counts) {
      expect(count).toBeGreaterThanOrEqual(SCARE_COUNT[length].min);
      expect(count).toBeLessThanOrEqual(SCARE_COUNT[length].max);
    }
    expect(new Set(counts).size).toBe(2);
  });

  it('builds every scare by spec §16: anticipation → false alarm → release → scare → recovery', () => {
    for (const { beats } of plans) {
      beats.forEach((beat, i) => {
        if (beat.role !== 'scare') return;
        expect(beats.slice(i - 4, i + 2).map((b) => b.role)).toEqual([
          'build',
          'anticipation',
          'false_alarm',
          'release',
          'scare',
          'recovery',
        ]);
        // The relief before the scare is short ("через 3 секунды").
        expect(beats[i - 1]!.duration).toBeLessThanOrEqual(BEAT_MS[length].release_short[1]);
        expect(beat.duration).toBeGreaterThanOrEqual(100);
        expect(beat.duration).toBeLessThanOrEqual(300);
      });
    }
  });

  it('never puts two scares in a row: a false wave cools down between them', () => {
    for (const { beats } of plans) {
      const scares = beats.flatMap((b, i) => (b.role === 'scare' ? [i] : []));
      for (let k = 1; k < scares.length; k++) {
        const between = beats.slice(scares[k - 1]! + 1, scares[k]!).map((b) => b.role);
        // The next scare's own misdirection plus at least one false wave.
        expect(between.filter((role) => role === 'false_alarm').length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('raises the tension towards the end', () => {
    for (const { beats } of plans) {
      const builds = beats.filter((b) => b.role === 'build');
      if (builds.length >= 2) expect(builds[builds.length - 1]!.tensionFrom).toBeGreaterThan(builds[0]!.tensionFrom);
      expect(beats[beats.length - 1]!.tensionTo).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('plans no scares without scare frames', () => {
    for (const seed of seeds.slice(0, 100)) {
      expect(beatsOf(seed, length, false).some((b) => b.role === 'scare')).toBe(false);
    }
  });
});

describe('filmLengthMs', () => {
  it('is exactly 37 s for the short film and 120–180 s for the long one', () => {
    for (const seed of testSeeds(300, 'test/beats/length')) {
      const profile = generateProfile(profileRng(seed));
      expect(filmLengthMs('short', profile)).toBe(37_000);
      const long = filmLengthMs('long', profile);
      expect(long).toBeGreaterThanOrEqual(120_000);
      expect(long).toBeLessThanOrEqual(180_000);
      expect(long % 100).toBe(0);
    }
  });
});
