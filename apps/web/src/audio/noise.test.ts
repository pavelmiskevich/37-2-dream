import { describe, expect, it } from 'vitest';
import { generateNoise, makeLoopable, type NoiseColor } from './noise';
import { createRng } from './rng';

const COLORS: NoiseColor[] = ['white', 'pink', 'brown'];
const LENGTH = 48_000;

describe('generateNoise', () => {
  it.each(COLORS)('%s noise is reproducible from the seed', (color) => {
    const a = generateNoise(color, LENGTH, createRng(5));
    const b = generateNoise(color, LENGTH, createRng(5));
    const c = generateNoise(color, LENGTH, createRng(6));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it.each(COLORS)('%s noise loops without a step and has no DC offset', (color) => {
    const data = generateNoise(color, LENGTH, createRng(9));
    expect(data[0]).toBeCloseTo(data[LENGTH - 1]!, 6);
    const mean = data.reduce((acc, v) => acc + v, 0) / LENGTH;
    expect(Math.abs(mean)).toBeLessThan(1e-4);
  });

  it.each(COLORS)('%s noise peaks at 0.9', (color) => {
    const data = generateNoise(color, LENGTH, createRng(3));
    const peak = data.reduce((acc, v) => Math.max(acc, Math.abs(v)), 0);
    expect(peak).toBeCloseTo(0.9, 5);
  });

  it('brown noise is much smoother than white noise', () => {
    const roughness = (data: Float32Array) => {
      let sum = 0;
      for (let i = 1; i < data.length; i++) sum += Math.abs(data[i]! - data[i - 1]!);
      return sum / data.length;
    };
    const white = generateNoise('white', LENGTH, createRng(1));
    const brown = generateNoise('brown', LENGTH, createRng(1));
    expect(roughness(brown)).toBeLessThan(roughness(white) / 10);
  });
});

describe('makeLoopable', () => {
  it('removes the drift between the ends', () => {
    const data = Float32Array.from([0, 1, 2, 3, 4]);
    makeLoopable(data);
    expect(data[0]).toBeCloseTo(data[4]!, 6);
  });
});
