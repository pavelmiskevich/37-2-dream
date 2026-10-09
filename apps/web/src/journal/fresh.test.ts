import { normalizeSeed } from '@dream/core';
import { describe, expect, it } from 'vitest';
import { freshSeed } from './fresh';

describe('freshSeed', () => {
  it('draws a new seed unlike the last ones', () => {
    const seed = normalizeSeed('DREAM-8F72-A19C-37B2');
    let byte = 0;
    const next = freshSeed([seed], () => Array.from({ length: 6 }, () => byte++ % 256));
    expect(next).not.toBe(seed);
    expect(next).toMatch(/^DREAM-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });
});
