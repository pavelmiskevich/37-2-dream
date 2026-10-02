import type { ApartmentTimeline, LastWords, LastWordsOpening, LastWordsTrail } from '@dream/core';

/**
 * The hero's last words in the apartment (vision, slice item 1). He means
 * every word: the tone is grave, nothing winks at the player (pillar 1).
 * The core picks the ids by seed; the words live here.
 */
export const LAST_WORDS = 'Передайте коту…';

export const OPENINGS: Readonly<Record<LastWordsOpening, string>> = {
  none: '',
  if_i_dont_wake_up: 'Если я не проснусь…',
  this_is_the_end: 'Всё. Это конец.',
  remember_my_words: 'Запомните мои слова.',
  too_late_for_doctors: 'Врача не надо. Уже поздно.',
  last_request: 'Последняя просьба.',
};

/** What he still manages to say before sleep cuts him off. */
export const TRAILS: Readonly<Record<LastWordsTrail, string>> = {
  none: '',
  that_i: 'что я…',
  the_bowl: 'что миска…',
  not_to_wait: 'пусть не ждёт…',
  that_everything: 'что всё…',
};

/** Seconds into the speaking phase when "Передайте коту…" follows an opening. */
export const OPENING_SECONDS = 2;
/** Seconds into the speaking phase when the trail is said. */
export const TRAIL_SECONDS = 3.4;
/** Share of falling asleep over which the subtitle fades out. */
export const SUBTITLE_FADE = 0.35;

export interface Subtitle {
  text: string;
  /** 0..1. */
  opacity: number;
}

export const NO_SUBTITLE: Subtitle = { text: '', opacity: 0 };

/**
 * Subtitle on screen at `sceneTime` seconds: nothing while he looks around;
 * then the opening, "Передайте коту…" and the trail, word by word; it stays
 * while he is silent and fades as his eyes close. `sleep` is the progress of
 * falling asleep (0..1); `tickDt` converts the timeline to seconds.
 */
export function subtitleAt(
  words: LastWords,
  timeline: ApartmentTimeline,
  tickDt: number,
  sceneTime: number,
  sleep: number,
): Subtitle {
  const since = sceneTime - timeline.speakAt * tickDt;
  if (since < 0) return NO_SUBTITLE;
  const opening = OPENINGS[words.opening];
  const trail = TRAILS[words.trail];
  const parts: string[] = [];
  if (opening) parts.push(opening);
  if (!opening || since >= OPENING_SECONDS) parts.push(LAST_WORDS);
  if (trail && since >= TRAIL_SECONDS) parts.push(trail);
  const opacity = 1 - Math.min(1, Math.max(0, sleep / SUBTITLE_FADE));
  return opacity > 0 ? { text: parts.join(' '), opacity } : NO_SUBTITLE;
}
