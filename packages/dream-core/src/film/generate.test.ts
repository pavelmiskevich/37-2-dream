import { describe, expect, it } from 'vitest';
import { generateDream } from '../dream';
import { generateProfile } from '../profile';
import { DREAM_MOTIFS } from '../scenes';
import { normalizeSeed, type DreamSeed } from '../seed';
import { profileRng } from '../streams';
import { testSeeds } from '../test-utils';
import { ENGINE_VERSION } from '../version';
import { SCARE_COUNT } from './beats';
import { MAX_LOCATION_RUN, assetCooldown } from './cast';
import { DREAM_LENGTH_SECONDS, FILM_SOUNDS, type DreamFilm, type DreamLength, type Shot } from './film';
import { MIN_SHOT_MS, generateFilm } from './generate';
import type { LibraryAsset, LibraryManifest, LocationTag } from './library';
import { MIN_FLASH_GAP_MS } from './look';
import { TEST_LIBRARY, TEST_LIBRARY_NO_SCARES } from './test-library';

/**
 * Fixed seeds whose films on the test library are pinned as JSON files. If a
 * change alters them, explain it in the PR and update the files with
 * `vitest run -u` (AGENTS.md, "Детерминизм").
 */
const SNAPSHOT_SEEDS = ['DREAM-8F72-A19C-37B2', 'DREAM-0000-0000-0000', 'DREAM-C0DE-BEEF-0451'].map(normalizeSeed);
const LENGTHS: readonly DreamLength[] = ['short', 'long'];

const assets = new Map(TEST_LIBRARY.assets.map((asset) => [asset.id, asset]));
const assetOf = (shot: Shot): LibraryAsset => assets.get(shot.assetId)!;
const ms = (seconds: number): number => Math.round(seconds * 1000);

const seeds = testSeeds(1000, 'test/film-seeds');
const films: Record<DreamLength, DreamFilm[]> = {
  short: seeds.map((seed) => generateFilm(seed, 'short', TEST_LIBRARY)),
  long: seeds.map((seed) => generateFilm(seed, 'long', TEST_LIBRARY)),
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

// A thousand films of each length are checked; give the slow CI machine room.
const SLOW = 60_000;

describe('generateFilm: purity', () => {
  it('gives deeply equal films for the same seed and length, regardless of what ran in between', () => {
    for (const length of LENGTHS) {
      const first = generateFilm(SNAPSHOT_SEEDS[0]!, length, TEST_LIBRARY);
      for (const other of SNAPSHOT_SEEDS.slice(1)) generateFilm(other, length, TEST_LIBRARY);
      expect(generateFilm(SNAPSHOT_SEEDS[0]!, length, TEST_LIBRARY)).toEqual(first);
    }
  });

  it('reads the library without changing it', () => {
    const frozen = deepFreeze(JSON.parse(JSON.stringify(TEST_LIBRARY)) as LibraryManifest);
    expect(generateFilm(SNAPSHOT_SEEDS[1]!, 'long', frozen)).toEqual(generateFilm(SNAPSHOT_SEEDS[1]!, 'long', TEST_LIBRARY));
  });

  it('survives a JSON round trip unchanged', () => {
    const film = generateFilm(SNAPSHOT_SEEDS[2]!, 'long', TEST_LIBRARY);
    expect(JSON.parse(JSON.stringify(film))).toEqual(film);
  });

  it('does not change the scene graph of the same seed', () => {
    const before = generateDream(SNAPSHOT_SEEDS[0]!);
    generateFilm(SNAPSHOT_SEEDS[0]!, 'short', TEST_LIBRARY);
    expect(generateDream(SNAPSHOT_SEEDS[0]!)).toEqual(before);
  });

  for (const length of LENGTHS) {
    it.each(SNAPSHOT_SEEDS)(`matches the pinned ${length} film for %s`, async (seed) => {
      const json = `${JSON.stringify(generateFilm(seed, length, TEST_LIBRARY), null, 2)}\n`;
      await expect(json).toMatchFileSnapshot(`../__snapshots__/films/${seed}-${length}.json`);
    });
  }
});

describe.each(LENGTHS)('generateFilm: structure of %s films', { timeout: SLOW }, (length) => {
  const list = films[length];

  it('records the seed, length, engine version and the profile of the scene graph', () => {
    list.slice(0, 50).forEach((film, i) => {
      expect(film.seed).toBe(seeds[i]);
      expect(film.length).toBe(length);
      expect(film.engineVersion).toBe(ENGINE_VERSION);
      expect(film.profile).toEqual(generateProfile(profileRng(seeds[i] as DreamSeed)));
    });
  });

  it('lasts exactly 37 s (short) or 120–180 s (long), and the shots tile it', () => {
    for (const film of list) {
      const { min, max } = DREAM_LENGTH_SECONDS[length];
      expect(film.duration).toBeGreaterThanOrEqual(min);
      expect(film.duration).toBeLessThanOrEqual(max);
      let at = 0;
      film.shots.forEach((shot, index) => {
        expect(shot.index).toBe(index);
        expect(ms(shot.start)).toBe(at);
        at += ms(shot.duration);
      });
      expect(at).toBe(ms(film.duration));
    }
  });

  it('casts scare frames only as scares, 100–300 ms long, and keeps their count in bounds', () => {
    for (const film of list) {
      const scares = film.shots.filter((shot) => shot.scare);
      expect(scares.length).toBeGreaterThanOrEqual(SCARE_COUNT[length].min);
      expect(scares.length).toBeLessThanOrEqual(SCARE_COUNT[length].max);
      for (const shot of film.shots) {
        expect(assetOf(shot).tags.mood === 'scare').toBe(shot.scare);
        if (shot.scare) {
          expect(ms(shot.duration)).toBeGreaterThanOrEqual(100);
          expect(ms(shot.duration)).toBeLessThanOrEqual(300);
        } else {
          expect(ms(shot.duration)).toBeGreaterThanOrEqual(MIN_SHOT_MS);
        }
      }
    }
  });

  it('precedes every scare with waiting: a held shot, a misdirection, a short relief and silence', () => {
    let scares = 0;
    for (const film of list) {
      film.shots.forEach((shot, i) => {
        if (!shot.scare) return;
        scares++;
        const [held, misdirection, relief] = film.shots.slice(i - 3, i);
        expect(held!.duration).toBeGreaterThanOrEqual(2);
        expect(misdirection!.duration).toBeLessThanOrEqual(1);
        expect(relief!.duration).toBeGreaterThanOrEqual(1.5);
        expect(relief!.cutOut).toBe('hard');
        const hush = film.sounds.find((c) => c.sound === 'silence' && c.action === 'start' && c.at < shot.start && c.at >= relief!.start);
        expect(hush).toBeDefined();
        expect(film.sounds).toContainEqual({ at: shot.start, sound: 'stinger', action: 'hit', params: { volume: 1 } });
      });
    }
    expect(scares).toBeGreaterThan(0);
  });

  it('hits the stinger only on scares', () => {
    for (const film of list) {
      const starts = film.shots.filter((shot) => shot.scare).map((shot) => shot.start);
      const stingers = film.sounds.filter((c) => c.sound === 'stinger').map((c) => c.at);
      expect(stingers).toEqual(starts);
    }
  });

  it('cuts sensibly: hard cuts take no time, transitions fit both neighbours, the film ends on a blink or fade', () => {
    for (const film of list) {
      film.shots.forEach((shot, i) => {
        const next = film.shots[i + 1];
        if (shot.cutOut === 'hard') expect(shot.cutDuration).toBe(0);
        else {
          expect(shot.cutDuration).toBeGreaterThan(0);
          expect(ms(shot.cutDuration)).toBeLessThanOrEqual(0.4 * Math.min(ms(shot.duration), ms(next?.duration ?? shot.duration)) + 1);
        }
        if (next?.scare || shot.scare) expect(shot.cutOut).toBe('hard');
      });
      expect(['blink', 'fade', 'hard']).toContain(film.shots[film.shots.length - 1]!.cutOut);
    }
  });

  it('keeps flashes and scares at least a second apart (D-009)', () => {
    for (const film of list) {
      const flashes = film.shots
        .flatMap((shot) => [
          ...(shot.cutOut === 'flash' ? [ms(shot.start + shot.duration)] : []),
          ...(shot.scare ? [ms(shot.start)] : []),
        ])
        .sort((a, b) => a - b);
      for (let k = 1; k < flashes.length; k++) {
        expect(flashes[k]! - flashes[k - 1]!).toBeGreaterThanOrEqual(MIN_FLASH_GAP_MS);
      }
    }
  });

  it('moves the camera inside the frame and keeps the look in 0…1', () => {
    for (const film of list.slice(0, 200)) {
      for (const shot of film.shots) {
        const { zoomFrom, zoomTo, panFrom, panTo, sway } = shot.camera;
        expect(Math.min(zoomFrom, zoomTo)).toBeGreaterThanOrEqual(1);
        const limit = 1 - 1 / Math.min(zoomFrom, zoomTo);
        for (const v of [...panFrom, ...panTo]) expect(Math.abs(v)).toBeLessThanOrEqual(limit + 1e-9);
        for (const v of [sway, shot.parallax, ...Object.values(shot.look)]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
        if (assetOf(shot).depth === undefined) expect(shot.parallax).toBe(0);
      }
    }
  });

  it('burns hotter towards the end: fever follows the tension', () => {
    let hotter = 0;
    for (const film of list) {
      const quarter = film.duration / 4;
      const fever = (from: number, to: number): number => {
        const shots = film.shots.filter((s) => !s.scare && s.start >= from && s.start < to);
        return shots.reduce((sum, s) => sum + s.look.fever, 0) / shots.length;
      };
      if (fever(quarter * 3, film.duration) > fever(0, quarter)) hotter++;
    }
    expect(hotter / list.length).toBeGreaterThan(0.95);
  });

  it('orders sound cues in time, inside the film, with parameters in 0…1', () => {
    for (const film of list) {
      const bad = film.sounds.filter(
        (cue, i) =>
          !FILM_SOUNDS.includes(cue.sound) ||
          cue.at < 0 ||
          cue.at > film.duration ||
          (i > 0 && cue.at < film.sounds[i - 1]!.at) ||
          Object.values(cue.params ?? {}).some((v) => !(v >= 0 && v <= 1)),
      );
      expect(bad).toEqual([]);
      expect(film.sounds[0]).toEqual({ at: 0, sound: 'hum', action: 'start', params: expect.any(Object) });
    }
  });

  it('often starts a sound before the cut to the shot that shows its source', () => {
    let early = 0;
    let total = 0;
    for (const film of list) {
      for (const cue of film.sounds) {
        if (cue.action !== 'start' || !['monitor', 'ventilator', 'vacuum'].includes(cue.sound)) continue;
        total++;
        const cut = film.shots.some((s) => s.start > cue.at && s.start - cue.at <= 2);
        if (cut) early++;
      }
    }
    expect(early / total).toBeGreaterThan(0.6);
  });

  it('records every intrusion where its motif sounds, in time order (D-020)', () => {
    for (const film of list) {
      film.intrusions.forEach((intrusion, i) => {
        expect(DREAM_MOTIFS).toContain(intrusion.motif);
        if (i > 0) expect(intrusion.at).toBeGreaterThanOrEqual(film.intrusions[i - 1]!.at);
        const sounding = film.sounds.some(
          (c) => c.sound === intrusion.motif && c.at === intrusion.at && (c.action === 'start' || c.action === 'hit'),
        );
        expect(sounding).toBe(true);
      });
      for (const bed of ['monitor', 'ventilator', 'vacuum'] as const) {
        const started = film.sounds.some((c) => c.sound === bed && c.action === 'start');
        expect(film.intrusions.some((x) => x.motif === bed)).toBe(started);
      }
    }
  });

  it('wakes up as the scene graph plans it (D-020)', () => {
    for (const film of list) {
      expect(['tea_brought', 'unknown']).toContain(film.awakening.reason);
      expect(film.awakening.temperature).toBe(36.9);
      const kitchen = film.sounds.some((c) => c.sound === 'kitchen');
      expect(kitchen).toBe(film.awakening.reason === 'tea_brought');
    }
    expect(new Set(list.map((film) => film.awakening.reason)).size).toBe(2);
  });
});

describe('generateFilm: the edit', { timeout: SLOW }, () => {
  const frames = TEST_LIBRARY.assets.filter((asset) => asset.tags.mood !== 'scare').length;

  it.each(LENGTHS)('rests every asset for a while before reusing it (%s)', (length) => {
    const cooldown = assetCooldown(frames);
    for (const film of films[length]) {
      const lastSeen = new Map<string, number>();
      film.shots.forEach((shot, i) => {
        if (shot.scare) return;
        const last = lastSeen.get(shot.assetId);
        if (last !== undefined) expect(i - last).toBeGreaterThan(cooldown);
        lastSeen.set(shot.assetId, i);
      });
    }
  });

  it.each(LENGTHS)('stays in a location for at most a few shots (%s)', (length) => {
    for (const film of films[length]) {
      let run = 0;
      let location: LocationTag | undefined;
      for (const shot of film.shots) {
        if (shot.scare) continue;
        const here = assetOf(shot).tags.location;
        run = here === location ? run + 1 : 1;
        location = here;
        expect(run).toBeLessThanOrEqual(MAX_LOCATION_RUN);
      }
    }
  });

  it.each(LENGTHS)('gives 1000 seeds noticeably different films (%s)', (length) => {
    const list = films[length];
    const order = new Set(list.map((film) => film.shots.map((s) => s.assetId).join(' ')));
    const opening = new Set(list.map((film) => film.shots.slice(0, 5).map((s) => s.assetId).join(' ')));
    const route = new Set(
      list.map((film) =>
        film.shots
          .map((s) => assetOf(s).tags.location)
          .filter((loc, i, all) => loc !== all[i - 1])
          .join(' '),
      ),
    );
    expect(order.size).toBe(list.length);
    expect(opening.size).toBeGreaterThan(list.length * 0.95);
    expect(route.size).toBeGreaterThan(list.length * 0.98);

    // No location dominates the first shot; most of them open some film.
    const first = new Map<LocationTag, number>();
    for (const film of list) {
      const loc = assetOf(film.shots[0]!).tags.location;
      first.set(loc, (first.get(loc) ?? 0) + 1);
    }
    expect(first.size).toBeGreaterThanOrEqual(7);
    expect(Math.max(...first.values())).toBeLessThan(list.length * 0.35);
  });

  it('leans on the profile: medicine, Soviet yards, anxiety (spec §4)', () => {
    const all = [...films.short, ...films.long];
    const share = (film: DreamFilm, locations: readonly LocationTag[]): number =>
      film.shots.filter((s) => locations.includes(assetOf(s).tags.location)).length / film.shots.length;
    const mean = (list: readonly DreamFilm[], f: (film: DreamFilm) => number): number =>
      list.reduce((sum, film) => sum + f(film), 0) / list.length;
    const high = (key: 'medicalIntensity' | 'sovietIntensity' | 'anxiety') => all.filter((f) => f.profile[key] > 0.7);
    const low = (key: 'medicalIntensity' | 'sovietIntensity' | 'anxiety') => all.filter((f) => f.profile[key] < 0.3);

    const medical = (film: DreamFilm): number => share(film, ['hospital_corridor', 'thermometer_corridor']);
    expect(mean(high('medicalIntensity'), medical)).toBeGreaterThan(1.4 * mean(low('medicalIntensity'), medical));

    const soviet = (film: DreamFilm): number => share(film, ['yard', 'stairwell']);
    expect(mean(high('sovietIntensity'), soviet)).toBeGreaterThan(1.4 * mean(low('sovietIntensity'), soviet));

    // Anxious dreams cut faster.
    const shotLength = (film: DreamFilm): number => film.duration / film.shots.length;
    const short = (list: DreamFilm[]): DreamFilm[] => list.filter((f) => f.length === 'short');
    expect(mean(short(high('anxiety')), shotLength)).toBeLessThan(0.85 * mean(short(low('anxiety')), shotLength));
  });

  it('shows clips no longer than they last', () => {
    for (const film of [...films.short, ...films.long]) {
      for (const shot of film.shots) {
        const asset = assetOf(shot);
        if (asset.kind === 'clip') expect(shot.duration).toBeLessThanOrEqual(asset.duration!);
      }
    }
  });
});

describe('generateFilm: libraries', { timeout: SLOW }, () => {
  it('makes a film without scares from a library without scare frames', () => {
    for (const seed of seeds.slice(0, 100)) {
      for (const length of LENGTHS) {
        const film = generateFilm(seed, length, TEST_LIBRARY_NO_SCARES);
        expect(film.shots.some((s) => s.scare)).toBe(false);
        expect(film.sounds.some((c) => c.sound === 'stinger')).toBe(false);
        expect(ms(film.shots.reduce((sum, s) => sum + s.duration, 0))).toBe(ms(film.duration));
      }
    }
  });

  it('copes with a tiny library without showing the same frame twice in a row', () => {
    const tiny: LibraryManifest = { version: 1, assets: TEST_LIBRARY.assets.filter((a) => a.id.startsWith('yard-')) };
    for (const seed of seeds.slice(0, 50)) {
      const film = generateFilm(seed, 'long', tiny);
      film.shots.forEach((shot, i) => {
        if (i > 0) expect(shot.assetId).not.toBe(film.shots[i - 1]!.assetId);
      });
    }
  });

  it('refuses a library with nothing to show', () => {
    expect(() => generateFilm(SNAPSHOT_SEEDS[0]!, 'short', { version: 1, assets: [] })).toThrow(RangeError);
    const onlyScares = { version: 1 as const, assets: TEST_LIBRARY.assets.filter((a) => a.tags.mood === 'scare') };
    expect(() => generateFilm(SNAPSHOT_SEEDS[0]!, 'short', onlyScares)).toThrow(RangeError);
  });
});
