import { TICK_DT } from '@dream/core';

/**
 * Accumulator for a fixed-step simulation ("Fix Your Timestep"): real time
 * from the browser is collected, and whole ticks of `dt` are taken out of it.
 * The leftover fraction of a tick is the render interpolation factor.
 *
 * The frame rate decides only how many ticks run per frame — never what a
 * tick does — so 30 Hz and 144 Hz screens produce the same states (D-005).
 * Nothing here touches the DOM; the caller feeds it timestamps.
 */
export interface FixedStepOptions {
  /** Called once per tick, in order. */
  onTick: () => void;
  /** Tick length, seconds. Default: the core's `TICK_DT`. */
  dt?: number;
  /**
   * Longest stretch of real time one frame may simulate, seconds. A frame
   * after a hitch or a hidden tab drops the excess instead of running
   * hundreds of ticks at once (and falling further behind).
   */
  maxFrameTime?: number;
}

export interface FixedStepLoop {
  /** Feeds a frame timestamp in ms (e.g. from `requestAnimationFrame`); returns `alpha`. */
  frame(nowMs: number): number;
  /** Feeds elapsed real time in seconds; runs the ticks it covers and returns `alpha`. */
  advance(elapsed: number): number;
  /**
   * How far real time has moved past the last tick, in ticks: 0..1. Render
   * draws `lerp(previous, current, alpha)`.
   */
  readonly alpha: number;
  /** Total ticks run. */
  readonly ticks: number;
  /** Forgets the last timestamp, so the next `frame` simulates nothing (e.g. after a pause). */
  resetClock(): void;
}

export const DEFAULT_MAX_FRAME_TIME = 0.25;

export function createFixedStepLoop({ onTick, dt = TICK_DT, maxFrameTime = DEFAULT_MAX_FRAME_TIME }: FixedStepOptions): FixedStepLoop {
  if (!(dt > 0)) throw new RangeError(`Tick length must be positive, got ${dt}.`);
  let accumulator = 0;
  let ticks = 0;
  let lastMs: number | null = null;

  const advance = (elapsed: number): number => {
    accumulator += Math.min(maxFrameTime, Math.max(0, Number.isFinite(elapsed) ? elapsed : 0));
    while (accumulator >= dt) {
      accumulator -= dt;
      ticks += 1;
      onTick();
    }
    return accumulator / dt;
  };

  return {
    frame(nowMs) {
      const elapsed = lastMs === null ? 0 : (nowMs - lastMs) / 1000;
      lastMs = nowMs;
      return advance(elapsed);
    },
    advance,
    get alpha() {
      return accumulator / dt;
    },
    get ticks() {
      return ticks;
    },
    resetClock() {
      lastMs = null;
    },
  };
}
