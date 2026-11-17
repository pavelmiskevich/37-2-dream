import { describe, expect, it } from 'vitest';
import { flickerAt, lookAt, MAX_LOOK, NO_FLASH_FLICKER } from './look';

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

  it('softens the exposure flicker with "без вспышек" and leaves the rest of the look alone', () => {
    const times = Array.from({ length: 2400 }, (_, i) => i / 240);
    const swing = (settings?: { noFlash: boolean }) => {
      const exposures = times.map((t) => lookAt(FULL, t, 5, settings).exposure);
      return Math.max(...exposures) - Math.min(...exposures);
    };
    // Without the switch the whole frame does pulse: the dream looks as before.
    expect(swing()).toBeGreaterThan(0.05);
    expect(swing({ noFlash: false })).toBe(swing());
    // With it the frame still breathes, but at a quarter of the swing (#115).
    expect(NO_FLASH_FLICKER).toBeGreaterThan(0);
    expect(NO_FLASH_FLICKER).toBeLessThanOrEqual(0.25);
    expect(swing({ noFlash: true })).toBeGreaterThan(0);
    expect(swing({ noFlash: true })).toBeCloseTo(swing() * NO_FLASH_FLICKER, 9);
    for (const t of [0.3, 2.7, 9.1]) {
      const { exposure, ...rest } = lookAt(FULL, t, 5, { noFlash: true });
      const { exposure: flickering, ...before } = lookAt(FULL, t, 5);
      expect(exposure - 1).toBeCloseTo((flickering - 1) * NO_FLASH_FLICKER, 12);
      expect(rest).toEqual(before);
    }
  });
});
