import { buttonBit, type SimInput, type Vec2 } from '@dream/core';

/**
 * Player input without the DOM: the controller feeds it key codes, mouse
 * deltas and touch points, and the session takes one `SimInput` per tick
 * with `sample()` (D-012). Everything here is plain arithmetic, so it is
 * unit-tested directly.
 *
 * Conventions follow the core: `move` is `[right, forward]`, `look` is
 * `[yaw, pitch]` in radians with positive yaw turning left and positive
 * pitch looking up. Moving the mouse (or a finger) right turns right, so a
 * positive screen dx is a negative yaw; screen y grows downwards, so a
 * positive dy looks down.
 */

export interface InputSettings {
  /** Look per mouse pixel under pointer lock, radians. */
  mouseSensitivity: number;
  /** Look per CSS pixel of a swipe on the right half, radians. */
  touchLookSensitivity: number;
  /** Mouse movement of a single event above this is a browser glitch and is clamped, px. */
  maxMouseStep: number;
  /** Distance from the stick's origin that means full speed, CSS px. */
  stickRadius: number;
  /** Fraction of `stickRadius` ignored around the origin. */
  stickDeadZone: number;
  /** A touch on the look side shorter than this… */
  tapMaxMs: number;
  /** …that travelled less than this (CSS px) is a tap: the `use` action. */
  tapMaxDistance: number;
}

export const DEFAULT_INPUT_SETTINGS: InputSettings = {
  mouseSensitivity: 0.0025,
  touchLookSensitivity: 0.006,
  maxMouseStep: 400,
  stickRadius: 56,
  stickDeadZone: 0.12,
  tapMaxMs: 250,
  tapMaxDistance: 12,
};

/** Physical key codes (`KeyboardEvent.code`), so WASD works on any layout. */
const MOVE_KEYS: Readonly<Record<string, Vec2>> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

const KEY_BUTTONS: Readonly<Record<string, number>> = {
  Space: buttonBit('jump'),
  KeyE: buttonBit('use'),
};

/** Mouse button 0 (primary) under pointer lock is `use`. */
const MOUSE_BUTTONS: Readonly<Record<number, number>> = {
  0: buttonBit('use'),
};

/** True for keys the game handles (their browser default, like scrolling, is suppressed). */
export function isGameKey(code: string): boolean {
  return code in MOVE_KEYS || code in KEY_BUTTONS;
}

/** Scales a vector longer than 1 down to length 1. */
export function clampToUnit([x, y]: Vec2): Vec2 {
  const length = Math.hypot(x, y);
  return length > 1 ? [x / length, y / length] : [x, y];
}

/** Movement `[right, forward]` from the held keys; opposite keys cancel, diagonals have length 1. */
export function moveFromKeys(held: Iterable<string>): Vec2 {
  let x = 0;
  let y = 0;
  for (const code of new Set(held)) {
    const dir = MOVE_KEYS[code];
    if (dir) {
      x += dir[0];
      y += dir[1];
    }
  }
  // Arrows and WASD for the same direction must not add up to double speed.
  return clampToUnit([Math.sign(x), Math.sign(y)]);
}

/** Button mask of the held keys. */
export function buttonsFromKeys(held: Iterable<string>): number {
  let mask = 0;
  for (const code of held) mask |= KEY_BUTTONS[code] ?? 0;
  return mask;
}

/**
 * Virtual stick: a finger `dx, dy` CSS px away from where it touched down.
 * Full speed at `radius`; the dead zone is cut out and the rest rescaled, so
 * the speed still starts from 0 at its edge.
 */
export function stickVector(dx: number, dy: number, radius: number, deadZone: number): Vec2 {
  const distance = Math.hypot(dx, dy);
  if (!(radius > 0) || distance === 0) return [0, 0];
  const amount = Math.min(1, distance / radius);
  if (amount <= deadZone) return [0, 0];
  const scaled = (amount - deadZone) / (1 - deadZone);
  // Screen y grows downwards; pushing the stick up walks forward.
  return [(dx / distance) * scaled + 0, (-dy / distance) * scaled + 0];
}

/** Look change `[yaw, pitch]` for a pointer moving `dx, dy` pixels. */
export function lookFromPixels(dx: number, dy: number, sensitivity: number): Vec2 {
  return [-dx * sensitivity + 0, -dy * sensitivity + 0];
}

/** Which half of the screen a touch belongs to. */
export type TouchRole = 'stick' | 'look';

/** Where the stick is drawn: its origin and the clamped knob, CSS px. */
export interface StickView {
  originX: number;
  originY: number;
  knobX: number;
  knobY: number;
  radius: number;
}

export interface InputState {
  keyDown(code: string): void;
  keyUp(code: string): void;
  /** Mouse movement under pointer lock, px. */
  mouseMove(dx: number, dy: number): void;
  mouseButton(button: number, down: boolean): void;
  /**
   * A finger touched down at `x, y` on a surface `width` px wide. The left
   * half drives the stick, the right half looks around; a second finger on a
   * half that is already taken is ignored (returns null).
   */
  touchStart(id: number, x: number, y: number, width: number, timeMs: number): TouchRole | null;
  touchMove(id: number, x: number, y: number): void;
  touchEnd(id: number, x: number, y: number, timeMs: number): void;
  /** The browser took the touch away (gesture, alert): no tap. */
  touchCancel(id: number): void;
  /** The stick to draw, or null when no finger drives it. */
  stick(): StickView | null;
  /**
   * Input of the next tick. Mouse and swipe movement collected since the
   * previous call is consumed; a press shorter than a tick (a tap, a quick
   * click) is still held for this one tick, so the simulation sees it.
   */
  sample(): SimInput;
  /** Releases everything held and drops pending movement (focus lost, pause). */
  clear(): void;
}

interface TouchTrack {
  role: TouchRole;
  startX: number;
  startY: number;
  startMs: number;
  x: number;
  y: number;
  /** Farthest the finger has been from its start, px. */
  travel: number;
}

export function createInputState(settings: InputSettings = DEFAULT_INPUT_SETTINGS): InputState {
  const keys = new Set<string>();
  const touches = new Map<number, TouchTrack>();
  let mouseButtons = 0;
  let lookYaw = 0;
  let lookPitch = 0;
  /** Buttons pressed since the last sample; held for at least one tick. */
  let latched = 0;

  const addLook = (dx: number, dy: number, sensitivity: number) => {
    const [yaw, pitch] = lookFromPixels(dx, dy, sensitivity);
    lookYaw += yaw;
    lookPitch += pitch;
  };

  const touchOf = (role: TouchRole): TouchTrack | undefined => {
    for (const touch of touches.values()) if (touch.role === role) return touch;
    return undefined;
  };

  const touchMove = (id: number, x: number, y: number) => {
    const touch = touches.get(id);
    if (!touch) return;
    if (touch.role === 'look') addLook(x - touch.x, y - touch.y, settings.touchLookSensitivity);
    touch.x = x;
    touch.y = y;
    touch.travel = Math.max(touch.travel, Math.hypot(x - touch.startX, y - touch.startY));
  };

  const finite = (value: number) => (Number.isFinite(value) ? value : 0);
  const clampStep = (value: number) => Math.max(-settings.maxMouseStep, Math.min(settings.maxMouseStep, finite(value)));

  return {
    keyDown(code) {
      keys.add(code);
      latched |= KEY_BUTTONS[code] ?? 0;
    },
    keyUp(code) {
      keys.delete(code);
    },
    mouseMove(dx, dy) {
      addLook(clampStep(dx), clampStep(dy), settings.mouseSensitivity);
    },
    mouseButton(button, down) {
      const bit = MOUSE_BUTTONS[button] ?? 0;
      if (down) {
        mouseButtons |= bit;
        latched |= bit;
      } else {
        mouseButtons &= ~bit;
      }
    },
    touchStart(id, x, y, width, timeMs) {
      const role: TouchRole = x < width / 2 ? 'stick' : 'look';
      if (touches.has(id) || touchOf(role)) return null;
      touches.set(id, { role, startX: x, startY: y, startMs: timeMs, x, y, travel: 0 });
      return role;
    },
    touchMove,
    touchEnd(id, x, y, timeMs) {
      const touch = touches.get(id);
      if (!touch) return;
      touchMove(id, x, y);
      touches.delete(id);
      const tap =
        touch.role === 'look' && timeMs - touch.startMs <= settings.tapMaxMs && touch.travel < settings.tapMaxDistance;
      if (tap) latched |= buttonBit('use');
    },
    touchCancel(id) {
      touches.delete(id);
    },
    stick() {
      const touch = touchOf('stick');
      if (!touch) return null;
      const dx = touch.x - touch.startX;
      const dy = touch.y - touch.startY;
      const distance = Math.hypot(dx, dy);
      const k = distance > settings.stickRadius ? settings.stickRadius / distance : 1;
      return {
        originX: touch.startX,
        originY: touch.startY,
        knobX: touch.startX + dx * k,
        knobY: touch.startY + dy * k,
        radius: settings.stickRadius,
      };
    },
    sample() {
      const stickTouch = touchOf('stick');
      const stick = stickTouch
        ? stickVector(
            stickTouch.x - stickTouch.startX,
            stickTouch.y - stickTouch.startY,
            settings.stickRadius,
            settings.stickDeadZone,
          )
        : ([0, 0] as const);
      const fromKeys = moveFromKeys(keys);
      const move = clampToUnit([fromKeys[0] + stick[0], fromKeys[1] + stick[1]]);
      const input: SimInput = {
        move,
        look: [lookYaw, lookPitch],
        buttons: buttonsFromKeys(keys) | mouseButtons | latched,
      };
      lookYaw = 0;
      lookPitch = 0;
      latched = 0;
      return input;
    },
    clear() {
      keys.clear();
      touches.clear();
      mouseButtons = 0;
      lookYaw = 0;
      lookPitch = 0;
      latched = 0;
    },
  };
}
