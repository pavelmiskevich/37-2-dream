import { describe, expect, it } from 'vitest';
import { testSeeds } from '../test-utils';
import type { Beat } from './beats';
import { CLIP_HOLD_MS, generateFilm, holdClip, MIN_SHOT_MS } from './generate';
import type { LibraryAsset } from './library';
import { TEST_LIBRARY, TEST_LIBRARY_NO_SCARES } from './test-library';

const byId = new Map(TEST_LIBRARY.assets.map((asset) => [asset.id, asset]));
const seeds = testSeeds(120, 'test/clips');
const films = seeds.flatMap((seed) => (['short', 'long'] as const).map((length) => generateFilm(seed, length, TEST_LIBRARY)));
const assetOf = (id: string): LibraryAsset => byId.get(id) as LibraryAsset;

describe('clip shots (#141)', () => {
  it('start in the middle of the clip and never run past its end', () => {
    let clips = 0;
    for (const film of films) {
      for (const shot of film.shots) {
        const asset = assetOf(shot.assetId);
        if (asset.kind !== 'clip') {
          expect(shot.clipFrom).toBeUndefined();
          continue;
        }
        clips += 1;
        const from = shot.clipFrom as number;
        expect(from).toBeGreaterThanOrEqual(0);
        expect(from + shot.duration).toBeLessThanOrEqual(asset.duration! + 1e-3);
        expect(Math.abs(from - (asset.duration! - shot.duration) / 2)).toBeLessThanOrEqual(0.001);
      }
    }
    expect(clips).toBeGreaterThan(50);
  });

  it('are held long enough to be seen moving', () => {
    const clip = films.flatMap((film) => film.shots.filter((shot) => assetOf(shot.assetId).kind === 'clip').map((shot) => shot.duration));
    const share = (seconds: number) => clip.filter((s) => s >= seconds - 1e-9).length / clip.length;
    // Before #141 about half the clips were on screen for 1.5 s and one in eight for 3 s.
    expect(share(CLIP_HOLD_MS.climax / 1000)).toBeGreaterThan(0.65);
    expect(share(CLIP_HOLD_MS.default / 1000 - 0.1)).toBeGreaterThan(0.3);
  });

  it('keeps every shot long enough and the film contiguous', () => {
    for (const film of films) {
      for (const shot of film.shots) if (!shot.scare) expect(shot.duration).toBeGreaterThanOrEqual(MIN_SHOT_MS / 1000 - 1e-9);
      for (let i = 1; i < film.shots.length; i++) {
        const prev = film.shots[i - 1]!;
        expect(film.shots[i]!.start).toBeCloseTo(prev.start + prev.duration, 6);
      }
      const last = film.shots[film.shots.length - 1]!;
      expect(last.start + last.duration).toBeCloseTo(film.duration, 6);
    }
  });

  it('leave a library without clips as it was', () => {
    const stills = { version: 1 as const, assets: TEST_LIBRARY_NO_SCARES.assets.filter((asset) => asset.kind !== 'clip') };
    for (const seed of seeds.slice(0, 20)) {
      for (const shot of generateFilm(seed, 'short', stills).shots) expect(shot.clipFrom).toBeUndefined();
    }
  });
});

describe('holdClip (#141)', () => {
  const beat = { role: 'build' } as Beat;
  const other = { role: 'climax' } as Beat;
  const slots = (...ms: number[]) => {
    let start = 0;
    return ms.map((length, i) => {
      const slot = { beat: i < 3 ? beat : other, start, ms: length };
      start += length;
      return slot;
    });
  };
  const ends = (timed: { start: number; ms: number }[]) => timed.map((slot) => slot.start + slot.ms);

  it('takes the time from the next shot of the beat', () => {
    const timed = slots(1200, 2500, 2000, 1000);
    expect(holdClip(timed, 0, 3000, 5000, timed.length)).toBe(0);
    expect(timed.map((slot) => slot.ms)).toEqual([3000, 700, 2000, 1000]);
    expect(ends(timed)).toEqual([3000, 3700, 5700, 6700]);
  });

  it('takes a short neighbour whole and goes on to the next one', () => {
    const timed = slots(1200, 900, 2000, 1000);
    expect(holdClip(timed, 0, 3000, 5000, timed.length)).toBe(1);
    expect(timed.map((slot) => slot.ms)).toEqual([3000, 1100, 1000]);
  });

  it('never reaches into another beat or past the limit, and keeps its neighbours long enough', () => {
    const timed = slots(1200, 2000, 600, 1000);
    expect(holdClip(timed, 1, 3000, 5000, timed.length)).toBe(1);
    expect(timed.map((slot) => slot.ms)).toEqual([1200, 2600, 1000]);

    const capped = slots(1200, 900, 2000);
    // The clip is too short to take the neighbour whole: it takes what leaves it at the minimum.
    expect(holdClip(capped, 0, 3000, 1800, capped.length)).toBe(0);
    expect(capped.map((slot) => slot.ms)).toEqual([1800, 300, 2000]);
    expect(capped[1]!.ms).toBeGreaterThanOrEqual(MIN_SHOT_MS);

    const fenced = slots(1200, 2500, 2000);
    expect(holdClip(fenced, 0, 3000, 5000, 1)).toBe(0);
    expect(fenced.map((slot) => slot.ms)).toEqual([1200, 2500, 2000]);
  });
});
