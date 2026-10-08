import { findScene, type Dream } from '@dream/core';
import type { JournalEntry } from './storage';
import {
  dateText,
  durationText,
  eventText,
  locationText,
  reasonText,
  sourceLine,
  strangeObjectText,
  temperatureText,
} from './texts';

/**
 * What the journal card says, as plain data: the page and the PNG are both
 * drawn from it, so they never disagree. Order follows spec §34, with the
 * sources of the sounds (vision, "Реальность → сон") before the reason.
 */
export type CardBlock =
  /** Small line above the title. */
  | { kind: 'kicker'; text: string }
  /** "СОН №1847". */
  | { kind: 'title'; text: string }
  /** Label — value lines. */
  | { kind: 'rows'; rows: readonly (readonly [string, string])[] }
  /** A heading over lines of text. */
  | { kind: 'section'; heading: string; lines: readonly string[] }
  /** "ПРИЧИНА: …". */
  | { kind: 'reason'; text: string }
  /** Seed, engine, date: small print at the bottom. */
  | { kind: 'meta'; rows: readonly (readonly [string, string])[] };

export const CARD_KICKER = 'Журнал сновидений';

/** "СОН №1847". */
export function cardTitle(number: number): string {
  return `СОН №${number}`;
}

/** The card of `entry`; `dream` is the dream of its seed (for the names of things in it). */
export function journalCard(entry: JournalEntry, dream: Dream, date: Date = new Date(entry.date)): CardBlock[] {
  const { summary } = entry;
  const flavor = findScene(dream, 'jam')?.params.flavor;
  const none = ['—'];
  const locations = summary.locations.map((id) => locationText(id, flavor));
  const events = summary.events.map((event) => eventText(event.id, event.count));
  const sources = summary.heard.map((heard) => sourceLine(heard.motif, heard.source));

  return [
    { kind: 'kicker', text: CARD_KICKER },
    { kind: 'title', text: cardTitle(entry.number) },
    {
      kind: 'rows',
      rows: [
        ['Температура при засыпании', temperatureText(summary.temperature.asleep)],
        ['Температура при пробуждении', temperatureText(summary.temperature.awake)],
        ['Длительность', durationText(summary.duration)],
      ],
    },
    { kind: 'section', heading: 'Локации', lines: locations.length > 0 ? locations : none },
    { kind: 'section', heading: 'События', lines: events.length > 0 ? events : none },
    { kind: 'section', heading: 'Самый странный объект', lines: [strangeObjectText(summary.strangestObject)] },
    { kind: 'section', heading: 'Источники звуков', lines: sources.length > 0 ? sources : none },
    { kind: 'reason', text: reasonText(summary.wakeReason) },
    {
      kind: 'meta',
      rows: [
        ['Seed', summary.seed],
        ['Версия движка', String(summary.engineVersion)],
        ['Дата', Number.isNaN(date.getTime()) ? '—' : dateText(date)],
      ],
    },
  ];
}

/** File name of the saved card: "son-1847-DREAM-8F72-A19C-37B2.png". */
export function cardFileName(entry: Pick<JournalEntry, 'number' | 'seed'>): string {
  return `son-${entry.number}-${entry.seed}.png`;
}
