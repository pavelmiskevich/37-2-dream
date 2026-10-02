import { describe, expect, it } from 'vitest';
import { CREAK_SILENT_BELOW, creakShape } from './creak';
import { soundProfileFromSeed } from './profile';

const CHARACTER = { rubHz: 220, ringHz: 900 };

describe('creakShape', () => {
  it('is silent for a swing that barely moves', () => {
    expect(creakShape(0, 1, CHARACTER)).toBeNull();
    expect(creakShape(CREAK_SILENT_BELOW / 2, 1, CHARACTER)).toBeNull();
    expect(creakShape(CREAK_SILENT_BELOW, 1, CHARACTER)).not.toBeNull();
  });

  it('follows the amplitude: higher swing — louder, longer, higher creak', () => {
    const low = creakShape(0.2, 1, CHARACTER)!;
    const high = creakShape(0.9, 1, CHARACTER)!;
    expect(high.gain).toBeGreaterThan(low.gain);
    expect(high.duration).toBeGreaterThan(low.duration);
    expect(high.rubPeakHz).toBeGreaterThan(low.rubPeakHz);
    // Fits between two passes of the seat even at the top (half period ≈ 1.5 s).
    expect(high.duration).toBeLessThan(1);
  });

  it('glides up into the peak and down after it, within the envelope', () => {
    const shape = creakShape(0.6, 1, CHARACTER)!;
    expect(shape.rubStartHz).toBeLessThan(shape.rubPeakHz);
    expect(shape.rubEndHz).toBeLessThan(shape.rubPeakHz);
    expect(shape.attack).toBeGreaterThan(0);
    expect(shape.attack).toBeLessThan(1);
    expect(shape.gain).toBeLessThanOrEqual(1);
  });

  it('shifts every frequency with the scene pitch and survives a bad one', () => {
    const nominal = creakShape(0.5, 1, CHARACTER)!;
    const shrill = creakShape(0.5, 1.25, CHARACTER)!;
    expect(shrill.rubPeakHz / nominal.rubPeakHz).toBeCloseTo(1.25, 9);
    expect(shrill.bands[0]!.hz / nominal.bands[0]!.hz).toBeCloseTo(1.25, 9);
    expect(creakShape(0.5, Number.NaN, CHARACTER)).toEqual(nominal);
  });

  it('gets a seeded character from the sound profile', () => {
    for (let seed = 0; seed < 100; seed++) {
      const { swing } = soundProfileFromSeed(seed);
      expect(swing.rubHz).toBeGreaterThanOrEqual(150);
      expect(swing.rubHz).toBeLessThanOrEqual(260);
      expect(swing.ringHz).toBeGreaterThanOrEqual(700);
      expect(swing.ringHz).toBeLessThanOrEqual(1100);
    }
  });
});
