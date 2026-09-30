import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from './index';

describe('ENGINE_VERSION', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(ENGINE_VERSION)).toBe(true);
    expect(ENGINE_VERSION).toBeGreaterThan(0);
  });
});
