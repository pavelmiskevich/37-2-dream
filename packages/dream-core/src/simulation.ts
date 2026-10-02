/**
 * Fixed-step dream simulation (D-001, D-005, D-012).
 *
 * `step` advances the dream by exactly one tick of `TICK_DT` seconds. It is a
 * pure function of the dream, the previous state and the tick's input, so a
 * run is fully determined by its seed and its input log, whatever the frame
 * rate: the app only decides how many ticks to run per frame and interpolates
 * between the last two states for rendering.
 *
 * `SimState` is plain JSON data — numbers, strings, booleans, tuples — so it
 * can be stored as a checkpoint and resumed with no loss. The random stream of
 * the current scene is kept inside it as an `RngState`.
 */
import { generateDream, type Dream } from './dream';
import { createFallRules } from './fall';
import { IDLE_INPUT, quantizeInput, type SimInput } from './input';
import { inputsOf, type InputLog } from './input-log';
import { rngFromState, type Rng, type RngState } from './rng';
import type { AwakeningReason, DreamScene, SceneId } from './scenes';
import type { DreamSeed } from './seed';
import { sceneRng } from './streams';
import { driftTemperature, isDreamingScene, temperatureWakeReason } from './temperature';
import { ENGINE_VERSION } from './version';
import { createYardRules } from './yard';

/** Simulation ticks per second. */
export const TICK_RATE = 60;
/** Length of one tick, seconds. The simulation never steps by anything else. */
export const TICK_DT = 1 / TICK_RATE;

/** Walking speed at full stick, metres per second. */
export const WALK_SPEED = 1.4;
/** Eye height of the hero standing up, metres. */
export const EYE_HEIGHT = 1.6;
/** Pitch limit, radians: just short of straight up/down so yaw stays defined. */
export const MAX_PITCH = Math.PI / 2 - 0.01;

/** Key of the per-scene random stream the simulation draws from. */
export const SIMULATION_CHANNEL = 'simulation';

export type Vec3 = readonly [number, number, number];

/** First-person pose of the hero. */
export interface PlayerState {
  /** Eye position, metres. Y is up; yaw 0 looks along −Z. */
  position: Vec3;
  /** Heading, radians; positive turns left. Not wrapped, so it interpolates without jumps. */
  yaw: number;
  /** Radians, positive looks up; within ±`MAX_PITCH`. */
  pitch: number;
}

/** Scene-local variables kept by `SceneRules` (swing amplitude, jam depth…). */
export type SceneVars = Readonly<Record<string, number>>;

export interface SimState {
  /** `ENGINE_VERSION` of the simulation that produced this state. */
  engineVersion: number;
  seed: DreamSeed;
  /** Ticks simulated since the start of the dream. */
  tick: number;
  /** Index of the current scene in `dream.scenes`. */
  sceneIndex: number;
  /** Ticks spent in the current scene; time in the scene is `sceneTick * TICK_DT`. */
  sceneTick: number;
  /**
   * Hero's temperature, °C. Starts at `dream.profile.temperature`; in dreaming
   * scenes it drifts, scene rules heat or cool it with `applyHeat`, and leaving
   * the safe range wakes the hero up (temperature.ts, D-014).
   */
  temperature: number;
  player: PlayerState;
  /** Buttons held during the previous tick, to tell a press from a hold. */
  buttons: number;
  /** State of the current scene's `SIMULATION_CHANNEL` stream. */
  rng: RngState;
  /** Variables of the current scene's rules; reset on every scene change. */
  sceneVars: SceneVars;
  /** True once the last scene has completed; further steps only count ticks. */
  finished: boolean;
  /**
   * Why the hero woke up; absent while he is asleep. Set on entering the
   * awakening scene: the planned reason of that scene when the dream ran its
   * course, or the temperature's verdict when it woke him up early.
   */
  wakeReason?: AwakeningReason;
}

/** Everything a scene rule may look at during one tick. */
export interface SceneContext {
  readonly dream: Dream;
  readonly scene: DreamScene;
  /** Quantized input of this tick. */
  readonly input: SimInput;
  /** Buttons that went down this tick (held now, not held on the previous tick). */
  readonly pressed: number;
  /** The scene's simulation stream; its state is saved back into `SimState.rng`. */
  readonly rng: Rng;
}

/**
 * Extension point for scene mechanics. Every hook is pure: it gets a state
 * and returns the next one.
 */
export interface SceneRules {
  /** Called once on entering the scene, after `sceneVars` and `rng` are reset. */
  enter?(state: SimState, context: SceneContext): SimState;
  /** Called every tick in the scene, after the common movement update. */
  update?(state: SimState, context: SceneContext): SimState;
  /**
   * True when the scene is over and the dream moves on. Default: the scene's
   * nominal `duration` has elapsed. Real transition conditions (the swing, the
   * temperature) replace it per scene.
   */
  isComplete?(state: SimState, context: SceneContext): boolean;
}

export type SceneRulesMap = Readonly<Partial<Record<SceneId, SceneRules>>>;

/** Rules of the slice scenes. A scene without rules simply lasts its `duration`. */
export const SCENE_RULES: SceneRulesMap = {
  yard: createYardRules({ tickDt: TICK_DT, eyeHeight: EYE_HEIGHT, maxPitch: MAX_PITCH }),
  fall: createFallRules({ tickDt: TICK_DT, eyeHeight: EYE_HEIGHT, durationTicks: sceneDurationTicks }),
};

/** Number of whole ticks the scene lasts by default. */
export function sceneDurationTicks(scene: DreamScene): number {
  return Math.max(1, Math.round(scene.duration * TICK_RATE));
}

function sceneAt(dream: Dream, index: number): DreamScene {
  const scene = dream.scenes[index];
  if (scene === undefined) throw new RangeError(`Dream has no scene ${index}.`);
  return scene;
}

/** Resets per-scene fields for scene `index` and runs its `enter` hook. */
function enterScene(dream: Dream, state: SimState, index: number, input: SimInput, rules: SceneRulesMap): SimState {
  const scene = sceneAt(dream, index);
  const rng = sceneRng(dream.seed, index, SIMULATION_CHANNEL);
  const entered: SimState = { ...state, sceneIndex: index, sceneTick: 0, sceneVars: {}, rng: rng.state() };
  const enter = rules[scene.id]?.enter;
  if (!enter) return entered;
  const next = enter(entered, { dream, scene, input, pressed: 0, rng });
  return { ...next, rng: rng.state() };
}

export interface InitialStateOptions {
  /**
   * Index of the scene the dream starts in, for playtesting a scene directly
   * (`?scene=`, D-013). Default 0. A run started elsewhere replays only with
   * the same option: the input log does not store it.
   */
  startScene?: number;
}

/** State at tick 0: the first scene (or `options.startScene`) has just begun. */
export function createInitialState(
  dream: Dream,
  rules: SceneRulesMap = SCENE_RULES,
  { startScene = 0 }: InitialStateOptions = {},
): SimState {
  if (!Number.isInteger(startScene)) throw new RangeError(`Start scene must be an index, got ${startScene}.`);
  const state: SimState = {
    engineVersion: ENGINE_VERSION,
    seed: dream.seed,
    tick: 0,
    sceneIndex: 0,
    sceneTick: 0,
    temperature: dream.profile.temperature,
    player: { position: [0, EYE_HEIGHT, 0], yaw: 0, pitch: 0 },
    buttons: 0,
    rng: [0, 0, 0, 0],
    sceneVars: {},
    finished: false,
  };
  return enterScene(dream, state, startScene, IDLE_INPUT, rules);
}

/** Default first-person movement: turn, then walk on the horizontal plane. */
export function movePlayer(player: PlayerState, input: SimInput): PlayerState {
  const yaw = player.yaw + input.look[0];
  const pitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, player.pitch + input.look[1]));
  const [right, forward] = input.move;
  const step = WALK_SPEED * TICK_DT;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const [x, y, z] = player.position;
  return {
    position: [x + (right * cos - forward * sin) * step, y, z + (-right * sin - forward * cos) * step],
    yaw,
    pitch,
  };
}

/**
 * Advances the dream by one tick (`TICK_DT`). Pure: the same dream, state and
 * input always give a deeply equal result, and `state` is never mutated.
 * The input is quantized first, exactly as the input log stores it.
 */
export function step(dream: Dream, state: SimState, rawInput: SimInput, rules: SceneRulesMap = SCENE_RULES): SimState {
  if (state.seed !== dream.seed) throw new RangeError(`State of ${state.seed} stepped with dream ${dream.seed}.`);
  if (state.finished) return { ...state, tick: state.tick + 1 };

  const input = quantizeInput(rawInput);
  const scene = sceneAt(dream, state.sceneIndex);
  const sceneRules = rules[scene.id];
  const rng = rngFromState(state.rng);
  const context: SceneContext = { dream, scene, input, pressed: input.buttons & ~state.buttons, rng };

  let next: SimState = {
    ...state,
    tick: state.tick + 1,
    sceneTick: state.sceneTick + 1,
    player: movePlayer(state.player, input),
    buttons: input.buttons,
  };

  // Temperature model (D-014): the drift runs before the scene rules, so that
  // scenes see the new value and their heat sources add on top of it.
  const dreaming = isDreamingScene(scene.id);
  if (dreaming) next = { ...next, temperature: driftTemperature(state.temperature, state.tick * TICK_DT, TICK_DT) };

  if (sceneRules?.update) next = sceneRules.update(next, context);
  next = { ...next, rng: rng.state() };

  // Leaving the safe range wakes the hero up, whatever the scene had planned.
  const verdict = dreaming ? temperatureWakeReason(next.temperature) : null;
  if (verdict) return wakeUp(dream, next, verdict, input, rules);

  const complete = sceneRules?.isComplete
    ? sceneRules.isComplete(next, context)
    : next.sceneTick >= sceneDurationTicks(scene);
  if (!complete) return next;

  const nextIndex = state.sceneIndex + 1;
  if (nextIndex >= dream.scenes.length) return { ...next, finished: true };
  const entered = enterScene(dream, next, nextIndex, input, rules);
  const nextScene = sceneAt(dream, nextIndex);
  if (nextScene.id !== 'awakening' || entered.wakeReason !== undefined) return entered;
  return { ...entered, wakeReason: nextScene.params.reason };
}

/**
 * Early awakening: jumps to the dream's awakening scene with `reason`, or
 * finishes the dream when there is none ahead.
 */
function wakeUp(dream: Dream, state: SimState, reason: AwakeningReason, input: SimInput, rules: SceneRulesMap): SimState {
  const woken: SimState = { ...state, wakeReason: reason };
  const awakening = dream.scenes.findIndex((scene, index) => index > state.sceneIndex && scene.id === 'awakening');
  if (awakening < 0) return { ...woken, finished: true };
  return enterScene(dream, woken, awakening, input, rules);
}

/** Steps `state` through `inputs`, one tick per input. */
export function runInputs(
  dream: Dream,
  state: SimState,
  inputs: Iterable<SimInput>,
  rules: SceneRulesMap = SCENE_RULES,
): SimState {
  let current = state;
  for (const input of inputs) current = step(dream, current, input, rules);
  return current;
}

/**
 * Replays a recorded run: the dream of `seed` from its first tick through
 * every tick of `log` (or from `options.startScene`, if the run began there).
 * Gives a state deeply equal to the one the live run ended with. Throws if
 * the log was recorded by another engine version.
 */
export function replay(
  seed: DreamSeed,
  log: InputLog,
  rules: SceneRulesMap = SCENE_RULES,
  options: InitialStateOptions = {},
): SimState {
  if (log.engineVersion !== ENGINE_VERSION) {
    throw new RangeError(`Input log is from engine ${log.engineVersion}, this is engine ${ENGINE_VERSION}.`);
  }
  const dream = generateDream(seed);
  return runInputs(dream, createInitialState(dream, rules, options), inputsOf(log), rules);
}
