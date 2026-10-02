import { describe, expect, it } from 'vitest';
import { findScene, generateDream, type Dream } from './dream';
import { buttonMask, IDLE_INPUT, type SimInput } from './input';
import { createInputRecorder } from './input-log';
import {
  JAM_CEILING,
  JAM_GRAVITY_DIRECTIONS,
  JAM_JAR,
  JAM_MOTION,
  JAM_TURN,
  frameAngle,
  jamCarry,
  jamLidOpensAt,
  jamMotion,
  rotateByQuat,
} from './jam';
import { normalizeSeed } from './seed';
import {
  SCENE_RULES,
  TICK_DT,
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

/** Real rules, with the scenes before the jam skipped in one tick each. */
const skipToJam: SceneRulesMap = {
  ...SCENE_RULES,
  apartment: { isComplete: () => true },
  yard: { isComplete: () => true },
  fall: { isComplete: () => true },
};

function enterJam(target: Dream = dream, inputs: readonly SimInput[] = []): SimState {
  const start = runInputs(target, createInitialState(target, skipToJam), [IDLE_INPUT, IDLE_INPUT, IDLE_INPUT], skipToJam);
  expect(target.scenes[start.sceneIndex]!.id).toBe('jam');
  return runInputs(target, start, inputs, skipToJam);
}

/** A copy of `dream` with the jam's params changed. */
function withJam(params: Partial<ReturnType<typeof jamOf>['params']>): Dream {
  const copy = generateDream(seed);
  Object.assign(jamOf(copy).params, params);
  return copy;
}

const jamOf = (target: Dream) => findScene(target, 'jam')!;
const repeat = (input: SimInput, ticks: number): SimInput[] => Array.from({ length: ticks }, () => input);
const v = (state: SimState, key: string) => state.sceneVars[key]!;
const frameOf = (state: SimState) => [v(state, 'qx'), v(state, 'qy'), v(state, 'qz'), v(state, 'qw')] as const;
const gravityOf = (state: SimState) => JAM_GRAVITY_DIRECTIONS[v(state, 'gravity')];

/** Ticks until the jam is left, stepping with `input` (at most `limit`). */
function ticksInJam(target: Dream, input: SimInput, limit = 10_000): number {
  let state = enterJam(target);
  const jam = jamOf(target);
  for (let i = 1; i <= limit; i++) {
    state = step(target, state, input, skipToJam);
    if (state.sceneIndex !== jam.index) return i;
  }
  return Infinity;
}

describe('jam motion', () => {
  it('is slower and more sluggish in thicker jam', () => {
    const runny = jamMotion(0.4);
    const thick = jamMotion(0.95);
    expect(thick.swimSpeed).toBeLessThan(runny.swimSpeed);
    expect(thick.inertia).toBeGreaterThan(runny.inertia);
    expect(thick.floatSpeed).toBeLessThan(runny.floatSpeed);
    // Even the runniest jam is slower than walking.
    expect(jamMotion(0).swimSpeed).toBeLessThan(1.4);
    expect(jamMotion(0).swimSpeed).toBe(JAM_MOTION.swimSpeed[0]);
  });

  it('carries the hero to the lid smoothly from the carry point to the end', () => {
    expect(jamCarry(0)).toBe(0);
    expect(jamCarry(0.79)).toBe(0);
    expect(jamCarry(0.9)).toBeCloseTo(0.5, 9);
    expect(jamCarry(1)).toBe(1);
  });

  it('opens the lid after the first turn of gravity, before the carry', () => {
    expect(jamLidOpensAt(0.2)).toBeCloseTo(0.35, 9);
    expect(jamLidOpensAt(0.7)).toBe(0.8);
  });
});

describe('jam rules', () => {
  const jam = jamOf(dream);
  const jamTicks = sceneDurationTicks(jam);

  it('start after the splash, near the bottom and still sinking', () => {
    const state = enterJam();
    expect(state.sceneTick).toBe(0);
    expect(state.player.position).toEqual([0, JAM_JAR.startY, 0]);
    expect(v(state, 'vy')).toBeLessThan(0);
    expect(gravityOf(state)).toBe('down');
    expect(v(state, 'lidOpen')).toBe(0);
  });

  it('sink a little after the splash, then float up slowly', () => {
    const states = [enterJam()];
    for (let i = 0; i < 15 * 60; i++) states.push(step(dream, states.at(-1)!, IDLE_INPUT, skipToJam));
    const lowest = Math.min(...states.map((s) => s.player.position[1]));
    expect(lowest).toBeLessThan(JAM_JAR.startY - 0.3);
    const before = states[5 * 60]!.player.position[1];
    const after = states[15 * 60]!.player.position[1];
    // Before the first turn of gravity, floating is slow and steady.
    expect(15 * 60).toBeLessThan(jam.params.gravityFlipAt * jamTicks);
    expect(after).toBeGreaterThan(before);
    expect((after - before) / 10).toBeLessThanOrEqual(jamMotion(jam.params.viscosity).floatSpeed + 1e-9);
  });

  it('feel viscous: thicker jam slows the stroke, and the hero glides on after letting go', () => {
    const swim = (viscosity: number, ticks: number) => {
      const state = enterJam(withJam({ viscosity }), repeat({ ...IDLE_INPUT, move: [0, 1] }, ticks));
      return -state.player.position[2];
    };
    expect(swim(0.95, 120)).toBeLessThan(swim(0.4, 120));
    expect(swim(0.95, 120)).toBeLessThan(0.6);

    // The stroke builds up: the first half second covers less than half a second at speed.
    const first = swim(0.6, 30);
    const later = swim(0.6, 210) - swim(0.6, 180);
    expect(first).toBeLessThan(later * 0.6);

    // Inertia: after letting go the hero keeps moving for a while.
    const moving = enterJam(dream, repeat({ ...IDLE_INPUT, move: [0, 1] }, 180));
    const glided = runInputs(dream, moving, repeat(IDLE_INPUT, 30), skipToJam);
    expect(moving.player.position[2] - glided.player.position[2]).toBeGreaterThan(0.1);
  });

  it('swim where the hero looks, up and down included', () => {
    const up = enterJam(dream, [{ ...IDLE_INPUT, look: [0, 1.2] }, ...repeat({ ...IDLE_INPUT, move: [0, 1] }, 180)]);
    const down = enterJam(dream, [{ ...IDLE_INPUT, look: [0, -1.2] }, ...repeat({ ...IDLE_INPUT, move: [0, 1] }, 180)]);
    expect(up.player.position[1]).toBeGreaterThan(down.player.position[1] + 1.5);
  });

  it('kick towards the felt up on a jump', () => {
    const kicked = enterJam(dream, [{ ...IDLE_INPUT, buttons: buttonMask('jump') }, ...repeat(IDLE_INPUT, 60)]);
    const idle = enterJam(dream, repeat(IDLE_INPUT, 61));
    expect(kicked.player.position[1]).toBeGreaterThan(idle.player.position[1] + 0.2);
    // Holding the button is one kick, not a jet.
    const held = enterJam(dream, repeat({ ...IDLE_INPUT, buttons: buttonMask('jump') }, 61));
    expect(held.player.position[1]).toBeCloseTo(kicked.player.position[1], 9);
  });

  it('keep the hero inside the glass', () => {
    const state = enterJam(dream, repeat({ ...IDLE_INPUT, move: [1, 0.3] }, 60 * 30));
    const [x, y, z] = state.player.position;
    expect(Math.hypot(x, z)).toBeLessThanOrEqual(JAM_JAR.radius - JAM_JAR.body + 1e-9);
    expect(y).toBeGreaterThanOrEqual(JAM_JAR.body);
    expect(y).toBeLessThanOrEqual(JAM_CEILING);
  });

  it("turn gravity at the scene's gravityFlipAt to the scene's direction, then back and on", () => {
    let state = enterJam();
    const changes: { tick: number; to: string }[] = [];
    for (let i = 0; i < jamTicks - 1; i++) {
      const next = step(dream, state, IDLE_INPUT, skipToJam);
      if (next.sceneIndex !== jam.index) break;
      if (gravityOf(next) !== gravityOf(state)) changes.push({ tick: next.sceneTick, to: gravityOf(next)! });
      state = next;
    }
    expect(changes[0]).toEqual({ tick: Math.round(jam.params.gravityFlipAt * jamTicks), to: jam.params.gravity });
    expect(changes[1]?.to).toBe('down');
    expect(changes.length).toBeGreaterThanOrEqual(2);
    // Turns alternate with ordinary gravity.
    changes.forEach((change, i) => expect(change.to === 'down').toBe(i % 2 === 1));
  });

  it('float the other way when gravity turns', () => {
    const upside = withJam({ gravity: 'up', gravityFlipAt: 0.2 });
    const flip = Math.round(0.2 * sceneDurationTicks(jamOf(upside)));
    const atFlip = enterJam(upside, repeat(IDLE_INPUT, flip));
    const later = runInputs(upside, atFlip, repeat(IDLE_INPUT, 5 * 60), skipToJam);
    expect(gravityOf(later)).toBe('up');
    expect(later.player.position[1]).toBeLessThan(atFlip.player.position[1]);

    const sideways = withJam({ gravity: 'left', gravityFlipAt: 0.2 });
    const sideFlip = enterJam(sideways, repeat(IDLE_INPUT, flip));
    const drifted = runInputs(sideways, sideFlip, repeat(IDLE_INPUT, 5 * 60), skipToJam);
    // Gravity pulls left, so the hero floats right.
    expect(drifted.player.position[0]).toBeGreaterThan(sideFlip.player.position[0] + 0.1);
  });

  it('turn the camera after gravity no faster than the limit, and all the way', () => {
    for (const gravity of ['up', 'left', 'forward'] as const) {
      const target = withJam({ gravity, gravityFlipAt: 0.2 });
      const flip = Math.round(0.2 * sceneDurationTicks(jamOf(target)));
      let state = enterJam(target, repeat(IDLE_INPUT, flip - 1));
      let fastest = 0;
      for (let i = 0; i < 7 * 60; i++) {
        const next = step(target, state, IDLE_INPUT, skipToJam);
        // Angle between two successive frames.
        const a = frameOf(state);
        const b = frameOf(next);
        const cos = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
        fastest = Math.max(fastest, (2 * Math.acos(cos)) / TICK_DT);
        state = next;
      }
      expect(fastest).toBeLessThanOrEqual(JAM_TURN.maxRate + 1e-6);
      expect(fastest).toBeGreaterThan(JAM_TURN.maxRate * 0.9);
      // Seven seconds — less than gravity holds — are enough even for a half turn.
      const g = [-v(state, 'gx'), -v(state, 'gy'), -v(state, 'gz')] as const;
      expect(frameAngle(frameOf(state), g)).toBeLessThan(0.01);
    }
  });

  it('swim in the felt frame once it has turned', () => {
    const target = withJam({ gravity: 'up', gravityFlipAt: 0.2 });
    const flip = Math.round(0.2 * sceneDurationTicks(jamOf(target)));
    const turned = enterJam(target, repeat(IDLE_INPUT, flip + 8 * 60));
    // Upside down, the felt up is the world's down.
    expect(rotateByQuat(frameOf(turned), [0, 1, 0])[1]).toBeCloseTo(-1, 3);
    const lookUp = runInputs(
      target,
      turned,
      [{ ...IDLE_INPUT, look: [0, 1.2] }, ...repeat({ ...IDLE_INPUT, move: [0, 1] }, 120)],
      skipToJam,
    );
    expect(lookUp.player.position[1]).toBeLessThan(turned.player.position[1] - 0.5);
  });

  it('keep the lid shut before the first turn of gravity has passed', () => {
    // Straight up as fast as possible: he reaches the lid, it does not give.
    const opens = Math.ceil(jamLidOpensAt(jam.params.gravityFlipAt) * jamTicks);
    const up = [{ ...IDLE_INPUT, look: [0, 1.5] }, ...repeat({ ...IDLE_INPUT, move: [0, 1] }, opens - 10)] as SimInput[];
    const state = enterJam(dream, up);
    expect(state.sceneIndex).toBe(jam.index);
    expect(state.player.position[1]).toBeCloseTo(JAM_CEILING, 6);
    expect(v(state, 'lidOpen')).toBe(0);
    // Once it gives, the hero is out.
    const out = runInputs(dream, state, repeat({ ...IDLE_INPUT, move: [0, 1] }, 20), skipToJam);
    expect(out.sceneIndex).toBe(jam.index + 1);
  });

  it('let a swimmer leave through the lid before the end', () => {
    const swim: SimInput[] = [{ ...IDLE_INPUT, look: [0, 1.5] }, ...repeat({ ...IDLE_INPUT, move: [0, 1] }, jamTicks)];
    let state = enterJam();
    let ticks = 0;
    for (const input of swim) {
      state = step(dream, state, input, skipToJam);
      ticks++;
      if (state.sceneIndex !== jam.index) break;
    }
    expect(state.sceneIndex).toBe(jam.index + 1);
    expect(ticks).toBeLessThan(jamTicks * 0.8);
  });

  it.each(testSeeds(12, 'test/jam-idle'))('end on their own exactly at the nominal duration of %s', (s) => {
    const target = generateDream(s);
    expect(ticksInJam(target, IDLE_INPUT)).toBe(sceneDurationTicks(jamOf(target)));
  });

  it('end at the nominal duration even when the hero swims down with all his might', () => {
    const down = { ...IDLE_INPUT, move: [0, -1] as const, look: [0, 0] as const };
    expect(ticksInJam(dream, down)).toBe(jamTicks);
    // Carried up to the lid on the last tick.
    const last = enterJam(dream, repeat(down, jamTicks - 1));
    expect(last.player.position[1]).toBeCloseTo(JAM_CEILING, 3);
    expect(gravityOf(last)).toBe('down');
  });

  it('draw later turns of gravity from the scene stream: same seed, same turns', () => {
    const a = enterJam(dream, repeat(IDLE_INPUT, jamTicks - 1));
    const b = enterJam(dream, repeat(IDLE_INPUT, jamTicks - 1));
    expect(a).toEqual(b);
  });

  it('is plain JSON data', () => {
    const state = enterJam(dream, randomInputs(600, 'jam/json'));
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe('jam rules under replay', () => {
  it.each(testSeeds(3, 'test/jam-replay'))('replays a restless jam of %s exactly', (s) => {
    const live = generateDream(s);
    const recorder = createInputRecorder();
    let state = createInitialState(live, skipToJam);
    const ticks = 3 + sceneDurationTicks(jamOf(live)) + 30;
    for (const input of randomInputs(ticks, `jam/${s}`)) state = step(live, state, recorder.record(input), skipToJam);
    expect(replay(s, recorder.toLog(), skipToJam)).toEqual(state);
    expect(state.sceneIndex).toBeGreaterThan(jamOf(live).index);
  });
});
