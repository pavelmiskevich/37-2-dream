import { describe, expect, it } from 'vitest';
import { GASP, gaspLevel, gaspShape } from './gasp';

describe('gaspShape (#134)', () => {
  it('is silence at no strength and scales with it', () => {
    expect(gaspShape(0)).toBeNull();
    expect(gaspShape(0.5)?.gain).toBe(0.5);
    expect(gaspShape()?.gain).toBe(1);
    expect(gaspShape(3)?.gain).toBe(1);
  });

  it('is short: a rush of air and a catch', () => {
    expect(GASP.duration).toBeLessThan(0.6);
    expect(GASP.rise + GASP.catch).toBeLessThanOrEqual(GASP.duration);
    expect(GASP.mouth.toHz).toBeGreaterThan(GASP.mouth.fromHz);
  });

  it('starts at once, keeps filling and stops dead at the top', () => {
    const shape = gaspShape()!;
    expect(gaspLevel(shape, 0)).toBe(0);
    expect(gaspLevel(shape, 0.01)).toBeGreaterThan(0.3);
    const rising = [0.05, 0.1, 0.2, 0.3].map((t) => gaspLevel(shape, t));
    expect([...rising].sort((a, b) => a - b)).toEqual(rising);
    expect(gaspLevel(shape, shape.rise)).toBeCloseTo(1);
    expect(gaspLevel(shape, shape.rise + shape.catch)).toBeCloseTo(0);
    expect(gaspLevel(shape, shape.duration)).toBe(0);
  });
});
