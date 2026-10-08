/**
 * Dramaturgy of the dream film (D-023, spec §16): the film is cut into beats,
 * each a stretch with one job — drift, build up, wait, misdirect, let go,
 * scare, recover, peak. Beats come in waves:
 *
 *   opening → wave → wave → … → climax
 *
 *   false wave:  build → false_alarm → release
 *   scare wave:  build → anticipation → false_alarm → release → scare → recovery
 *
 * The scare wave is the §16 chain: trigger (build) → anticipation →
 * misdirection (false alarm) → relief (a short release, "через 3 секунды") →
 * the real scare → recovery; the waves between two scares are its cooldown.
 * The tension baseline rises over the film, so every wave starts a bit higher
 * than the one before and the film ends on its peak.
 *
 * Times here are integer milliseconds: the beats add up to the film length
 * exactly, with no floating-point drift.
 */
import { weightedPick } from '../catalog';
import { clamp01, lerp, round } from '../math';
import type { DreamProfile } from '../profile';
import type { Rng } from '../rng';
import { DREAM_LENGTH_SECONDS, type DreamLength } from './film';

export const BEAT_ROLES = [
  'opening',
  'build',
  'anticipation',
  'false_alarm',
  'release',
  'scare',
  'recovery',
  'climax',
] as const;
export type BeatRole = (typeof BEAT_ROLES)[number];

export interface Beat {
  role: BeatRole;
  /** Start and duration, integer milliseconds from the film start. */
  start: number;
  duration: number;
  /** Tension at the start and the end of the beat, 0…1. */
  tensionFrom: number;
  tensionTo: number;
}

type Range = readonly [number, number];

/**
 * Nominal beat lengths, ms. `false_alarm`, `scare` and the release before a
 * scare (`release_short`) keep their drawn length; the other beats stretch or
 * shrink together so that the film hits its length exactly.
 */
export const BEAT_MS: Readonly<Record<DreamLength, Readonly<Record<BeatRole | 'release_short', Range>>>> = {
  short: {
    opening: [4000, 7000],
    build: [4000, 7000],
    anticipation: [3000, 5000],
    false_alarm: [400, 800],
    release: [2500, 4500],
    release_short: [1500, 3000],
    scare: [100, 300],
    recovery: [1500, 3000],
    climax: [4000, 7000],
  },
  long: {
    opening: [7000, 13000],
    build: [6000, 14000],
    anticipation: [4000, 8000],
    false_alarm: [500, 1000],
    release: [3500, 7500],
    release_short: [2000, 4000],
    scare: [100, 300],
    recovery: [3000, 6000],
    climax: [9000, 16000],
  },
};

/** Scares per film (vision: "не больше одного-двух за сон"; issue #37). */
export const SCARE_COUNT: Readonly<Record<DreamLength, { min: number; max: number }>> = {
  short: { min: 0, max: 1 },
  long: { min: 1, max: 2 },
};

/** Length of the film, ms. Short is exact; long follows the profile's `dreamLength`. */
export function filmLengthMs(length: DreamLength, profile: DreamProfile): number {
  const { min, max } = DREAM_LENGTH_SECONDS[length];
  if (min === max) return min * 1000;
  // `dreamLength` is uniform over 2.5–3.5 minutes: map it onto the range, in tenths of a second.
  const t = clamp01(profile.dreamLength - 2.5);
  return Math.round(lerp(min, max, t) * 10) * 100;
}

/**
 * How many scares the film gets. Without scare frames in the library there
 * are none: a scare is never faked with an ordinary frame.
 */
export function scareCount(length: DreamLength, profile: DreamProfile, hasScares: boolean, rng: Rng): number {
  const roll = rng.next();
  if (!hasScares) return 0;
  const { min, max } = SCARE_COUNT[length];
  return roll < lerp(0.3, 0.9, profile.jumpscareIntensity) ? max : min;
}

type Wave = 'false' | 'scare';

interface Draft {
  role: BeatRole;
  ms: number;
  elastic: boolean;
}

const WAVE_ROLES: Readonly<Record<Wave, readonly (BeatRole | 'release_short')[]>> = {
  false: ['build', 'false_alarm', 'release'],
  scare: ['build', 'anticipation', 'false_alarm', 'release_short', 'scare', 'recovery'],
};

const FIXED: readonly (BeatRole | 'release_short')[] = ['false_alarm', 'scare', 'release_short'];

const mean = ([a, b]: Range): number => (a + b) / 2;

function meanWave(length: DreamLength, wave: Wave): number {
  return WAVE_ROLES[wave].reduce((sum, role) => sum + mean(BEAT_MS[length][role]), 0);
}

/**
 * Order of the waves: `falses` false waves with `scares` scare waves between
 * them, never two scare waves in a row (the cooldown). Scares lean towards
 * the end, where the tension is highest.
 */
function arrangeWaves(falses: number, scares: number, rng: Rng): Wave[] {
  const gaps = Array.from({ length: falses + 1 }, (_, i) => i);
  const chosen: number[] = [];
  for (let i = 0; i < scares && gaps.length > 0; i++) {
    const gap = weightedPick(gaps, (g) => 1 + g, rng);
    chosen.push(gap);
    gaps.splice(gaps.indexOf(gap), 1);
  }
  const waves: Wave[] = [];
  for (let gap = 0; gap <= falses; gap++) {
    if (chosen.includes(gap)) waves.push('scare');
    if (gap < falses) waves.push('false');
  }
  return waves;
}

/** Tension a beat starts and ends with, before the profile's anxiety. */
function roleTension(role: BeatRole, base: number, baseEnd: number): [number, number] {
  switch (role) {
    case 'opening':
      return [base, baseEnd + 0.05];
    case 'build':
      return [base + 0.05, baseEnd + 0.35];
    case 'anticipation':
      return [base + 0.35, baseEnd + 0.5];
    case 'false_alarm':
      return [0.8 + base * 0.2, 0.8 + base * 0.2];
    case 'release':
      return [Math.max(0.05, base - 0.05), Math.max(0.05, baseEnd - 0.1)];
    case 'scare':
      return [1, 1];
    case 'recovery':
      return [base + 0.2, baseEnd];
    case 'climax':
      return [base + 0.3, 1];
  }
}

/**
 * Plans the beats of a film of `totalMs` milliseconds with `scares` scares.
 * The beats tile the film without gaps.
 */
export function planBeats(
  length: DreamLength,
  totalMs: number,
  scares: number,
  profile: DreamProfile,
  rng: Rng,
): Beat[] {
  const ranges = BEAT_MS[length];
  const fixedMean = mean(ranges.opening) + mean(ranges.climax) + scares * meanWave(length, 'scare');
  const minFalses = scares === 1 ? 0 : 1;
  const falses = Math.max(minFalses, Math.round((totalMs - fixedMean) / meanWave(length, 'false')));
  const waves = arrangeWaves(falses, scares, rng);

  const drafts: Draft[] = [];
  const add = (role: BeatRole | 'release_short'): void => {
    const [min, max] = ranges[role];
    drafts.push({
      role: role === 'release_short' ? 'release' : role,
      ms: Math.round(rng.range(min, max)),
      elastic: !FIXED.includes(role),
    });
  };
  add('opening');
  for (const wave of waves) WAVE_ROLES[wave].forEach(add);
  add('climax');

  // Stretch the elastic beats so that everything adds up to `totalMs`; the
  // climax absorbs the rounding.
  const fixedMs = drafts.reduce((sum, d) => sum + (d.elastic ? 0 : d.ms), 0);
  const elasticMs = drafts.reduce((sum, d) => sum + (d.elastic ? d.ms : 0), 0);
  const scale = (totalMs - fixedMs) / elasticMs;
  for (const draft of drafts) if (draft.elastic) draft.ms = Math.round(draft.ms * scale);
  const climax = drafts[drafts.length - 1] as Draft;
  climax.ms += totalMs - drafts.reduce((sum, d) => sum + d.ms, 0);

  const anxiety = lerp(0.8, 1.15, profile.anxiety);
  const baseAt = (ms: number): number => lerp(0.1, 0.45, ms / totalMs);
  const beats: Beat[] = [];
  let start = 0;
  for (const { role, ms } of drafts) {
    const [from, to] = roleTension(role, baseAt(start), baseAt(start + ms));
    const scaled = (t: number): number => (role === 'scare' ? 1 : round(clamp01(t * anxiety), 3));
    beats.push({ role, start, duration: ms, tensionFrom: scaled(from), tensionTo: scaled(to) });
    start += ms;
  }
  return beats;
}

/** Tension at moment `ms` inside `beat`. */
export function tensionAt(beat: Beat, ms: number): number {
  const t = beat.duration > 0 ? clamp01((ms - beat.start) / beat.duration) : 0;
  return lerp(beat.tensionFrom, beat.tensionTo, t);
}
