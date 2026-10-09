import type { AwakeningReason, DreamLength } from '@dream/core';

/**
 * Words of the dream film outside the dream itself: the falling-asleep
 * screen, the pause and the awakening. Nothing here jokes or winks: the
 * warning is a warning, the voice from the kitchen is an ordinary question,
 * the reason is stated as dryly as a form. It only becomes funny because of
 * what came before it (vision, "Тон").
 */

const NBSP = String.fromCharCode(0xa0);

/** "37,2 °C": decimal comma, no-break space before the unit. */
export function temperatureText(celsius: number): string {
  return `${celsius.toFixed(1).replace('.', ',')}${NBSP}°C`;
}

export const SLEEP_ACTION = 'Нажмите, чтобы уснуть';
export const SLEEP_LOADING = 'Вы засыпаете';
export const SLEEP_UNAVAILABLE = 'Сон недоступен: библиотека кадров не загрузилась. Обновите страницу.';

export const LENGTH_LEGEND = 'Длина сна';
export const LENGTH_TEXT: Readonly<Record<DreamLength, string>> = {
  short: `37${NBSP}секунд`,
  long: `2–3${NBSP}минуты`,
};

/** D-009: said before the dream, next to the switch. */
export const FLASH_WARNING =
  'Во сне бывают резкие вспышки, громкие звуки и скримеры. Если вы чувствительны к мерцанию света, включите «без вспышек».';
export const NO_FLASH_LABEL = 'Без вспышек и резких скримеров';

export const PAUSE_TITLE = 'Пауза';
export const PAUSE_RESUME = 'Продолжить';
export const PAUSE_EXIT = 'Проснуться';

/** Somebody in the kitchen. */
export const KITCHEN_CALL = 'Ты чай будешь?';

/** The reason of the awakening, as the form states it (spec §35). */
export const REASONS: Readonly<Record<AwakeningReason, string>> = {
  tea_brought: 'ПРИНЕСЛИ ЧАЙ',
  unknown: 'НЕИЗВЕСТНО',
  malingerer: 'СИМУЛЯНТ',
  overheated: 'МОЗГ РЕШИЛ, ЧТО ХВАТИТ',
};

/** "ПРИЧИНА: ПРИНЕСЛИ ЧАЙ." */
export function reasonLine(reason: AwakeningReason): string {
  return `ПРИЧИНА: ${REASONS[reason]}.`;
}

/** The second half of the project's central phrase; the first is the thermometer. */
export const NOTHING_SERIOUS = 'Ничего страшного. Просто приснилось.';
