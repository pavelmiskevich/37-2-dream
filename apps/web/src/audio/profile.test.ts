import { describe, expect, it } from 'vitest';
import { soundProfileFromSeed } from './profile';

describe('soundProfileFromSeed', () => {
  it('is a pure function of the seed', () => {
    expect(soundProfileFromSeed('DREAM-8F72-A19C-37B2')).toEqual(soundProfileFromSeed('DREAM-8F72-A19C-37B2'));
    expect(soundProfileFromSeed(37)).toEqual(soundProfileFromSeed(37));
  });

  it('gives different dreams a different voice', () => {
    expect(soundProfileFromSeed('DREAM-8F72-A19C-37B2')).not.toEqual(soundProfileFromSeed('DREAM-0001-0002-0003'));
  });

  it('keeps every sound in its recognisable range', () => {
    for (let seed = 0; seed < 200; seed++) {
      const p = soundProfileFromSeed(seed);
      expect(p.monitor.pitchHz).toBeGreaterThanOrEqual(880);
      expect(p.monitor.pitchHz).toBeLessThanOrEqual(1000);
      expect(p.ventilator.breathsPerMinute).toBeGreaterThanOrEqual(12);
      expect(p.ventilator.breathsPerMinute).toBeLessThanOrEqual(16);
      expect(p.ventilator.exhaleHz).toBeGreaterThan(p.ventilator.inhaleHz * 2);
      expect(p.hum.mainsHz).toBeGreaterThan(49.5);
      expect(p.hum.mainsHz).toBeLessThan(50.5);
      expect(p.vacuum.whineHz).toBeGreaterThan(p.vacuum.motorHz * 5);
      // The hero breathes lower than the ventilator he turns into, and a little faster.
      expect(p.breath.exhaleHz).toBeGreaterThan(p.breath.inhaleHz);
      expect(p.breath.exhaleHz).toBeLessThan(p.ventilator.inhaleHz);
      expect(p.breath.breathsPerMinute).toBeGreaterThanOrEqual(16);
      expect(p.breath.breathsPerMinute).toBeLessThanOrEqual(19);
    }
  });
});
