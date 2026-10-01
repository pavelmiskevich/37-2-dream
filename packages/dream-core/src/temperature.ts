/**
 * Temperature model (vision "Игрок", spec §20, D-014): the hero's fever is the
 * main mechanic. It lives in `SimState.temperature` and changes in three ways:
 *
 * - drift: left alone, the temperature slowly settles towards the setpoint
 *   (37.2 — "the dream holds") while breathing a little around it, as in the
 *   spec: 37.1 → 37.2 → 37.3 → 37.2;
 * - heat sources: scene rules raise or lower it with `applyHeat` (a swing, a
 *   jump, a fright heat; water, a blanket, shade cool);
 * - thresholds: too low and the hero recovers ("ПРИЧИНА: СИМУЛЯНТ"), too high
 *   and the brain decides it has had enough. Both wake him up.
 *
 * Everything here is pure arithmetic on numbers: no RNG draws (the scene
 * stream belongs to the scene rules), no trigonometry, no clock.
 */
import { clamp } from './math';
import { DREAM_TEMPERATURE } from './profile';
import type { AwakeningReason, SceneId } from './scenes';

/** Tunable numbers of the model. All are placeholders until the playtest. */
export interface TemperatureModel {
  /** Where the temperature settles when nothing heats or cools the hero, °C. */
  setpoint: number;
  /** Time constant of the drift back to the setpoint, seconds: a deviation shrinks e times over it. */
  settleTime: number;
  /** Half-height of the slow breathing around the course of the temperature, °C. */
  wobbleAmplitude: number;
  /** Period of that breathing, seconds. */
  wobblePeriod: number;
  /** Below this the hero recovers and wakes up early: "ПРИЧИНА: СИМУЛЯНТ". */
  wakeBelow: number;
  /** Above this the brain decides it has had enough and wakes the hero up. */
  wakeAbove: number;
  /** The temperature never leaves [min, max], whatever the sources add. */
  min: number;
  max: number;
}

export const TEMPERATURE_MODEL: Readonly<TemperatureModel> = {
  setpoint: DREAM_TEMPERATURE,
  settleTime: 40,
  wobbleAmplitude: 0.1,
  wobblePeriod: 24,
  wakeBelow: 37.0,
  wakeAbove: 39.0,
  min: 35.0,
  max: 42.0,
};

/**
 * Scenes in which the hero is asleep: the temperature drifts, sources act and
 * the thresholds wake him up. In the apartment he has not fallen asleep yet,
 * on awakening he is already awake — there the temperature stays as it is.
 */
export const DREAMING_SCENES: readonly SceneId[] = ['yard', 'fall', 'jam'];

export function isDreamingScene(id: SceneId): boolean {
  return DREAMING_SCENES.includes(id);
}

/**
 * Breathing of the temperature at `time` seconds, °C: a triangle wave that
 * starts at 0 and goes up first (0 → +A → 0 → −A → 0 over one period).
 */
export function temperatureWobble(time: number, model: Readonly<TemperatureModel> = TEMPERATURE_MODEL): number {
  const turns = time / model.wobblePeriod;
  const phase = turns - Math.floor(turns);
  const wave = phase < 0.25 ? 4 * phase : phase < 0.75 ? 2 - 4 * phase : 4 * phase - 4;
  return model.wobbleAmplitude * wave;
}

/**
 * Temperature after `dt` seconds of drift, starting from `temperature` at
 * `time`. The course under the breathing (`temperature − wobble`) relaxes to
 * the setpoint; the breathing itself is a function of time, so heat added by
 * a source shifts the course and then slowly fades out of it.
 */
export function driftTemperature(
  temperature: number,
  time: number,
  dt: number,
  model: Readonly<TemperatureModel> = TEMPERATURE_MODEL,
): number {
  const course = temperature - temperatureWobble(time, model);
  const settled = course + (model.setpoint - course) * (dt / model.settleTime);
  return clamp(settled + temperatureWobble(time + dt, model), model.min, model.max);
}

/**
 * Heat source: raises the temperature by `degrees` (negative cools), within
 * the model's bounds. The entry point for scene rules — call it from
 * `SceneRules.update`, e.g. `applyHeat(state, SWING_HEAT * TICK_DT)` for a
 * source that heats `SWING_HEAT` °C per second, or once for a jolt.
 */
export function applyHeat<S extends { readonly temperature: number }>(
  state: S,
  degrees: number,
  model: Readonly<TemperatureModel> = TEMPERATURE_MODEL,
): S {
  return { ...state, temperature: clamp(state.temperature + degrees, model.min, model.max) };
}

/** Why the temperature wakes the hero up right now, or null if the dream holds. */
export function temperatureWakeReason(
  temperature: number,
  model: Readonly<TemperatureModel> = TEMPERATURE_MODEL,
): AwakeningReason | null {
  if (temperature < model.wakeBelow) return 'malingerer';
  if (temperature > model.wakeAbove) return 'overheated';
  return null;
}

/** What a thermometer in the dream shows: the temperature to a tenth of a degree. */
export function thermometerReading(temperature: number): number {
  return Math.round(temperature * 10) / 10;
}

/**
 * Transition condition "temperature ≥ `threshold`", judged by the thermometer
 * reading, so that a door marked "НЕ ОТКРЫВАТЬ ПРИ ТЕМПЕРАТУРЕ НИЖЕ 37,2"
 * opens exactly when a thermometer shows 37,2. Use it in
 * `SceneRules.isComplete` or `update`.
 */
export function temperatureAtLeast(state: { readonly temperature: number }, threshold: number): boolean {
  return Math.round(state.temperature * 10) >= Math.round(threshold * 10);
}
