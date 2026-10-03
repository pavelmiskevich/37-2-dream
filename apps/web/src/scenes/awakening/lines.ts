import { thermometerReading, type AwakeningReason, type AwakeningTimeline } from '@dream/core';
import { NO_SUBTITLE, type Subtitle } from '../apartment/lines';
import { formatReading } from '../apartment/thermometer';

/**
 * Words of the awakening (vision, "Реальность → сон"; spec §35). Nothing
 * here jokes or winks (pillar 1): the voice from the kitchen is an ordinary
 * question, the reason is stated as dryly as a form. The core gives the
 * reason id; the words live here.
 */

/** Somebody in the kitchen. In the dream it was the voice from the lift. */
export const KITCHEN_CALL = 'Ты чай будешь?';

/** The reason of the awakening, as the form states it. */
export const REASONS: Readonly<Record<AwakeningReason, string>> = {
  tea_brought: 'ПРИНЕСЛИ ЧАЙ',
  unknown: 'НЕИЗВЕСТНО',
  malingerer: 'СИМУЛЯНТ',
  overheated: 'МОЗГ РЕШИЛ, ЧТО ХВАТИТ',
};

/** "ПРИЧИНА: СИМУЛЯНТ." */
export function reasonLine(reason: AwakeningReason): string {
  return `ПРИЧИНА: ${REASONS[reason]}.`;
}

const NBSP = String.fromCharCode(0xa0);

/** "ТЕМПЕРАТУРА: 36,9 °C" — the thermometer's reading, decimal comma. */
export function temperatureLine(celsius: number): string {
  return `ТЕМПЕРАТУРА: ${formatReading(thermometerReading(celsius))}${NBSP}°C`;
}

/** The two lines of the verdict, top to bottom. */
export function verdictLines(reason: AwakeningReason, celsius: number): [string, string] {
  return [reasonLine(reason), temperatureLine(celsius)];
}

/** How long the kitchen call stays on screen, and its fades, seconds. */
export const CALL_SECONDS = 3;
export const CALL_FADE = 0.3;
/** The verdict fades in over this long, seconds. */
export const VERDICT_FADE = 1.5;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The kitchen call at `sceneTime` seconds: from the timeline's `callAt`, for `CALL_SECONDS`. */
export function callSubtitle(timeline: AwakeningTimeline, tickDt: number, sceneTime: number): Subtitle {
  const since = sceneTime - timeline.callAt * tickDt;
  if (since < 0 || since > CALL_SECONDS) return NO_SUBTITLE;
  const opacity = Math.min(clamp01(since / CALL_FADE), clamp01((CALL_SECONDS - since) / CALL_FADE));
  return opacity > 0 ? { text: KITCHEN_CALL, opacity } : NO_SUBTITLE;
}

/** Opacity of the verdict at `sceneTime` seconds: 0 until `verdictAt`, then fading in and staying. */
export function verdictOpacity(timeline: AwakeningTimeline, tickDt: number, sceneTime: number): number {
  return clamp01((sceneTime - timeline.verdictAt * tickDt) / VERDICT_FADE);
}
