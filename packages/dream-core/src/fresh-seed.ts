/**
 * Choosing the seed of the next dream with the history in mind (D-004,
 * D-021). The history never reaches `generateDream`: it only filters the
 * candidates the app drew from its entropy, so a seed still names the same
 * dream on any device. The function is pure — the app supplies the
 * candidates and the seeds of the last dreams from its journal.
 *
 * Two dreams are compared by their profiles (spec §4): the hidden character
 * of a dream that biases everything in it. A candidate whose profile is too
 * close to one of the last dreams is dropped.
 */
import { generateProfile, PROFILE_INTENSITY_KEYS, DREAM_LENGTH_MINUTES, type DreamProfile } from './profile';
import type { DreamSeed } from './seed';
import { profileRng } from './streams';

/** How many of the last dreams a new seed must not resemble. */
export const RECENT_DREAMS = 5;

/**
 * Smallest `profileDistance` from every recent dream a candidate needs. Two
 * random profiles are about 0.4 apart on average; below 0.25 they lie in the
 * nearest ~4 % of each other.
 */
export const MIN_PROFILE_DISTANCE = 0.25;

/** Profile of the dream of `seed`, as `generateDream` draws it. */
export function profileOfSeed(seed: DreamSeed): DreamProfile {
  return generateProfile(profileRng(seed));
}

/**
 * Distance between two profiles, 0 (equal) .. 1 (opposite corners): the root
 * mean square of the differences of every intensity and of the dream length
 * (scaled to 0..1 over its range).
 */
export function profileDistance(a: DreamProfile, b: DreamProfile): number {
  const span = DREAM_LENGTH_MINUTES.max - DREAM_LENGTH_MINUTES.min;
  const diffs = PROFILE_INTENSITY_KEYS.map((key) => a[key] - b[key]);
  diffs.push((a.dreamLength - b.dreamLength) / span);
  return Math.sqrt(diffs.reduce((sum, d) => sum + d * d, 0) / diffs.length);
}

export interface FreshSeedOptions {
  /** How many of `recent` (from the end) to compare with. Default `RECENT_DREAMS`. */
  recentCount?: number;
  /** Default `MIN_PROFILE_DISTANCE`. */
  minDistance?: number;
}

/**
 * The first of `candidates` whose profile is at least `minDistance` from the
 * profile of each of the last `recentCount` seeds of `recent` (oldest first,
 * as the journal keeps them). If no candidate qualifies, the one farthest
 * from its nearest recent dream. Pure; throws on an empty candidate list.
 */
export function chooseFreshSeed(
  candidates: readonly DreamSeed[],
  recent: readonly DreamSeed[],
  { recentCount = RECENT_DREAMS, minDistance = MIN_PROFILE_DISTANCE }: FreshSeedOptions = {},
): DreamSeed {
  const first = candidates[0];
  if (first === undefined) throw new RangeError('chooseFreshSeed needs at least one candidate.');
  const last = recentCount > 0 ? recent.slice(-recentCount).map(profileOfSeed) : [];
  if (last.length === 0) return first;

  let best = first;
  let bestDistance = -1;
  for (const candidate of candidates) {
    const profile = profileOfSeed(candidate);
    const nearest = Math.min(...last.map((other) => profileDistance(profile, other)));
    if (nearest >= minDistance) return candidate;
    if (nearest > bestDistance) {
      best = candidate;
      bestDistance = nearest;
    }
  }
  return best;
}
