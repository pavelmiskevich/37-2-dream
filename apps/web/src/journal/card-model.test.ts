import { AWAKENING_REASONS, DREAM_MOTIFS, MOTIF_SOURCES, findScene, generateDream, normalizeSeed, type DreamSummary } from '@dream/core';
import { describe, expect, it } from 'vitest';
import { cardFileName, journalCard, type CardBlock } from './card-model';
import { nextDreamUrl, shareUrl, freshSeed } from './fresh';
import type { JournalEntry } from './storage';
import { durationText, eventText, locationText, plural, reasonText, sourceLine, strangeObjectText, temperatureText } from './texts';

const seed = normalizeSeed('DREAM-8F72-A19C-37B2');
const dream = generateDream(seed);

const summary: DreamSummary = {
  seed,
  engineVersion: dream.engineVersion,
  temperature: { asleep: 37.2, awake: 36.9 },
  duration: 192.4,
  locations: ['yard', 'fall', 'jam'],
  events: [
    { id: 'thermometer', count: 1 },
    { id: 'vacuum', count: 3 },
    { id: 'fall', count: 1 },
    { id: 'will_page', count: 7 },
    { id: 'jam_jar', count: 1 },
  ],
  strangestObject: { kind: 'nightstand', item: 'mustard_plasters' },
  wakeReason: 'tea_brought',
  heard: [
    { motif: 'ventilator', source: 'snoring', count: 2, firstSceneIndex: 0 },
    { motif: 'vacuum', source: 'cleaning', count: 3, firstSceneIndex: 1 },
  ],
};
const entry: JournalEntry = { number: 1847, seed, date: '2026-10-02T12:00:00.000Z', summary };

/** No-break spaces as plain ones, for readable expectations. */
const plain = (value: string) => value.replaceAll(String.fromCharCode(0xa0), ' ');

const text = (blocks: CardBlock[]) =>
  blocks.flatMap((block): string[] => {
    switch (block.kind) {
      case 'rows':
      case 'meta':
        return block.rows.map(([label, value]) => `${label}: ${value}`);
      case 'section':
        return [block.heading, ...block.lines];
      default:
        return [block.text];
    }
  }).map(plain);

describe('journalCard', () => {
  const lines = text(journalCard(entry, dream, new Date(2026, 9, 2)));

  it('reads as a medical record', () => {
    expect(lines).toContain('СОН №1847');
    expect(lines).toContain('Температура при засыпании: 37,2 °C');
    expect(lines).toContain('Температура при пробуждении: 36,9 °C');
    expect(lines).toContain('Длительность: 03:12');
    expect(lines).toContain('советский двор');
    expect(lines).toContain('3 появления пылесоса');
    expect(lines).toContain('7 листов завещания');
    expect(lines).toContain('Горчичники');
    expect(lines).toContain('Источник звука ИВЛ: ваш храп');
    expect(lines).toContain('Источник звука турбины: уборка в соседней комнате');
    expect(lines).toContain('ПРИЧИНА: ПРИНЕСЛИ ЧАЙ');
    expect(lines).toContain(`Seed: ${seed}`);
    expect(lines).toContain('Дата: 02.10.2026');
  });

  it('names the jar by the jam of the dream', () => {
    const flavor = findScene(dream, 'jam')!.params.flavor;
    expect(lines).toContain(locationText('jam', flavor));
    expect(locationText('jam', 'cherry')).toBe('банка вишнёвого варенья');
  });

  it('puts a dash under empty sections', () => {
    const empty = text(journalCard({ ...entry, summary: { ...summary, locations: [], events: [], heard: [] } }, dream));
    expect(empty.filter((line) => line === '—')).toHaveLength(3);
  });

  it('never ends a line with an exclamation mark', () => {
    for (const line of lines) expect(line).not.toMatch(/!/);
  });
});

describe('texts', () => {
  it('has words for every reason, motif and source', () => {
    expect(AWAKENING_REASONS.map(reasonText)).toEqual([
      'ПРИЧИНА: ПРИНЕСЛИ ЧАЙ',
      'ПРИЧИНА: НЕИЗВЕСТНО',
      'ПРИЧИНА: СИМУЛЯНТ',
      'ПРИЧИНА: МОЗГ РЕШИЛ, ЧТО ХВАТИТ',
    ]);
    for (const motif of DREAM_MOTIFS) expect(sourceLine(motif, MOTIF_SOURCES[motif])).not.toMatch(/undefined/);
  });

  it('declines counts', () => {
    const forms = ['падение', 'падения', 'падений'] as const;
    expect([1, 2, 4, 5, 11, 12, 21, 22, 25, 101, 111].map((n) => plural(n, forms))).toEqual([
      'падение',
      'падения',
      'падения',
      'падений',
      'падений',
      'падений',
      'падение',
      'падения',
      'падений',
      'падение',
      'падений',
    ]);
    expect(plain(eventText('vacuum', 1))).toBe('1 появление пылесоса');
  });

  it('formats numbers the Russian way', () => {
    expect(plain(temperatureText(39.04))).toBe('39,0 °C');
    expect(durationText(59.6)).toBe('01:00');
    expect(durationText(3725)).toBe('1:02:05');
  });

  it('names the strangest object', () => {
    expect(plain(strangeObjectText({ kind: 'jam_jar', flavor: 'blackcurrant' }))).toBe(
      'Банка варенья из чёрной смородины высотой 12 м',
    );
    expect(strangeObjectText({ kind: 'will_clause', clause: 'wifi_password' })).toBe('Лист завещания (пароль от Wi-Fi)');
    expect(strangeObjectText(null)).toBe('Не установлен');
  });
});

describe('links', () => {
  const location = { origin: 'https://example.test', pathname: '/dream/', search: '?seed=x&scene=jam&debug&sandbox=journal' };

  it('shares the dream by its seed only', () => {
    expect(shareUrl(seed, location)).toBe(`https://example.test/dream/?seed=${seed}`);
  });

  it('falls asleep again keeping only the debug overlay', () => {
    expect(nextDreamUrl(seed, location)).toBe(`https://example.test/dream/?seed=${seed}&debug=`);
    expect(nextDreamUrl(seed, { ...location, search: '?scene=jam' })).toBe(`https://example.test/dream/?seed=${seed}`);
  });

  it('names the PNG by number and seed', () => {
    expect(cardFileName(entry)).toBe(`son-1847-${seed}.png`);
  });

  it('draws a new seed unlike the last ones', () => {
    let byte = 0;
    const next = freshSeed([seed], () => Array.from({ length: 6 }, () => byte++ % 256));
    expect(next).not.toBe(seed);
    expect(next).toMatch(/^DREAM-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });
});
