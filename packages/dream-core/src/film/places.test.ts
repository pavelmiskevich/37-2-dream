import { describe, expect, it } from 'vitest';
import { generateProfile } from '../profile';
import { createSeededRng } from '../rng';
import { profileRng } from '../streams';
import { testSeeds } from '../test-utils';
import { MAX_USES, castFrames } from './cast';
import { generateFilm } from './generate';
import { LOCATION_TAGS, isWakingFrame, subjectsOf, type LibraryAsset, type LibraryManifest, type LocationTag } from './library';
import { DREAM_PLACES, planPlaces } from './places';
import { filmRng } from './streams';
import { TEST_LIBRARY } from './test-library';

/** Test library with every location five times over: enough frames for the dream to keep to a few. */
const WIDE: LibraryManifest = {
  version: 1,
  assets: TEST_LIBRARY.assets.flatMap((asset) =>
    asset.tags.mood === 'scare' ? [asset] : [0, 1, 2, 3, 4].map((n): LibraryAsset => ({ ...asset, id: `${asset.id}-${n}` })),
  ),
};
const byId = new Map(WIDE.assets.map((asset) => [asset.id, asset]));
const seeds = testSeeds(120, 'test/places');
const profileOf = (seed: (typeof seeds)[number]) => generateProfile(profileRng(seed));
const placesOf = (seed: (typeof seeds)[number], length: 'short' | 'long') =>
  planPlaces(profileOf(seed), WIDE.assets, length, filmRng(seed, length, 'places'));

describe('planPlaces (#77)', () => {
  it('keeps to a few locations, in tag order', () => {
    for (const seed of seeds) {
      for (const length of ['short', 'long'] as const) {
        const places = placesOf(seed, length) as LocationTag[];
        const [min, max] = DREAM_PLACES.count[length];
        expect(places.length).toBeGreaterThanOrEqual(min);
        expect(places.length).toBeLessThanOrEqual(max);
        expect(places).toEqual(LOCATION_TAGS.filter((location) => places.includes(location)));
      }
    }
  });

  it('takes more locations when they have too few frames, and all of a small library', () => {
    for (const seed of seeds.slice(0, 40)) {
      const places = planPlaces(profileOf(seed), TEST_LIBRARY.assets, 'short', filmRng(seed, 'short', 'places'));
      if (places === undefined) continue;
      const frames = castFrames(TEST_LIBRARY.assets).filter((asset) => places.includes(asset.tags.location));
      expect(frames.length).toBeGreaterThanOrEqual(DREAM_PLACES.minFrames.short);
    }
    const two = TEST_LIBRARY.assets.filter((asset) => asset.tags.location === 'yard' || asset.tags.location === 'stairs');
    expect(planPlaces(profileOf(seeds[0]!), two, 'long', createSeededRng('places/two'))).toBeUndefined();
  });

  it('draws the same number of times whatever the library', () => {
    const profile = profileOf(seeds[0]!);
    for (const assets of [WIDE.assets, TEST_LIBRARY.assets.slice(0, 3)]) {
      const a = createSeededRng('places/draws');
      planPlaces(profile, assets, 'short', a);
      const b = createSeededRng('places/draws');
      for (let i = 0; i <= LOCATION_TAGS.length; i++) b.next();
      expect(a.next()).toBe(b.next());
    }
  });

  it('leans to the places of the profile', () => {
    const medical = (places: LocationTag[]) => places.includes('hospital_corridor') || places.includes('thermometer_corridor');
    const share = (list: typeof seeds) => list.filter((seed) => medical(placesOf(seed, 'short') as LocationTag[])).length / list.length;
    const many = testSeeds(600, 'test/places/lean');
    const high = many.filter((seed) => profileOf(seed).medicalIntensity > 0.7);
    const low = many.filter((seed) => profileOf(seed).medicalIntensity < 0.3);
    expect(share(high)).toBeGreaterThan(share(low) + 0.15);
  });
});

describe('a dream in its places (#77)', () => {
  const films = seeds.map((seed) => generateFilm(seed, 'long', WIDE));

  it('casts its ordinary shots from its own places only', () => {
    for (const film of films) {
      const places = placesOf(film.seed, 'long') as LocationTag[];
      const heights = film.ending === 'fall' ? 3 : 0;
      for (const shot of film.shots.slice(0, film.shots.length - heights)) {
        if (!shot.scare) expect(places).toContain(byId.get(shot.assetId)!.tags.location);
      }
    }
  });

  it('differs from another dream in where it happens', () => {
    const where = films.map((film) => new Set(film.shots.filter((shot) => !shot.scare).map((shot) => byId.get(shot.assetId)!.tags.location)));
    let overlap = 0;
    for (let i = 0; i + 1 < where.length; i += 2) {
      const a = where[i]!;
      const b = where[i + 1]!;
      const shared = [...a].filter((location) => b.has(location)).length;
      overlap += shared / (a.size + b.size - shared);
    }
    expect(overlap / (where.length / 2)).toBeLessThan(0.7);
  });

  it('shows no frame more than MAX_USES times', () => {
    for (const film of films) {
      const uses = new Map<string, number>();
      for (const shot of film.shots) if (!shot.scare) uses.set(shot.assetId, (uses.get(shot.assetId) ?? 0) + 1);
      expect(Math.max(...uses.values())).toBeLessThanOrEqual(MAX_USES);
    }
  });
});

/** The wide library where every frame and scare has two more variants of its subject (#155). */
const VARIED: LibraryManifest = {
  version: 1,
  assets: WIDE.assets.flatMap((asset) =>
    isWakingFrame(asset) ? [asset] : [asset, ...[2, 3].map((n): LibraryAsset => ({ ...asset, id: `${asset.id}-${n}` }))],
  ),
};

describe('variants of one subject (#158)', () => {
  const subjects = subjectsOf(VARIED.assets);
  const subjectOf = (id: string): string => subjects.get(id)!;
  const films = seeds.flatMap((seed) => [generateFilm(seed, 'short', VARIED), generateFilm(seed, 'long', VARIED)]);

  it('knows a variant only by an asset of the same kind without the suffix', () => {
    const still = (id: string, kind: 'still' | 'clip' = 'still'): LibraryAsset => ({ ...TEST_LIBRARY.assets[0]!, id, kind });
    const known = subjectsOf([still('stairs-down-37'), still('yard-swing'), still('yard-swing-2'), still('yard-swing-3', 'clip'), still('clip-a-2', 'clip')]);
    expect(Object.fromEntries(known)).toEqual({
      'stairs-down-37': 'stairs-down-37',
      'yard-swing': 'yard-swing',
      'yard-swing-2': 'yard-swing',
      'yard-swing-3': 'yard-swing-3',
      'clip-a-2': 'clip-a-2',
    });
  });

  it('shows no subject more than MAX_USES times, whichever variants it takes', () => {
    for (const film of films) {
      const uses = new Map<string, number>();
      for (const shot of film.shots) if (!shot.scare) uses.set(subjectOf(shot.assetId), (uses.get(subjectOf(shot.assetId)) ?? 0) + 1);
      expect(Math.max(...uses.values())).toBeLessThanOrEqual(MAX_USES);
    }
  });

  it('never cuts from a subject to another variant of it', () => {
    for (const film of films) {
      const shots = film.shots.filter((shot) => !shot.scare);
      for (let i = 1; i < shots.length; i++) expect(subjectOf(shots[i]!.assetId)).not.toBe(subjectOf(shots[i - 1]!.assetId));
    }
  });

  it('makes every scare a new subject while the library has any left (#75)', () => {
    const library = new Set(VARIED.assets.filter((asset) => asset.tags.mood === 'scare').map((asset) => subjectOf(asset.id))).size;
    let several = 0;
    for (const film of films) {
      const scares = film.shots.filter((shot) => shot.scare).map((shot) => subjectOf(shot.assetId));
      if (scares.length > 1) several++;
      expect(new Set(scares).size).toBe(Math.min(scares.length, library));
    }
    expect(several).toBeGreaterThan(0);
  });
});
