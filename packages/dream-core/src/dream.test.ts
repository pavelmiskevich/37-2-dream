import { describe, expect, it } from 'vitest';
import { findScene, generateDream, type Dream } from './dream';
import { MOTIF_SOURCES, SCENE_IDS, WILL_PAGES, isSceneId, type DreamScene } from './scenes';
import { normalizeSeed } from './seed';
import { testSeeds } from './test-utils';
import { ENGINE_VERSION } from './version';

/**
 * Fixed seeds whose dreams are pinned as JSON files. If a change alters them,
 * that is a new engine version: bump ENGINE_VERSION, update the files with
 * `vitest run -u` and explain the change in the PR (AGENTS.md, "Детерминизм").
 */
const SNAPSHOT_SEEDS = [
  'DREAM-8F72-A19C-37B2',
  'DREAM-0000-0000-0000',
  'DREAM-FFFF-FFFF-FFFF',
  'DREAM-3720-3720-3720',
  'DREAM-C0DE-BEEF-0451',
].map(normalizeSeed);

const dreams: Dream[] = testSeeds(1000, 'test/dream-seeds').map(generateDream);
const scenesOf = <Id extends DreamScene['id']>(id: Id) => dreams.map((dream) => findScene(dream, id)!);

describe('generateDream: purity', () => {
  it('gives deeply equal dreams for the same seed, regardless of what ran in between', () => {
    const seed = SNAPSHOT_SEEDS[0]!;
    const first = generateDream(seed);
    for (const other of SNAPSHOT_SEEDS.slice(1)) generateDream(other);
    expect(generateDream(seed)).toEqual(first);
  });

  it('does not share mutable state between results', () => {
    const seed = SNAPSHOT_SEEDS[1]!;
    const a = generateDream(seed);
    a.scenes.length = 0;
    a.transitions[0]!.kind = 'splash';
    expect(generateDream(seed).scenes).toHaveLength(SCENE_IDS.length);
    expect(generateDream(seed).transitions[0]!.kind).toBe('fall_asleep');
  });

  it('survives a JSON round trip unchanged', () => {
    const dream = generateDream(SNAPSHOT_SEEDS[2]!);
    expect(JSON.parse(JSON.stringify(dream))).toEqual(dream);
  });

  it.each(SNAPSHOT_SEEDS)('matches the pinned scene graph for %s', async (seed) => {
    const json = `${JSON.stringify(generateDream(seed), null, 2)}\n`;
    await expect(json).toMatchFileSnapshot(`./__snapshots__/dreams/${seed}.json`);
  });
});

describe('generateDream: structure', () => {
  const dream = generateDream(SNAPSHOT_SEEDS[0]!);

  it('records the seed and engine version', () => {
    expect(dream.seed).toBe('DREAM-8F72-A19C-37B2');
    expect(dream.engineVersion).toBe(ENGINE_VERSION);
  });

  it('plays the slice scenes in fixed order with matching indices and seeds', () => {
    expect(dream.scenes.map((scene) => scene.id)).toEqual(['apartment', 'yard', 'fall', 'jam', 'awakening']);
    dream.scenes.forEach((scene, index) => {
      expect(scene.index).toBe(index);
      expect(scene.seed).toBe(`DREAM-8F72-A19C-37B2/scene/${index}`);
    });
  });

  it('chains scenes with transitions', () => {
    expect(dream.transitions.map((t) => `${t.from}>${t.to}`)).toEqual([
      'apartment>yard',
      'yard>fall',
      'fall>jam',
      'jam>awakening',
    ]);
  });

  it('finds scenes by id with typed params', () => {
    const yard = findScene(dream, 'yard');
    expect(yard?.params.buildingFloors).toBeGreaterThan(0);
    expect(isSceneId('yard')).toBe(true);
    expect(isSceneId('kitchen')).toBe(false);
  });
});

describe('generateDream: 1000 seeds', () => {
  it('fits scene durations into the dream length', () => {
    for (const dream of dreams) {
      const sum = dream.scenes.reduce((s, scene) => s + scene.duration, 0);
      expect(Math.abs(sum - dream.duration)).toBeLessThan(1e-6);
      expect(Math.abs(dream.duration - dream.profile.dreamLength * 60)).toBeLessThanOrEqual(0.3);
      for (const scene of dream.scenes) expect(scene.duration).toBeGreaterThan(5);
    }
  });

  it('keeps intensities in [0, 1] and follows the dramatic arc on average', () => {
    const avg = (id: DreamScene['id']): number =>
      scenesOf(id).reduce((s, scene) => s + scene.intensity, 0) / dreams.length;
    for (const dream of dreams) {
      for (const scene of dream.scenes) {
        expect(scene.intensity).toBeGreaterThanOrEqual(0);
        expect(scene.intensity).toBeLessThanOrEqual(1);
      }
    }
    expect(avg('apartment')).toBeLessThan(avg('yard'));
    expect(avg('yard')).toBeLessThan(avg('fall'));
    expect(avg('fall')).toBeLessThan(avg('jam'));
    expect(avg('awakening')).toBeLessThan(avg('apartment'));
  });

  it('varies every enumerated parameter', () => {
    const values = <T>(list: T[]): T[] => [...new Set(list)].sort();
    expect(values(scenesOf('apartment').map((s) => s.params.roomLight))).toEqual(['daylight', 'lamp', 'tv_glow']);
    expect(values(scenesOf('yard').map((s) => s.params.timeOfDay))).toEqual(['dawn', 'dusk', 'night', 'noon']);
    expect(values(scenesOf('yard').map((s) => s.params.buildingFloors))).toEqual([12, 16, 5, 9]);
    expect(values(scenesOf('yard').map((s) => s.params.vacuumPasses))).toEqual([1, 2, 3]);
    expect(values(scenesOf('jam').map((s) => s.params.flavor))).toEqual(['apricot', 'blackcurrant', 'cherry', 'raspberry']);
    expect(values(scenesOf('jam').map((s) => s.params.gravity))).toEqual(['back', 'forward', 'left', 'right', 'up']);
    const pageCounts = values(scenesOf('fall').map((s) => s.params.willPages.length));
    expect(pageCounts[0]).toBe(WILL_PAGES.min);
    expect(pageCounts.at(-1)).toBe(WILL_PAGES.max);
  });

  it('keeps scene parameters within bounds', () => {
    for (const yard of scenesOf('yard')) {
      expect(yard.params.homeFloor).toBeGreaterThanOrEqual(1);
      expect(yard.params.homeFloor).toBeLessThanOrEqual(yard.params.buildingFloors);
      expect(yard.params.fog).toBeGreaterThanOrEqual(0);
      expect(yard.params.fog).toBeLessThanOrEqual(1);
    }
    for (const fall of scenesOf('fall')) {
      expect(new Set(fall.params.willPages).size).toBe(fall.params.willPages.length);
      expect(fall.params.height).toBeGreaterThanOrEqual(25);
      expect(fall.params.height).toBeLessThanOrEqual(180);
    }
    for (const jam of scenesOf('jam')) {
      expect(jam.params.viscosity).toBeGreaterThanOrEqual(0.4);
      expect(jam.params.viscosity).toBeLessThanOrEqual(0.95);
      expect(jam.params.gravityFlipAt).toBeGreaterThanOrEqual(0.2);
      expect(jam.params.gravityFlipAt).toBeLessThanOrEqual(0.6);
    }
    for (const apartment of scenesOf('apartment')) expect(apartment.params.thermometer).toBe(37.2);
    for (const awakening of scenesOf('awakening')) expect(awakening.params.temperature).toBe(36.9);
  });

  it('lets the profile shape the content', () => {
    const share = (list: boolean[]): number => list.filter(Boolean).length / list.length;
    const anxious = dreams.filter((d) => d.profile.anxiety > 0.7);
    const calm = dreams.filter((d) => d.profile.anxiety < 0.3);
    const dark = (d: Dream): boolean => ['dusk', 'night'].includes(findScene(d, 'yard')!.params.timeOfDay);
    expect(share(anxious.map(dark))).toBeGreaterThan(share(calm.map(dark)));

    const echoCount = (d: Dream): number => d.scenes.reduce((s, scene) => s + scene.echoes.length, 0);
    const avgEchoes = (list: Dream[]): number => list.reduce((s, d) => s + echoCount(d), 0) / list.length;
    expect(avgEchoes(dreams.filter((d) => d.profile.medicalIntensity > 0.7))).toBeGreaterThan(
      avgEchoes(dreams.filter((d) => d.profile.medicalIntensity < 0.3)),
    );
  });

  it('places echoes only in dream scenes and respects their cooldown', () => {
    for (const dream of dreams) {
      expect(findScene(dream, 'apartment')!.echoes).toEqual([]);
      expect(findScene(dream, 'awakening')!.echoes).toEqual([]);
      dream.scenes.forEach((scene, index) => {
        const motifs = scene.echoes.map((echo) => echo.motif);
        expect(new Set(motifs).size).toBe(motifs.length);
        const previous = dream.scenes[index - 1]?.echoes.map((echo) => echo.motif) ?? [];
        for (const motif of motifs) expect(previous).not.toContain(motif);
        const at = scene.echoes.map((echo) => echo.at);
        expect(at).toEqual([...at].sort((a, b) => a - b));
      });
    }
    expect(dreams.some((d) => d.scenes.some((s) => s.echoes.length > 0))).toBe(true);
    expect(dreams.some((d) => d.scenes.every((s) => s.echoes.length === 0))).toBe(true);
  });

  it('reveals the real source of every motif heard, and only those', () => {
    for (const dream of dreams) {
      const heard = new Set(['vacuum', 'swing_creak', ...dream.scenes.flatMap((s) => s.echoes.map((e) => e.motif))]);
      const reveals = findScene(dream, 'awakening')!.params.reveals;
      expect(new Set(reveals.map((r) => r.motif))).toEqual(heard);
      for (const reveal of reveals) expect(reveal.source).toBe(MOTIF_SOURCES[reveal.motif]);
    }
  });

  it('gives every seed its own dream', () => {
    const keys = dreams.map((d) => JSON.stringify({ ...d, seed: '', scenes: d.scenes.map((s) => ({ ...s, seed: '' })) }));
    expect(new Set(keys).size).toBe(dreams.length);
  });
});
