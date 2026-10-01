import { describe, expect, it } from 'vitest';
import { isDreamSeed, normalizeSeed, parseSeed, seedFromEntropy } from './seed';

describe('parseSeed', () => {
  it('keeps a canonical seed as is', () => {
    expect(parseSeed('DREAM-8F72-A19C-37B2')).toBe('DREAM-8F72-A19C-37B2');
  });

  it.each([
    'dream-8f72-a19c-37b2',
    '  DREAM-8F72-A19C-37B2\n',
    'DREAM8F72A19C37B2',
    '8F72-A19C-37B2',
    '8f72a19c37b2',
    'DREAM-8F72A19C-37B2',
  ])('normalises %j', (input) => {
    expect(parseSeed(input)).toBe('DREAM-8F72-A19C-37B2');
  });

  it.each([
    '',
    'DREAM',
    'DREAM-8F72-A19C-37B',
    'DREAM-8F72-A19C-37B22',
    'DREAM-8G72-A19C-37B2',
    'DREAM--8F72-A19C-37B2',
    'DREAM-8F72--A19C-37B2',
    'DREAM-8F72 A19C-37B2',
    'NIGHTMARE-8F72-A19C-37B2',
    'DREAM-8F72-A19C-37B2-0000',
  ])('rejects %j', (input) => {
    expect(parseSeed(input)).toBeUndefined();
  });
});

describe('normalizeSeed', () => {
  it('returns the canonical seed', () => {
    expect(normalizeSeed('dream-0000-ffff-0a0b')).toBe('DREAM-0000-FFFF-0A0B');
  });

  it('throws RangeError on invalid input', () => {
    expect(() => normalizeSeed('DREAM-XXXX-XXXX-XXXX')).toThrow(RangeError);
  });
});

describe('isDreamSeed', () => {
  it('accepts only the canonical form', () => {
    expect(isDreamSeed('DREAM-8F72-A19C-37B2')).toBe(true);
    expect(isDreamSeed('dream-8f72-a19c-37b2')).toBe(false);
    expect(isDreamSeed('8F72-A19C-37B2')).toBe(false);
  });
});

describe('seedFromEntropy', () => {
  it('encodes the first six bytes as hex', () => {
    expect(seedFromEntropy([0x8f, 0x72, 0xa1, 0x9c, 0x37, 0xb2])).toBe('DREAM-8F72-A19C-37B2');
    expect(seedFromEntropy(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]))).toBe('DREAM-0001-0203-0405');
  });

  it('produces seeds that parse back to themselves', () => {
    const seed = seedFromEntropy([255, 0, 128, 7, 16, 200]);
    expect(isDreamSeed(seed)).toBe(true);
    expect(parseSeed(seed)).toBe(seed);
  });

  it('rejects too little or malformed entropy', () => {
    expect(() => seedFromEntropy([1, 2, 3, 4, 5])).toThrow(RangeError);
    expect(() => seedFromEntropy([1, 2, 3, 4, 5, 256])).toThrow(RangeError);
    expect(() => seedFromEntropy([1, 2, 3, 4, 5, -1])).toThrow(RangeError);
    expect(() => seedFromEntropy([1, 2, 3, 4, 5, 0.5])).toThrow(RangeError);
  });
});
