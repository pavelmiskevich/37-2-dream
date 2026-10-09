import { findScene, type Dream } from '@dream/core';
import { CARD_KICKER, cardTitle, type CardBlock } from './blocks';
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

/** The card of a played game dream (v1.2); the film's card is `film-card.ts`. Both are drawn from `CardBlock`s. */
export { CARD_KICKER, cardFileName, cardTitle, type CardBlock } from './blocks';

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
