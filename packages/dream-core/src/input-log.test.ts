import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, buttonMask, quantizeInput } from './input';
import { INPUT_LOG_FORMAT, createInputRecorder, inputsOf, parseInputLog, serializeInputLog, type InputLog } from './input-log';
import { randomInputs } from './test-utils';
import { ENGINE_VERSION } from './version';

describe('createInputRecorder', () => {
  it('returns the quantized input it recorded', () => {
    const recorder = createInputRecorder();
    const raw = { move: [0.33333, 2] as const, look: [0.0123456, 0] as const, buttons: 1 };
    expect(recorder.record(raw)).toEqual(quantizeInput(raw));
    expect(recorder.ticks).toBe(1);
  });

  it('writes a row only when the input changes', () => {
    const recorder = createInputRecorder();
    const forward = { move: [0, 1] as const, look: [0, 0] as const, buttons: 0 };
    for (let i = 0; i < 10; i++) recorder.record(IDLE_INPUT);
    for (let i = 0; i < 20; i++) recorder.record(forward);
    recorder.record({ ...forward, buttons: buttonMask('jump') });
    for (let i = 0; i < 5; i++) recorder.record(IDLE_INPUT);
    expect(recorder.toLog()).toEqual({
      format: INPUT_LOG_FORMAT,
      engineVersion: ENGINE_VERSION,
      ticks: 36,
      changes: [
        [10, 0, 1000, 0, 0, 0],
        [30, 0, 1000, 0, 0, 1],
        [31, 0, 0, 0, 0, 0],
      ],
    });
  });

  it('hands out copies of the log', () => {
    const recorder = createInputRecorder();
    recorder.record({ move: [1, 0], look: [0, 0], buttons: 0 });
    const log = recorder.toLog();
    log.changes.length = 0;
    expect(recorder.toLog().changes).toHaveLength(1);
  });
});

describe('inputsOf', () => {
  it('expands a log back into the recorded inputs, tick by tick', () => {
    const raw = randomInputs(3000);
    const recorder = createInputRecorder();
    const recorded = raw.map((input) => recorder.record(input));
    expect([...inputsOf(recorder.toLog())]).toEqual(recorded);
  });

  it('gives idle input for an empty log', () => {
    const log: InputLog = { format: INPUT_LOG_FORMAT, engineVersion: ENGINE_VERSION, ticks: 3, changes: [] };
    expect([...inputsOf(log)]).toEqual([IDLE_INPUT, IDLE_INPUT, IDLE_INPUT]);
  });
});

describe('JSON', () => {
  const recorder = createInputRecorder();
  for (const input of randomInputs(2000, 'json')) recorder.record(input);
  const log = recorder.toLog();

  it('round-trips a log unchanged', () => {
    expect(parseInputLog(serializeInputLog(log))).toEqual(log);
  });

  it('stays compact', () => {
    // A restless player changes input on ~half of the ticks; ~25 bytes per row.
    expect(serializeInputLog(log).length).toBeLessThan(log.ticks * 20);
  });

  const valid = { format: INPUT_LOG_FORMAT, engineVersion: 1, ticks: 10, changes: [[0, 0, 1000, 0, 0, 0]] };
  it.each([
    ['not an object', 'null'],
    ['unknown format', { ...valid, format: 99 }],
    ['bad engine version', { ...valid, engineVersion: 0 }],
    ['negative ticks', { ...valid, ticks: -1 }],
    ['non-array changes', { ...valid, changes: {} }],
    ['short change', { ...valid, changes: [[0, 0, 0]] }],
    ['tick out of range', { ...valid, changes: [[10, 0, 0, 0, 0, 0]] }],
    ['ticks out of order', { ...valid, changes: [[3, 0, 0, 0, 0, 0], [3, 0, 1, 0, 0, 0]] }],
    ['fractional units', { ...valid, changes: [[0, 0.5, 0, 0, 0, 0]] }],
    ['move outside the unit circle', { ...valid, changes: [[0, 1000, 1000, 0, 0, 0]] }],
    ['huge look', { ...valid, changes: [[0, 0, 0, 1e9, 0, 0]] }],
    ['unknown buttons', { ...valid, changes: [[0, 0, 0, 0, 0, 64]] }],
  ])('rejects %s', (_, data) => {
    expect(() => parseInputLog(typeof data === 'string' ? data : JSON.stringify(data))).toThrow(TypeError);
  });
});
