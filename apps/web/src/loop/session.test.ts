import { describe, expect, it } from 'vitest';
import {
  ALL_BUTTONS,
  IDLE_INPUT,
  createSeededRng,
  normalizeSeed,
  parseInputLog,
  replay,
  serializeInputLog,
  type SimInput,
  type SimState,
} from '@dream/core';
import { interpolateFrame } from './interpolate';
import { seedFromQuery } from './seed';
import { createDreamSession } from './session';

const seed = normalizeSeed('DREAM-8F72-A19C-37B2');

/**
 * Player input as a function of the tick, so that every frame rate feeds the
 * simulation the same input sequence. (A real player presses keys in real
 * time; that this lands on the same ticks at any frame rate is not the claim.)
 */
function scriptedInput(ticks: number): (tick: number) => SimInput {
  const rng = createSeededRng('web/scripted-input');
  const inputs: SimInput[] = [];
  let held: SimInput = IDLE_INPUT;
  for (let i = 0; i < ticks; i++) {
    if (rng.chance(0.1)) held = { move: [rng.range(-1, 1), rng.range(-1, 1)], look: [0, 0], buttons: rng.int(0, ALL_BUTTONS) };
    inputs.push({ ...held, look: [rng.range(-0.02, 0.02), rng.range(-0.01, 0.01)] });
  }
  return (tick) => inputs[tick] ?? IDLE_INPUT;
}

/**
 * Plays `seconds` of the dream with frames `frameTime()` apart and returns
 * every state seen, keyed by tick, plus the session.
 */
function play(seconds: number, frameTime: () => number) {
  const session = createDreamSession({ seed, readInput: scriptedInput(seconds * 60 + 60) });
  const byTick = new Map<number, SimState>();
  let nowMs = 1000;
  session.frame(nowMs);
  while (nowMs < 1000 + seconds * 1000) {
    nowMs += frameTime() * 1000;
    session.frame(nowMs);
    byTick.set(session.previous.tick, session.previous);
    byTick.set(session.state.tick, session.state);
  }
  return { session, byTick };
}

describe('frame rate independence', () => {
  it('gives the same state on the same tick at 30 Hz and at 144 Hz', () => {
    const at30 = play(40, () => 1 / 30);
    const at144 = play(40, () => 1 / 144);
    const common = [...at30.byTick.keys()].filter((tick) => at144.byTick.has(tick));
    // 30 Hz runs two ticks per frame, so every tick shows up via state/previous.
    expect(common.length).toBeGreaterThan(2350);
    // The run crossed at least one scene change.
    expect(at30.session.state.sceneIndex).toBeGreaterThan(0);
    for (const tick of common) expect(at144.byTick.get(tick)).toEqual(at30.byTick.get(tick));
    // The run actually moved: the player is not where it started.
    expect(at30.session.state.player.position).not.toEqual([0, 1.6, 0]);
  });

  it('holds with jittery frame times too', () => {
    const rng = createSeededRng('web/jitter');
    const steady = play(10, () => 1 / 60);
    const jittery = play(10, () => rng.range(0.002, 0.07));
    for (const [tick, state] of jittery.byTick) {
      const reference = steady.byTick.get(tick);
      if (reference) expect(state).toEqual(reference);
    }
  });

  it('records a log that replays into the live state', () => {
    const { session } = play(15, () => 1 / 144);
    const log = parseInputLog(serializeInputLog(session.inputLog()));
    expect(log.ticks).toBe(session.state.tick);
    expect(replay(seed, log)).toEqual(session.state);
  });
});

describe('startScene', () => {
  it('starts in the given scene and replays with the same option', () => {
    const session = createDreamSession({ seed, startScene: 2, readInput: scriptedInput(600) });
    expect(session.startScene).toBe(2);
    expect(session.state.sceneIndex).toBe(2);
    session.frame(0);
    session.frame(5000);
    expect(session.state.tick).toBeGreaterThan(0);
    expect(replay(seed, session.inputLog(), undefined, { startScene: 2 })).toEqual(session.state);
  });
});

describe('interpolateFrame', () => {
  const { session } = play(1, () => 1 / 60);
  const a = session.previous;
  const b = session.state;

  it('blends the last two ticks', () => {
    expect(interpolateFrame(a, b, 0).player).toEqual(a.player);
    expect(interpolateFrame(a, b, 1).player).toEqual(b.player);
    const half = interpolateFrame(a, b, 0.5);
    expect(half.player.yaw).toBeCloseTo((a.player.yaw + b.player.yaw) / 2, 12);
    expect(half.time).toBeCloseTo(((a.tick + b.tick) / 2) / 60, 12);
  });

  it('clamps alpha', () => {
    expect(interpolateFrame(a, b, 7).alpha).toBe(1);
    expect(interpolateFrame(a, b, -1).alpha).toBe(0);
  });

  it('does not blend across a scene change', () => {
    const next: SimState = { ...b, sceneIndex: b.sceneIndex + 1, sceneTick: 0, player: { position: [50, 1.6, 50], yaw: 0, pitch: 0 } };
    const view = interpolateFrame(b, next, 0.3);
    expect(view.player).toEqual(next.player);
    expect(view.sceneTime).toBe(0);
  });
});

describe('seedFromQuery', () => {
  it('takes a valid seed from the address', () => {
    expect(seedFromQuery('?seed=dream-8f72-a19c-37b2&scene=yard')).toBe('DREAM-8F72-A19C-37B2');
  });

  it('falls back to a random seed', () => {
    const bytes = () => [1, 2, 3, 4, 5, 6];
    expect(seedFromQuery('', bytes)).toBe('DREAM-0102-0304-0506');
    expect(seedFromQuery('?seed=nonsense', bytes)).toBe('DREAM-0102-0304-0506');
  });
});
