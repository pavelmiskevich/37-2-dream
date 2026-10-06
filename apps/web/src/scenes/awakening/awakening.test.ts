import { describe, expect, it } from 'vitest';
import { AWAKENING_REASONS, TICK_DT, awakeningTimeline } from '@dream/core';
import { CALL_SECONDS, KITCHEN_CALL, REASONS, callSubtitle, reasonLine, temperatureLine, verdictLines, verdictOpacity } from './lines';
import { MICROWAVE, awakeningCues, awakeningExitEvents } from './sound';

const timeline = awakeningTimeline(TICK_DT);
const callAt = timeline.callAt * TICK_DT;
const verdictAt = timeline.verdictAt * TICK_DT;

describe('reason of the awakening', () => {
  it('has a dry line for every reason the core can give', () => {
    for (const reason of AWAKENING_REASONS) {
      expect(REASONS[reason]).toMatch(/^[А-ЯЁ ,]+$/u);
      expect(reasonLine(reason)).toBe(`ПРИЧИНА: ${REASONS[reason]}.`);
    }
  });

  it('states each reason as the vision and the spec put it', () => {
    expect(reasonLine('tea_brought')).toBe('ПРИЧИНА: ПРИНЕСЛИ ЧАЙ.');
    expect(reasonLine('unknown')).toBe('ПРИЧИНА: НЕИЗВЕСТНО.');
    expect(reasonLine('malingerer')).toBe('ПРИЧИНА: СИМУЛЯНТ.');
    expect(reasonLine('overheated')).toBe('ПРИЧИНА: МОЗГ РЕШИЛ, ЧТО ХВАТИТ.');
  });

  it('shows the temperature as the thermometer reads it', () => {
    expect(temperatureLine(36.9)).toBe('ТЕМПЕРАТУРА: 36,9 °C');
    expect(temperatureLine(39.04)).toBe('ТЕМПЕРАТУРА: 39,0 °C');
    expect(verdictLines('malingerer', 36.96)).toEqual(['ПРИЧИНА: СИМУЛЯНТ.', 'ТЕМПЕРАТУРА: 37,0 °C']);
  });

  it('fades in at the verdict and stays', () => {
    expect(verdictOpacity(timeline, TICK_DT, verdictAt - 0.1)).toBe(0);
    expect(verdictOpacity(timeline, TICK_DT, verdictAt + 0.5)).toBeGreaterThan(0);
    expect(verdictOpacity(timeline, TICK_DT, verdictAt + 60)).toBe(1);
  });
});

describe('the voice from the kitchen', () => {
  it('asks about tea, a plain question', () => {
    expect(KITCHEN_CALL).toBe('Ты чай будешь?');
  });

  it('is on screen from the call for a few seconds, gone before the verdict', () => {
    expect(callSubtitle(timeline, TICK_DT, callAt - 0.1).opacity).toBe(0);
    expect(callSubtitle(timeline, TICK_DT, callAt + 1)).toEqual({ text: KITCHEN_CALL, opacity: 1 });
    expect(callSubtitle(timeline, TICK_DT, callAt + CALL_SECONDS + 0.1).opacity).toBe(0);
    expect(callAt + CALL_SECONDS).toBeLessThanOrEqual(verdictAt);
  });
});

describe('sound of the awakening', () => {
  const cues = awakeningCues(timeline, TICK_DT, 14);

  it('gives him his own breathing back at once', () => {
    expect(cues.filter((cue) => cue.at === 0).map((cue) => cue.event)).toEqual([
      { type: 'breath.rate', breathsPerMinute: 14 },
      { type: 'sound.start', sound: 'breath', fade: 2.5 },
    ]);
  });

  it('opens the kitchen after the vacuum goes quiet: a cup, then the microwave three times', () => {
    const quiet = timeline.quietAt * TICK_DT;
    const later = cues.filter((cue) => cue.at > 0);
    expect(later.every((cue) => cue.at > quiet && cue.at < callAt)).toBe(true);
    expect(later.filter((cue) => cue.event.type === 'monitor.beep')).toHaveLength(MICROWAVE.beeps);
    expect(later[0]!.event).toMatchObject({ type: 'sound.start', sound: 'kitchen' });
    const at = cues.map((cue) => cue.at);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it('goes quiet when the view goes', () => {
    expect(awakeningExitEvents().map((e) => e.type)).toEqual(['sound.stop', 'sound.stop']);
  });
});
