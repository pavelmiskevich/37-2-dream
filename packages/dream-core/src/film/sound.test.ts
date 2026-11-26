import { describe, expect, it } from 'vitest';
import { testSeeds } from '../test-utils';
import type { DreamFilm, DreamLength } from './film';
import { generateFilm } from './generate';
import type { LibraryAsset } from './library';
import { TEST_LIBRARY } from './test-library';

const BEDS = ['monitor', 'ventilator', 'vacuum'] as const;
const byId = new Map(TEST_LIBRARY.assets.map((asset) => [asset.id, asset]));
const assetOf = (id: string): LibraryAsset => byId.get(id) as LibraryAsset;
const seeds = testSeeds(200, 'test/sound');
const films: Record<DreamLength, DreamFilm[]> = {
  short: seeds.map((seed) => generateFilm(seed, 'short', TEST_LIBRARY)),
  long: seeds.map((seed) => generateFilm(seed, 'long', TEST_LIBRARY)),
};
const bedsOf = (film: DreamFilm) => BEDS.filter((bed) => film.sounds.some((cue) => cue.sound === bed && cue.action === 'start'));

describe('a sound of its own (#78)', () => {
  it('gives every dream one bed or two, never all three', () => {
    for (const film of [...films.short, ...films.long]) {
      const beds = bedsOf(film);
      expect(beds.length).toBeGreaterThanOrEqual(1);
      expect(beds.length).toBeLessThanOrEqual(2);
    }
  });

  it('gives a long dream a second bed more often than a short one', () => {
    const two = (list: DreamFilm[]) => list.filter((film) => bedsOf(film).length === 2).length / list.length;
    expect(two(films.long)).toBeGreaterThan(two(films.short) + 0.2);
  });

  it('leans to the beds whose source the dream shows', () => {
    const tally = { shown: [0, 0], unseen: [0, 0] };
    for (const film of [...films.short, ...films.long]) {
      const motifs = new Set(film.shots.filter((shot) => !shot.scare).flatMap((shot) => assetOf(shot.assetId).tags.motifs));
      for (const bed of BEDS) {
        const row = motifs.has(bed === 'vacuum' ? 'vacuum_woman' : bed) ? tally.shown : tally.unseen;
        row[0]! += 1;
        if (bedsOf(film).includes(bed)) row[1]! += 1;
      }
    }
    const rate = ([all, sounded]: number[]) => sounded! / all!;
    expect(rate(tally.shown)).toBeGreaterThan(1.5 * rate(tally.unseen));
  });

  it('does not take a hospital corridor for a monitor', () => {
    // Before #78 a corridor in view started the monitor in every such dream.
    const noMonitors = { version: 1 as const, assets: TEST_LIBRARY.assets.filter((asset) => !asset.tags.motifs.includes('monitor')) };
    const corridor = seeds
      .map((seed) => generateFilm(seed, 'short', noMonitors))
      .filter((film) => film.shots.some((shot) => !shot.scare && assetOf(shot.assetId).tags.location === 'hospital_corridor'));
    expect(corridor.length).toBeGreaterThan(30);
    expect(corridor.filter((film) => bedsOf(film).includes('monitor')).length).toBeLessThan(corridor.length * 0.6);
  });

  it('makes the journals of two dreams differ', () => {
    const heard = films.short.map((film) => [...new Set(film.intrusions.map((x) => x.motif))].sort().join('+'));
    const sets = new Map<string, number>();
    for (const key of heard) sets.set(key, (sets.get(key) ?? 0) + 1);
    expect(sets.size).toBeGreaterThanOrEqual(6);
    expect(Math.max(...sets.values())).toBeLessThan(heard.length * 0.35);
  });

  it('sounds a false alarm with something the dream has', () => {
    for (const film of [...films.short, ...films.long]) {
      const swing = film.shots.some((shot) => !shot.scare && assetOf(shot.assetId).tags.motifs.includes('swing'));
      for (const cue of film.sounds) {
        // The creak of a false alarm comes at full strength; only a dream with the swing has it.
        if (cue.sound === 'swing_creak' && cue.params?.strength === 1 && (cue.params.pitch ?? 1) < 0.4) expect(swing).toBe(true);
        // A roar of the vacuum is the dream's own vacuum.
        if (cue.sound === 'vacuum' && cue.params?.turbine === 1) expect(bedsOf(film)).toContain('vacuum');
        // A lone beep is always in the journal.
        if (cue.sound === 'monitor' && cue.action === 'hit') {
          expect(film.intrusions.some((x) => x.motif === 'monitor' && x.at <= cue.at)).toBe(true);
        }
      }
    }
  });
});
