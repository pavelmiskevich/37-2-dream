import { describe, expect, it } from 'vitest';
import { PeriodicClock } from './clock';
import {
  beepShape,
  MIN_BEEP_GAP,
  MONITOR_FASTEST_PERIOD,
  MONITOR_SLOWEST_PERIOD,
  monitorPeriod,
} from './monitor';

const STEPS = Array.from({ length: 101 }, (_, i) => i / 100);

describe('monitorPeriod', () => {
  it('spans calm "пип… пип…" to "ПИППИППИП"', () => {
    expect(monitorPeriod(0)).toBeCloseTo(MONITOR_SLOWEST_PERIOD);
    expect(monitorPeriod(1)).toBeCloseTo(MONITOR_FASTEST_PERIOD);
  });

  it('gets faster monotonically', () => {
    for (let i = 1; i < STEPS.length; i++) {
      expect(monitorPeriod(STEPS[i]!)).toBeLessThan(monitorPeriod(STEPS[i - 1]!));
    }
  });

  it('clamps bad input', () => {
    expect(monitorPeriod(-3)).toBe(monitorPeriod(0));
    expect(monitorPeriod(7)).toBe(monitorPeriod(1));
    expect(monitorPeriod(Number.NaN)).toBe(monitorPeriod(0));
  });
});

describe('beepShape', () => {
  it.each(STEPS)('beeps never overlap and stay audible as separate beeps (intensity %s)', (i) => {
    const shape = beepShape(i, 960);
    expect(shape.duration + MIN_BEEP_GAP).toBeLessThanOrEqual(monitorPeriod(i) + 1e-9);
    expect(shape.attack + shape.release).toBeLessThan(shape.duration);
  });

  it('gets louder and slightly lower as it gets urgent', () => {
    const calm = beepShape(0, 960);
    const critical = beepShape(1, 960);
    expect(critical.gain).toBeGreaterThan(calm.gain);
    expect(critical.frequency).toBeLessThan(calm.frequency);
    expect(critical.frequency).toBeGreaterThan(calm.frequency * 0.9);
  });
});

describe('monitor schedule', () => {
  const beepsIn = (intensity: number, seconds: number) => {
    const clock = new PeriodicClock();
    clock.start(0);
    return clock.take(0, seconds, () => monitorPeriod(intensity)).length;
  };

  it('beeps about once a second when calm and several times a second when critical', () => {
    expect(beepsIn(0, 10)).toBe(10);
    expect(beepsIn(1, 10)).toBeGreaterThanOrEqual(70);
  });

  it('a critical ramp followed by silence leaves no beeps', () => {
    const clock = new PeriodicClock();
    clock.start(0);
    let intensity = 0;
    const times: number[] = [];
    for (let t = 0; t < 5; t += 0.025) {
      intensity = Math.min(1, t / 4);
      clock.retime(t, monitorPeriod(intensity));
      times.push(...clock.take(t, t + 0.15, () => monitorPeriod(intensity)));
    }
    clock.stop();
    expect(clock.take(5, 10, () => monitorPeriod(intensity))).toEqual([]);
    const gaps = times.slice(1).map((t, i) => t - times[i]!);
    // Tempo only accelerates during the ramp.
    expect(gaps.at(-1)!).toBeLessThan(gaps[0]!);
  });
});
