import type { AssetTags, LibraryAsset, LibraryManifest } from '@dream/core';
import { describe, expect, it } from 'vitest';
import { WAKING, dueWakingCues, wakingCues, wakingFrame, wakingView } from './waking';

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
    expect(cues.map((cue) => cue.at)).toEqual([...cues.map((cue) => cue.at)].sort((a, b) => a - b));
    const fired: unknown[] = [];
    let from = 0;
    for (let to = 0.016; from < WAKING.end; to += 0.016) {
      fired.push(...dueWakingCues(cues, from, to));
      from = to;
    }
    expect(fired).toEqual(cues);
  });
});
