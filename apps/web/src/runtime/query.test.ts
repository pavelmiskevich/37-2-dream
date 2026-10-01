import { describe, expect, it } from 'vitest';
import { normalizeSeed } from '@dream/core';
import { queryWithSeed, sceneFromQuery } from './query';

const seed = normalizeSeed('DREAM-8F72-A19C-37B2');

describe('sceneFromQuery', () => {
  it('reads a known scene id', () => {
    expect(sceneFromQuery('?scene=yard')).toBe('yard');
    expect(sceneFromQuery('?seed=DREAM-8F72-A19C-37B2&scene=jam')).toBe('jam');
    expect(sceneFromQuery('?scene=%20Fall%20')).toBe('fall');
  });

  it('ignores a missing or unknown scene', () => {
    expect(sceneFromQuery('')).toBeNull();
    expect(sceneFromQuery('?scene=')).toBeNull();
    expect(sceneFromQuery('?scene=kitchen')).toBeNull();
  });
});

describe('queryWithSeed', () => {
  it('adds the seed and keeps the other parameters', () => {
    expect(queryWithSeed('', seed)).toBe('?seed=DREAM-8F72-A19C-37B2');
    expect(queryWithSeed('?scene=yard', seed)).toBe('?scene=yard&seed=DREAM-8F72-A19C-37B2');
  });

  it('replaces a seed written in another form', () => {
    expect(queryWithSeed('?seed=8f72a19c37b2&scene=yard', seed)).toBe('?seed=DREAM-8F72-A19C-37B2&scene=yard');
  });
});
