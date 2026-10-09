import { normalizeSeed } from '@dream/core';
import { describe, expect, it } from 'vitest';
import { JOURNAL_STORAGE_KEY, browserStorage, createDreamJournal, type SeededSummary } from './storage';

/** A Map-backed `Storage`. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

/** A `Storage` whose every method throws, like a blocked or full one. */
function brokenStorage(): Storage {
  const fail = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  return {
    get length() {
      return fail();
    },
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  };
}

const seeds = ['DREAM-8F72-A19C-37B2', 'DREAM-0000-0000-0000', 'DREAM-C0DE-BEEF-0451'].map(normalizeSeed);
const summaryOf = (index: number): SeededSummary => ({ seed: seeds[index % seeds.length]! });
const date = new Date('2026-10-02T21:00:00Z');

describe('createDreamJournal', () => {
  it('numbers the dreams from 1 and keeps their seeds, summaries and dates', () => {
    const storage = memoryStorage();
    const journal = createDreamJournal(() => storage);
    expect(journal.nextNumber()).toBe(1);
    const first = journal.record(summaryOf(0), date);
    const second = journal.record(summaryOf(1), date);
    expect(first).toMatchObject({ number: 1, seed: seeds[0], date: '2026-10-02T21:00:00.000Z' });
    expect(second.number).toBe(2);
    expect(journal.nextNumber()).toBe(3);
    // A new page (a new journal object) reads the same.
    const again = createDreamJournal(() => storage);
    expect(again.entries()).toEqual([first, second]);
    expect(again.recentSeeds(5)).toEqual([seeds[0], seeds[1]]);
    expect(again.recentSeeds(1)).toEqual([seeds[1]]);
    expect(again.recentSeeds(0)).toEqual([]);
  });

  it('keeps only the last entries but goes on numbering', () => {
    const storage = memoryStorage();
    const journal = createDreamJournal(() => storage, { limit: 3 });
    for (let i = 0; i < 5; i++) journal.record(summaryOf(i), date);
    expect(journal.entries().map((entry) => entry.number)).toEqual([3, 4, 5]);
    expect(journal.nextNumber()).toBe(6);
  });

  it('works without storage: every dream is number 1', () => {
    const journal = createDreamJournal(() => null);
    expect(journal.record(summaryOf(0), date).number).toBe(1);
    expect(journal.record(summaryOf(1), date).number).toBe(1);
    expect(journal.entries()).toEqual([]);
    expect(journal.recentSeeds(5)).toEqual([]);
  });

  it('survives a storage that throws on every call', () => {
    const journal = createDreamJournal(brokenStorage);
    expect(() => journal.record(summaryOf(0), date)).not.toThrow();
    expect(journal.record(summaryOf(0), date).number).toBe(1);
    expect(journal.nextNumber()).toBe(1);
    expect(journal.entries()).toEqual([]);
  });

  it('survives a storage getter that throws', () => {
    const journal = createDreamJournal(() => {
      throw new DOMException('Access is denied', 'SecurityError');
    });
    expect(journal.record(summaryOf(0), date).number).toBe(1);
  });

  it('goes on when the storage is full', () => {
    const storage = memoryStorage();
    const journal = createDreamJournal(() => storage);
    journal.record(summaryOf(0), date);
    storage.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
    expect(journal.record(summaryOf(1), date).number).toBe(2);
    expect(journal.entries()).toHaveLength(1);
  });

  it('ignores garbage in the storage', () => {
    const storage = memoryStorage();
    const journal = createDreamJournal(() => storage);
    storage.setItem(JOURNAL_STORAGE_KEY, '{not json');
    expect(journal.nextNumber()).toBe(1);
    storage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify({ number: 7 }));
    expect(journal.nextNumber()).toBe(1);
    storage.setItem(
      JOURNAL_STORAGE_KEY,
      JSON.stringify([
        { number: 4, seed: 'not a seed', date: '', summary: {} },
        { number: -1, seed: seeds[0], date: '', summary: {} },
        { number: 9, seed: seeds[1], date: '2026-10-01T00:00:00.000Z', summary: {} },
        null,
      ]),
    );
    expect(journal.entries().map((entry) => entry.number)).toEqual([9]);
    expect(journal.record(summaryOf(0), date).number).toBe(10);
  });
});

describe('entries of the v1.2 game', () => {
  // What the game build wrote under the same key: a summary of another shape.
  const gameEntry = {
    number: 7,
    seed: seeds[0],
    date: '2026-10-05T20:15:00.000Z',
    summary: {
      seed: seeds[0],
      engineVersion: 8,
      temperature: { asleep: 37.2, awake: 36.9 },
      duration: 192.4,
      locations: ['yard', 'fall', 'jam'],
      events: [{ id: 'thermometer', count: 1 }],
      strangestObject: { kind: 'will_clause', clause: 'cat' },
      wakeReason: 'tea_brought',
      heard: [{ motif: 'vacuum', source: 'cleaning', count: 3, firstSceneIndex: 1 }],
    },
  };

  it('are read, and the numbering goes on from them', () => {
    const storage = memoryStorage();
    storage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify([gameEntry]));
    const journal = createDreamJournal(() => storage);
    expect(journal.entries()).toEqual([gameEntry]);
    expect(journal.recentSeeds(5)).toEqual([seeds[0]]);
    const next = journal.record(summaryOf(1), date);
    expect(next.number).toBe(8);
    expect(journal.entries().map((entry) => entry.number)).toEqual([7, 8]);
  });
});

describe('browserStorage', () => {
  it('is null where there is no window', () => {
    expect(browserStorage()).toBeNull();
  });
});
