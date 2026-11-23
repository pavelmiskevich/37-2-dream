import type { SoundCue } from '@dream/core';
import { describe, expect, it } from 'vitest';
import { BREATH_RATE, CREAK_PERIOD, cueEvents, dueCues, expandCues, STALE_HIT, VENTILATOR_RATE } from './sound';

const FLASHES_ON = { noFlash: false };

describe('cueEvents', () => {
  it('starts and stops the engine sounds, parameters first', () => {
    expect(cueEvents({ at: 0, sound: 'monitor', action: 'start', params: { tempo: 0.4 } }, FLASHES_ON)).toEqual([
      { type: 'monitor.intensity', value: 0.4 },
      { type: 'sound.start', sound: 'monitor' },
    ]);
    expect(cueEvents({ at: 0, sound: 'hum', action: 'stop' }, FLASHES_ON)).toEqual([{ type: 'sound.stop', sound: 'hum' }]);
  });

  it('maps tempo to breathing rates and the vacuum to its turbine and volume', () => {
    expect(cueEvents({ at: 0, sound: 'ventilator', action: 'set', params: { rate: 1 } }, FLASHES_ON)).toEqual([
      { type: 'ventilator.rate', breathsPerMinute: VENTILATOR_RATE.max },
    ]);
    expect(cueEvents({ at: 0, sound: 'vacuum', action: 'set', params: { turbine: 2, volume: 0.5 } }, FLASHES_ON)).toEqual([
      { type: 'vacuum.turbine', value: 1 },
      { type: 'vacuum.volume', value: 0.5 },
    ]);
  });

  it('gives the beds the volume of their start and set cues (#80)', () => {
    expect(cueEvents({ at: 0, sound: 'hum', action: 'set', params: { volume: 0.7, muffle: 0 } }, FLASHES_ON)).toEqual([
      { type: 'sound.volume', sound: 'hum', value: 0.7 },
      { type: 'master.muffle', value: 0 },
    ]);
    // The volume comes before the start, so the sound starts at it.
    expect(cueEvents({ at: 0, sound: 'kitchen', action: 'start', params: { volume: 0.3 } }, FLASHES_ON)).toEqual([
      { type: 'sound.volume', sound: 'kitchen', value: 0.3 },
      { type: 'sound.start', sound: 'kitchen' },
    ]);
    expect(cueEvents({ at: 0, sound: 'breath', action: 'start', params: { volume: 1.4, rate: 0 } }, FLASHES_ON)).toEqual([
      { type: 'breath.rate', breathsPerMinute: BREATH_RATE.min },
      { type: 'sound.volume', sound: 'breath', value: 1 },
      { type: 'sound.start', sound: 'breath' },
    ]);
    for (const sound of ['monitor', 'ventilator'] as const) {
      expect(cueEvents({ at: 0, sound, action: 'set', params: { volume: 0.5 } }, FLASHES_ON)).toContainEqual({
        type: 'sound.volume',
        sound,
        value: 0.5,
      });
    }
    // The lone beep and the vacuum keep their own levels.
    expect(cueEvents({ at: 0, sound: 'monitor', action: 'hit', params: { volume: 1 } }, FLASHES_ON)).toEqual([{ type: 'monitor.beep' }]);
    const vacuum = cueEvents({ at: 0, sound: 'vacuum', action: 'start', params: { volume: 0.5 } }, FLASHES_ON);
    expect(vacuum.some((event) => event.type === 'sound.volume')).toBe(false);
  });

  it('muffles the whole mix from any cue', () => {
    expect(cueEvents({ at: 0, sound: 'hum', action: 'set', params: { muffle: 0.6 } }, FLASHES_ON)).toEqual([
      { type: 'master.muffle', value: 0.6 },
    ]);
  });

  it('plays the stinger, softened without flashes (D-009)', () => {
    const cue: SoundCue = { at: 0, sound: 'stinger', action: 'hit', params: { volume: 0.9 } };
    expect(cueEvents(cue, FLASHES_ON)).toEqual([{ type: 'stinger.hit', strength: 0.9, soft: false }]);
    expect(cueEvents(cue, { noFlash: true })).toEqual([{ type: 'stinger.hit', strength: 0.9, soft: true }]);
  });

  it('drops the mix into silence and brings it back', () => {
    expect(cueEvents({ at: 0, sound: 'silence', action: 'start', params: { depth: 0.75 } }, FLASHES_ON)).toEqual([
      { type: 'master.volume', value: 0.25 },
    ]);
    expect(cueEvents({ at: 0, sound: 'silence', action: 'start' }, FLASHES_ON)).toEqual([{ type: 'master.volume', value: 0 }]);
    expect(cueEvents({ at: 0, sound: 'silence', action: 'stop' }, FLASHES_ON)).toEqual([{ type: 'master.volume', value: 1 }]);
  });

  it('beeps the monitor once and creaks the swing on a hit', () => {
    expect(cueEvents({ at: 0, sound: 'monitor', action: 'hit' }, FLASHES_ON)).toEqual([{ type: 'monitor.beep' }]);
    const [creak] = cueEvents({ at: 0, sound: 'swing_creak', action: 'hit', params: { strength: 0.5, pitch: 0.5 } }, FLASHES_ON);
    expect(creak).toEqual({ type: 'swing.creak', strength: 0.5, pitch: 1 });
  });
});

describe('expandCues', () => {
  it('turns a creaking swing into creaks every swing period, until it stops', () => {
    const cues = expandCues(
      [
        { at: 10, sound: 'swing_creak', action: 'start', params: { strength: 0.6 } },
        { at: 10, sound: 'hum', action: 'start' },
        { at: 15, sound: 'swing_creak', action: 'stop' },
      ],
      37,
    );
    const creaks = cues.filter((cue) => cue.sound === 'swing_creak');
    expect(creaks.every((cue) => cue.action === 'hit')).toBe(true);
    expect(creaks.map((cue) => cue.at)).toEqual([0, 1, 2, 3].map((i) => 10 + i * CREAK_PERIOD));
    expect(cues.some((cue) => cue.sound === 'hum')).toBe(true);
  });

  it('changes the creak with set and keeps creaking to the end when never stopped', () => {
    const cues = expandCues(
      [
        { at: 30, sound: 'swing_creak', action: 'start', params: { strength: 0.3 } },
        { at: 32, sound: 'swing_creak', action: 'set', params: { strength: 0.9 } },
      ],
      35,
    );
    expect(cues.map((cue) => cue.params?.strength)).toEqual([0.3, 0.3, 0.9, 0.9]);
    expect(cues.at(-1)!.at).toBeLessThan(35);
  });

  it('sorts the cues by time', () => {
    const cues = expandCues(
      [
        { at: 5, sound: 'hum', action: 'stop' },
        { at: 1, sound: 'hum', action: 'start' },
      ],
      10,
    );
    expect(cues.map((cue) => cue.at)).toEqual([1, 5]);
  });
});

describe('dueCues', () => {
  const cues: SoundCue[] = [
    { at: 0, sound: 'hum', action: 'start' },
    { at: 1, sound: 'monitor', action: 'hit' },
    { at: 2, sound: 'monitor', action: 'start' },
    { at: 3, sound: 'stinger', action: 'hit' },
  ];

  it('fires the cues reached in [from, to)', () => {
    expect(dueCues(cues, 0, 1).map((cue) => cue.at)).toEqual([0]);
    expect(dueCues(cues, 1, 1.1).map((cue) => cue.at)).toEqual([1]);
    expect(dueCues(cues, 1.1, 2.1).map((cue) => cue.at)).toEqual([2]);
    expect(dueCues(cues, 3, 3)).toEqual([]);
  });

  it('skips one-shots reached too late but always applies state changes', () => {
    // A stalled tab jumps from 0.5 to 3.5 s: the beep is stale, the start is not.
    const due = dueCues(cues, 0.5, 3 + STALE_HIT / 2);
    expect(due.map((cue) => cue.at)).toEqual([2, 3]);
  });
});

describe('the wind of a fall (#137)', () => {
  it('rises from its start and is cut dead at its stop', () => {
    expect(cueEvents({ at: 35.8, sound: 'fall_wind', action: 'start' }, FLASHES_ON)).toEqual([{ type: 'wind.start' }]);
    expect(cueEvents({ at: 37, sound: 'fall_wind', action: 'stop' }, FLASHES_ON)).toEqual([{ type: 'wind.stop' }]);
  });
});
