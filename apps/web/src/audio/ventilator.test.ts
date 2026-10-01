import { describe, expect, it } from 'vitest';
import { BREATH_CYCLE, breathCycle, breathPeriod } from './ventilator';

const BANDS = { inhaleHz: 1100, exhaleHz: 3000 };

describe('BREATH_CYCLE', () => {
  it('starts and ends silent, so cycles join without clicks', () => {
    expect(BREATH_CYCLE[0]!.phase).toBe(0);
    expect(BREATH_CYCLE[0]!.gain).toBe(0);
    expect(BREATH_CYCLE.at(-1)!.phase).toBe(1);
    expect(BREATH_CYCLE.at(-1)!.gain).toBe(0);
    expect(BREATH_CYCLE[0]!.band).toBe(BREATH_CYCLE.at(-1)!.band);
  });

  it('has strictly increasing phases', () => {
    for (let i = 1; i < BREATH_CYCLE.length; i++) {
      expect(BREATH_CYCLE[i]!.phase).toBeGreaterThan(BREATH_CYCLE[i - 1]!.phase);
    }
  });

  it('retunes the filter between inhale and exhale only while silent', () => {
    for (let i = 1; i < BREATH_CYCLE.length; i++) {
      const a = BREATH_CYCLE[i - 1]!;
      const b = BREATH_CYCLE[i]!;
      if (Math.abs(b.band - a.band) > 0.2) {
        expect(a.gain).toBe(0);
        expect(b.gain).toBe(0);
      }
    }
  });

  it('has an inhale ("ф") and a louder, brighter exhale ("ш")', () => {
    const sounding = BREATH_CYCLE.filter((k) => k.gain > 0);
    const inhale = sounding.filter((k) => k.band < 0.5);
    const exhale = sounding.filter((k) => k.band >= 0.5);
    expect(inhale.length).toBeGreaterThan(0);
    expect(exhale.length).toBeGreaterThan(0);
    expect(Math.max(...inhale.map((k) => k.phase))).toBeLessThan(Math.min(...exhale.map((k) => k.phase)));
    expect(Math.max(...exhale.map((k) => k.gain))).toBeGreaterThan(Math.max(...inhale.map((k) => k.gain)));
  });
});

describe('breathPeriod', () => {
  it('converts breaths per minute to seconds and clamps', () => {
    expect(breathPeriod(15)).toBe(4);
    expect(breathPeriod(0)).toBe(breathPeriod(6));
    expect(breathPeriod(1000)).toBe(breathPeriod(30));
  });
});

describe('breathCycle', () => {
  it('lays the cycle out in absolute time between the two bands', () => {
    const points = breathCycle(10, 4, BANDS);
    expect(points[0]!.time).toBe(10);
    expect(points.at(-1)!.time).toBe(14);
    for (const point of points) {
      expect(point.frequency).toBeGreaterThanOrEqual(BANDS.inhaleHz - 1e-9);
      expect(point.frequency).toBeLessThanOrEqual(BANDS.exhaleHz + 1e-9);
    }
  });

  it('chains cycles seamlessly: one ends exactly where the next begins', () => {
    const first = breathCycle(0, 4, BANDS);
    const second = breathCycle(4, 4, BANDS);
    expect(first.at(-1)).toEqual(second[0]);
  });
});
