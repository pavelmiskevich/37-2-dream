import { describe, expect, it } from 'vitest';
import { isOnCooldown, itemWeight, pickFromCatalog, weightedPick, weightedSample, type Catalog } from './catalog';
import { createSeededRng } from './rng';

type Id = 'common' | 'rare' | 'never';

const catalog: Catalog<Id> = [
  { id: 'common', baseWeight: 3, rarity: 0, cooldownScenes: 2 },
  { id: 'rare', baseWeight: 2, rarity: 0.5, cooldownScenes: 0 },
  { id: 'never', baseWeight: 0, rarity: 0, cooldownScenes: 0 },
];

describe('weightedPick', () => {
  it('picks proportionally to weight and never picks weight 0', () => {
    const rng = createSeededRng('weighted');
    const counts = { a: 0, b: 0, z: 0 };
    const weights = { a: 1, b: 3, z: 0 };
    for (let i = 0; i < 8000; i++) counts[weightedPick(['a', 'b', 'z'] as const, (k) => weights[k], rng)] += 1;
    expect(counts.z).toBe(0);
    expect(counts.b / counts.a).toBeGreaterThan(2.7);
    expect(counts.b / counts.a).toBeLessThan(3.3);
  });

  it('rejects impossible input', () => {
    const rng = createSeededRng('bad');
    expect(() => weightedPick([], () => 1, rng)).toThrow(RangeError);
    expect(() => weightedPick(['a'], () => 0, rng)).toThrow(RangeError);
    expect(() => weightedPick(['a'], () => -1, rng)).toThrow(RangeError);
    expect(() => weightedPick(['a'], () => Number.NaN, rng)).toThrow(RangeError);
  });
});

describe('weightedSample', () => {
  it('returns distinct items and skips weight 0', () => {
    const rng = createSeededRng('sample');
    for (let i = 0; i < 100; i++) {
      const picked = weightedSample(['a', 'b', 'c', 'z'], 5, (k) => (k === 'z' ? 0 : 1), rng);
      expect([...picked].sort()).toEqual(['a', 'b', 'c']);
    }
    expect(weightedSample(['a', 'b', 'c'], 2, () => 1, rng)).toHaveLength(2);
  });
});

describe('catalog weights', () => {
  it('apply rarity and bias', () => {
    const [common, rare] = catalog;
    expect(itemWeight(common!, { sceneIndex: 0 })).toBe(3);
    expect(itemWeight(rare!, { sceneIndex: 0 })).toBe(1);
    expect(itemWeight(rare!, { sceneIndex: 0, bias: () => 2 })).toBe(2);
  });

  it('apply cooldown within the dream', () => {
    const common = catalog[0]!;
    const lastUsed = new Map<Id, number>([['common', 1]]);
    expect(isOnCooldown(common, 1, lastUsed)).toBe(true);
    expect(isOnCooldown(common, 3, lastUsed)).toBe(true);
    expect(isOnCooldown(common, 4, lastUsed)).toBe(false);
    expect(isOnCooldown(common, 3, new Map())).toBe(false);
    expect(itemWeight(common, { sceneIndex: 2, lastUsed })).toBe(0);
  });

  it('pickFromCatalog honours cooldown and reports when nothing is pickable', () => {
    const rng = createSeededRng('catalog');
    const lastUsed = new Map<Id, number>([['common', 0]]);
    for (let i = 0; i < 50; i++) expect(pickFromCatalog(catalog, rng, { sceneIndex: 1, lastUsed })?.id).toBe('rare');
    expect(pickFromCatalog(catalog, rng, { sceneIndex: 1, lastUsed, bias: (item) => (item.id === 'rare' ? 0 : 1) })).toBeUndefined();
  });
});
