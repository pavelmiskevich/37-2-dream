import {
  DREAM_MOTIFS,
  LOCATION_TAGS,
  MOTIF_SOURCES,
  MOTIF_TAGS,
  OBJECT_LOCATIONS,
  generateFilm,
  normalizeSeed,
  summarizeFilm,
  type FilmSummary,
} from '@dream/core';
import { describe, expect, it } from 'vitest';
import { TEST_LIBRARY } from '../../../../packages/dream-core/src/film/test-library';
import type { CardBlock } from './blocks';
import { LOCATION_TEXT, durationText, filmJournalCard, sourceLine, strangeObjectText } from './film-card';
import type { JournalEntry } from './storage';

const seed = normalizeSeed('DREAM-8F72-A19C-37B2');

const summary: FilmSummary = {
  seed,
  engineVersion: 8,
  length: 'long',
  temperature: { asleep: 37.2, awake: 36.9 },
  duration: 161.3,
  shots: 58,
  scares: 1,
  locations: ['yard', 'stairwell', 'thermometer_corridor'],
  strangestObject: { kind: 'motif', motif: 'vacuum_woman' },
  wakeReason: 'tea_brought',
  heard: [
    { motif: 'vacuum', source: 'cleaning', count: 1, firstAt: 2.1 },
    { motif: 'swing_creak', source: 'bed_creak', count: 3, firstAt: 6 },
  ],
};
const entry: JournalEntry<FilmSummary> = { number: 12, seed, date: '2026-10-09T12:00:00.000Z', summary };

/** No-break spaces as plain ones, for readable expectations. */
const plain = (value: string) => value.replaceAll(String.fromCharCode(0xa0), ' ');
const section = (blocks: CardBlock[], heading: string) =>
  blocks.flatMap((block) => (block.kind === 'section' && block.heading === heading ? block.lines.map(plain) : []));
const rows = (blocks: CardBlock[], kind: 'rows' | 'meta') =>
  blocks.flatMap((block) => (block.kind === kind ? block.rows.map(([label, value]) => [label, plain(value)]) : []));

describe('filmJournalCard', () => {
  const blocks = filmJournalCard(entry, new Date(2026, 9, 9));

  it('states the number, the temperatures and the length', () => {
    expect(blocks.find((block) => block.kind === 'title')).toEqual({ kind: 'title', text: 'СОН №12' });
    expect(rows(blocks, 'rows')).toEqual([
      ['Температура при засыпании', '37,2 °C'],
      ['Температура при пробуждении', '36,9 °C'],
      ['Длительность', '02:41'],
    ]);
  });

  it('lists the locations, the strangest object and the sources of the sounds', () => {
    expect(section(blocks, 'Локации')).toEqual(['советский двор', 'подъезд', 'коридор термометров']);
    expect(section(blocks, 'Самый странный объект')).toEqual(['Женщина с пылесосом']);
    expect(section(blocks, 'Источники звуков')).toEqual([
      'Источник звука турбины: уборка в соседней комнате',
      'Источник звука качелей: скрип кровати, когда вы ворочались',
    ]);
  });

  it('states the reason and names the dream so that it can be opened again', () => {
    expect(blocks.find((block) => block.kind === 'reason')).toEqual({ kind: 'reason', text: 'ПРИЧИНА: ПРИНЕСЛИ ЧАЙ' });
    expect(rows(blocks, 'meta')).toEqual([
      ['Seed', seed],
      ['Длина сна', '2–3 минуты'],
      ['Версия движка', '8'],
      ['Дата', '09.10.2026'],
    ]);
  });

  it('puts a dash where the film showed or sounded nothing', () => {
    const empty = filmJournalCard({ ...entry, summary: { ...summary, locations: [], strangestObject: null, heard: [] } });
    expect(section(empty, 'Локации')).toEqual(['—']);
    expect(section(empty, 'Самый странный объект')).toEqual(['Не установлен']);
    expect(section(empty, 'Источники звуков')).toEqual(['—']);
  });

  it('is built for a real film', () => {
    for (const length of ['short', 'long'] as const) {
      const real = summarizeFilm(generateFilm(seed, length, TEST_LIBRARY), TEST_LIBRARY);
      const card = filmJournalCard({ ...entry, summary: real });
      expect(section(card, 'Локации')).toHaveLength(real.locations.length);
      expect(section(card, 'Источники звуков')).toHaveLength(Math.max(1, real.heard.length));
    }
  });
});

describe('words of the film journal', () => {
  it('has a name for every location, motif and source', () => {
    for (const location of LOCATION_TAGS) expect(LOCATION_TEXT[location]).toBeTruthy();
    for (const motif of MOTIF_TAGS) expect(strangeObjectText({ kind: 'motif', motif })).toMatch(/^[А-ЯЁ]/);
    for (const location of OBJECT_LOCATIONS) expect(strangeObjectText({ kind: 'location', location })).toMatch(/^[А-ЯЁ]/);
    for (const motif of DREAM_MOTIFS) expect(sourceLine(motif, MOTIF_SOURCES[motif])).toMatch(/^Источник звука .+: .+$/);
  });

  it('formats the length of a film', () => {
    expect(durationText(37)).toBe('00:37');
    expect(durationText(161.3)).toBe('02:41');
    expect(durationText(180)).toBe('03:00');
  });
});
