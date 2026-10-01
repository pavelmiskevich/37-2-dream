import { describe, expect, it } from 'vitest';
import { MIN_PERIOD, PeriodicClock } from './clock';

describe('PeriodicClock', () => {
  it('yields nothing until started', () => {
    expect(new PeriodicClock().take(0, 10, () => 1)).toEqual([]);
  });

  it('yields events in the look-ahead window and continues across calls', () => {
    const clock = new PeriodicClock();
    clock.start(1);
    expect(clock.take(0, 2.5, () => 0.5)).toEqual([1, 1.5, 2]);
    expect(clock.take(2.5, 3.6, () => 0.5)).toEqual([2.5, 3, 3.5]);
  });

  it('stops yielding after stop', () => {
    const clock = new PeriodicClock();
    clock.start(0);
    clock.take(0, 1, () => 0.5);
    clock.stop();
    expect(clock.running).toBe(false);
    expect(clock.take(1, 5, () => 0.5)).toEqual([]);
  });

  it('skips events that fell behind instead of bursting them', () => {
    const clock = new PeriodicClock();
    clock.start(0);
    clock.take(0, 0.1, () => 1);
    // A throttled tab wakes up ten seconds later.
    expect(clock.take(10, 10.1, () => 1)).toEqual([10]);
  });

  it('never goes below the minimum period', () => {
    const clock = new PeriodicClock();
    clock.start(0);
    expect(clock.take(0, 1, () => 0).length).toBe(Math.ceil(1 / MIN_PERIOD));
  });

  it('pulls the next event closer when the period shortens', () => {
    const clock = new PeriodicClock();
    clock.start(0);
    expect(clock.take(0, 0.1, () => 1)).toEqual([0]);
    clock.retime(0.2, 0.3);
    expect(clock.take(0.2, 0.5, () => 0.3)).toEqual([0.3]);
  });

  it('does not push the next event later when the period grows', () => {
    const clock = new PeriodicClock();
    clock.start(0);
    clock.take(0, 0.1, () => 0.5);
    clock.retime(0.2, 2);
    expect(clock.take(0.2, 0.6, () => 2)).toEqual([0.5]);
  });

  it('never retimes an event into the past', () => {
    const clock = new PeriodicClock();
    clock.start(0);
    clock.take(0, 0.1, () => 1);
    clock.retime(0.7, 0.2);
    expect(clock.take(0.7, 0.8, () => 0.2)).toEqual([0.7]);
  });
});
