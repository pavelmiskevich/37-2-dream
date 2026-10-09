/**
 * Edit decision list of the dream film (#37, D-023): seed + length + library
 * → `DreamFilm`. Pure: the same three inputs always give a deeply equal film,
 * and nothing outside them (history, clock, storage) reaches it (D-004, D-005).
 *
 *   profile        — the `generateProfile` draw of the seed (fresh-seed.ts reads the same)
 *   beats          — dramaturgy (beats.ts): opening, waves, climax
 *   shots          — every beat cut into shots by its rhythm
 *   cast           — an asset per shot (cast.ts)
 *   camera, look   — per shot (look.ts)
 *   cuts           — per shot, by rhythm; flashes kept apart (D-009)
 *   sound          — cues and intrusions (sound.ts)
 *   awakening      — the planned reason and temperature (D-020)
 *
 * Every step draws from its own stream (streams.ts), so changing how one
 * step draws does not reshuffle the others.
 */
import { lerp } from '../math';
import { generateProfile, type DreamProfile } from '../profile';
import type { Rng } from '../rng';
import { generateAwakeningParams } from '../scenes';
import type { DreamSeed } from '../seed';
import { profileRng } from '../streams';
import { ENGINE_VERSION } from '../version';
import { filmLengthMs, planBeats, scareCount, tensionAt, type Beat, type BeatRole } from './beats';
import { createCaster } from './cast';
import type { DreamFilm, DreamLength, GenerateFilm, Shot } from './film';
import type { LibraryManifest } from './library';
import { cameraFor, cutFor, lookFor, parallaxFor } from './look';
import { planSound, type TimedShot } from './sound';
import { filmRng, filmSharedRng } from './streams';

type Range = readonly [number, number];

/** Shot lengths by beat, ms, at the start and at the end of the beat (the rhythm accelerates). */
const SHOT_MS: Readonly<Record<BeatRole, { from: Range; to: Range } | 'whole'>> = {
  opening: { from: [3000, 6000], to: [2500, 5000] },
  build: { from: [2500, 4500], to: [1000, 2000] },
  anticipation: 'whole',
  false_alarm: 'whole',
  release: 'whole',
  scare: 'whole',
  recovery: { from: [1500, 3500], to: [1500, 3500] },
  climax: { from: [1500, 2500], to: [350, 800] },
};

/** Shots of a short film are cut faster. */
const LENGTH_PACE: Readonly<Record<DreamLength, number>> = { short: 0.75, long: 1 };

/** Shortest ordinary shot, ms; scares and false alarms are their whole beat. */
export const MIN_SHOT_MS = 300;

/** Waiting and letting go are held in one long shot unless the beat is longer than this. */
const LONGEST_HELD_MS = 7000;

/** Cuts a beat into shot lengths that add up to the beat exactly. */
function shotLengths(beat: Beat, length: DreamLength, profile: DreamProfile, rng: Rng): number[] {
  const rhythm = SHOT_MS[beat.role];
  if (rhythm === 'whole') {
    if (beat.duration <= LONGEST_HELD_MS || beat.role === 'scare' || beat.role === 'false_alarm') return [beat.duration];
    const first = Math.round(beat.duration * rng.range(0.4, 0.6));
    return [first, beat.duration - first];
  }
  // Anxious dreams cut faster, calm ones hold longer.
  const pace = LENGTH_PACE[length] * lerp(1.3, 0.75, profile.anxiety);
  const lengths: number[] = [];
  let used = 0;
  while (used < beat.duration) {
    const progress = used / beat.duration;
    const min = lerp(rhythm.from[0], rhythm.to[0], progress) * pace;
    const max = lerp(rhythm.from[1], rhythm.to[1], progress) * pace;
    let ms = Math.max(MIN_SHOT_MS, Math.round(rng.range(min, max)));
    const left = beat.duration - used - ms;
    if (left < MIN_SHOT_MS) ms = beat.duration - used;
    lengths.push(ms);
    used += ms;
  }
  return lengths;
}

export const generateFilm: GenerateFilm = (seed: DreamSeed, length: DreamLength, library: LibraryManifest): DreamFilm => {
  const profile = generateProfile(profileRng(seed));
  const totalMs = filmLengthMs(length, profile);

  const hasScares = library.assets.some((asset) => asset.tags.mood === 'scare');
  const beatRng = filmRng(seed, length, 'beats');
  const scares = scareCount(length, profile, hasScares, beatRng);
  const beats = planBeats(length, totalMs, scares, profile, beatRng);

  // Shots: lengths by beat rhythm, then an asset for each.
  const rhythmRng = filmRng(seed, length, 'rhythm');
  const caster = createCaster(library.assets, profile, filmRng(seed, length, 'cast'));
  const planned: (TimedShot & { beat: Beat })[] = [];
  for (const beat of beats) {
    let start = beat.start;
    for (const ms of shotLengths(beat, length, profile, rhythmRng)) {
      const asset = caster.pick({ shotIndex: planned.length, role: beat.role, ms });
      planned.push({ start, duration: ms, asset, scare: beat.role === 'scare', beat });
      start += ms;
    }
  }

  // Camera, look and cuts: each shot from its own stream.
  let lastFlash = -Infinity;
  const shots: Shot[] = planned.map((shot, index) => {
    const rng = filmRng(seed, length, 'shot', index);
    const { beat, asset, start, duration } = shot;
    const tension = tensionAt(beat, start + duration / 2);
    const next = planned[index + 1];
    const end = start + duration;
    const cut = cutFor(
      { role: beat.role, nextRole: next?.beat.role, ms: duration, nextMs: next?.duration ?? 0, end, lastFlash },
      length,
      rng,
    );
    if (cut.kind === 'flash' || shot.scare) lastFlash = shot.scare ? start : end;
    return {
      index,
      assetId: asset.id,
      start: start / 1000,
      duration: duration / 1000,
      camera: cameraFor(beat.role, tension, duration, rng),
      parallax: parallaxFor(beat.role, duration, asset.depth !== undefined, profile, rng),
      look: lookFor(beat.role, tension, profile, rng),
      cutOut: cut.kind,
      cutDuration: cut.ms / 1000,
      scare: shot.scare,
    };
  });

  // How the dream ends: the planned reason and temperature (D-020).
  const awakening = generateAwakeningParams([], filmSharedRng(seed, 'awakening'));
  const { sounds, intrusions } = planSound(beats, planned, totalMs, profile, awakening.reason, filmRng(seed, length, 'sound'));

  return {
    engineVersion: ENGINE_VERSION,
    seed,
    length,
    duration: totalMs / 1000,
    profile,
    shots,
    sounds,
    intrusions,
    awakening: { reason: awakening.reason, temperature: awakening.temperature },
  };
};
