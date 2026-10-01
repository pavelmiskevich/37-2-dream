import { describe, expect, it } from 'vitest';
import { ditherMatrixGlsl, PS1_DITHER_MATRIX, quantizeChannel } from './dither';

describe('PS1_DITHER_MATRIX', () => {
  it('is a 4×4 table of offsets from -4 to +3, each used twice', () => {
    expect(PS1_DITHER_MATRIX).toHaveLength(16);
    for (let v = -4; v <= 3; v++) {
      expect(PS1_DITHER_MATRIX.filter((x) => x === v)).toHaveLength(2);
    }
  });

  it('renders as a GLSL float array literal', () => {
    expect(ditherMatrixGlsl()).toBe(
      'float[16]( -4.0, 0.0, -3.0, 1.0, 2.0, -2.0, 3.0, -1.0, -3.0, 1.0, -4.0, 0.0, 3.0, -1.0, 2.0, -2.0 )',
    );
  });
});

describe('quantizeChannel', () => {
  it('reduces 8-bit colour to 32 levels without dither', () => {
    const levels = new Set<number>();
    for (let v = 0; v < 256; v++) levels.add(quantizeChannel(v / 255, 0, 0, 5, false));
    expect(levels.size).toBe(32);
    expect(quantizeChannel(0, 0, 0, 5, false)).toBe(0);
    expect(quantizeChannel(1, 0, 0, 5, false)).toBe(1);
  });

  it('keeps black and white pure under dither', () => {
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(quantizeChannel(0, x, y, 5)).toBe(0);
        expect(quantizeChannel(1, x, y, 5)).toBe(1);
      }
    }
  });

  it('dithers a flat in-between value into a mix that averages back to it', () => {
    const value = 98 / 255;
    let sum = 0;
    const seen = new Set<number>();
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const q = quantizeChannel(value, x, y, 5);
        seen.add(q);
        sum += q;
      }
    }
    expect(seen.size).toBe(2);
    expect(Math.abs(sum / 16 - value)).toBeLessThan(1 / 31);
  });
});
