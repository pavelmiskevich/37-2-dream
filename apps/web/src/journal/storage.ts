import { parseSeed, type DreamSeed, type DreamSummary } from '@dream/core';

/**
 * Local dream journal (spec §34, D-021): the dreams played on this device,
 * kept in `localStorage`. It stores only what the journal needs — the number,
 * the seed, the summary and the date — and is used for two things: numbering
 * the dreams and steering the choice of the next seed away from the last
 * ones (D-004). The dream itself never reads it.
 *
 * Storage is optional. Every access is wrapped: in a private window, with
 * storage disabled or full, the game goes on, the journal simply forgets and
 * every dream is "СОН №1".
 */

/** What a journal keeps about a dream: the game's summary or the film's (D-027); the seed names the dream. */
export interface SeededSummary {
  seed: DreamSeed;
}

export interface JournalEntry<S extends SeededSummary = DreamSummary> {
  /** "СОН №…": 1 for the first dream on this device. */
  number: number;
  seed: DreamSeed;
  /** When the dream ended, ISO 8601 (the app's clock; the core has none). */
  date: string;
  summary: S;
}

export interface DreamJournal<S extends SeededSummary = DreamSummary> {
  /**
   * Recorded dreams, oldest first. Empty without storage. Entries written by
   * an older build may carry a summary of another shape: only `number`, `seed`
   * and `date` are checked on reading.
   */
  entries(): JournalEntry<S>[];
  /** Number the next dream gets: one more than the last recorded, or 1. */
  nextNumber(): number;
  /** Seeds of the last `count` dreams, oldest first. */
  recentSeeds(count: number): DreamSeed[];
  /** Records a dream and returns its entry, numbered, even if it could not be saved. */
  record(summary: S, date: Date): JournalEntry<S>;
}

export const JOURNAL_STORAGE_KEY = '37.2-dream/journal/v1';

/** Entries kept; older ones are dropped. Numbering goes on from the last one. */
export const JOURNAL_LIMIT = 100;

/** `window.localStorage`, or null where even touching it throws (e.g. blocked cookies). */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isEntry<S extends SeededSummary>(value: unknown): value is JournalEntry<S> {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<Record<keyof JournalEntry<S>, unknown>>;
  return (
    typeof entry.number === 'number' &&
    Number.isInteger(entry.number) &&
    entry.number > 0 &&
    typeof entry.seed === 'string' &&
    parseSeed(entry.seed) === entry.seed &&
    typeof entry.date === 'string' &&
    typeof entry.summary === 'object' &&
    entry.summary !== null
  );
}

export interface DreamJournalOptions {
  key?: string;
  limit?: number;
}

export function createDreamJournal<S extends SeededSummary = DreamSummary>(
  storage: () => Storage | null = browserStorage,
  { key = JOURNAL_STORAGE_KEY, limit = JOURNAL_LIMIT }: DreamJournalOptions = {},
): DreamJournal<S> {
  const read = (): JournalEntry<S>[] => {
    try {
      const raw = storage()?.getItem(key);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((value): value is JournalEntry<S> => isEntry<S>(value)) : [];
    } catch {
      return [];
    }
  };

  const write = (entries: readonly JournalEntry<S>[]): void => {
    try {
      storage()?.setItem(key, JSON.stringify(entries));
    } catch {
      // Full, disabled or gone: the dream is not remembered, the game goes on.
    }
  };

  const nextNumber = (entries: readonly JournalEntry<S>[]): number =>
    entries.reduce((max, entry) => Math.max(max, entry.number), 0) + 1;

  return {
    entries: read,
    nextNumber: () => nextNumber(read()),
    recentSeeds: (count) => (count > 0 ? read().slice(-count).map((entry) => entry.seed) : []),
    record(summary, date) {
      const entries = read();
      const entry: JournalEntry<S> = { number: nextNumber(entries), seed: summary.seed, date: date.toISOString(), summary };
      write([...entries, entry].slice(-limit));
      return entry;
    },
  };
}
