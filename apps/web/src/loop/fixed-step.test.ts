import { describe, expect, it } from 'vitest';
import { createFixedStepLoop } from './fixed-step';

const DT = 1 / 60;

function counting(maxFrameTime?: number) {
  let ticks = 0;
  const loop = createFixedStepLoop({ onTick: () => (ticks += 1), maxFrameTime });
  return { loop, ticks: () => ticks };
}

describe('createFixedStepLoop', () => {
  it('runs one tick per 1/60 s of real time, whatever the frame rate', () => {
    for (const hz of [30, 60, 75, 144, 240]) {
      const { loop, ticks } = counting();
      for (let frame = 0; frame < hz * 10; frame++) loop.advance(1 / hz);
      expect(Math.abs(ticks() - 600)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the remainder as the interpolation factor', () => {
    const { loop, ticks } = counting();
    expect(loop.advance(DT * 2.25)).toBeCloseTo(0.25, 9);
    expect(ticks()).toBe(2);
    expect(loop.advance(DT * 0.5)).toBeCloseTo(0.75, 9);
    expect(loop.alpha).toBeCloseTo(0.75, 9);
    expect(ticks()).toBe(2);
    expect(loop.ticks).toBe(2);
  });

  it('turns timestamps into elapsed time; the first frame only starts the clock', () => {
    const { loop, ticks } = counting();
    loop.frame(10_000);
    expect(ticks()).toBe(0);
    loop.frame(10_000 + 1000 / 30);
    expect(ticks()).toBe(2);
    loop.resetClock();
    loop.frame(99_000);
    expect(ticks()).toBe(2);
  });

  it('drops time beyond maxFrameTime instead of spiralling', () => {
    const { loop, ticks } = counting(0.25);
    loop.advance(30); // a hidden tab coming back
    expect(ticks()).toBe(15);
  });

  it('ignores time going backwards and garbage', () => {
    const { loop, ticks } = counting();
    loop.advance(-1);
    loop.advance(Number.NaN);
    loop.frame(1000);
    loop.frame(900);
    expect(ticks()).toBe(0);
  });

  it('rejects a non-positive tick length', () => {
    expect(() => createFixedStepLoop({ onTick: () => {}, dt: 0 })).toThrow(RangeError);
  });
});
