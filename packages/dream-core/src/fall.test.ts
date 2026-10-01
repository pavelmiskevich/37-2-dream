import { describe, expect, it } from 'vitest';
import { findScene, generateDream } from './dream';
import { FALL_DRIFT, FALL_HEAT, fallMonitorIntensity, fallenFraction } from './fall';
import { IDLE_INPUT, type SimInput } from './input';
import { createInputRecorder } from './input-log';
import { normalizeSeed } from './seed';
import {
  EYE_HEIGHT,
  SCENE_RULES,
  createInitialState,
  replay,
  runInputs,
  sceneDurationTicks,
  step,
  type SceneRulesMap,
  type SimState,
} from './simulation';
import { randomInputs, testSeeds } from './test-utils';

const seed = normalizeSeed('DREAM-8F72-A19C-37B2');
const dream = generateDream(seed);
const fall = findScene(dream, 'fall')!;
const fallTicks = sceneDurationTicks(fall);

/** Real rules, with the scenes before the fall skipped in one tick each. */
const skipToFall: SceneRulesMap = {
  ...SCENE_RULES,
  apartment: { isComplete: () => true },
  yard: { isComplete: () => true },
};

function enterFall(inputs: readonly SimInput[] = []): SimState {
  const start = runInputs(dream, createInitialState(dream, skipToFall), [IDLE_INPUT, IDLE_INPUT], skipToFall);
  expect(start.sceneIndex).toBe(fall.index);
  return runInputs(dream, start, inputs, skipToFall);
}

const repeat = (input: SimInput, ticks: number): SimInput[] => Array.from({ length: ticks }, () => input);
const v = (state: SimState, key: string) => state.sceneVars[key]!;

describe('fall curves', () => {
  it('falls the whole height, faster at the end', () => {
    expect(fallenFraction(0)).toBe(0);
    expect(fallenFraction(1)).toBe(1);
    expect(fallenFraction(0.75) - fallenFraction(0.5)).toBeGreaterThan(fallenFraction(0.25) - fallenFraction(0));
  });

  it('speeds the monitor up towards the landing', () => {
    expect(fallMonitorIntensity(0)).toBeLessThan(0.5);
    expect(fallMonitorIntensity(1)).toBe(1);
    expect(fallMonitorIntensity(0.8)).toBeGreaterThan(fallMonitorIntensity(0.4));
  });
});

describe('fall rules', () => {
  it('start on the fall axis at the full height', () => {
    const state = enterFall();
    expect(state.sceneTick).toBe(0);
    expect(state.player.position).toEqual([0, EYE_HEIGHT + fall.params.height, 0]);
    expect(v(state, 'progress')).toBe(0);
    expect(v(state, 'altitude')).toBe(fall.params.height);
    expect(v(state, 'monitor')).toBeCloseTo(0.3, 9);
  });

  it('lose altitude every tick and land in the jam when the scene ends', () => {
    let state = enterFall();
    let previous = v(state, 'altitude');
    for (let i = 1; i < fallTicks; i++) {
      state = step(dream, state, IDLE_INPUT, skipToFall);
      expect(state.sceneIndex).toBe(fall.index);
      expect(v(state, 'altitude')).toBeLessThan(previous);
      previous = v(state, 'altitude');
    }
    const landed = step(dream, state, IDLE_INPUT, skipToFall);
    expect(landed.sceneIndex).toBe(fall.index + 1);
    expect(dream.scenes[landed.sceneIndex]!.id).toBe('jam');
    // The landing pose carries over into the jam.
    expect(landed.player.position[1]).toBeCloseTo(EYE_HEIGHT, 9);
  });

  it('keep the generated timeline', () => {
    const state = enterFall(repeat(IDLE_INPUT, fallTicks - 1));
    expect(state.sceneIndex).toBe(fall.index);
    expect(step(dream, state, IDLE_INPUT, skipToFall).sceneIndex).toBe(fall.index + 1);
  });

  it('let the hero drift a little, relative to where he looks', () => {
    const forward = enterFall(repeat({ ...IDLE_INPUT, move: [0, 1] }, 60));
    expect(forward.player.position[2]).toBeLessThan(-0.5);
    expect(Math.abs(forward.player.position[0])).toBeLessThan(1e-9);

    const turned = enterFall([{ ...IDLE_INPUT, look: [Math.PI / 2, 0] }, ...repeat({ ...IDLE_INPUT, move: [0, 1] }, 60)]);
    expect(turned.player.position[0]).toBeLessThan(-0.5);
    expect(Math.abs(turned.player.position[2])).toBeLessThan(1e-3);
  });

  it('never let the hero drift further than the radius or faster than the limit', () => {
    const state = enterFall(repeat({ ...IDLE_INPUT, move: [1, 0] }, fallTicks - 1));
    const [x, , z] = state.player.position;
    expect(Math.hypot(x, z)).toBeLessThanOrEqual(FALL_DRIFT.radius + 1e-9);
    expect(Math.hypot(x, z)).toBeCloseTo(FALL_DRIFT.radius, 6);
    expect(Math.hypot(v(state, 'vx'), v(state, 'vz'))).toBeLessThanOrEqual(FALL_DRIFT.maxSpeed + 1e-9);
  });

  it('let the hero look around freely', () => {
    const state = enterFall(repeat({ ...IDLE_INPUT, look: [0.01, -0.01] }, 50));
    expect(state.player.yaw).toBeCloseTo(0.5, 6);
    expect(state.player.pitch).toBeCloseTo(-0.5, 6);
  });

  it('tumble the camera as much as the scene says', () => {
    const tumbleOf = (tumble: number) => {
      const tumbling = generateDream(seed);
      const scene = findScene(tumbling, 'fall')!;
      scene.params.tumble = tumble;
      let state = runInputs(tumbling, createInitialState(tumbling, skipToFall), [IDLE_INPUT, IDLE_INPUT], skipToFall);
      let most = 0;
      for (let i = 0; i < 600; i++) {
        state = step(tumbling, state, IDLE_INPUT, skipToFall);
        most = Math.max(most, Math.abs(v(state, 'roll')), Math.abs(v(state, 'sway')));
      }
      return most;
    };
    expect(tumbleOf(0)).toBe(0);
    expect(tumbleOf(0.3)).toBeGreaterThan(0.05);
    expect(tumbleOf(1)).toBeGreaterThan(tumbleOf(0.3));
  });

  it('draw the tumble from the scene simulation stream: same seed, same tumble', () => {
    const a = enterFall(repeat(IDLE_INPUT, 100));
    const b = enterFall(repeat(IDLE_INPUT, 100));
    expect(a).toEqual(b);
    const other = generateDream(normalizeSeed('DREAM-0000-0000-0000'));
    const otherState = runInputs(other, createInitialState(other, skipToFall), repeat(IDLE_INPUT, 102), skipToFall);
    expect(v(otherState, 'rollPhase')).not.toBe(v(a, 'rollPhase'));
  });

  it('heat the hero a little as the ground nears, never enough to wake him', () => {
    const calm: SceneRulesMap = { ...skipToFall, fall: {} };
    const before = runInputs(dream, createInitialState(dream, calm), repeat(IDLE_INPUT, 1 + fallTicks), calm);
    const after = enterFall(repeat(IDLE_INPUT, fallTicks - 1));
    const heat = after.temperature - before.temperature;
    expect(heat).toBeGreaterThan(0.05);
    expect(heat).toBeLessThan(FALL_HEAT * fall.duration);
    expect(after.wakeReason).toBeUndefined();
  });

  it('is plain JSON data', () => {
    const state = enterFall(randomInputs(300, 'fall/json'));
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe('fall rules under replay', () => {
  it.each(testSeeds(3, 'test/fall-replay'))('replays a restless fall of %s exactly', (s) => {
    const live = generateDream(s);
    const recorder = createInputRecorder();
    let state = createInitialState(live, skipToFall);
    const ticks = 2 + sceneDurationTicks(findScene(live, 'fall')!) + 30;
    for (const input of randomInputs(ticks, `fall/${s}`)) state = step(live, state, recorder.record(input), skipToFall);
    expect(replay(s, recorder.toLog(), skipToFall)).toEqual(state);
    expect(state.sceneIndex).toBeGreaterThan(findScene(live, 'fall')!.index);
  });
});
