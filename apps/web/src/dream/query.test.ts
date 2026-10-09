import { normalizeSeed } from '@dream/core';
import { describe, expect, it } from 'vitest';
import { dreamUrl, parseDreamQuery, queryWithDream } from './query';

const SEED = normalizeSeed('DREAM-8F72-A19C-37B2');

describe('parseDreamQuery', () => {
  it('reads the seed, the length and "без вспышек"', () => {
    expect(parseDreamQuery('?seed=DREAM-8F72-A19C-37B2&length=long&noflash=1')).toEqual({ seed: SEED, length: 'long', noFlash: true });
    expect(parseDreamQuery('?seed=dream-8f72-a19c-37b2&length=SHORT')).toEqual({ seed: SEED, length: 'short', noFlash: false });
  });

  it('gives nulls for what is missing or malformed', () => {
    expect(parseDreamQuery('')).toEqual({ seed: null, length: null, noFlash: false });
    expect(parseDreamQuery('?seed=nonsense&length=forever&noflash=0')).toEqual({ seed: null, length: null, noFlash: false });
  });
});

describe('queryWithDream', () => {
  it('names the dream and keeps the other parameters', () => {
    expect(queryWithDream('?noflash=1&seed=old', SEED, 'long')).toBe('?noflash=1&seed=DREAM-8F72-A19C-37B2&length=long');
    expect(queryWithDream('', SEED, 'short')).toBe('?seed=DREAM-8F72-A19C-37B2&length=short');
  });

  it('round-trips through parseDreamQuery', () => {
    for (const length of ['short', 'long'] as const) {
      const parsed = parseDreamQuery(queryWithDream('?x=1', SEED, length));
      expect(parsed.seed).toBe(SEED);
      expect(parsed.length).toBe(length);
    }
  });
});

describe('dreamUrl', () => {
  it('is the page with only the seed and the length', () => {
    const location = { origin: 'https://example.test', pathname: '/dream/' };
    const url = dreamUrl(SEED, 'long', location);
    expect(url).toBe('https://example.test/dream/?seed=DREAM-8F72-A19C-37B2&length=long');
    expect(parseDreamQuery(new URL(url).search)).toEqual({ seed: SEED, length: 'long', noFlash: false });
  });
});
