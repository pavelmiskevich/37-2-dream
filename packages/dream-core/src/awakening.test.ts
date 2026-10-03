import { describe, expect, it } from 'vitest';
import { APARTMENT } from './apartment';
import {
  AWAKENING,
  AWAKENING_PHASES,
  awakeningPhase,
  awakeningPhaseAt,
  awakeningTimeline,
  awakeningWake,
  isPlannedReason,
  type AwakeningPhase,
} from './awakening';
import { findScene, generateDream } from './dream';
import { IDLE_INPUT, type SimInput } from './input';
import { createInputRecorder } from './input-log';
import { AWAKENING_REASONS } from './scenes';
import { normalizeSeed } from './seed';
import {
  SCENE_RULES,
  TICK_DT,
  TICK_RATE,
  createInitialState,
  replay,
  runInputs,
  step,
  type SceneRulesMap,
  type SimState,
} from './simulation';
import { applyHeat, TEMPERATURE_MODEL } from './temperature';
import { testSeeds } from './test-utils';

const seed = normalizeSeed('DREAM-8F72-A19C-37B2');
const dream = generateDream(seed);
const awakening = findScene(dream, 'awakening')!;
const yard = findScene(dream, 'yard')!;
const timeline = awakeningTimeline(TICK_DT);

const idle = (ticks: number): SimInput[] => Array.from({ length: ticks }, () => IDLE_INPUT);

function stateAtScene(index: number, rules: SceneRulesMap = SCENE_RULES): SimState {
  let state = createInitialState(dream, rules);
  while (state.sceneIndex < index) state = step(dream, state, IDLE_INPUT, rules);
  return state;
}

describe('awakening parameters', () => {
  const planned = testSeeds(1000, 'test/awakening-seeds').map((s) => findScene(generateDream(s), 'awakening')!.params);

  it('plan the tea most of the time and an unknown reason now and then', () => {
    const unknown = planned.filter((p) => p.reason === 'unknown').length / planned.length;
    expect(new Set(planned.map((p) => p.reason))).toEqual(new Set(['tea_brought', 'unknown']));
    // One in eight by weight.
    expect(unknown).toBeGreaterThan(0.08);
    expect(unknown).toBeLessThan(0.18);
  });

  it('always break the fever: 36,9', () => {
    expect(new Set(planned.map((p) => p.temperature))).toEqual(new Set([36.9]));
  });

  it('tell planned reasons from the temperature’s verdicts', () => {
    expect(AWAKENING_REASONS.filter(isPlannedReason)).toEqual(['tea_brought', 'unknown']);
  });
});

describe('awakeningTimeline', () => {
  it('goes through every phase in order and lasts 19 s', () => {
    const seen: AwakeningPhase[] = [];
    for (let tick = 0; tick <= timeline.overAt; tick++) {
      const phase = awakeningPhaseAt(timeline, tick);
      if (seen.at(-1) !== phase) seen.push(phase);
    }
    expect(seen).toEqual([...AWAKENING_PHASES]);
    expect(timeline.overAt).toBe(AWAKENING.overAt * TICK_RATE);
    expect(timeline.callAt - timeline.quietAt).toBeGreaterThan(0);
  });
});

describe('awakening rules', () => {
  it('settle how a dream that ran its course ended', () => {
    const state = createInitialState(dream, SCENE_RULES, { startScene: awakening.index });
    expect(state.wakeReason).toBe(awakening.params.reason);
    expect(state.temperature).toBe(36.9);
    expect(state.player.position).toEqual(APARTMENT.eye);
    expect(awakeningPhase(state)).toBe('waking');
    expect(awakeningWake(state)).toBe(0);
  });

  it('open the eyes, go through the phases and finish the dream', () => {
    let state = createInitialState(dream, SCENE_RULES, { startScene: awakening.index });
    state = runInputs(dream, state, idle(timeline.listeningAt));
    expect(awakeningWake(state)).toBe(1);
    expect(awakeningPhase(state)).toBe('listening');
    state = runInputs(dream, state, idle(timeline.callAt - timeline.listeningAt));
    expect(awakeningPhase(state)).toBe('call');
    expect(state.finished).toBe(false);
    state = runInputs(dream, state, idle(timeline.overAt - timeline.callAt));
    expect(state.finished).toBe(true);
    expect(state.sceneIndex).toBe(awakening.index);
  });

  it('keep him in bed: no walking, the head turns only so far', () => {
    let state = createInitialState(dream, SCENE_RULES, { startScene: awakening.index });
    state = runInputs(dream, state, Array.from({ length: 300 }, () => ({ move: [1, 1], look: [0.05, 0.05], buttons: 0 })));
    expect(state.player.position).toEqual(APARTMENT.eye);
    expect(state.player.yaw).toBe(APARTMENT.yaw.max);
    expect(state.player.pitch).toBe(APARTMENT.pitch.max);
  });

  it('keep the temperature of an early awakening', () => {
    const cooling: SceneRulesMap = { ...SCENE_RULES, yard: { update: (s) => applyHeat(s, -0.5 * TICK_DT) } };
    let state = stateAtScene(yard.index, cooling);
    while (state.sceneIndex === yard.index) state = step(dream, state, IDLE_INPUT, cooling);
    expect(state.sceneIndex).toBe(awakening.index);
    expect(state.wakeReason).toBe('malingerer');
    expect(state.temperature).toBeLessThan(TEMPERATURE_MODEL.wakeBelow);
    expect(state.player.position).toEqual(APARTMENT.eye);
  });

  it('end a whole idle dream with the planned reason, and replay it exactly', () => {
    const recorder = createInputRecorder();
    let state = createInitialState(dream);
    while (!state.finished) state = step(dream, state, recorder.record(IDLE_INPUT));
    expect(state.wakeReason).toBe(awakening.params.reason);
    expect(state.temperature).toBe(36.9);
    expect(replay(seed, recorder.toLog())).toEqual(state);
  });
});
