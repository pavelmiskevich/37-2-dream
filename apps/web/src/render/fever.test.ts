import { describe, expect, it } from 'vitest';
import { MAX_FEVER_POST, NO_FEVER_POST, feverPostParams } from './fever';

describe('feverPostParams', () => {
  it('leaves the picture untouched without fever and is at its maximum at full fever', () => {
    expect(feverPostParams(0)).toEqual(NO_FEVER_POST);
    expect(feverPostParams(1)).toEqual(MAX_FEVER_POST);
  });

  it('clamps the level', () => {
    expect(feverPostParams(3)).toEqual(MAX_FEVER_POST);
    expect(feverPostParams(-1)).toEqual(NO_FEVER_POST);
    expect(feverPostParams(Number.NaN)).toEqual(NO_FEVER_POST);
  });

  it('grows with the fever', () => {
    const a = feverPostParams(0.3);
    const b = feverPostParams(0.6);
    expect(b.aberration).toBeGreaterThan(a.aberration);
    expect(b.warp).toBeGreaterThan(a.warp);
    expect(b.breath).toBeGreaterThan(a.breath);
  });

  it('splits colours by a whole internal pixel or more at 38.5 (level 0.6) and by under half at 37.2', () => {
    const height = 200; // smallest internal height of the presets
    expect(feverPostParams(0.6).aberration * height).toBeGreaterThan(1);
    expect(feverPostParams(0.08).aberration * 240).toBeLessThan(0.5);
  });
});
