import type { AssetTags, LibraryAsset, LibraryManifest } from '@dream/core';
import { describe, expect, it } from 'vitest';
import type { SampleId } from '../audio';
import {
  ROOM_TONES,
  WAKING,
  WAKING_RECORDINGS,
  dueWakingCues,
  wakingCues,
  wakingFrame,
  wakingRoomTone,
  wakingSamples,
  wakingView,
  type RoomTone,
  type WakingCue,
  type WakingRecordingsAvailable,
} from './waking';

/** Room tone of the playtest seed, and a seed that wakes up to the other one (named in the PR). */
const PLAYTEST_ROOM_TONE: RoomTone = 'room-hallway';
const OTHER_SEED = 'DREAM-4C21-9E07-B5D3';

function asset(id: string, tags: Partial<AssetTags>, kind: LibraryAsset['kind'] = 'still'): LibraryAsset {
  return {
    id,
    kind,
    file: `stills/${id}.webp`,
    width: 1280,
    height: 720,
    tags: { location: 'yard', motifs: [], people: 'none', mood: 'calm', time: 'night', ...tags },
    generation: { model: 'm', license: 'Apache-2.0', prompt: 'p', seed: 1, source: 's' },
  };
}

const library = (...assets: LibraryAsset[]): LibraryManifest => ({ version: 1, assets });

describe('wakingFrame', () => {
  it('is null while the library has no bedroom by day', () => {
    expect(wakingFrame(library())).toBeNull();
    expect(wakingFrame(library(asset('yard', {}), asset('bedroom-night', { location: 'bedroom', time: 'night' })))).toBeNull();
    expect(wakingFrame(library(asset('kitchen-day', { location: 'kitchen', time: 'day' })))).toBeNull();
  });

  it('picks up the bedroom by day as soon as the manifest has it', () => {
    const day = asset('bedroom-day', { location: 'bedroom', time: 'day' });
    expect(wakingFrame(library(asset('yard', {}), day, asset('bedroom-day-2', { location: 'bedroom', time: 'day' })))).toBe(day);
  });

  it('never wakes up into a scare frame or a clip', () => {
    const scare = asset('bedroom-face', { location: 'bedroom', time: 'day', mood: 'scare' });
    const clip = asset('bedroom-clip', { location: 'bedroom', time: 'day' }, 'clip');
    expect(wakingFrame(library(scare, clip))).toBeNull();
  });
});

describe('wakingView', () => {
  it('starts with shut eyes and nothing on screen', () => {
    expect(wakingView(0)).toEqual({ eyes: 0, thermometer: 0, call: 0, verdict: 0, over: false });
  });

  it('opens the eyes, then shows the thermometer, the call and the reason in that order', () => {
    expect(wakingView(WAKING.eyes).eyes).toBe(1);
    expect(wakingView(WAKING.thermometerAt).thermometer).toBe(0);
    expect(wakingView(WAKING.thermometerAt + WAKING.thermometerFade).thermometer).toBe(1);
    expect(wakingView(WAKING.callAt + WAKING.callSeconds / 2)).toMatchObject({ call: 1, verdict: 0 });
    expect(wakingView(WAKING.callAt + WAKING.callSeconds + 0.01).call).toBe(0);
    expect(wakingView(WAKING.verdictAt + WAKING.verdictFade)).toMatchObject({ thermometer: 1, verdict: 1, over: false });
  });

  it('never lets the call and the reason overlap, and ends', () => {
    expect(WAKING.callAt + WAKING.callSeconds).toBeLessThanOrEqual(WAKING.verdictAt);
    expect(WAKING.verdictAt + WAKING.verdictFade).toBeLessThan(WAKING.end);
    expect(wakingView(WAKING.end - 0.01).over).toBe(false);
    expect(wakingView(WAKING.end).over).toBe(true);
  });

  it('keeps every opacity within 0…1', () => {
    for (let t = -1; t < WAKING.end + 2; t += 0.05) {
      const { eyes, thermometer, call, verdict } = wakingView(t);
      for (const value of [eyes, thermometer, call, verdict]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('wakingCues', () => {
  const cues = wakingCues();

  it('opens the mix and brings in his breathing and the kitchen at once', () => {
    const first = cues.filter((cue) => cue.at === 0).map((cue) => cue.event);
    expect(first).toContainEqual({ type: 'master.volume', value: 1 });
    expect(first).toContainEqual({ type: 'master.muffle', value: 0 });
    expect(first).toContainEqual({ type: 'sound.start', sound: 'breath', fade: WAKING.breathFade });
    expect(first).toContainEqual({ type: 'sound.start', sound: 'kitchen', fade: WAKING.kitchenFade });
  });

  it('beeps the microwave three times before the call', () => {
    const beeps = cues.filter((cue) => cue.event.type === 'monitor.beep');
    expect(beeps).toHaveLength(3);
    for (const beep of beeps) expect(beep.at).toBeLessThan(WAKING.callAt);
  });

  it('is in time order and every cue is fired exactly once by consecutive windows', () => {
    for (const list of [cues, wakingCues(everything('room-hall'))]) {
      expect(list.map((cue) => cue.at)).toEqual([...list.map((cue) => cue.at)].sort((a, b) => a - b));
      const fired: unknown[] = [];
      let from = 0;
      for (let to = 0.016; from < WAKING.end; to += 0.016) {
        fired.push(...dueWakingCues(list, from, to));
        from = to;
      }
      expect(fired).toEqual(list);
    }
  });

  it('plays no recordings when none has loaded, as before them', () => {
    const none = wakingCues({ roomTone: 'room-hallway', has: () => false });
    expect(none).toEqual(cues);
    expect(cues.some((cue) => cue.event.type === 'sample.play')).toBe(false);
  });
});

function everything(roomTone: RoomTone): WakingRecordingsAvailable {
  return { roomTone, has: () => true };
}

const plays = (list: WakingCue[]) =>
  list.flatMap((cue) => (cue.event.type === 'sample.play' ? [{ at: cue.at, ...cue.event }] : []));

describe('wakingCues with the recordings', () => {
  const cues = wakingCues(everything('room-hallway'));
  const play = (sample: SampleId) => plays(cues).find((p) => p.sample === sample);

  it('plays the room tone of the dream from the start, looping, and never the other one', () => {
    expect(play('room-hallway')).toMatchObject({ at: 0, loop: true, gain: WAKING_RECORDINGS.roomTone.gain });
    expect(play('room-hall')).toBeUndefined();
    expect(plays(wakingCues(everything('room-hall'))).map((p) => p.sample)).toContain('room-hall');
  });

  it('snores in the dark first, and his own breathing comes in only after the snore', () => {
    expect(play('snore')?.at).toBe(0);
    const breath = cues.find((cue) => cue.event.type === 'sound.start' && cue.event.sound === 'breath');
    expect(breath?.at).toBe(WAKING_RECORDINGS.snore.ends);
    expect(WAKING_RECORDINGS.snore.ends).toBeLessThanOrEqual(WAKING.eyes + 0.5);
  });

  it('turns the monitor into the recorded microwave: its three beeps replace the synthesised ones before the call', () => {
    expect(cues.some((cue) => cue.event.type === 'monitor.beep')).toBe(false);
    const microwave = play('microwave');
    const { firstBeep, beepInFile } = WAKING_RECORDINGS.microwave;
    expect(microwave?.at).toBeCloseTo(firstBeep - beepInFile);
    // Three beeps 0,6 s apart from the first one, all before the call.
    expect(firstBeep + 2 * 0.6).toBeLessThan(WAKING.callAt);
    expect(firstBeep).toBeGreaterThanOrEqual(WAKING_RECORDINGS.snore.ends);
  });

  it('creaks the bed as he wakes, after the snore has begun and before the call', () => {
    const bed = play('bed-creak');
    expect(bed?.at).toBeGreaterThan(0);
    expect(bed?.at).toBeLessThan(WAKING.callAt);
  });

  it('takes the kettle off the stove just as the kitchen asks about tea', () => {
    const kettle = play('kettle');
    const { from, offInFile } = WAKING_RECORDINGS.kettle;
    expect(kettle?.offset).toBe(from);
    expect((kettle?.at ?? 0) + (offInFile - from)).toBeCloseTo(WAKING.callAt);
  });

  it('lays only what has loaded: a missing microwave falls back to the synthesised beeps', () => {
    const partial = wakingCues({ roomTone: 'room-hall', has: (sample) => sample !== 'microwave' && sample !== 'snore' });
    expect(partial.filter((cue) => cue.event.type === 'monitor.beep')).toHaveLength(WAKING.microwave.beeps);
    expect(plays(partial).map((p) => p.sample).sort()).toEqual(['bed-creak', 'kettle', 'room-hall']);
    const breath = partial.find((cue) => cue.event.type === 'sound.start' && cue.event.sound === 'breath');
    expect(breath?.at).toBe(0);
  });
});

describe('wakingRoomTone', () => {
  it('is a pure function of the seed', () => {
    expect(wakingRoomTone('DREAM-8F72-A19C-37B2')).toBe(wakingRoomTone('DREAM-8F72-A19C-37B2'));
  });

  it('pins the room tones of the playtest seeds', () => {
    expect(wakingRoomTone('DREAM-8F72-A19C-37B2')).toBe(PLAYTEST_ROOM_TONE);
    expect(wakingRoomTone(OTHER_SEED)).toBe('room-hall');
  });

  it('takes turns between both room tones across dreams', () => {
    const counts = new Map<RoomTone, number>();
    for (let i = 0; i < 400; i++) {
      const tone = wakingRoomTone(`DREAM-${i.toString(16).toUpperCase().padStart(4, '0')}-0000-0000`);
      counts.set(tone, (counts.get(tone) ?? 0) + 1);
    }
    for (const tone of ROOM_TONES) expect(counts.get(tone) ?? 0).toBeGreaterThan(150);
  });

  it('is what the awakening loads, with the other four recordings', () => {
    const seed = 'DREAM-8F72-A19C-37B2';
    expect(wakingSamples(seed)).toEqual(['snore', 'microwave', 'bed-creak', 'kettle', wakingRoomTone(seed)]);
  });
});
