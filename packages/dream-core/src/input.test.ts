import { describe, expect, it } from 'vitest';
import {
  ACTION_BUTTONS,
  IDLE_INPUT,
  MAX_LOOK_PER_TICK,
  buttonMask,
  inputFromUnits,
  inputToUnits,
  isHeld,
  quantizeInput,
  type SimInput,
} from './input';
import { createSeededRng } from './rng';

const input = (move: [number, number], look: [number, number] = [0, 0], buttons = 0): SimInput => ({ move, look, buttons });

describe('buttons', () => {
  it('map each action to its own bit', () => {
    const masks = ACTION_BUTTONS.map((button) => buttonMask(button));
    expect(new Set(masks).size).toBe(ACTION_BUTTONS.length);
    expect(buttonMask('jump', 'use')).toBe(masks.reduce((a, b) => a | b, 0));
    expect(isHeld(buttonMask('use'), 'use')).toBe(true);
    expect(isHeld(buttonMask('use'), 'jump')).toBe(false);
  });
});

describe('quantizeInput', () => {
  it('keeps the idle input as is', () => {
    expect(quantizeInput(IDLE_INPUT)).toEqual(IDLE_INPUT);
  });

  it('snaps values to the log grid', () => {
    expect(inputToUnits(input([0.12345, -0.9876], [0.000123456, -0.5], 3))).toEqual([123, -988, 12, -50000, 3]);
    expect(inputToUnits(input([0, -1], [0, 0], 0))).toEqual([0, -1000, 0, 0, 0]);
  });

  it('limits movement to the unit circle', () => {
    const [x, y] = quantizeInput(input([1, 1])).move;
    expect(Math.hypot(x, y)).toBeLessThanOrEqual(1);
    expect(x).toBeCloseTo(Math.SQRT1_2, 2);
    expect(quantizeInput(input([5, 0])).move).toEqual([1, 0]);
  });

  it('cleans up garbage', () => {
    const q = quantizeInput(input([Number.NaN, Number.POSITIVE_INFINITY], [100, Number.NaN], 0b1111_0110));
    expect(q.move).toEqual([0, 0]);
    expect(q.look[0]).toBeLessThanOrEqual(MAX_LOOK_PER_TICK);
    expect(q.look[1]).toBe(0);
    expect(q.buttons).toBe(buttonMask('use'));
  });

  it('is idempotent and survives JSON (no -0, no drift)', () => {
    const rng = createSeededRng('quantize');
    for (let i = 0; i < 5000; i++) {
      const raw = input(
        [rng.range(-1.5, 1.5), rng.range(-1.5, 1.5)],
        [rng.range(-0.05, 0.05), rng.range(-0.05, 0.05)],
        rng.int(0, 7),
      );
      const once = quantizeInput(raw);
      expect(quantizeInput(once)).toEqual(once);
      expect(inputToUnits(once)).toEqual(inputToUnits(raw));
      expect(JSON.parse(JSON.stringify(once))).toEqual(once);
      expect(Object.is(once.move[0], -0)).toBe(false);
    }
  });

  it('round-trips through log units', () => {
    const units = [-707, 707, -31416, 12, 1] as const;
    expect(inputToUnits(inputFromUnits(units))).toEqual(units);
  });
});
