import { describe, expect, it } from 'vitest';
import {
  APARTMENT,
  APARTMENT_PHASES,
  apartmentPhase,
  apartmentPhaseAt,
  apartmentSleep,
  apartmentTimeline,
  type ApartmentPhase,
} from './apartment';
import { findScene, generateDream } from './dream';
import { IDLE_INPUT, type SimInput } from './input';
import { createInputRecorder } from './input-log';
import { NIGHTSTAND_ITEMS } from './scenes';
import { normalizeSeed } from './seed';
import {
  EYE_HEIGHT,
  SCENE_RULES,
  SIMULATION_CHANNEL,
  TICK_DT,
  createInitialState,
  replay,
  runInputs,
  step,
  type SceneRulesMap,
  type SimState,
} from './simulation';
import { sceneRng } from './streams';
import { randomInputs, testSeeds } from './test-utils';

const seed = normalizeSeed('DREAM-8F72-A19C-37B2');
const dream = generateDream(seed);
const apartment = findScene(dream, 'apartment')!;
const timeline = apartmentTimeline(apartment, TICK_DT);
const apartments = testSeeds(1000, 'test/apartment-seeds').map((s) => findScene(generateDream(s), 'apartment')!);

const idle = (ticks: number): SimInput[] => Array.from({ length: ticks }, () => IDLE_INPUT);
const walkAndLook = (ticks: number, look: [number, number]): SimInput[] =>
  Array.from({ length: ticks }, () => ({ move: [1, 1], look, buttons: 0 }));

describe('apartment parameters', () => {
  it('vary the last words and the bedside table by seed', () => {
    const values = <T>(list: T[]): T[] => [...new Set(list)].sort();
    expect(values(apartments.map((a) => a.params.lastWords.opening))).toEqual([
      'if_i_dont_wake_up',
      'last_request',
      'none',
      'remember_my_words',
      'this_is_the_end',
      'too_late_for_doctors',
    ]);
    expect(values(apartments.map((a) => a.params.lastWords.trail))).toEqual([
      'none',
      'not_to_wait',
      'that_everything',
      'that_i',
      'the_bowl',
    ]);
    expect(values(apartments.flatMap((a) => a.params.nightstand))).toHaveLength(9);
    expect(values(apartments.map((a) => a.params.nightstand.length))).toEqual([NIGHTSTAND_ITEMS.min, NIGHTSTAND_ITEMS.max]);
  });

  it('never put the same thing on the bedside table twice', () => {
    for (const a of apartments) expect(new Set(a.params.nightstand).size).toBe(a.params.nightstand.length);
  });
});

describe('apartmentTimeline', () => {
  it('lasts 20–40 seconds for every seed', () => {
    for (const a of apartments) {
      const seconds = apartmentTimeline(a, TICK_DT).asleepAt * TICK_DT;
      expect(seconds).toBeGreaterThanOrEqual(20);
      expect(seconds).toBeLessThanOrEqual(40);
    }
  });

  it('puts the phases in order, with `sleepDelay` between the last words and sleep', () => {
    for (const a of apartments) {
      const t = apartmentTimeline(a, TICK_DT);
      expect(0).toBeLessThan(t.speakAt);
      expect(t.speakAt).toBeLessThan(t.silentAt);
      expect(t.silentAt).toBeLessThan(t.sleepAt);
      expect(t.sleepAt).toBeLessThan(t.asleepAt);
      expect((t.sleepAt - t.silentAt) * TICK_DT).toBeCloseTo(a.params.sleepDelay, 9);
    }
  });

  it('names the phase at any tick', () => {
    const at = (tick: number): ApartmentPhase => apartmentPhaseAt(timeline, tick);
    expect(at(0)).toBe('awake');
    expect(at(timeline.speakAt - 1)).toBe('awake');
    expect(at(timeline.speakAt)).toBe('speaking');
    expect(at(timeline.silentAt)).toBe('silent');
    expect(at(timeline.sleepAt)).toBe('falling_asleep');
    expect(at(timeline.asleepAt - 1)).toBe('falling_asleep');
    expect(at(timeline.asleepAt)).toBe('asleep');
  });
});

describe('apartment rules', () => {
  const start = createInitialState(dream);

  it('are registered for the apartment', () => {
    expect(SCENE_RULES.apartment?.isComplete).toBeTypeOf('function');
  });

  it('put the hero in bed, looking at the bedside table', () => {
    expect(start.player).toEqual({ position: APARTMENT.eye, yaw: APARTMENT.startYaw, pitch: APARTMENT.startPitch });
    expect(apartmentPhase(start)).toBe('awake');
    expect(apartmentSleep(start)).toBe(0);
  });

  it('keep him in bed whatever the stick says', () => {
    const state = runInputs(dream, start, walkAndLook(300, [0, 0]));
    expect(state.player.position).toEqual(APARTMENT.eye);
  });

  it('let him turn his head only as far as a man lying on a pillow can', () => {
    const left = runInputs(dream, start, walkAndLook(200, [0.05, 0.05]));
    expect(left.player.yaw).toBe(APARTMENT.yaw.max);
    expect(left.player.pitch).toBe(APARTMENT.pitch.max);
    const right = runInputs(dream, start, walkAndLook(200, [-0.05, -0.05]));
    expect(right.player.yaw).toBe(APARTMENT.yaw.min);
    expect(right.player.pitch).toBe(APARTMENT.pitch.min);
  });

  it('go through the phases in order while sleep only deepens', () => {
    let state: SimState = start;
    const seen: ApartmentPhase[] = [apartmentPhase(state)];
    let sleep = 0;
    while (state.sceneIndex === 0) {
      state = step(dream, state, IDLE_INPUT);
      if (state.sceneIndex !== 0) break;
      const phase = apartmentPhase(state);
      if (seen.at(-1) !== phase) seen.push(phase);
      expect(apartmentSleep(state)).toBeGreaterThanOrEqual(sleep);
      sleep = apartmentSleep(state);
    }
    expect(seen).toEqual(['awake', 'speaking', 'silent', 'falling_asleep']);
    expect(sleep).toBeGreaterThan(0.95);
  });

  it('end the scene when he is asleep and hand the dream a standing hero', () => {
    // Only the apartment's rules: the real yard puts the hero in its own place.
    const rules: SceneRulesMap = { apartment: SCENE_RULES.apartment };
    const before = runInputs(dream, createInitialState(dream, rules), idle(timeline.asleepAt - 1), rules);
    expect(before.sceneIndex).toBe(0);
    expect(apartmentPhase(before)).toBe('falling_asleep');

    const after = step(dream, before, IDLE_INPUT, rules);
    expect(after.tick).toBe(timeline.asleepAt);
    expect(dream.scenes[after.sceneIndex]?.id).toBe('yard');
    expect(after.player).toEqual({ position: [0, EYE_HEIGHT, 0], yaw: 0, pitch: 0 });
  });

  it('hand over to the real yard at the end of the prologue', () => {
    const after = runInputs(dream, start, idle(timeline.asleepAt));
    expect(dream.scenes[after.sceneIndex]?.id).toBe('yard');
    expect(after.sceneTick).toBe(0);
  });

  it('never draw from the scene stream', () => {
    const state = runInputs(dream, start, randomInputs(timeline.asleepAt - 1, 'apartment/rng'));
    expect(state.sceneIndex).toBe(0);
    expect(state.rng).toEqual(sceneRng(seed, 0, SIMULATION_CHANNEL).state());
  });

  it('keep the phase as plain JSON data', () => {
    const state = runInputs(dream, start, idle(timeline.silentAt + 5));
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(APARTMENT_PHASES[state.sceneVars.phase!]).toBe('silent');
  });

  it('replay bit for bit', () => {
    const recorder = createInputRecorder();
    let state = start;
    for (const input of randomInputs(timeline.asleepAt + 300, 'apartment/replay')) {
      state = step(dream, state, recorder.record(input));
    }
    expect(replay(seed, recorder.toLog())).toEqual(state);
    expect(state.sceneIndex).toBe(1);
  });
});
