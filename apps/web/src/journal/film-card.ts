import type { DreamMotif, FilmStrangeObject, FilmSummary, LocationTag, MotifTag, RealSource } from '@dream/core';
import { LENGTH_TEXT, REASONS, temperatureText } from '../dream/lines';
import { CARD_KICKER, cardTitle, type CardBlock } from './blocks';
import type { JournalEntry } from './storage';

/**
 * The journal card of a dream film (D-021, D-027), from `summarizeFilm`. The
 * card is a medical document: dry, exact, entirely serious. Nothing here
 * jokes or winks; the absurdity is in what is being recorded, and in the
 * sources of the sounds — the one place the dream is explained.
 *
 * Self-contained on purpose: the words of the v1.2 game journal (`texts.ts`)
 * go away with the game (#41).
 */

/** Where the edit went, as the record names it. */
export const LOCATION_TEXT: Readonly<Record<LocationTag, string>> = {
  yard: 'советский двор',
  stairwell: 'подъезд',
  stairs: 'лестница',
  hospital_corridor: 'больничный коридор',
  thermometer_corridor: 'коридор термометров',
  jam_jar: 'банка варенья',
  bedroom: 'спальня',
  kitchen: 'кухня',
  elevator: 'лифт',
};

const MOTIF_OBJECT_TEXT: Readonly<Record<MotifTag, string>> = {
  swing: 'Качели',
  vacuum_woman: 'Женщина с пылесосом',
  ventilator: 'Аппарат ИВЛ',
  monitor: 'Реанимационный монитор',
  thermometer: 'Термометр',
  pigeons: 'Голуби',
  will_papers: 'Листы завещания',
};

const LOCATION_OBJECT_TEXT: Readonly<Partial<Record<LocationTag, string>>> = {
  jam_jar: 'Банка варенья',
  elevator: 'Лифт',
};

/** "Самый странный объект". */
export function strangeObjectText(object: FilmStrangeObject | null): string {
  if (object === null) return 'Не установлен';
  if (object.kind === 'motif') return MOTIF_OBJECT_TEXT[object.motif];
  const text = LOCATION_OBJECT_TEXT[object.location] ?? LOCATION_TEXT[object.location];
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The motif as the dream presented it, in the genitive: "Источник звука ИВЛ". */
const MOTIF_TEXT: Readonly<Record<DreamMotif, string>> = {
  ventilator: 'ИВЛ',
  monitor: 'реанимационного монитора',
  vacuum: 'турбины',
  swing_creak: 'качелей',
  lift_voice: 'голоса из лифта',
};

/** What it really was (vision, "Тон"). */
const SOURCE_TEXT: Readonly<Record<RealSource, string>> = {
  snoring: 'ваш храп',
  microwave: 'микроволновка на кухне',
  cleaning: 'уборка в соседней комнате',
  bed_creak: 'скрип кровати, когда вы ворочались',
  tea_offer: '«Ты чай будешь?» с кухни',
};

/** "Источник звука ИВЛ: ваш храп". */
export function sourceLine(motif: DreamMotif, source: RealSource): string {
  return `Источник звука ${MOTIF_TEXT[motif]}: ${SOURCE_TEXT[source]}`;
}

/** "00:37", "02:41". */
export function durationText(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** "02.10.2026", local date. */
export function dateText(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${date.getFullYear()}`;
}

/** The card of `entry`. */
export function filmJournalCard(entry: JournalEntry<FilmSummary>, date: Date = new Date(entry.date)): CardBlock[] {
  const { summary } = entry;
  const none = ['—'];
  const locations = summary.locations.map((location) => LOCATION_TEXT[location]);
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
    { kind: 'section', heading: 'Самый странный объект', lines: [strangeObjectText(summary.strangestObject)] },
    { kind: 'section', heading: 'Источники звуков', lines: sources.length > 0 ? sources : none },
    { kind: 'reason', text: `ПРИЧИНА: ${REASONS[summary.wakeReason]}` },
    {
      kind: 'meta',
      rows: [
        ['Seed', summary.seed],
        ['Длина сна', LENGTH_TEXT[summary.length]],
        ['Версия движка', String(summary.engineVersion)],
        ['Дата', Number.isNaN(date.getTime()) ? '—' : dateText(date)],
      ],
    },
  ];
}
