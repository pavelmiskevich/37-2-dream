import { describe, expect, it } from 'vitest';
import { findScene, generateDream } from './dream';
import type { WillClause } from './scenes';
import { normalizeSeed } from './seed';
import { testSeeds } from './test-utils';
import { WILL_PAPERS, generateWill, willOfScene, willPageText, willVariantCount } from './will';

const ALL_CLAUSES: readonly WillClause[] = [
  'cat',
  'wifi_password',
  'tv_remote',
  'slippers',
  'balcony_jars',
  'garage_key',
  'soup_in_fridge',
  'neighbor_debt',
  'sofa_side',
  'phone_charger',
];

const seed = normalizeSeed('DREAM-8F72-A19C-37B2');
const seeds = testSeeds(300, 'test/will-seeds');

describe('generateWill', () => {
  it('gives the same text for the same seed', () => {
    expect(generateWill(seed, 2, ALL_CLAUSES)).toEqual(generateWill(seed, 2, ALL_CLAUSES));
  });

  it('gives different texts for different seeds', () => {
    const texts = new Set(seeds.map((s) => generateWill(s, 2, ['cat', 'tv_remote', 'wifi_password']).map(willPageText).join('\n')));
    expect(texts.size).toBe(seeds.length);
  });

  it('depends on the scene index (its own stream per scene)', () => {
    expect(generateWill(seed, 2, ALL_CLAUSES)).not.toEqual(generateWill(seed, 3, ALL_CLAUSES));
  });

  it('writes one page per clause, in order', () => {
    const pages = generateWill(seed, 2, ['soup_in_fridge', 'cat', 'garage_key']);
    expect(pages.map((page) => page.clause)).toEqual(['soup_in_fridge', 'cat', 'garage_key']);
    for (const page of pages) expect(WILL_PAPERS).toContain(page.paper);
  });

  it('opens with the temperature on the first page and stays official', () => {
    for (const s of seeds.slice(0, 50)) {
      const pages = generateWill(s, 2, ALL_CLAUSES);
      expect(pages[0]!.body).toContain('37,2 °C');
      for (const page of pages) {
        const text = willPageText(page);
        expect(page.heading).toBe(page.heading.toUpperCase());
        expect(page.closing).toContain('Подпись');
        // No unfilled slots, no exclamations, no doubled spaces or stray punctuation.
        expect(text).not.toMatch(/[{}!]/);
        expect(text).not.toMatch(/ {2}|,\.|\.\.| [,.]/);
        expect(page.body.endsWith('.')).toBe(true);
        const sentences = page.body.toLowerCase().replace('особое указание: ', '').split('. ');
        expect(new Set(sentences).size).toBe(sentences.length);
      }
    }
  });

  it('can write at least 30 distinct bequests for every clause', () => {
    for (const clause of ALL_CLAUSES) expect(willVariantCount(clause)).toBeGreaterThanOrEqual(30);
  });

  it('actually produces at least 30 distinct pages for every clause', () => {
    for (const clause of ALL_CLAUSES) {
      const bodies = new Set(seeds.map((s) => generateWill(s, 2, [clause])[0]!.body));
      expect(bodies.size, clause).toBeGreaterThanOrEqual(30);
    }
  });
});

describe('willOfScene', () => {
  it('writes the pages of the dream fall scene', () => {
    const dream = generateDream(seed);
    const fall = findScene(dream, 'fall')!;
    const pages = willOfScene(dream.seed, fall);
    expect(pages.map((page) => page.clause)).toEqual(fall.params.willPages);
    expect(pages).toEqual(generateWill(dream.seed, fall.index, fall.params.willPages));
  });
});
