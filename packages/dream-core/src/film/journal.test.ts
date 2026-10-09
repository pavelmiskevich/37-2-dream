import { describe, expect, it } from 'vitest';
import { MOTIF_SOURCES } from '../scenes';
import { normalizeSeed } from '../seed';
import { testSeeds } from '../test-utils';
import { generateFilm } from './generate';
import { OBJECT_LOCATIONS, heardInFilm, summarizeFilm } from './journal';
import type { LibraryManifest } from './library';
import { TEST_LIBRARY } from './test-library';

const SEED = normalizeSeed('DREAM-8F72-A19C-37B2');
const assets = new Map(TEST_LIBRARY.assets.map((asset) => [asset.id, asset]));

describe('summarizeFilm', () => {
  it('is pure and does not change the film', () => {
    const film = generateFilm(SEED, 'long', TEST_LIBRARY);
    const copy = JSON.parse(JSON.stringify(film)) as typeof film;
    const first = summarizeFilm(film, TEST_LIBRARY);
    summarizeFilm(generateFilm(normalizeSeed('DREAM-0000-0000-0000'), 'short', TEST_LIBRARY), TEST_LIBRARY);
    expect(summarizeFilm(film, TEST_LIBRARY)).toEqual(first);
    expect(film).toEqual(copy);
    expect(generateFilm(SEED, 'long', TEST_LIBRARY)).toEqual(copy);
  });

  it('states the premise, the awakening and the length of the film', () => {
    for (const length of ['short', 'long'] as const) {
      const film = generateFilm(SEED, length, TEST_LIBRARY);
      const summary = summarizeFilm(film, TEST_LIBRARY);
      expect(summary.seed).toBe(SEED);
      expect(summary.length).toBe(length);
      expect(summary.engineVersion).toBe(film.engineVersion);
      expect(summary.temperature).toEqual({ asleep: 37.2, awake: 36.9 });
      expect(summary.duration).toBe(film.duration);
      expect(summary.shots).toBe(film.shots.length);
      expect(summary.scares).toBe(film.shots.filter((shot) => shot.scare).length);
      expect(summary.wakeReason).toBe(film.awakening.reason);
    }
  });

  it('lists every location shown once, in order of first appearance', () => {
    for (const seed of testSeeds(50, 'test/film-journal')) {
      const film = generateFilm(seed, 'long', TEST_LIBRARY);
      const expected: string[] = [];
      for (const shot of film.shots) {
        const location = assets.get(shot.assetId)!.tags.location;
        if (!expected.includes(location)) expected.push(location);
      }
      expect(summarizeFilm(film, TEST_LIBRARY).locations).toEqual(expected);
    }
  });

  it('picks the strangest object among the things the film showed', () => {
    for (const seed of testSeeds(100, 'test/film-journal')) {
      const film = generateFilm(seed, 'short', TEST_LIBRARY);
      const shown = film.shots.map((shot) => assets.get(shot.assetId)!.tags);
      const object = summarizeFilm(film, TEST_LIBRARY).strangestObject;
      const nameable = shown.some((tags) => tags.motifs.length > 0 || OBJECT_LOCATIONS.includes(tags.location));
      if (!object) expect(nameable).toBe(false);
      else if (object.kind === 'motif') expect(shown.some((tags) => tags.motifs.includes(object.motif))).toBe(true);
      else {
        expect(OBJECT_LOCATIONS).toContain(object.location);
        expect(shown.some((tags) => tags.location === object.location)).toBe(true);
      }
    }
  });

  it('reveals the sources of the sounds the film recorded', () => {
    for (const seed of testSeeds(50, 'test/film-journal')) {
      const film = generateFilm(seed, 'long', TEST_LIBRARY);
      const heard = summarizeFilm(film, TEST_LIBRARY).heard;
      expect(heard.map((entry) => entry.motif)).toEqual([...new Set(film.intrusions.map((intrusion) => intrusion.motif))]);
      for (const entry of heard) {
        const all = film.intrusions.filter((intrusion) => intrusion.motif === entry.motif);
        expect(entry.source).toBe(MOTIF_SOURCES[entry.motif]);
        expect(entry.count).toBe(all.length);
        expect(entry.firstAt).toBe(all[0]!.at);
      }
    }
  });

  it('skips shots whose asset is not in the library', () => {
    const film = generateFilm(SEED, 'short', TEST_LIBRARY);
    const empty: LibraryManifest = { version: 1, assets: [] };
    const summary = summarizeFilm(film, empty);
    expect(summary.locations).toEqual([]);
    expect(summary.strangestObject).toBeNull();
    expect(summary.heard).toEqual(heardInFilm(film));
  });
});
