/**
 * Abstract player input for one simulation tick. The core knows nothing about
 * keys, mice or touches: the app turns DOM events into a `SimInput` once per
 * tick (D-005).
 *
 * Every value is quantized to a fixed grid before the simulation sees it, so
 * the input log stores small integers and a replay feeds the simulation
 * bit-identical numbers.
 */

/** A 2D vector as a plain tuple (JSON-friendly). */
export type Vec2 = readonly [number, number];

/**
 * Action buttons, in bit order: `ACTION_BUTTONS[i]` is bit `1 << i` of
 * `SimInput.buttons`. Append new buttons at the end; reordering breaks
 * recorded logs.
 */
export const ACTION_BUTTONS = ['jump', 'use'] as const;

export type ActionButton = (typeof ACTION_BUTTONS)[number];

export interface SimInput {
  /**
   * Movement intent in the player's own frame: `[right, forward]`, each in
   * [-1, 1]. Vectors longer than 1 are scaled down to length 1.
   */
  move: Vec2;
  /**
   * Look change for this tick, radians: `[yaw, pitch]`. Positive yaw turns
   * left (counter-clockwise seen from above), positive pitch looks up.
   */
  look: Vec2;
  /** Bit mask of the buttons held during this tick, see `ACTION_BUTTONS`. */
  buttons: number;
}

/** Resolution of `move`: one log unit. */
export const MOVE_UNITS = 1000;
/** Resolution of `look`: one log unit is 1e-5 rad (≈ 0.0006°). */
export const LOOK_UNITS = 100_000;
/** Bit mask with every known button set. */
export const ALL_BUTTONS = (1 << ACTION_BUTTONS.length) - 1;
/** Largest look change per tick, radians; anything above is a glitch, not a turn. */
export const MAX_LOOK_PER_TICK = Math.PI;

export const IDLE_INPUT: SimInput = { move: [0, 0], look: [0, 0], buttons: 0 };

/** Bit of `button` in `SimInput.buttons`. */
export function buttonBit(button: ActionButton): number {
  return 1 << ACTION_BUTTONS.indexOf(button);
}

/** True while `button` is held in the bit mask `buttons`. */
export function isHeld(buttons: number, button: ActionButton): boolean {
  return (buttons & buttonBit(button)) !== 0;
}

/** Bit mask of `buttons`, for building inputs: `buttonMask('jump', 'use')`. */
export function buttonMask(...buttons: readonly ActionButton[]): number {
  return buttons.reduce((mask, button) => mask | buttonBit(button), 0);
}

const finiteOr0 = (value: number): number => (Number.isFinite(value) ? value : 0);
const clampTo = (value: number, limit: number): number => Math.min(limit, Math.max(-limit, value));

/**
 * Integer log units of an input: `[moveX, moveY, lookYaw, lookPitch, buttons]`.
 * Non-finite values become 0, movement is clamped to the unit circle and look
 * to `MAX_LOOK_PER_TICK`, unknown button bits are dropped.
 */
export function inputToUnits(input: SimInput): [number, number, number, number, number] {
  const [x, y] = input.move.map((v) => clampTo(finiteOr0(v), 1)) as [number, number];
  let moveX = Math.round(x * MOVE_UNITS);
  let moveY = Math.round(y * MOVE_UNITS);
  // Decided on the integer grid so that quantizing twice changes nothing.
  // Truncation keeps the scaled vector inside the unit circle.
  if (moveX * moveX + moveY * moveY > MOVE_UNITS * MOVE_UNITS) {
    const length = Math.hypot(x, y);
    moveX = Math.trunc((x / length) * MOVE_UNITS);
    moveY = Math.trunc((y / length) * MOVE_UNITS);
  }
  const [yaw, pitch] = input.look.map((v) => clampTo(finiteOr0(v), MAX_LOOK_PER_TICK)) as [number, number];
  return [
    moveX + 0,
    moveY + 0,
    Math.round(yaw * LOOK_UNITS) + 0,
    Math.round(pitch * LOOK_UNITS) + 0,
    (Number.isInteger(input.buttons) ? input.buttons : 0) & ALL_BUTTONS,
  ];
}

/** Input back from integer log units. */
export function inputFromUnits(units: readonly [number, number, number, number, number]): SimInput {
  const [x, y, yaw, pitch, buttons] = units;
  // `+ 0` turns -0 into 0, so a quantized input survives a JSON round trip unchanged.
  return {
    move: [x / MOVE_UNITS + 0, y / MOVE_UNITS + 0],
    look: [yaw / LOOK_UNITS + 0, pitch / LOOK_UNITS + 0],
    buttons,
  };
}

/**
 * Snaps an input to the log grid. The simulation only ever sees quantized
 * input, which is what makes `replay` exact. Idempotent.
 */
export function quantizeInput(input: SimInput): SimInput {
  return inputFromUnits(inputToUnits(input));
}
