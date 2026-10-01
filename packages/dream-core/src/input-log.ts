/**
 * Input log (D-001, D-005, D-012): the input of every tick of a run, stored
 * run-length encoded. A row is written only when the input differs from the
 * previous tick's, so a player standing still costs nothing.
 *
 *   {
 *     "format": 1,
 *     "engineVersion": 1,
 *     "ticks": 1800,
 *     "changes": [[0, 0, 1000, 0, 0, 0], [240, 0, 0, -150, 0, 1]]
 *   }
 *
 * A change is `[tick, moveX, moveY, lookYaw, lookPitch, buttons]` in integer
 * log units (see `inputToUnits`); it holds until the next change. Ticks before
 * the first change are idle. The seed is not part of the log: a run is
 * `seed + log`.
 */
import { ALL_BUTTONS, IDLE_INPUT, LOOK_UNITS, MAX_LOOK_PER_TICK, MOVE_UNITS, inputFromUnits, inputToUnits, type SimInput } from './input';
import { ENGINE_VERSION } from './version';

/** Version of the log layout itself. */
export const INPUT_LOG_FORMAT = 1;

/** `[tick, moveX, moveY, lookYaw, lookPitch, buttons]`, integers. */
export type InputChange = readonly [number, number, number, number, number, number];

export interface InputLog {
  format: number;
  /** `ENGINE_VERSION` the run was recorded with; `replay` refuses other versions. */
  engineVersion: number;
  /** Number of ticks recorded; the input of tick `t` exists for `0 <= t < ticks`. */
  ticks: number;
  /** Input changes in strictly increasing tick order. */
  changes: InputChange[];
}

export interface InputRecorder {
  /**
   * Records the input of the next tick and returns it quantized: that is the
   * input the simulation must be stepped with, so the live run and its replay
   * see the same numbers.
   */
  record(input: SimInput): SimInput;
  /** Number of ticks recorded so far. */
  readonly ticks: number;
  /** A copy of the log so far. */
  toLog(): InputLog;
}

const sameUnits = (a: readonly number[], b: readonly number[]): boolean => a.every((value, i) => value === b[i]);

export function createInputRecorder(): InputRecorder {
  const changes: InputChange[] = [];
  let last = inputToUnits(IDLE_INPUT);
  let ticks = 0;
  return {
    record(input) {
      const units = inputToUnits(input);
      if (!sameUnits(units, last)) {
        changes.push([ticks, ...units]);
        last = units;
      }
      ticks += 1;
      return inputFromUnits(units);
    },
    get ticks() {
      return ticks;
    },
    toLog: () => ({
      format: INPUT_LOG_FORMAT,
      engineVersion: ENGINE_VERSION,
      ticks,
      changes: changes.map((change) => [...change] as const),
    }),
  };
}

/** Input of every tick of `log`, in order: exactly `log.ticks` values. */
export function* inputsOf(log: InputLog): Generator<SimInput, void, undefined> {
  let current = IDLE_INPUT;
  let next = 0;
  for (let tick = 0; tick < log.ticks; tick++) {
    const change = log.changes[next];
    if (change !== undefined && change[0] === tick) {
      const [, ...units] = change;
      current = inputFromUnits(units);
      next += 1;
    }
    yield current;
  }
}

export function serializeInputLog(log: InputLog): string {
  return JSON.stringify(log);
}

const isInt = (value: unknown): value is number => Number.isInteger(value);
const inRange = (value: unknown, limit: number): boolean => isInt(value) && Math.abs(value) <= limit;
const MAX_LOOK_UNITS = Math.round(MAX_LOOK_PER_TICK * LOOK_UNITS);

/**
 * Parses and validates a log produced by `serializeInputLog`. Throws
 * `TypeError` on anything malformed, so a corrupted log never replays into a
 * silently different dream.
 */
export function parseInputLog(json: string): InputLog {
  const fail = (reason: string): never => {
    throw new TypeError(`Invalid input log: ${reason}.`);
  };
  const data: unknown = JSON.parse(json);
  if (typeof data !== 'object' || data === null) return fail('not an object');
  const { format, engineVersion, ticks, changes } = data as Record<string, unknown>;
  if (format !== INPUT_LOG_FORMAT) return fail(`unsupported format ${String(format)}`);
  if (!isInt(engineVersion) || engineVersion < 1) return fail('bad engineVersion');
  if (!isInt(ticks) || ticks < 0) return fail('bad ticks');
  if (!Array.isArray(changes)) return fail('changes is not an array');

  let previousTick = -1;
  const parsed = changes.map((change: unknown, i): InputChange => {
    if (!Array.isArray(change) || change.length !== 6) return fail(`change ${i} is not a 6-tuple`);
    const [tick, moveX, moveY, lookYaw, lookPitch, buttons] = change as unknown[];
    if (!isInt(tick) || tick <= previousTick || tick >= ticks) return fail(`change ${i} has bad tick`);
    if (!inRange(moveX, MOVE_UNITS) || !inRange(moveY, MOVE_UNITS)) return fail(`change ${i} has bad move`);
    if ((moveX as number) ** 2 + (moveY as number) ** 2 > MOVE_UNITS ** 2) return fail(`change ${i} moves too fast`);
    if (!inRange(lookYaw, MAX_LOOK_UNITS) || !inRange(lookPitch, MAX_LOOK_UNITS)) return fail(`change ${i} has bad look`);
    if (!isInt(buttons) || buttons < 0 || (buttons & ~ALL_BUTTONS) !== 0) return fail(`change ${i} has bad buttons`);
    previousTick = tick;
    return [tick, moveX as number, moveY as number, lookYaw as number, lookPitch as number, buttons];
  });
  return { format, engineVersion, ticks, changes: parsed };
}
