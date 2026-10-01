import { describe, expect, it } from 'vitest';
import { buttonMask, isHeld, quantizeInput } from '@dream/core';
import {
  DEFAULT_INPUT_SETTINGS,
  buttonsFromKeys,
  clampToUnit,
  createInputState,
  isGameKey,
  lookFromPixels,
  moveFromKeys,
  stickVector,
} from './input-state';

const settings = DEFAULT_INPUT_SETTINGS;
const WIDTH = 400;

describe('moveFromKeys', () => {
  it('maps WASD and arrows to [right, forward]', () => {
    expect(moveFromKeys(['KeyW'])).toEqual([0, 1]);
    expect(moveFromKeys(['KeyS'])).toEqual([0, -1]);
    expect(moveFromKeys(['KeyA'])).toEqual([-1, 0]);
    expect(moveFromKeys(['ArrowRight'])).toEqual([1, 0]);
    expect(moveFromKeys([])).toEqual([0, 0]);
  });

  it('cancels opposite keys and keeps diagonals at length 1', () => {
    expect(moveFromKeys(['KeyW', 'KeyS'])).toEqual([0, 0]);
    const [x, y] = moveFromKeys(['KeyW', 'KeyD']);
    expect(Math.hypot(x, y)).toBeCloseTo(1, 12);
    expect(x).toBeCloseTo(y, 12);
  });

  it('does not double the speed for a key and its arrow twin', () => {
    expect(moveFromKeys(['KeyW', 'ArrowUp'])).toEqual([0, 1]);
  });

  it('ignores keys that do not move', () => {
    expect(moveFromKeys(['KeyQ', 'Space'])).toEqual([0, 0]);
  });
});

describe('buttonsFromKeys / isGameKey', () => {
  it('maps Space to jump and E to use', () => {
    expect(buttonsFromKeys(['Space'])).toBe(buttonMask('jump'));
    expect(buttonsFromKeys(['KeyE', 'KeyW'])).toBe(buttonMask('use'));
    expect(buttonsFromKeys(['Space', 'KeyE'])).toBe(buttonMask('jump', 'use'));
  });

  it('knows the game keys', () => {
    expect(isGameKey('KeyW')).toBe(true);
    expect(isGameKey('Space')).toBe(true);
    expect(isGameKey('Escape')).toBe(false);
    expect(isGameKey('F5')).toBe(false);
  });
});

describe('stickVector', () => {
  const r = 50;

  it('pushing up walks forward, right strafes right', () => {
    expect(stickVector(0, -r, r, 0)).toEqual([0, 1]);
    expect(stickVector(r, 0, r, 0)).toEqual([1, 0]);
    expect(stickVector(0, r, r, 0)).toEqual([0, -1]);
  });

  it('saturates at the radius', () => {
    const [x, y] = stickVector(300, -400, r, 0.1);
    expect(Math.hypot(x, y)).toBeCloseTo(1, 12);
    expect(x).toBeCloseTo(0.6, 12);
    expect(y).toBeCloseTo(0.8, 12);
  });

  it('cuts the dead zone and rescales from its edge', () => {
    expect(stickVector(4, 0, r, 0.1)).toEqual([0, 0]);
    expect(stickVector(5, 0, r, 0.1)).toEqual([0, 0]);
    expect(stickVector(27.5, 0, r, 0.1)[0]).toBeCloseTo(0.5, 12);
  });

  it('is zero without displacement or radius', () => {
    expect(stickVector(0, 0, r, 0.1)).toEqual([0, 0]);
    expect(stickVector(10, 10, 0, 0.1)).toEqual([0, 0]);
  });
});

describe('lookFromPixels', () => {
  it('turns right (negative yaw) for a move to the right and looks up for a move up', () => {
    expect(lookFromPixels(10, 0, 0.01)).toEqual([-0.1, 0]);
    expect(lookFromPixels(0, -10, 0.01)).toEqual([0, 0.1]);
    expect(lookFromPixels(0, 0, 0.01)).toEqual([0, 0]);
  });
});

describe('clampToUnit', () => {
  it('only scales down', () => {
    expect(clampToUnit([0.3, 0.4])).toEqual([0.3, 0.4]);
    expect(clampToUnit([3, 4])).toEqual([0.6, 0.8]);
  });
});

describe('createInputState', () => {
  it('is idle by default', () => {
    expect(createInputState().sample()).toEqual({ move: [0, 0], look: [0, 0], buttons: 0 });
  });

  it('holds keys across ticks until released', () => {
    const input = createInputState();
    input.keyDown('KeyW');
    expect(input.sample().move).toEqual([0, 1]);
    expect(input.sample().move).toEqual([0, 1]);
    input.keyUp('KeyW');
    expect(input.sample().move).toEqual([0, 0]);
  });

  it('accumulates mouse movement between ticks and consumes it once', () => {
    const input = createInputState();
    input.mouseMove(10, 0);
    input.mouseMove(30, -20);
    const first = input.sample();
    expect(first.look[0]).toBeCloseTo(-40 * settings.mouseSensitivity, 12);
    expect(first.look[1]).toBeCloseTo(20 * settings.mouseSensitivity, 12);
    expect(input.sample().look).toEqual([0, 0]);
  });

  it('accumulated look survives quantization within one log unit', () => {
    const input = createInputState();
    for (let i = 0; i < 7; i++) input.mouseMove(3, 1);
    const look = quantizeInput(input.sample()).look;
    expect(look[0]).toBeCloseTo(-21 * settings.mouseSensitivity, 5);
    expect(look[1]).toBeCloseTo(-7 * settings.mouseSensitivity, 5);
  });

  it('clamps glitchy mouse jumps and ignores non-finite deltas', () => {
    const input = createInputState();
    input.mouseMove(10_000, Number.NaN);
    expect(input.sample().look[0]).toBeCloseTo(-settings.maxMouseStep * settings.mouseSensitivity, 12);
  });

  it('keeps a press shorter than a tick for one tick', () => {
    const input = createInputState();
    input.keyDown('Space');
    input.keyUp('Space');
    expect(isHeld(input.sample().buttons, 'jump')).toBe(true);
    expect(input.sample().buttons).toBe(0);

    input.mouseButton(0, true);
    input.mouseButton(0, false);
    expect(isHeld(input.sample().buttons, 'use')).toBe(true);
    expect(input.sample().buttons).toBe(0);
  });

  it('holds the primary mouse button as use while it is down', () => {
    const input = createInputState();
    input.mouseButton(0, true);
    input.sample();
    expect(isHeld(input.sample().buttons, 'use')).toBe(true);
    input.mouseButton(0, false);
    expect(input.sample().buttons).toBe(0);
    input.mouseButton(2, true);
    expect(input.sample().buttons).toBe(0);
  });

  it('combines keys and stick, never above length 1', () => {
    const input = createInputState();
    input.keyDown('KeyW');
    input.touchStart(1, 100, 300, WIDTH, 0);
    input.touchMove(1, 100 + settings.stickRadius, 300);
    const [x, y] = input.sample().move;
    expect(Math.hypot(x, y)).toBeCloseTo(1, 12);
    expect(x).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it('clear() releases everything', () => {
    const input = createInputState();
    input.keyDown('KeyW');
    input.mouseButton(0, true);
    input.mouseMove(50, 50);
    input.touchStart(1, 100, 300, WIDTH, 0);
    input.clear();
    expect(input.sample()).toEqual({ move: [0, 0], look: [0, 0], buttons: 0 });
    expect(input.stick()).toBeNull();
  });
});

describe('touch controls', () => {
  it('left half is the stick: drag up walks forward', () => {
    const input = createInputState();
    expect(input.touchStart(1, 80, 600, WIDTH, 0)).toBe('stick');
    input.touchMove(1, 80, 600 - settings.stickRadius * 2);
    expect(input.sample().move).toEqual([0, 1]);
    input.touchEnd(1, 80, 500, 1000);
    expect(input.sample().move).toEqual([0, 0]);
  });

  it('draws the stick at its origin with the knob clamped to the radius', () => {
    const input = createInputState();
    expect(input.stick()).toBeNull();
    input.touchStart(1, 80, 600, WIDTH, 0);
    input.touchMove(1, 80 + 300, 600);
    expect(input.stick()).toEqual({
      originX: 80,
      originY: 600,
      knobX: 80 + settings.stickRadius,
      knobY: 600,
      radius: settings.stickRadius,
    });
  });

  it('right half looks around: swipe left turns left, swipe down looks down', () => {
    const input = createInputState();
    expect(input.touchStart(2, 300, 400, WIDTH, 0)).toBe('look');
    input.touchMove(2, 280, 400);
    input.touchMove(2, 260, 410);
    const look = input.sample().look;
    expect(look[0]).toBeCloseTo(40 * settings.touchLookSensitivity, 12);
    expect(look[1]).toBeCloseTo(-10 * settings.touchLookSensitivity, 12);
    expect(input.sample().look).toEqual([0, 0]);
    // The finger keeps its last position: the next move adds only its own delta.
    input.touchMove(2, 250, 410);
    expect(input.sample().look[0]).toBeCloseTo(10 * settings.touchLookSensitivity, 12);
  });

  it('a short tap on the right half is use, for exactly one tick', () => {
    const input = createInputState();
    input.touchStart(2, 300, 400, WIDTH, 1000);
    input.touchEnd(2, 303, 402, 1000 + settings.tapMaxMs - 1);
    expect(isHeld(input.sample().buttons, 'use')).toBe(true);
    expect(input.sample().buttons).toBe(0);
  });

  it('a swipe, a long press or a tap on the stick is not use', () => {
    const input = createInputState();
    input.touchStart(2, 300, 400, WIDTH, 0);
    input.touchMove(2, 300 - settings.tapMaxDistance - 1, 400);
    input.touchEnd(2, 300, 400, 100);
    expect(input.sample().buttons).toBe(0);

    input.touchStart(3, 300, 400, WIDTH, 0);
    input.touchEnd(3, 300, 400, settings.tapMaxMs + 1);
    expect(input.sample().buttons).toBe(0);

    input.touchStart(4, 50, 400, WIDTH, 0);
    input.touchEnd(4, 50, 400, 10);
    expect(input.sample().buttons).toBe(0);
  });

  it('a cancelled touch is not a tap', () => {
    const input = createInputState();
    input.touchStart(2, 300, 400, WIDTH, 0);
    input.touchCancel(2);
    input.touchEnd(2, 300, 400, 10);
    expect(input.sample().buttons).toBe(0);
  });

  it('stick and look work with two fingers at once; a third finger on a taken half is ignored', () => {
    const input = createInputState();
    expect(input.touchStart(1, 80, 600, WIDTH, 0)).toBe('stick');
    expect(input.touchStart(2, 300, 400, WIDTH, 0)).toBe('look');
    expect(input.touchStart(3, 90, 500, WIDTH, 0)).toBeNull();
    expect(input.touchStart(4, 350, 500, WIDTH, 0)).toBeNull();
    input.touchMove(1, 80, 600 - settings.stickRadius);
    input.touchMove(2, 310, 400);
    input.touchMove(3, 0, 0);
    const sample = input.sample();
    expect(sample.move).toEqual([0, 1]);
    expect(sample.look[0]).toBeCloseTo(-10 * settings.touchLookSensitivity, 12);
  });
});
