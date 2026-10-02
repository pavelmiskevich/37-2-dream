import { describe, expect, it } from 'vitest';
import { generateDream } from './dream';
import { IDLE_INPUT, buttonMask, type SimInput } from './input';
import { createInputRecorder, parseInputLog, serializeInputLog } from './input-log';
import { DREAM_TEMPERATURE } from './profile';
import type { SceneId } from './scenes';
import { normalizeSeed } from './seed';
import {
  TICK_DT,
  TICK_RATE,
  createInitialState,
  replay,
  runInputs,
  sceneDurationTicks,
  step,
  type SceneRules,
  type SceneRulesMap,
  type SimState,
} from './simulation';
import {
  DREAMING_SCENES,
  TEMPERATURE_MODEL,
  applyHeat,
  driftTemperature,
  isDreamingScene,
  temperatureAtLeast,
  temperatureWakeReason,
  temperatureWobble,
  thermometerReading,
  type TemperatureModel,
} from './temperature';
import { randomInputs, testSeeds } from './test-utils';

const seed = normalizeSeed('DREAM-8F72-A19C-37B2');
const dream = generateDream(seed);
const indexOf = (id: SceneId) => dream.scenes.findIndex((scene) => scene.id === id);
const yard = indexOf('yard');
const awakening = indexOf('awakening');
const ticksBefore = (index: number) =>
  dream.scenes.slice(0, index).reduce((sum, scene) => sum + sceneDurationTicks(scene), 0);

const idle = (ticks: number): SimInput[] => Array.from({ length: ticks }, () => IDLE_INPUT);
const model = TEMPERATURE_MODEL;

/** Steps idle until the dream reaches scene `index`. */
function stateAtScene(index: number, rules?: SceneRulesMap): SimState {
  let state = createInitialState(dream, rules);
  while (state.sceneIndex < index) state = step(dream, state, IDLE_INPUT, rules);
  return state;
}

describe('temperatureWobble', () => {
  const period = model.wobblePeriod;
  const a = model.wobbleAmplitude;

  it('breathes 37.1 → 37.2 → 37.3 → 37.2 around the course: up first, then down', () => {
    expect(temperatureWobble(0)).toBe(0);
    expect(temperatureWobble(period / 4)).toBeCloseTo(a, 12);
    expect(temperatureWobble(period / 2)).toBeCloseTo(0, 12);
    expect(temperatureWobble((3 * period) / 4)).toBeCloseTo(-a, 12);
    expect(temperatureWobble(period)).toBeCloseTo(0, 12);
  });

  it('stays within ±amplitude and changes slowly', () => {
    let previous = temperatureWobble(0);
    for (let tick = 1; tick < period * 3 * TICK_RATE; tick++) {
      const value = temperatureWobble(tick * TICK_DT);
      expect(Math.abs(value)).toBeLessThanOrEqual(a + 1e-12);
      expect(Math.abs(value - previous)).toBeLessThanOrEqual((4 * a * TICK_DT) / period + 1e-12);
      previous = value;
    }
  });
});

describe('driftTemperature', () => {
  const still: TemperatureModel = { ...model, wobbleAmplitude: 0 };

  it('keeps the setpoint when nothing happens', () => {
    let t = model.setpoint;
    for (let tick = 0; tick < 60 * TICK_RATE; tick++) t = driftTemperature(t, tick * TICK_DT, TICK_DT, still);
    expect(t).toBe(model.setpoint);
  });

  it('settles a deviation back towards the setpoint over settleTime (e times)', () => {
    for (const offset of [1.2, -0.15]) {
      let t = model.setpoint + offset;
      const ticks = model.settleTime * TICK_RATE;
      for (let tick = 0; tick < ticks; tick++) t = driftTemperature(t, tick * TICK_DT, TICK_DT, still);
      expect((t - model.setpoint) / offset).toBeCloseTo(Math.exp(-1), 2);
    }
  });

  it('is slow: a degree of fever takes more than a minute to fade by half', () => {
    let t = model.setpoint + 1;
    for (let tick = 0; tick < 60 * TICK_RATE; tick++) t = driftTemperature(t, tick * TICK_DT, TICK_DT, still);
    expect(t - model.setpoint).toBeGreaterThan(0.2);
    expect(t - model.setpoint).toBeLessThan(1);
  });

  it('follows the breathing around the setpoint', () => {
    let t = model.setpoint;
    let low = t;
    let high = t;
    for (let tick = 0; tick < model.wobblePeriod * TICK_RATE; tick++) {
      t = driftTemperature(t, tick * TICK_DT, TICK_DT);
      low = Math.min(low, t);
      high = Math.max(high, t);
    }
    expect(high).toBeCloseTo(model.setpoint + model.wobbleAmplitude, 2);
    expect(low).toBeCloseTo(model.setpoint - model.wobbleAmplitude, 2);
  });

  it('stays within the model bounds', () => {
    expect(driftTemperature(50, 0, TICK_DT)).toBe(model.max);
    expect(driftTemperature(20, 0, TICK_DT)).toBe(model.min);
  });
});

describe('heat sources and thresholds', () => {
  it('applyHeat adds degrees within bounds and keeps the rest of the state', () => {
    const state = { temperature: 37.2, other: 'kept' };
    expect(applyHeat(state, 0.5)).toEqual({ temperature: 37.7, other: 'kept' });
    expect(applyHeat(state, -0.3).temperature).toBeCloseTo(36.9, 12);
    expect(applyHeat(state, 100).temperature).toBe(model.max);
    expect(applyHeat(state, -100).temperature).toBe(model.min);
    expect(state.temperature).toBe(37.2);
  });

  it('wakes below wakeBelow as a malingerer and above wakeAbove as overheated', () => {
    expect(temperatureWakeReason(model.wakeBelow)).toBeNull();
    expect(temperatureWakeReason(model.wakeBelow - 0.001)).toBe('malingerer');
    expect(temperatureWakeReason(model.wakeAbove)).toBeNull();
    expect(temperatureWakeReason(model.wakeAbove + 0.001)).toBe('overheated');
    expect(temperatureWakeReason(DREAM_TEMPERATURE)).toBeNull();
    expect(temperatureWakeReason(38, { ...model, wakeAbove: 37.9 })).toBe('overheated');
  });

  it('keeps the whole breathing range of the setpoint inside the safe zone', () => {
    expect(model.setpoint - model.wobbleAmplitude).toBeGreaterThan(model.wakeBelow);
    expect(model.setpoint + model.wobbleAmplitude).toBeLessThan(model.wakeAbove);
  });

  it('reads thermometers to a tenth and judges conditions by the reading', () => {
    expect(thermometerReading(37.249)).toBe(37.2);
    expect(thermometerReading(37.25)).toBe(37.3);
    expect(temperatureAtLeast({ temperature: 37.2 }, 37.2)).toBe(true);
    expect(temperatureAtLeast({ temperature: 37.16 }, 37.2)).toBe(true);
    expect(temperatureAtLeast({ temperature: 37.14 }, 37.2)).toBe(false);
    expect(temperatureAtLeast({ temperature: 38.5 }, 37.2)).toBe(true);
  });

  it('treats only the scenes inside the dream as dreaming', () => {
    expect(DREAMING_SCENES).toEqual(['yard', 'fall', 'jam']);
    expect(isDreamingScene('apartment')).toBe(false);
    expect(isDreamingScene('awakening')).toBe(false);
  });
});

describe('temperature in step', () => {
  it('stays put in the apartment, before the hero falls asleep', () => {
    const state = runInputs(dream, createInitialState(dream), randomInputs(ticksBefore(yard) - 1));
    expect(state.sceneIndex).toBe(0);
    expect(state.temperature).toBe(DREAM_TEMPERATURE);
  });

  it('drifts during the dream but holds when nobody touches it; the dream runs its course', () => {
    // No scene rules: every scene lasts its duration (the real yard waits for its swing).
    const timed: SceneRulesMap = {};
    let state = createInitialState(dream, timed);
    let low = Infinity;
    let high = -Infinity;
    let moved = false;
    while (!state.finished) {
      const next = step(dream, state, IDLE_INPUT, timed);
      if (isDreamingScene(dream.scenes[next.sceneIndex]!.id)) {
        low = Math.min(low, next.temperature);
        high = Math.max(high, next.temperature);
        moved ||= next.temperature !== state.temperature;
      }
      if (next.sceneIndex === awakening && state.sceneIndex !== awakening) {
        expect(next.wakeReason).toBe('tea_brought');
        expect(next.tick).toBe(ticksBefore(awakening));
      }
      if (next.sceneIndex < awakening) expect(next.wakeReason).toBeUndefined();
      state = next;
    }
    expect(moved).toBe(true);
    expect(low).toBeGreaterThan(model.wakeBelow);
    expect(high).toBeLessThan(model.wakeAbove);
    expect(state.wakeReason).toBe('tea_brought');
  });

  it('lets scene rules heat the hero after the drift of the same tick', () => {
    const jolt: SceneRulesMap = { yard: { update: (state) => applyHeat(state, 0.25) } };
    const before = stateAtScene(yard, jolt);
    const plain = step(dream, before, IDLE_INPUT);
    const heated = step(dream, before, IDLE_INPUT, jolt);
    expect(heated.temperature - plain.temperature).toBeCloseTo(0.25, 12);
  });

  it('wakes the hero as a malingerer when a scene cools him below the threshold', () => {
    const rules: SceneRulesMap = { yard: { update: (state) => applyHeat(state, -0.5 * TICK_DT) } };
    let state = stateAtScene(yard, rules);
    while (state.sceneIndex === yard) state = step(dream, state, IDLE_INPUT, rules);
    expect(state.sceneIndex).toBe(awakening);
    expect(state.sceneTick).toBe(0);
    expect(state.wakeReason).toBe('malingerer');
    expect(state.finished).toBe(false);
    expect(state.temperature).toBeLessThan(model.wakeBelow);
    expect(state.temperature).toBeGreaterThan(model.wakeBelow - 0.01);
    // Awake: the temperature no longer changes, the awakening scene plays out.
    const later = runInputs(dream, state, idle(120), rules);
    expect(later.temperature).toBe(state.temperature);
    expect(later.wakeReason).toBe('malingerer');
  });

  it('wakes the hero as overheated when the brain has had enough', () => {
    const fall = indexOf('fall');
    const rules: SceneRulesMap = { fall: { update: (state) => applyHeat(state, 1.5 * TICK_DT) } };
    let state = stateAtScene(fall, rules);
    let ticks = 0;
    while (state.sceneIndex === fall) {
      state = step(dream, state, IDLE_INPUT, rules);
      ticks++;
    }
    expect(state.sceneIndex).toBe(awakening);
    expect(state.wakeReason).toBe('overheated');
    expect(state.temperature).toBeGreaterThan(model.wakeAbove);
    // ~1.8 °C at 1.5 °C/s plus the drift fighting back: a little over a second.
    expect(ticks).toBeGreaterThan(TICK_RATE);
    expect(ticks).toBeLessThan(2 * TICK_RATE);
  });

  it('finishes the dream when there is no awakening scene ahead', () => {
    const rules: SceneRulesMap = { yard: { update: (state) => applyHeat(state, -1) } };
    const short = { ...dream, scenes: dream.scenes.slice(0, awakening) };
    let state = createInitialState(short, rules);
    while (state.sceneIndex < yard) state = step(short, state, IDLE_INPUT, rules);
    state = step(short, state, IDLE_INPUT, rules);
    expect(state).toMatchObject({ finished: true, wakeReason: 'malingerer', sceneIndex: yard });
  });

  it('opens a transition only at the right temperature', () => {
    const use = buttonMask('use');
    // A door that opens at 37.6: every press of "use" adds 0.2 °C.
    const rules: SceneRulesMap = {
      yard: {
        update: (state, { pressed }) => (pressed & use ? applyHeat(state, 0.2) : state),
        isComplete: (state) => temperatureAtLeast(state, 37.6),
      },
    };
    const press: SimInput[] = [{ ...IDLE_INPUT, buttons: use }, IDLE_INPUT];
    let state = stateAtScene(yard, rules);
    state = runInputs(dream, state, press, rules);
    expect(state.sceneIndex).toBe(yard);
    state = runInputs(dream, state, [...press, ...press], rules);
    expect(state.sceneIndex).toBe(yard + 1);
  });
});

describe('temperature determinism', () => {
  // A restless player whose buttons heat and cool: lots of early awakenings.
  const jump = buttonMask('jump');
  const use = buttonMask('use');
  const restless: SceneRules = {
    update: (state, { input, rng }) => {
      let next = state;
      if (input.buttons & jump) next = applyHeat(next, 0.6 * TICK_DT);
      if (input.buttons & use) next = applyHeat(next, -0.4 * TICK_DT);
      return applyHeat(next, (rng.next() - 0.5) * 0.01);
    },
  };
  const rules: SceneRulesMap = { yard: restless, fall: restless, jam: restless };

  it.each(testSeeds(4, 'test/temperature-seeds'))('replays a run of %s with heat sources bit for bit', (s) => {
    const live = generateDream(s);
    const recorder = createInputRecorder();
    let state = createInitialState(live, rules);
    for (const input of randomInputs(12000, `temperature/${s}`)) state = step(live, state, recorder.record(input), rules);
    const log = parseInputLog(serializeInputLog(recorder.toLog()));
    expect(replay(s, log, rules)).toEqual(state);
    expect(state.wakeReason).toBeDefined();
  });

  it('resumes from a JSON checkpoint taken mid-fever', () => {
    const inputs = randomInputs(6000, 'temperature/checkpoint');
    const whole = runInputs(dream, createInitialState(dream, rules), inputs, rules);
    const half = runInputs(dream, createInitialState(dream, rules), inputs.slice(0, 2500), rules);
    const restored = JSON.parse(JSON.stringify(half)) as SimState;
    expect(runInputs(dream, restored, inputs.slice(2500), rules)).toEqual(whole);
  });

  it('is pinned: the idle course of the temperature (changing it requires an ENGINE_VERSION bump)', () => {
    const at = (seconds: number) => {
      const state = runInputs(dream, stateAtScene(yard), idle(seconds * TICK_RATE));
      return Number(state.temperature.toFixed(9));
    };
    expect([at(1), at(6), at(15), at(30)]).toMatchInlineSnapshot(`
      [
        37.216543191,
        37.299303405,
        37.158436178,
        37.297361464,
      ]
    `);
  });
});
