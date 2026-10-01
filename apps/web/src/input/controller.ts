import type { SimInput } from '@dream/core';
import { createInputState, isGameKey, type InputState } from './input-state';

/**
 * DOM side of the controls: turns keyboard, mouse (under Pointer Lock) and
 * touch events into calls on an `InputState`. Desktop: WASD/arrows to walk,
 * mouse to look, Space — jump, E or left click — use. Touch: a floating stick
 * on the left half, swipe to look on the right half, tap — use.
 */
export interface InputControllerOptions {
  /** Surface that takes touches and the pointer lock: the game canvas. */
  target: HTMLElement;
  state?: InputState;
  /** Pointer lock was held and is gone (Esc, Alt+Tab): the game pauses. */
  onLockLost?: () => void;
  /** Esc pressed while the pointer is not locked (no lock: touch, or a refused request). */
  onEscape?: () => void;
}

export interface InputController {
  readonly state: InputState;
  /** For `createDreamSession({ readInput })`: one sample per tick. */
  readInput(tick: number): SimInput;
  /** While disabled (sleep screen, pause) events are ignored and nothing is held. */
  setEnabled(enabled: boolean): void;
  readonly enabled: boolean;
  /** Asks for pointer lock; call from a user gesture. Failure is silent: keys still work. */
  requestLock(): void;
  readonly locked: boolean;
  /** True once a finger has touched the target: the device is played by touch. */
  readonly touch: boolean;
  dispose(): void;
}

export function createInputController({
  target,
  state = createInputState(),
  onLockLost,
  onEscape,
}: InputControllerOptions): InputController {
  let enabled = false;
  let locked = false;
  let touch = false;
  const controller = new AbortController();
  const listen = { signal: controller.signal };

  const requestLock = () => {
    if (locked || typeof target.requestPointerLock !== 'function') return;
    try {
      // Chrome returns a promise that rejects e.g. when re-locking too soon after Esc.
      const result: unknown = target.requestPointerLock();
      if (result instanceof Promise) result.catch(() => {});
    } catch {
      // Not allowed here (no gesture, iframe): play on without mouse look.
    }
  };

  const local = (event: PointerEvent) => {
    const rect = target.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width };
  };

  // --- Keyboard -----------------------------------------------------------

  window.addEventListener(
    'keydown',
    (event) => {
      if (event.code === 'Escape') {
        if (!locked) onEscape?.();
        return;
      }
      if (!enabled || event.ctrlKey || event.metaKey || event.altKey || !isGameKey(event.code)) return;
      event.preventDefault();
      if (!event.repeat) state.keyDown(event.code);
    },
    listen,
  );
  window.addEventListener('keyup', (event) => state.keyUp(event.code), listen);
  window.addEventListener('blur', () => state.clear(), listen);

  // --- Mouse: look and buttons under pointer lock -------------------------

  document.addEventListener(
    'pointerlockchange',
    () => {
      const wasLocked = locked;
      locked = document.pointerLockElement === target;
      if (!locked) state.clear();
      if (wasLocked && !locked) onLockLost?.();
    },
    listen,
  );
  document.addEventListener(
    'mousemove',
    (event) => {
      if (enabled && locked) state.mouseMove(event.movementX, event.movementY);
    },
    listen,
  );
  document.addEventListener(
    'mousedown',
    (event) => {
      if (enabled && locked) state.mouseButton(event.button, true);
    },
    listen,
  );
  document.addEventListener('mouseup', (event) => state.mouseButton(event.button, false), listen);

  // --- Pointer: a mouse click takes the lock back, fingers drive stick and look

  target.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType === 'mouse') {
        if (enabled && !locked) requestLock();
        return;
      }
      touch = true;
      // Also suppresses the emulated mouse events that would follow the touch.
      event.preventDefault();
      if (!enabled) return;
      const { x, y, width } = local(event);
      if (state.touchStart(event.pointerId, x, y, width, event.timeStamp)) {
        target.setPointerCapture?.(event.pointerId);
      }
    },
    listen,
  );
  target.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'mouse' || !enabled) return;
      const { x, y } = local(event);
      state.touchMove(event.pointerId, x, y);
    },
    listen,
  );
  target.addEventListener(
    'pointerup',
    (event) => {
      if (event.pointerType === 'mouse') return;
      const { x, y } = local(event);
      state.touchEnd(event.pointerId, x, y, event.timeStamp);
    },
    listen,
  );
  target.addEventListener(
    'pointercancel',
    (event) => {
      if (event.pointerType !== 'mouse') state.touchCancel(event.pointerId);
    },
    listen,
  );
  // Long press must not open the context menu over the game.
  target.addEventListener('contextmenu', (event) => event.preventDefault(), listen);

  return {
    state,
    readInput: () => state.sample(),
    setEnabled(value) {
      enabled = value;
      state.clear();
    },
    get enabled() {
      return enabled;
    },
    requestLock,
    get locked() {
      return locked;
    },
    get touch() {
      return touch;
    },
    dispose() {
      controller.abort();
      if (locked) document.exitPointerLock();
      state.clear();
    },
  };
}
