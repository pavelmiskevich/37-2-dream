import { DREAM_LENGTH_SECONDS, FILM_SOUNDS, normalizeSeed, type LibraryManifest } from '@dream/core';
import { describe, expect, it } from 'vitest';
import manifestJson from '../../public/film-fixture/library.json?raw';
import { fixtureFilm } from './fixture';

const manifest = JSON.parse(manifestJson) as LibraryManifest;
const SEED = normalizeSeed('DREAM-8F72-A19C-37B2');

describe('fixtureFilm', () => {
  it('cuts a 37-second film with every kind of cut and one scare', () => {
    const film = fixtureFilm(SEED, 'short', manifest);
    expect(film.duration).toBeCloseTo(DREAM_LENGTH_SECONDS.short.max, 9);
    expect(new Set(film.shots.map((shot) => shot.cutOut))).toEqual(new Set(['hard', 'fade', 'flash', 'blink']));
    expect(film.shots.filter((shot) => shot.scare)).toHaveLength(1);
    expect(film.sounds.some((cue) => cue.sound === 'stinger')).toBe(true);
  });

  it('lays shots end to end and only uses library assets and known sounds', () => {
    for (const length of ['short', 'long'] as const) {
      const film = fixtureFilm(SEED, length, manifest);
      let start = 0;
      for (const shot of film.shots) {
        expect(shot.start).toBeCloseTo(start, 9);
        start += shot.duration;
        expect(manifest.assets.some((asset) => asset.id === shot.assetId)).toBe(true);
      }
      expect(film.duration).toBeCloseTo(start, 9);
      for (const cue of film.sounds) expect(FILM_SOUNDS).toContain(cue.sound);
    }
  });

  it('runs 2–3 minutes long with two scares', () => {
    const film = fixtureFilm(SEED, 'long', manifest);
    expect(film.duration).toBeGreaterThanOrEqual(DREAM_LENGTH_SECONDS.long.min);
    expect(film.duration).toBeLessThanOrEqual(DREAM_LENGTH_SECONDS.long.max);
    expect(film.shots.filter((shot) => shot.scare)).toHaveLength(2);
    expect(film.sounds.filter((cue) => cue.sound === 'stinger')).toHaveLength(2);
  });

  it('is the same for the same seed and differs for another', () => {
    expect(fixtureFilm(SEED, 'short', manifest)).toEqual(fixtureFilm(SEED, 'short', manifest));
    const other = fixtureFilm(normalizeSeed('DREAM-0000-0000-0001'), 'short', manifest);
    expect(other.shots.map((shot) => shot.camera)).not.toEqual(fixtureFilm(SEED, 'short', manifest).shots.map((s) => s.camera));
  });
});
