import { describe, expect, it } from 'vitest';
import { flickerAt, lookAt, MAX_LOOK } from './look';

const NONE = { grain: 0, flicker: 0, blur: 0, vignette: 0, fever: 0 };
const FULL = { grain: 1, flicker: 1, blur: 1, vignette: 1, fever: 1 };

describe('flickerAt', () => {
  it('stays within −1…1, is deterministic and keeps moving', () => {
    const values = Array.from({ length: 2000 }, (_, i) => flickerAt(i * 0.013, 3));
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(-1);
    expect(flickerAt(4.2, 3)).toBe(flickerAt(4.2, 3));
    expect(new Set(values.map((v) => v.toFixed(3))).size).toBeGreaterThan(100);
  });
});

describe('lookAt', () => {
  it('keeps a trace of film even with every knob at zero', () => {
    const look = lookAt(NONE, 1.5);
    expect(look.grain).toBeGreaterThan(0);
    expect(look.exposure).toBe(1);
    expect(look.aberration).toBe(0);
    expect(look.warp).toBe(0);
    expect(look.blur).toBe(0);
  });

  it('scales every effect up to its maximum and no further', () => {
    const look = lookAt({ ...FULL, grain: 3, fever: 2 }, 1.5);
    expect(look.grain).toBeCloseTo(MAX_LOOK.grain, 9);
    expect(look.aberration).toBeCloseTo(MAX_LOOK.aberration, 9);
    expect(look.blur).toBeCloseTo(MAX_LOOK.blur, 9);
    expect(Math.abs(look.exposure - 1)).toBeLessThanOrEqual(MAX_LOOK.flicker);
  });

  it('eases the fever fringes in, so a mild fever stays clean', () => {
    expect(lookAt({ ...NONE, fever: 0.25 }, 0).aberration).toBeLessThan(MAX_LOOK.aberration * 0.25);
  });

  it('changes grain and weave with each frame of a 24 fps projector', () => {
    const a = lookAt(FULL, 1.0);
    expect(lookAt(FULL, 1.01).frame).toBe(a.frame);
    expect(lookAt(FULL, 1.01).weaveX).toBe(a.weaveX);
    expect(lookAt(FULL, 1.05).frame).toBe(a.frame + 1);
  });
});
