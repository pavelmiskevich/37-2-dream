import { describe, expect, it } from 'vitest';
import { generateProfile } from '../profile';
import { createSeededRng } from '../rng';
import { profileRng } from '../streams';
import { testSeeds } from '../test-utils';
import { FALL_ENDING, fallEndingChance, fallFrames, planEnding } from './ending';
import { generateFilm } from './generate';
import type { LibraryAsset, LibraryManifest } from './library';
import { TEST_LIBRARY } from './test-library';

/** Test library plus heights: a roof, a stairwell gap, an elevator shaft, a balcony. */
const HEIGHTS: LibraryAsset[] = (
  [
    ['fall-roof', 'yard', 'dread', 'dusk'],
    ['fall-gap', 'stairs', 'uneasy', 'interior'],
    ['fall-shaft', 'elevator', 'dread', 'interior'],
    ['fall-balcony', 'yard', 'uneasy', 'night'],
  ] as const
).map(([id, location, mood, time], i) => ({
  id,
  kind: 'still',
  file: `stills/${id}.webp`,
  depth: `depth/${id}.png`,
  width: 1280,
  height: 720,
  tags: { location, motifs: ['fall'], people: 'none', mood, time },
  generation: { model: 'm', license: 'Apache-2.0', prompt: id, seed: 9000 + i, source: 'test' },
}));
const WITH_HEIGHTS: LibraryManifest = { version: 1, assets: [...TEST_LIBRARY.assets, ...HEIGHTS] };
const isHeight = new Set(HEIGHTS.map((asset) => asset.id));

const seeds = testSeeds(150, 'test/ending');

describe('fall ending (#134)', () => {
  it('needs enough heights in the library', () => {
    expect(fallFrames(TEST_LIBRARY.assets)).toEqual([]);
    expect(fallFrames(WITH_HEIGHTS.assets)).toHaveLength(HEIGHTS.length);
    const two: LibraryManifest = { version: 1, assets: [...TEST_LIBRARY.assets, ...HEIGHTS.slice(0, FALL_ENDING.minFrames - 1)] };
    for (const seed of seeds.slice(0, 40)) {
      expect(generateFilm(seed, 'short', TEST_LIBRARY).ending).toBe('quiet');
      expect(generateFilm(seed, 'short', two).ending).toBe('quiet');
    }
  });

  it('draws once whatever the library, so it moves no other stream', () => {
    const profile = generateProfile(profileRng(seeds[0]!));
    for (const assets of [TEST_LIBRARY.assets, WITH_HEIGHTS.assets]) {
      const a = createSeededRng('ending/draws');
      planEnding(profile, assets, a);
      const b = createSeededRng('ending/draws');
      b.next();
      expect(a.next()).toBe(b.next());
    }
  });

  it('is likelier the more physics the dream has', () => {
    const low = { ...generateProfile(profileRng(seeds[0]!)), physicsInstability: 0 };
    const high = { ...low, physicsInstability: 1 };
    expect(fallEndingChance(low)).toBeCloseTo(FALL_ENDING.chance[0]);
    expect(fallEndingChance(high)).toBeCloseTo(FALL_ENDING.chance[1]);

    const films = seeds.map((seed) => generateFilm(seed, 'long', WITH_HEIGHTS));
    const falls = films.filter((film) => film.ending === 'fall');
    expect(falls.length).toBeGreaterThan(0);
    expect(falls.length).toBeLessThan(films.length / 2);
    const meanPhysics = (list: typeof films) => list.reduce((sum, film) => sum + film.profile.physicsInstability, 0) / list.length;
    expect(meanPhysics(falls)).toBeGreaterThan(meanPhysics(films.filter((film) => film.ending === 'quiet')));
  });

  it('ends in heights, falling in and cut off', () => {
    let checked = 0;
    for (const seed of seeds) {
      for (const length of ['short', 'long'] as const) {
        const film = generateFilm(seed, length, WITH_HEIGHTS);
        if (film.ending !== 'fall') continue;
        checked += 1;
        const tail = film.shots.slice(-FALL_ENDING.shots);
        for (const shot of tail) {
          expect(isHeight.has(shot.assetId), `${seed} ${length} #${shot.index}`).toBe(true);
          expect(shot.scare).toBe(false);
        }
        const zooms = tail.map((shot) => shot.camera.zoomTo);
        expect([...zooms].sort((a, b) => a - b)).toEqual(zooms);
        expect(tail.slice(0, -1).map((shot) => shot.camera.kind)).toEqual(tail.slice(0, -1).map(() => 'push'));
        const last = film.shots[film.shots.length - 1]!;
        // The last height is the fall itself (#137).
        expect(last.camera).toMatchObject({ kind: 'fall', zoomTo: FALL_ENDING.plunge.zoomTo });
        expect(last.cutOut).toBe('hard');
        expect(last.cutDuration).toBe(0);
        // The wind of the fall rises over the last height, the mix ducks, and both end at the cut.
        const wind = film.sounds.filter((cue) => cue.sound === 'fall_wind');
        expect(wind).toEqual([
          { at: last.start, sound: 'fall_wind', action: 'start' },
          { at: film.duration, sound: 'fall_wind', action: 'stop' },
        ]);
        expect(film.sounds).toContainEqual({ at: last.start, sound: 'silence', action: 'start', params: { depth: FALL_ENDING.duck } });
        const times = film.sounds.map((cue) => cue.at);
        expect([...times].sort((a, b) => a - b)).toEqual(times);
        // Two heights in a row are never the same frame.
        for (let i = 1; i < tail.length; i++) expect(tail[i]!.assetId).not.toBe(tail[i - 1]!.assetId);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('leaves the shots of a quiet ending to the edit as before', () => {
    for (const seed of seeds.slice(0, 60)) {
      const film = generateFilm(seed, 'short', WITH_HEIGHTS);
      if (film.ending === 'fall') continue;
      const last = film.shots[film.shots.length - 1]!;
      expect(last.camera.kind).not.toBe('fall');
      expect(film.sounds.some((cue) => cue.sound === 'fall_wind')).toBe(false);
    }
  });
});

describe('the last height (#134)', () => {
  it('is held long enough to fall in, and the film keeps its length', () => {
    let checked = 0;
    for (const seed of seeds) {
      const film = generateFilm(seed, 'short', WITH_HEIGHTS);
      if (film.ending !== 'fall') continue;
      checked += 1;
      const last = film.shots[film.shots.length - 1]!;
      expect(last.duration).toBeGreaterThanOrEqual(FALL_ENDING.lastMs / 1000 - 1e-9);
      expect(last.start + last.duration).toBeCloseTo(film.duration, 6);
      for (let i = 1; i < film.shots.length; i++) {
        const prev = film.shots[i - 1]!;
        expect(film.shots[i]!.start).toBeCloseTo(prev.start + prev.duration, 6);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
