import { describe, expect, it } from 'vitest';
import {
  TICK_DT,
  apartmentTimeline,
  findScene,
  generateDream,
  normalizeSeed,
  type ApartmentTimeline,
  type LastWords,
} from '@dream/core';
import { eyesAt } from './eyes';
import { LAST_WORDS, OPENINGS, OPENING_SECONDS, TRAILS, TRAIL_SECONDS, subtitleAt } from './lines';
import { apartmentExitEvents, apartmentSoundEvents, breathTempo, type ApartmentSound } from './sound';
import { formatReading, segmentsOf } from './thermometer';

const timeline: ApartmentTimeline = { speakAt: 600, silentAt: 870, sleepAt: 990, asleepAt: 1410 };
const speakAt = timeline.speakAt * TICK_DT;
const words = (opening: LastWords['opening'], trail: LastWords['trail']): LastWords => ({ opening, trail });

describe('last words', () => {
  it('are serious sentences for every id the core can pick', () => {
    for (const [id, text] of Object.entries(OPENINGS)) {
      if (id === 'none') expect(text).toBe('');
      else expect(text).toMatch(/^[А-ЯЁ].*[.…]$/u);
    }
    for (const [id, text] of Object.entries(TRAILS)) {
      if (id === 'none') expect(text).toBe('');
      else expect(text).toMatch(/^[а-яё].*…$/u);
    }
  });

  it('say nothing while he looks around', () => {
    expect(subtitleAt(words('last_request', 'that_i'), timeline, TICK_DT, speakAt - 0.01, 0).text).toBe('');
  });

  it('start with "Передайте коту…" when there is no opening', () => {
    expect(subtitleAt(words('none', 'none'), timeline, TICK_DT, speakAt, 0)).toEqual({ text: LAST_WORDS, opacity: 1 });
  });

  it('come word by word: the opening, the request, then what sleep cuts off', () => {
    const w = words('if_i_dont_wake_up', 'the_bowl');
    expect(subtitleAt(w, timeline, TICK_DT, speakAt + 0.5, 0).text).toBe('Если я не проснусь…');
    expect(subtitleAt(w, timeline, TICK_DT, speakAt + OPENING_SECONDS, 0).text).toBe('Если я не проснусь… Передайте коту…');
    expect(subtitleAt(w, timeline, TICK_DT, speakAt + TRAIL_SECONDS, 0).text).toBe(
      'Если я не проснусь… Передайте коту… что миска…',
    );
  });

  it('stay while he is silent and fade as his eyes close', () => {
    const w = words('this_is_the_end', 'none');
    const silent = subtitleAt(w, timeline, TICK_DT, timeline.sleepAt * TICK_DT - 0.1, 0);
    expect(silent).toEqual({ text: 'Всё. Это конец. Передайте коту…', opacity: 1 });
    const fading = subtitleAt(w, timeline, TICK_DT, timeline.sleepAt * TICK_DT + 1, 0.2);
    expect(fading.opacity).toBeGreaterThan(0);
    expect(fading.opacity).toBeLessThan(1);
    expect(subtitleAt(w, timeline, TICK_DT, timeline.asleepAt * TICK_DT, 1).text).toBe('');
  });

  it('fit the real prologue: the whole line is said before he falls silent', () => {
    const dream = generateDream(normalizeSeed('DREAM-8F72-A19C-37B2'));
    const t = apartmentTimeline(findScene(dream, 'apartment')!, TICK_DT);
    expect((t.silentAt - t.speakAt) * TICK_DT).toBeGreaterThan(TRAIL_SECONDS);
  });
});

describe('falling asleep', () => {
  it('starts with open eyes and ends in the dark with the lids shut', () => {
    expect(eyesAt(0)).toEqual({ lids: 0, dark: 0 });
    expect(eyesAt(1)).toEqual({ lids: 1, dark: 1 });
  });

  it('blinks heavily: the lids close and open again before they stay shut', () => {
    const lids = Array.from({ length: 101 }, (_, i) => eyesAt(i / 100).lids);
    const reopenings = lids.filter((value, i) => i > 0 && value < lids[i - 1]! - 1e-6).length;
    expect(reopenings).toBeGreaterThan(0);
    expect(Math.max(...lids.slice(0, 30))).toBeGreaterThan(0.95);
    expect(lids.slice(80).every((value) => value > 0.99)).toBe(true);
  });

  it('only darkens, never lightens', () => {
    for (let i = 1; i <= 100; i++) expect(eyesAt(i / 100).dark).toBeGreaterThanOrEqual(eyesAt((i - 1) / 100).dark);
  });
});

describe('apartment sound', () => {
  const tempo = { breath: 17, ventilator: 13 };
  const at = (phase: ApartmentSound['phase'], sleep = 0): ApartmentSound => ({ phase, sleep });

  it('starts his breathing and the kitchen behind the door', () => {
    const { events } = apartmentSoundEvents(null, at('awake'), tempo, null);
    expect(events).toContainEqual({ type: 'breath.rate', breathsPerMinute: 17 });
    expect(events.filter((e) => e.type === 'sound.start').map((e) => e.type === 'sound.start' && e.sound)).toEqual([
      'breath',
      'kitchen',
    ]);
  });

  it('stays quiet while nothing changes', () => {
    expect(apartmentSoundEvents(at('awake'), at('speaking'), tempo, 17).events).toEqual([]);
  });

  it('turns his breathing into the ventilator as he falls asleep', () => {
    const first = apartmentSoundEvents(at('silent'), at('falling_asleep', 0.01), tempo, 17);
    expect(first.events).toContainEqual(expect.objectContaining({ type: 'sound.start', sound: 'ventilator' }));
    expect(first.events).toContainEqual(expect.objectContaining({ type: 'sound.stop', sound: 'kitchen' }));
    expect(first.events).toContainEqual(expect.objectContaining({ type: 'sound.stop', sound: 'breath' }));

    // The breathing slows towards the ventilator's tempo, in coarse steps.
    let sent = first.tempo;
    let previous = at('falling_asleep', 0.01);
    const rates: number[] = [];
    for (let i = 2; i <= 100; i++) {
      const next = at('falling_asleep', i / 100);
      const result = apartmentSoundEvents(previous, next, tempo, sent);
      for (const event of result.events) if (event.type === 'breath.rate') rates.push(event.breathsPerMinute);
      expect(result.events.some((e) => e.type === 'sound.start')).toBe(false);
      sent = result.tempo;
      previous = next;
    }
    expect(rates.length).toBeGreaterThan(5);
    expect(rates.length).toBeLessThan(30);
    expect(rates.at(-1)).toBeCloseTo(13, 0);
    expect(breathTempo(tempo, 0)).toBe(17);
    expect(breathTempo(tempo, 1)).toBe(13);
  });

  it('lets the ventilator linger into the dream on leaving', () => {
    const stops = apartmentExitEvents();
    const ventilator = stops.find((e) => e.type === 'sound.stop' && e.sound === 'ventilator');
    const breath = stops.find((e) => e.type === 'sound.stop' && e.sound === 'breath');
    expect(ventilator && 'fade' in ventilator && ventilator.fade).toBeGreaterThan((breath && 'fade' in breath && breath.fade) || 0);
  });
});

describe('thermometer', () => {
  it('shows the reading with a decimal comma', () => {
    expect(formatReading(37.2)).toBe('37,2');
    expect(formatReading(36.94)).toBe('36,9');
  });

  it('lights seven segments per digit and the comma as a dot', () => {
    expect(segmentsOf('37,2')).toEqual([
      { segments: 'abcdg', dot: false },
      { segments: 'abc', dot: true },
      { segments: 'abdeg', dot: false },
    ]);
  });
});
