import {
  IDLE_INPUT,
  SCENE_RULES,
  createInitialState,
  createInputRecorder,
  generateDream,
  step,
  type Dream,
  type DreamSeed,
  type InputLog,
  type SceneRulesMap,
  type SimInput,
  type SimState,
} from '@dream/core';
import { createFixedStepLoop, type FixedStepOptions } from './fixed-step';
import { interpolateFrame, type FrameView } from './interpolate';

/**
 * One played dream: the core simulation driven by the fixed-step loop, with
 * every tick's input recorded so that `replay(seed, inputLog())` gives the
 * same run (D-001).
 */
export interface DreamSessionOptions {
  seed: DreamSeed;
  /**
   * Input for the tick about to run. Called exactly once per tick; the input
   * layer samples its keys, stick and mouse here. Default: no input.
   */
  readInput?: (tick: number) => SimInput;
  /** Scene rules; default: the core's `SCENE_RULES`. */
  rules?: SceneRulesMap;
  /** Passed to the fixed-step loop. */
  maxFrameTime?: FixedStepOptions['maxFrameTime'];
}

export interface DreamSession {
  readonly dream: Dream;
  /** State after the latest tick. */
  readonly state: SimState;
  /** State one tick earlier (equal to `state` before the first tick). */
  readonly previous: SimState;
  /** Feeds a frame timestamp in ms, runs the due ticks and returns what to draw. */
  frame(nowMs: number): FrameView;
  /** Same as `frame`, with elapsed seconds instead of a timestamp. */
  advance(elapsed: number): FrameView;
  /** Forgets the last timestamp, e.g. after a pause, so no time is simulated for it. */
  resetClock(): void;
  /** Input log of the run so far. */
  inputLog(): InputLog;
}

export function createDreamSession({
  seed,
  readInput = () => IDLE_INPUT,
  rules = SCENE_RULES,
  maxFrameTime,
}: DreamSessionOptions): DreamSession {
  const dream = generateDream(seed);
  const recorder = createInputRecorder();
  let state = createInitialState(dream, rules);
  let previous = state;

  const loop = createFixedStepLoop({
    maxFrameTime,
    onTick: () => {
      // The recorder quantizes the input; stepping with its result keeps the
      // live run identical to the replay.
      const input = recorder.record(readInput(state.tick));
      previous = state;
      state = step(dream, state, input, rules);
    },
  });

  const view = (alpha: number): FrameView => interpolateFrame(previous, state, alpha);

  return {
    dream,
    get state() {
      return state;
    },
    get previous() {
      return previous;
    },
    frame: (nowMs) => view(loop.frame(nowMs)),
    advance: (elapsed) => view(loop.advance(elapsed)),
    resetClock: () => loop.resetClock(),
    inputLog: () => recorder.toLog(),
  };
}
