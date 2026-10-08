import { describe, expect, it } from 'vitest';
import { STINGER_CLUSTER, stingerShape } from './stinger';

const CHARACTER = { rootHz: 320 };

describe('stingerShape', () => {
  it('is silent at zero strength and survives bad input', () => {
    expect(stingerShape(0, false, CHARACTER)).toBeNull();
    expect(stingerShape(Number.NaN, false, CHARACTER)).toBeNull();
    expect(stingerShape(5, false, CHARACTER)).toEqual(stingerShape(1, false, CHARACTER));
  });

  it('hits at once: a few milliseconds of attack, a screech up into pitch, a noise burst', () => {
    const hit = stingerShape(1, false, CHARACTER)!;
    expect(hit.attack).toBeLessThan(0.01);
    expect(hit.bend).toBeGreaterThan(0);
    expect(hit.bendTime).toBeGreaterThan(0);
    expect(hit.noise.gain).toBeGreaterThan(0);
    expect(hit.boom.fromHz).toBeGreaterThan(hit.boom.toHz);
    expect(hit.duration).toBeLessThan(3);
  });

  it('softened (без вспышек): swells in, quieter, muffled, no screech or burst', () => {
    const hit = stingerShape(1, false, CHARACTER)!;
    const soft = stingerShape(1, true, CHARACTER)!;
    expect(soft.attack).toBeGreaterThan(0.1);
    expect(soft.gain).toBeLessThan(hit.gain / 2);
    expect(soft.lowpassHz).toBeLessThan(hit.lowpassHz / 3);
    expect(soft.bend).toBe(0);
    expect(soft.noise.gain).toBe(0);
  });

  it('scales with strength and builds a dissonant cluster on the seeded root', () => {
    const weak = stingerShape(0.2, false, CHARACTER)!;
    const strong = stingerShape(1, false, CHARACTER)!;
    expect(strong.gain).toBeGreaterThan(weak.gain);
    expect(strong.gain).toBeLessThanOrEqual(1);
    expect(strong.cluster).toHaveLength(STINGER_CLUSTER.length);
    expect(strong.cluster[0]!.hz).toBe(320);
    // A minor second above the root: the interval that makes it hurt.
    expect(strong.cluster[1]!.hz / strong.cluster[0]!.hz).toBeCloseTo(2 ** (1 / 12), 3);
  });
});
