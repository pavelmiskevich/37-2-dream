import { parseSeed, type DreamLength, type DreamSeed } from '@dream/core';

/**
 * The address of a dream (D-027): `?seed=DREAM-8F72-A19C-37B2&length=short`.
 * Seed and length are everything a dream film depends on (D-022), so the
 * address always names the dream on screen and opening it plays the same one.
 */

export const DEFAULT_LENGTH: DreamLength = 'short';

export interface DreamQuery {
  /** Null without a valid `seed`: the page draws a fresh one. */
  seed: DreamSeed | null;
  /** Null without a valid `length`: the falling-asleep screen offers the default. */
  length: DreamLength | null;
  /** `noflash=1`: "без вспышек" is ticked whatever the device remembers (D-009). */
  noFlash: boolean;
}

const FLAG_ON: readonly string[] = ['1', 'true', 'yes'];

export function lengthFromParam(value: string | null): DreamLength | null {
  const length = value?.trim().toLowerCase();
  return length === 'short' || length === 'long' ? length : null;
}

export function parseDreamQuery(search: string): DreamQuery {
  const params = new URLSearchParams(search);
  return {
    seed: parseSeed(params.get('seed') ?? '') ?? null,
    length: lengthFromParam(params.get('length')),
    noFlash: FLAG_ON.includes(params.get('noflash')?.trim().toLowerCase() ?? ''),
  };
}

/** The query string with `seed` and `length` set to the dream on screen; other parameters are kept. */
export function queryWithDream(search: string, seed: DreamSeed, length: DreamLength): string {
  const params = new URLSearchParams(search);
  params.set('seed', seed);
  params.set('length', length);
  return `?${params.toString()}`;
}

/**
 * Link to a dream: this page with only `seed` and `length`. It plays the same
 * dream from the falling-asleep screen on any device.
 */
export function dreamUrl(seed: DreamSeed, length: DreamLength, location: Pick<Location, 'origin' | 'pathname'>): string {
  return `${location.origin}${location.pathname}?${new URLSearchParams({ seed, length }).toString()}`;
}
