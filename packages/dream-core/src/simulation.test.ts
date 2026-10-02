import { describe, expect, it } from 'vitest';
import { generateDream } from './dream';
import { IDLE_INPUT, buttonMask, isHeld, type SimInput } from './input';
import { createInputRecorder, parseInputLog, serializeInputLog } from './input-log';
import { DREAM_TEMPERATURE } from './profile';
import { normalizeSeed } from './seed';
import {
  EYE_HEIGHT,
  MAX_PITCH,
  SCENE_RULES,
  SIMULATION_CHANNEL,
  TICK_DT,
  WALK_SPEED,
  createInitialState,
  replay,
  runInputs,
  sceneDurationTicks,
  step,
  type SceneRulesMap,
  type SimState,
} from './simulation';
import { sceneRng } from './streams';
import { randomInputs, testSeeds } from './test-utils';
import { ENGINE_VERSION } from './version';

const seed = normalizeSeed('DREAM-8F72-A19C-37B2');
const dream = generateDream(seed);
const totalTicks = dream.scenes.reduce((sum, scene) => sum + sceneDurationTicks(scene), 0);
/**
 * No scene rules: every scene simply lasts its `duration` and the hero walks
 * freely (the real yard waits for its swing, the real apartment keeps him in
 * bed on the prologue's own clock; their rules have tests of their own).
 */
const timed: SceneRulesMap = {};

const forward: SimInput = { move: [0, 1], look: [0, 0], buttons: 0 };
const repeat = (input: SimInput, ticks: number): SimInput[] => Array.from({ length: ticks }, () => input);

/** Records `inputs` the way the app does: quantize via the recorder, then step. */
function liveRun(inputs: readonly SimInput[], rules?: SceneRulesMap) {
  const live = generateDream(seed);
  const recorder = createInputRecorder();
  let state = createInitialState(live, rules);
  for (const input of inputs) state = step(live, state, recorder.record(input), rules);
  return { state, log: recorder.toLog() };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('createInitialState', () => {
  const state = createInitialState(dream, timed);

  it('starts the first scene at tick 0 with the dream temperature', () => {
    expect(state).toMatchObject({
      engineVersion: ENGINE_VERSION,
      seed,
      tick: 0,
      sceneIndex: 0,
      sceneTick: 0,
      temperature: DREAM_TEMPERATURE,
      buttons: 0,
      sceneVars: {},
      finished: false,
    });
    expect(state.player).toEqual({ position: [0, EYE_HEIGHT, 0], yaw: 0, pitch: 0 });
  });

  it('keeps the RNG of the first scene inside the state', () => {
    expect(state.rng).toEqual(sceneRng(seed, 0, SIMULATION_CHANNEL).state());
  });

  it('is plain JSON data', () => {
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe('createInitialState with startScene', () => {
  const yard = dream.scenes.findIndex((scene) => scene.id === 'yard');

  it('starts the dream in the given scene with its own stream and enter hook', () => {
    const entered: number[] = [];
    const rules: SceneRulesMap = {
      yard: { enter: (state) => (entered.push(state.sceneIndex), { ...state, sceneVars: { entered: 1 } }) },
    };
    const state = createInitialState(dream, rules, { startScene: yard });
    expect(state).toMatchObject({ tick: 0, sceneIndex: yard, sceneTick: 0, sceneVars: { entered: 1 } });
    expect(state.rng).toEqual(sceneRng(seed, yard, SIMULATION_CHANNEL).state());
    expect(entered).toEqual([yard]);
  });

  it('defaults to the first scene', () => {
    expect(createInitialState(dream, undefined, {})).toEqual(createInitialState(dream));
  });

  it('refuses a scene the dream does not have', () => {
    expect(() => createInitialState(dream, undefined, { startScene: dream.scenes.length })).toThrow(RangeError);
    expect(() => createInitialState(dream, undefined, { startScene: -1 })).toThrow(RangeError);
    expect(() => createInitialState(dream, undefined, { startScene: 0.5 })).toThrow(RangeError);
  });

  it('replays a run that began in a later scene', () => {
    const recorder = createInputRecorder();
    let state = createInitialState(dream, undefined, { startScene: yard });
    for (const input of randomInputs(900, 'start-scene')) state = step(dream, state, recorder.record(input));
    expect(replay(seed, recorder.toLog(), undefined, { startScene: yard })).toEqual(state);
  });
});

describe('step', () => {
  it('advances by exactly one tick and never mutates its input', () => {
    const state = deepFreeze(createInitialState(dream));
    const next = step(dream, state, forward);
    expect(next.tick).toBe(1);
    expect(next.sceneTick).toBe(1);
    expect(step(dream, state, forward)).toEqual(next);
  });

  it('walks WALK_SPEED metres per second along the view direction', () => {
    const start = createInitialState(dream, timed);
    const ahead = runInputs(dream, start, repeat(forward, 60), timed);
    expect(ahead.player.position[0]).toBeCloseTo(0, 9);
    expect(ahead.player.position[1]).toBe(EYE_HEIGHT);
    expect(ahead.player.position[2]).toBeCloseTo(-WALK_SPEED, 9);

    const turned = runInputs(
      dream,
      start,
      [{ ...IDLE_INPUT, look: [Math.PI / 2, 0] }, ...repeat(forward, 60)],
      timed,
    );
    expect(turned.player.yaw).toBeCloseTo(Math.PI / 2, 4);
    expect(turned.player.position[0]).toBeCloseTo(-WALK_SPEED, 3);
    expect(turned.player.position[2]).toBeCloseTo(0, 3);
  });

  it('clamps pitch', () => {
    const up = runInputs(
      dream,
      createInitialState(dream, timed),
      repeat({ ...IDLE_INPUT, look: [0, 0.5] }, 10),
      timed,
    );
    expect(up.player.pitch).toBe(MAX_PITCH);
  });

  it('remembers held buttons for press detection', () => {
    const next = step(dream, createInitialState(dream), { ...IDLE_INPUT, buttons: buttonMask('jump') });
    expect(isHeld(next.buttons, 'jump')).toBe(true);
  });

  it('keeps the temperature in the apartment, before the hero falls asleep (model: temperature.test.ts)', () => {
    const end = runInputs(dream, createInitialState(dream), randomInputs(sceneDurationTicks(dream.scenes[0]!) - 1));
    expect(end.temperature).toBe(DREAM_TEMPERATURE);
  });

  it('refuses a state from another dream', () => {
    const other = generateDream(normalizeSeed('DREAM-0000-0000-0000'));
    expect(() => step(other, createInitialState(dream), IDLE_INPUT)).toThrow(RangeError);
  });
});

describe('scene timeline', () => {
  it('moves to the next scene when its duration has elapsed, then finishes', () => {
    let state = createInitialState(dream, timed);
    const changes: number[] = [];
    for (let i = 0; i < totalTicks + 10; i++) {
      const next = step(dream, state, IDLE_INPUT, timed);
      if (next.sceneIndex !== state.sceneIndex) {
        changes.push(next.tick);
        expect(next.sceneTick).toBe(0);
        // A scene whose `enter` draws from the stream starts further along it.
        if (!SCENE_RULES[dream.scenes[next.sceneIndex]!.id]?.enter) {
          expect(next.rng).toEqual(sceneRng(seed, next.sceneIndex, SIMULATION_CHANNEL).state());
        }
      }
      if (next.finished && !state.finished) expect(next.tick).toBe(totalTicks);
      state = next;
    }
    let at = 0;
    const expected = dream.scenes.slice(0, -1).map((scene) => (at += sceneDurationTicks(scene)));
    expect(changes).toEqual(expected);
    expect(state.finished).toBe(true);
    expect(state.sceneIndex).toBe(dream.scenes.length - 1);
    expect(state.tick).toBe(totalTicks + 10);
  });

  it('matches the nominal dream length', () => {
    expect(Math.abs(totalTicks * TICK_DT - dream.duration)).toBeLessThan(dream.scenes.length * TICK_DT);
  });

  it('freezes everything but the tick counter after the end', () => {
    const end = runInputs(dream, createInitialState(dream, timed), repeat(IDLE_INPUT, totalTicks), timed);
    const after = runInputs(dream, end, randomInputs(100), timed);
    expect(after).toEqual({ ...end, tick: end.tick + 100 });
  });
});

describe('replay', () => {
  it.each(testSeeds(3, 'test/replay-seeds'))('reproduces a random run of %s through the whole dream', (s) => {
    const live = generateDream(s);
    const recorder = createInputRecorder();
    let state = createInitialState(live, timed);
    for (const input of randomInputs(totalTicks + 600, `replay/${s}`)) {
      state = step(live, state, recorder.record(input), timed);
    }

    const log = parseInputLog(serializeInputLog(recorder.toLog()));
    const replayed = replay(s, log, timed);
    expect(replayed).toEqual(state);
    expect(replayed.finished).toBe(true);
  });

  it.each(testSeeds(3, 'test/replay-seeds'))('reproduces a random run of %s with the real scene rules', (s) => {
    const live = generateDream(s);
    const recorder = createInputRecorder();
    let state = createInitialState(live);
    for (const input of randomInputs(totalTicks, `replay-rules/${s}`)) state = step(live, state, recorder.record(input));
    expect(state.sceneIndex).toBeGreaterThan(0);
    expect(replay(s, parseInputLog(serializeInputLog(recorder.toLog())))).toEqual(state);
  });

  it('notices a single changed tick', () => {
    const { state, log } = liveRun(randomInputs(1000, 'tamper'));
    const changes = log.changes.map((change) => [...change] as [number, number, number, number, number, number]);
    const middle = changes[Math.floor(changes.length / 2)]!;
    middle[3] += 1; // 1e-5 rad of yaw on one tick
    expect(replay(seed, { ...log, changes })).not.toEqual(state);
  });

  it('stops at the last logged tick', () => {
    const { state, log } = liveRun(randomInputs(1234));
    const replayed = replay(seed, log);
    expect(replayed.tick).toBe(1234);
    expect(replayed).toEqual(state);
  });

  it('resumes from a JSON checkpoint without drift', () => {
    const inputs = randomInputs(4000, 'checkpoint');
    const whole = runInputs(dream, createInitialState(dream), inputs);
    const half = runInputs(dream, createInitialState(dream), inputs.slice(0, 1777));
    const restored = JSON.parse(JSON.stringify(half)) as SimState;
    expect(runInputs(dream, restored, inputs.slice(1777))).toEqual(whole);
  });

  it('refuses a log from another engine version', () => {
    const { log } = liveRun(randomInputs(10));
    expect(() => replay(seed, { ...log, engineVersion: ENGINE_VERSION + 1 })).toThrow(RangeError);
  });
});

describe('scene rules (extension point)', () => {
  const use = buttonMask('use');
  // A toy apartment: every tick draws a number; pressing "use" ends the scene.
  const rules: SceneRulesMap = {
    apartment: {
      enter: (state, { rng }) => ({ ...state, sceneVars: { entered: 1, roll: rng.next() } }),
      update: (state, { rng, pressed }) => ({
        ...state,
        sceneVars: { ...state.sceneVars, roll: rng.next(), presses: (state.sceneVars.presses ?? 0) + (pressed & use ? 1 : 0) },
      }),
      isComplete: (state) => (state.sceneVars.presses ?? 0) >= 2,
    },
  };
  const press = (ticks: number): SimInput[] => [...repeat({ ...IDLE_INPUT, buttons: use }, ticks), IDLE_INPUT];

  it('runs enter, update and the custom exit condition', () => {
    const initial = createInitialState(dream, rules);
    expect(initial.sceneVars.entered).toBe(1);
    expect(initial.rng).not.toEqual(sceneRng(seed, 0, SIMULATION_CHANNEL).state());

    // Holding the button counts as one press: the scene needs two.
    const held = runInputs(dream, initial, press(30), rules);
    expect(held.sceneVars.presses).toBe(1);
    expect(held.sceneIndex).toBe(0);

    const next = step(dream, held, { ...IDLE_INPUT, buttons: use }, rules);
    expect(next.sceneIndex).toBe(1);
    expect(next.tick).toBe(32);
    expect(next.sceneVars).toEqual({});
  });

  it('stays deterministic under replay', () => {
    const inputs = randomInputs(2000, 'rules');
    const { state, log } = liveRun(inputs, rules);
    expect(replay(seed, log, rules)).toEqual(state);
    expect(state.sceneIndex).toBeGreaterThan(0);
  });
});
