import { describe, expect, it } from 'vitest';
import { generateDream } from './dream';
import { IDLE_INPUT, buttonMask, type SimInput } from './input';
import { createInputRecorder, parseInputLog, serializeInputLog } from './input-log';
import { normalizeSeed } from './seed';
import {
  EYE_HEIGHT,
  SCENE_RULES,
  TICK_DT,
  TICK_RATE,
  createInitialState,
  replay,
  runInputs,
  step,
  type SceneRules,
  type SceneRulesMap,
  type SimState,
} from './simulation';
import { applyHeat, temperatureAtLeast } from './temperature';
import { randomInputs, testSeeds } from './test-utils';
import {
  SWING,
  SWING_HINT,
  SWING_HINT_MAX,
  SWING_RELEASE,
  YARD_VARS,
  calledSwingAmplitude,
  stepSwing,
  swingAmplitude,
  swingHeatRate,
  swingHintLevel,
  yardLayout,
  yardSwingAmplitude,
} from './yard';

const seed = normalizeSeed('DREAM-8F72-A19C-37B2');
const dream = generateDream(seed);
const yard = dream.scenes.findIndex((scene) => scene.id === 'yard');
const use = buttonMask('use');
const seconds = (s: number) => Math.round(s * TICK_RATE);
const v = (state: SimState, key: keyof typeof YARD_VARS) => state.sceneVars[YARD_VARS[key]] ?? 0;

const inYard = (rules: SceneRulesMap = SCENE_RULES) => createInitialState(dream, rules, { startScene: yard });

/** The hero standing right at the swing's seat, facing wherever he faced. */
const atSwing = (state: SimState): SimState => ({
  ...state,
  player: { ...state.player, position: [v(state, 'swingX'), EYE_HEIGHT, v(state, 'swingZ') + 0.5] },
});

/** Stands (or sits) still for `s` seconds. */
const idle = (state: SimState, s: number) => runInputs(dream, state, Array.from({ length: seconds(s) }, () => IDLE_INPUT));

/** Steps `ticks` ticks, asking `input` for each one given the current state. */
function drive(state: SimState, ticks: number, input: (state: SimState) => SimInput, rules = SCENE_RULES) {
  let current = state;
  for (let i = 0; i < ticks && current.sceneIndex === state.sceneIndex; i++) {
    current = step(dream, current, input(current), rules);
  }
  return current;
}

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * A player who knows what to do: walks to the swing, sits down, then pushes
 * forward while it moves forward and back while it moves back.
 */
function swingPlayer(state: SimState): SimInput {
  if (v(state, 'seated') !== 1) {
    const dx = v(state, 'swingX') - state.player.position[0];
    const dz = v(state, 'swingZ') - state.player.position[2];
    const turn = wrap(Math.atan2(-dx, -dz) - state.player.yaw);
    const near = Math.hypot(dx, dz) < SWING.reach * 0.8;
    // Press "use" every other tick once near: a press needs a release before it.
    return { move: [0, near ? 0 : 1], look: [Math.max(-0.1, Math.min(0.1, turn)), 0], buttons: near && state.tick % 2 === 0 ? use : 0 };
  }
  const speed = v(state, 'speed');
  return { ...IDLE_INPUT, move: [0, speed === 0 ? 1 : Math.sign(speed)] };
}

/** Sits on the swing (from right next to it) and settles. */
function seated(state: SimState, rules = SCENE_RULES): SimState {
  const sat = step(dream, atSwing(state), { ...IDLE_INPUT, buttons: use }, rules);
  return runInputs(dream, sat, Array.from({ length: seconds(SWING.mountTime) + 1 }, () => IDLE_INPUT), rules);
}

describe('yardLayout', () => {
  it('is a pure function of the seed and the scene', () => {
    expect(yardLayout(seed, yard)).toEqual(yardLayout(seed, yard));
    const layouts = testSeeds(12, 'test/yard-layouts').map((s) => yardLayout(s, 1));
    expect(new Set(layouts.map((l) => `${l.swing.x}/${l.swing.z}`)).size).toBe(12);
  });

  it.each(testSeeds(20, 'test/yard-layouts'))('keeps the swing and the start of %s inside the yard', (s) => {
    const { halfWidth, halfDepth, swing, start } = yardLayout(s, 1);
    for (const point of [swing, start]) {
      expect(Math.abs(point.x)).toBeLessThan(halfWidth - 1);
      expect(Math.abs(point.z)).toBeLessThan(halfDepth - 1);
    }
    // Far enough apart that the hero has to walk to it.
    expect(Math.hypot(swing.x - start.x, swing.z - start.z)).toBeGreaterThan(SWING.reach);
  });

  it('does not touch the dream itself', () => {
    yardLayout(seed, yard);
    expect(generateDream(seed)).toEqual(dream);
  });
});

describe('swing pendulum', () => {
  it('swings with a period of about three seconds', () => {
    let [angle, speed] = [0.3, 0];
    let crossings = 0;
    for (let i = 0; i < seconds(30); i++) {
      const [a, s] = stepSwing(angle, speed, 0, TICK_DT);
      if (Math.sign(a) !== Math.sign(angle) && angle !== 0) crossings++;
      [angle, speed] = [a, s];
    }
    // Two zero crossings per period.
    const period = 60 / crossings;
    expect(period).toBeGreaterThan(2.8);
    expect(period).toBeLessThan(3.2);
  });

  it('dies out without input', () => {
    let [angle, speed] = [0.9, 0];
    for (let i = 0; i < seconds(10); i++) [angle, speed] = stepSwing(angle, speed, 0, TICK_DT);
    expect(swingAmplitude(angle, speed)).toBeLessThan(0.9 * 0.35);
  });

  it('heats faster the higher it flies', () => {
    expect(swingHeatRate(0)).toBe(0);
    expect(swingHeatRate(SWING_RELEASE.amplitude)).toBeGreaterThan(4 * swingHeatRate(SWING_RELEASE.amplitude / 2) - 1e-12);
  });
});

describe('yard rules', () => {
  it('puts the hero at the start of the yard, the empty swing already swinging', () => {
    const state = inYard();
    const layout = yardLayout(seed, yard);
    expect(state.player.position).toEqual([layout.start.x, EYE_HEIGHT, layout.start.z]);
    expect(state.player.yaw).toBe(layout.start.yaw);
    expect(v(state, 'seated')).toBe(0);
    expect(yardSwingAmplitude(state)).toBeGreaterThanOrEqual(SWING.emptyAmplitude[0]);
    expect(yardSwingAmplitude(state)).toBeLessThanOrEqual(SWING.emptyAmplitude[1]);
  });

  it('keeps the empty swing going by itself, a little', () => {
    const later = runInputs(dream, inYard(), Array.from({ length: seconds(60) }, () => IDLE_INPUT));
    expect(yardSwingAmplitude(later)).toBeGreaterThan(SWING.emptyAmplitude[0] * 0.5);
    expect(yardSwingAmplitude(later)).toBeLessThan(SWING.sitBelow);
  });

  it('holds without input for two minutes: no transition, and the dream goes on', () => {
    const later = runInputs(dream, inYard(), Array.from({ length: seconds(120) }, () => IDLE_INPUT));
    expect(later.sceneIndex).toBe(yard);
    expect(v(later, 'released')).toBe(0);
    expect(later.wakeReason).toBeUndefined();
  });

  it('keeps the walking hero inside the yard', () => {
    const forward: SimInput = { move: [0, 1], look: [0, 0], buttons: 0 };
    const far = runInputs(dream, inYard(), Array.from({ length: seconds(60) }, () => forward));
    const { halfWidth, halfDepth } = yardLayout(seed, yard);
    expect(Math.abs(far.player.position[0])).toBeLessThan(halfWidth);
    expect(Math.abs(far.player.position[2])).toBeLessThan(halfDepth);
  });

  it('sits the hero down with "use" only when he is next to the swing', () => {
    const start = inYard();
    const far = step(dream, start, { ...IDLE_INPUT, buttons: use });
    expect(v(far, 'seated')).toBe(0);

    const near = step(dream, atSwing(start), { ...IDLE_INPUT, buttons: use });
    expect(v(near, 'seated')).toBe(1);

    // The camera glides onto the seat and turns to the seat's facing.
    const settled = seated(start);
    expect(v(settled, 'mount')).toBe(1);
    expect(wrap(settled.player.yaw - v(settled, 'swingYaw'))).toBeCloseTo(0, 9);
    expect(settled.player.position[1]).toBeLessThan(EYE_HEIGHT);
  });

  it('carries the seated hero with the swing: position and view follow the angle', () => {
    let state = seated(inYard());
    const poses: { angle: number; y: number; pitch: number }[] = [];
    for (let i = 0; i < seconds(6); i++) {
      state = step(dream, state, swingPlayer(state));
      poses.push({ angle: v(state, 'angle'), y: state.player.position[1], pitch: state.player.pitch });
    }
    const high = poses.reduce((a, b) => (Math.abs(b.angle) > Math.abs(a.angle) ? b : a));
    const low = poses.reduce((a, b) => (Math.abs(b.angle) < Math.abs(a.angle) ? b : a));
    expect(high.y).toBeGreaterThan(low.y + 0.05);
    expect(high.pitch).toBeCloseTo(SWING.viewTilt * high.angle, 6);
  });

  it('gets the hero off with "use" and lets the empty swing swing on', () => {
    const swinging = drive(seated(inYard()), seconds(4), swingPlayer);
    const off = step(dream, swinging, { ...IDLE_INPUT, buttons: use });
    expect(v(off, 'seated')).toBe(0);
    expect(off.player.position[1]).toBe(EYE_HEIGHT);
    expect(yardSwingAmplitude(off)).toBeGreaterThan(0.3);
  });

  it('pumped in time, flies high, heats the hero and lets him go into the fall', () => {
    let state = inYard();
    const startTemperature = state.temperature;
    let releasedAt = -1;
    let releasedState: SimState | null = null;
    for (let i = 0; i < seconds(60) && state.sceneIndex === yard; i++) {
      const next = step(dream, state, swingPlayer(state));
      if (releasedAt < 0 && v(next, 'released') === 1) {
        releasedAt = i;
        releasedState = next;
      }
      state = next;
    }
    expect(releasedState).not.toBeNull();
    const released = releasedState!;
    expect(yardSwingAmplitude(released)).toBeGreaterThanOrEqual(SWING_RELEASE.amplitude);
    expect(temperatureAtLeast(released, SWING_RELEASE.temperature)).toBe(true);
    expect(released.temperature).toBeGreaterThan(startTemperature);
    // A good player needs a few swings, not a minute.
    expect(releasedAt * TICK_DT).toBeGreaterThan(5);
    expect(releasedAt * TICK_DT).toBeLessThan(25);

    // The hero flies up while the transition runs, then the fall begins.
    expect(state.sceneIndex).toBe(yard + 1);
    expect(state.wakeReason).toBeUndefined();
  });

  it('rises into the sky after letting go', () => {
    let state = inYard();
    while (v(state, 'released') !== 1) state = step(dream, state, swingPlayer(state));
    const y0 = state.player.position[1];
    const later = runInputs(dream, state, Array.from({ length: seconds(SWING_RELEASE.duration) - 2 }, () => IDLE_INPUT));
    expect(later.sceneIndex).toBe(yard);
    expect(later.player.position[1]).toBeGreaterThan(y0 + 3);
    expect(later.player.pitch).toBeLessThan(-0.5);
  });

  it('lets the pumped hero go through the swing itself, not through the way out', () => {
    let state = inYard();
    while (v(state, 'released') !== 1) state = step(dream, state, swingPlayer(state));
    expect(v(state, 'fallback')).toBe(0);
    expect(state.sceneTick).toBeLessThan(seconds(SWING_HINT.fallbackAfter));
  });

  it('does not grow when pumped against the swing, held or mashed at random', () => {
    const against = (state: SimState): SimInput => ({ ...IDLE_INPUT, move: [0, -Math.sign(v(state, 'speed'))] });
    const hold: SimInput = { move: [0, 1], look: [0, 0], buttons: 0 };
    const start = seated(inYard());

    expect(yardSwingAmplitude(drive(start, seconds(30), against))).toBeLessThan(0.1);
    expect(yardSwingAmplitude(drive(start, seconds(30), () => hold))).toBeLessThan(0.4);

    const noise = randomInputs(seconds(60), 'yard/mash').map((input) => ({ ...input, buttons: 0 }));
    const mashed = runInputs(dream, start, noise);
    expect(mashed.sceneIndex).toBe(yard);
    expect(v(mashed, 'released')).toBe(0);
  });

  it('opens the transition only with fever: a cold hero swings high and stays in the yard', () => {
    const yardRules = SCENE_RULES.yard!;
    // Something keeps the hero at 37.1 however hard he swings.
    const cold: SceneRules = {
      ...yardRules,
      update: (state, context) => ({ ...yardRules.update!(state, context), temperature: 37.1 }),
    };
    const rules: SceneRulesMap = { ...SCENE_RULES, yard: cold };
    const swung = drive(inYard(rules), seconds(40), swingPlayer, rules);
    expect(swung.sceneIndex).toBe(yard);
    expect(v(swung, 'released')).toBe(0);
    expect(yardSwingAmplitude(swung)).toBeGreaterThan(SWING_RELEASE.amplitude);

    // The same swing with the fever back: off he goes.
    const warmed = step(dream, applyHeat(swung, 0.1), swingPlayer(swung));
    expect(v(warmed, 'released')).toBe(1);
  });

  it.each(testSeeds(3, 'test/yard-replay'))('replays a swing of %s bit for bit', (s) => {
    const live = generateDream(s);
    const index = live.scenes.findIndex((scene) => scene.id === 'yard');
    const recorder = createInputRecorder();
    let state = createInitialState(live, SCENE_RULES, { startScene: index });
    const noise = randomInputs(seconds(20), `yard/${s}`);
    for (let i = 0; i < seconds(40) && state.sceneIndex === index; i++) {
      // A real player: mostly the right rhythm, sometimes a random slip.
      const input = i % 7 === 0 ? noise[i % noise.length]! : swingPlayer(state);
      state = step(live, state, recorder.record(input));
    }
    const log = parseInputLog(serializeInputLog(recorder.toLog()));
    expect(replay(s, log, SCENE_RULES, { startScene: index })).toEqual(state);
  });
});

describe('the yard calls the hero to the swing', () => {
  it('counts levels in steps of time off the swing', () => {
    expect(swingHintLevel(0, TICK_DT)).toBe(0);
    expect(swingHintLevel(seconds(SWING_HINT.steps[0]) - 1, TICK_DT)).toBe(0);
    expect(swingHintLevel(seconds(SWING_HINT.steps[0]), TICK_DT)).toBe(1);
    expect(swingHintLevel(seconds(1000), TICK_DT)).toBe(SWING_HINT_MAX);
    // The first step comes after 20–30 s, the way out after the top level.
    expect(SWING_HINT.steps[0]).toBeGreaterThanOrEqual(20);
    expect(SWING_HINT.steps[0]).toBeLessThanOrEqual(30);
    expect(SWING_HINT.fallbackAfter).toBeGreaterThan(SWING_HINT.steps[SWING_HINT_MAX - 1]!);
  });

  it('grows more insistent the longer the hero stays off the swing, never less', () => {
    let state = inYard();
    let previous = 0;
    const changes: number[] = [];
    for (let i = 1; i < seconds(SWING_HINT.fallbackAfter); i++) {
      state = step(dream, state, IDLE_INPUT);
      const level = v(state, 'hint');
      expect(level).toBeGreaterThanOrEqual(previous);
      if (level !== previous) changes.push(i);
      previous = level;
    }
    expect(previous).toBe(SWING_HINT_MAX);
    // One step at a time, exactly when its time comes.
    expect(changes).toEqual(SWING_HINT.steps.map((s) => seconds(s)));
  });

  it('swings the empty swing harder at the top level, still low enough to sit on', () => {
    const quiet = idle(inYard(), SWING_HINT.steps[0] - 1);
    const calling = idle(quiet, SWING_HINT.steps[SWING_HINT_MAX - 1]! - SWING_HINT.steps[0] + 20);
    expect(v(calling, 'hint')).toBe(SWING_HINT_MAX);
    expect(yardSwingAmplitude(calling)).toBeGreaterThan(yardSwingAmplitude(quiet) + 0.15);
    expect(yardSwingAmplitude(calling)).toBeCloseTo(SWING_HINT.amplitude, 1);
    expect(yardSwingAmplitude(calling)).toBeLessThan(SWING.sitBelow);
    expect(calledSwingAmplitude(0.1, 0)).toBe(0.1);
    expect(calledSwingAmplitude(0.1, SWING_HINT_MAX)).toBe(SWING_HINT.amplitude);

    // The swing calls, and the hero can still answer.
    const sat = step(dream, atSwing(calling), { ...IDLE_INPUT, buttons: use });
    expect(v(sat, 'seated')).toBe(1);
  });

  it('does not grow while the hero sits on the swing, and starts over, not from zero, when he gets off', () => {
    const waited = idle(inYard(), SWING_HINT.steps[1] + 5);
    expect(v(waited, 'hint')).toBe(2);
    const sat = seated(waited);
    expect(v(sat, 'hint')).toBe(0);

    // A minute on the swing doing nothing: the yard does not call him.
    const sitting = idle(sat, 60);
    expect(v(sitting, 'seated')).toBe(1);
    expect(v(sitting, 'hint')).toBe(0);
    expect(v(sitting, 'idle')).toBe(v(sat, 'idle'));

    // Off again: the count goes on from `resumeAt`, so the first step comes sooner than at the start.
    const off = step(dream, sitting, { ...IDLE_INPUT, buttons: use });
    expect(v(off, 'seated')).toBe(0);
    expect(v(off, 'idle')).toBe(seconds(SWING_HINT.resumeAt));
    const sooner = SWING_HINT.steps[0] - SWING_HINT.resumeAt;
    expect(v(idle(off, sooner - 0.5), 'hint')).toBe(0);
    expect(v(idle(off, sooner + 0.5), 'hint')).toBe(1);
  });

  it('keeps a short visit: getting off soon after arriving does not set the count back', () => {
    const early = seated(idle(inYard(), 5));
    const off = step(dream, idle(early, 3), { ...IDLE_INPUT, buttons: use });
    expect(v(off, 'seated')).toBe(0);
    expect(v(off, 'idle')).toBe(v(early, 'idle'));
  });
});

describe('the way out of the yard', () => {
  const fallbackTick = seconds(SWING_HINT.fallbackAfter);

  it('without input, moves on to the fall at the set time: the world turns over, the dream goes on', () => {
    const before = runInputs(dream, inYard(), Array.from({ length: fallbackTick - 1 }, () => IDLE_INPUT));
    expect(v(before, 'released')).toBe(0);
    const out = step(dream, before, IDLE_INPUT);
    expect(v(out, 'released')).toBe(1);
    expect(v(out, 'fallback')).toBe(1);

    // The same transition as the swing's: he rises into the sky looking down, then the fall begins.
    const y0 = out.player.position[1];
    const flying = runInputs(dream, out, Array.from({ length: seconds(SWING_RELEASE.duration) - 2 }, () => IDLE_INPUT));
    expect(flying.sceneIndex).toBe(yard);
    expect(flying.player.position[1]).toBeGreaterThan(y0 + 3);
    expect(flying.player.pitch).toBeLessThan(-0.5);

    const fallen = runInputs(dream, flying, Array.from({ length: 4 }, () => IDLE_INPUT));
    expect(fallen.sceneIndex).toBe(yard + 1);
    expect(dream.scenes[fallen.sceneIndex]!.id).toBe('fall');
    expect(fallen.wakeReason).toBeUndefined();
  });

  it('also lets go of a hero who sits on the swing and never swings it high enough', () => {
    const sat = seated(idle(inYard(), 40));
    const out = drive(sat, fallbackTick, () => IDLE_INPUT);
    expect(out.sceneIndex).toBe(yard + 1);
    expect(out.wakeReason).toBeUndefined();
  });

  it('comes for a hero who wanders about the yard all the time, too', () => {
    const ticks = fallbackTick + seconds(SWING_RELEASE.duration) + 2;
    const noise = randomInputs(ticks, 'yard/wander').map((input) => ({ ...input, buttons: 0 }));
    expect(runInputs(dream, inYard(), noise).sceneIndex).toBe(yard + 1);
  });

  it('replays the way out bit for bit', () => {
    const recorder = createInputRecorder();
    const noise = randomInputs(seconds(30), 'yard/way-out');
    let state = inYard();
    for (let i = 0; i < fallbackTick + 10; i++) state = step(dream, state, recorder.record(noise[i % noise.length]!));
    expect(v(state, 'released')).toBe(1);
    const log = parseInputLog(serializeInputLog(recorder.toLog()));
    expect(replay(seed, log, SCENE_RULES, { startScene: yard })).toEqual(state);
  });
});
