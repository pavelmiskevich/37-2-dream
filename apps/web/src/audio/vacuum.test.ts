import { describe, expect, it } from 'vitest';
import { vacuumParams, type VacuumParams } from './vacuum';

const CHARACTER = { motorHz: 180, whineHz: 1500, wobbleHz: 0.3 };
const KEYS = Object.keys(vacuumParams(0, CHARACTER)) as (keyof VacuumParams)[];

describe('vacuumParams', () => {
  it('is continuous over the whole range: no jumps anywhere on the way to the turbine', () => {
    const steps = 2000;
    let previous = vacuumParams(0, CHARACTER);
    for (let i = 1; i <= steps; i++) {
      const current = vacuumParams(i / steps, CHARACTER);
      for (const key of KEYS) {
        const range = Math.abs(vacuumParams(1, CHARACTER)[key] - vacuumParams(0, CHARACTER)[key]) || 1;
        expect(Math.abs(current[key] - previous[key]) / range).toBeLessThan(0.005);
      }
      previous = current;
    }
  });

  it('starts as a muffled vacuum behind the wall', () => {
    const p = vacuumParams(0, CHARACTER);
    expect(p.motorHz).toBe(CHARACTER.motorHz);
    expect(p.whineHz).toBe(CHARACTER.whineHz);
    expect(p.rumbleGain).toBe(0);
    expect(p.wobbleDepth).toBeGreaterThan(0);
    expect(p.wallHz).toBeLessThan(3000);
  });

  it('ends as a turbine: rumble, high whine, open and steady', () => {
    const vacuum = vacuumParams(0, CHARACTER);
    const turbine = vacuumParams(1, CHARACTER);
    expect(turbine.rumbleGain).toBeGreaterThan(0.5);
    expect(turbine.whineHz).toBeGreaterThan(vacuum.whineHz * 2);
    expect(turbine.airHz).toBeLessThan(vacuum.airHz);
    expect(turbine.wallHz).toBeGreaterThan(10_000);
    expect(turbine.wobbleDepth).toBe(0);
    expect(turbine.level).toBeGreaterThan(vacuum.level);
  });

  it('rises in pitch and loudness monotonically', () => {
    for (let i = 1; i <= 100; i++) {
      const a = vacuumParams((i - 1) / 100, CHARACTER);
      const b = vacuumParams(i / 100, CHARACTER);
      expect(b.whineHz).toBeGreaterThanOrEqual(a.whineHz);
      expect(b.level).toBeGreaterThanOrEqual(a.level);
      expect(b.rumbleGain).toBeGreaterThanOrEqual(a.rumbleGain);
    }
  });

  it('clamps out-of-range input', () => {
    expect(vacuumParams(-1, CHARACTER)).toEqual(vacuumParams(0, CHARACTER));
    expect(vacuumParams(2, CHARACTER)).toEqual(vacuumParams(1, CHARACTER));
  });
});
