/**
 * Sound of the dream film (D-023): cues for the audio engine and the record
 * of reality intrusions (D-020). Sound leads the edit — a bed starts a moment
 * before the shot that shows its source, and a beat's mix changes a moment
 * before the cut — and drives the dread: the monitor speeds up with tension,
 * the vacuum turns into a turbine over the dream, everything falls silent
 * before a scare and the stinger hits on it.
 *
 * Parameters (all 0…1) the player maps to the engine (apps/web/src/audio):
 *
 *   hum          start/set  volume, muffle (muffle of the whole mix)
 *   monitor      start/set  volume, tempo  (0 calm "пип… пип…", 1 "ПИППИППИП")
 *                hit        volume         (one lone "пип.")
 *   ventilator   start/set  volume, rate   (0 slow, 1 fast breathing)
 *   vacuum       start/set  volume, turbine (0 vacuum, 1 turbine)
 *   breath       start      volume, rate   (quickened waiting; stopped = held)
 *   kitchen      start      volume         (reality: the tea is coming)
 *   swing_creak  hit        strength, pitch (0.5 = nominal pitch)
 *   stinger      hit        volume         (only on a scare)
 *   silence      start      depth          (how deep everything else ducks)
 *                stop                      (the mix comes back)
 *
 * `stop` cues at the end of the film end every bed it started except the
 * kitchen, which belongs to the waking flat.
 */
import { lerp, round } from '../math';
import type { DreamProfile } from '../profile';
import type { Rng } from '../rng';
import type { AwakeningReason, DreamMotif } from '../scenes';
import { tensionAt, type Beat } from './beats';
import type { FilmIntrusion, FilmSound, SoundCue } from './film';
import type { LibraryAsset, LocationTag, MotifTag } from './library';

/** A shot as the sound planner sees it: integer ms and its asset. */
export interface TimedShot {
  start: number;
  duration: number;
  asset: LibraryAsset;
  scare: boolean;
}

/** Beds: continuous sounds that may run through the film, and what shows their source. */
const BEDS = ['monitor', 'ventilator', 'vacuum'] as const satisfies readonly (FilmSound & DreamMotif)[];
type Bed = (typeof BEDS)[number];

const BED_SOURCES: Readonly<Record<Bed, { motifs: readonly MotifTag[]; locations: readonly LocationTag[] }>> = {
  monitor: { motifs: ['monitor'], locations: ['hospital_corridor'] },
  ventilator: { motifs: ['ventilator'], locations: [] },
  vacuum: { motifs: ['vacuum_woman'], locations: [] },
};

/** Chance a bed sounds although no shot shows its source, by profile. */
function bedChance(bed: Bed, profile: DreamProfile): number {
  switch (bed) {
    case 'monitor':
      return lerp(0.15, 0.9, profile.medicalIntensity);
    case 'ventilator':
      return lerp(0.1, 0.8, profile.medicalIntensity);
    case 'vacuum':
      return lerp(0.3, 0.95, profile.domesticIntensity);
  }
}

const shows = (shot: TimedShot, bed: Bed): boolean =>
  BED_SOURCES[bed].motifs.some((motif) => shot.asset.tags.motifs.includes(motif)) ||
  BED_SOURCES[bed].locations.includes(shot.asset.tags.location);

/** A long beat updates the mix about this often, ms. */
const MIX_STEP_MS = 4000;

export interface FilmSoundPlan {
  sounds: SoundCue[];
  intrusions: FilmIntrusion[];
}

/**
 * Plans the sound of a film. `totalMs` is the film length; `reason` is how
 * the dream ends (the kitchen comes in before the tea).
 */
export function planSound(
  beats: readonly Beat[],
  shots: readonly TimedShot[],
  totalMs: number,
  profile: DreamProfile,
  reason: AwakeningReason,
  rng: Rng,
): FilmSoundPlan {
  const cues: { at: number; order: number; cue: Omit<SoundCue, 'at'> }[] = [];
  const intrusions: { at: number; order: number; motif: DreamMotif }[] = [];
  let order = 0;
  const at = (ms: number): number => Math.min(totalMs, Math.max(0, Math.round(ms)));
  const cue = (ms: number, sound: FilmSound, action: SoundCue['action'], params?: Record<string, number>): void => {
    const rounded = params
      ? Object.fromEntries(Object.entries(params).map(([key, value]) => [key, round(value, 3)]))
      : undefined;
    cues.push({ at: at(ms), order: order++, cue: rounded ? { sound, action, params: rounded } : { sound, action } });
  };
  const heard = (ms: number, motif: DreamMotif): void => {
    intrusions.push({ at: at(ms), order: order++, motif });
  };
  const beatAt = (ms: number): Beat => beats.find((b) => ms < b.start + b.duration) ?? (beats[beats.length - 1] as Beat);
  const tension = (ms: number): number => tensionAt(beatAt(ms), ms);
  const calmBeats = beats.filter((b) => b.role !== 'scare' && b.role !== 'false_alarm');

  // The hum is always there: the dream's room tone.
  cue(0, 'hum', 'start', { volume: lerp(0.3, 0.5, rng.next()) });

  // Silences: a short hush before every misdirection, a deep one before every scare.
  const hushes = new Map<Beat, number>();
  for (const beat of beats) {
    if (beat.role === 'false_alarm') hushes.set(beat, Math.round(rng.range(300, 600)));
    if (beat.role === 'scare') hushes.set(beat, Math.round(rng.range(500, 1200)));
  }
  const silences = [...hushes].map(([beat, hush]) => ({ from: at(beat.start - hush), to: beat.start }));
  const silent = (ms: number): { from: number; to: number } | undefined =>
    silences.find((window) => ms >= window.from && ms < window.to);

  // Beds start a little before the first shot that shows their source, or on
  // a calm beat of the first half when the source is never shown; never in a
  // silence, which would swallow their first moment.
  const bedStart = new Map<Bed, number>();
  for (const bed of BEDS) {
    const lead = rng.range(300, 2000);
    const roll = rng.next();
    const beatRoll = rng.next();
    const shown = shots.find((shot) => !shot.scare && shows(shot, bed));
    let start: number | undefined;
    if (shown) start = shown.start - lead;
    else if (roll < bedChance(bed, profile)) {
      const early = calmBeats.filter((b) => b.start < totalMs * 0.6);
      const beat = early[Math.floor(beatRoll * early.length)];
      if (beat) start = beat.start - lead * 0.5;
    }
    if (start === undefined) continue;
    start = at(start);
    bedStart.set(bed, silent(start)?.to ?? start);
  }
  const vacuumPeak = lerp(0.8, 1, profile.domesticIntensity);
  const bedParams = (bed: Bed, ms: number): Record<string, number> => {
    const t = tension(ms);
    switch (bed) {
      case 'monitor':
        return { volume: lerp(0.35, 0.8, t), tempo: t };
      case 'ventilator':
        return { volume: lerp(0.3, 0.7, t), rate: lerp(0.2, 0.9, t) };
      case 'vacuum': {
        // D-020: the vacuum turns into a turbine over the dream, `peak · p^1.6`.
        const from = bedStart.get('vacuum') ?? 0;
        const p = Math.min(1, Math.max(0, (ms - from) / Math.max(1, totalMs - from)));
        return { volume: lerp(0.3, 0.9, p), turbine: vacuumPeak * p ** 1.6 };
      }
    }
  };
  for (const bed of BEDS) {
    const start = bedStart.get(bed);
    if (start === undefined) continue;
    cue(start, bed, 'start', bedParams(bed, start));
    heard(start, bed);
  }

  // The mix follows the tension: set a moment before every calm beat's cut,
  // then every few seconds along a long beat.
  for (const beat of calmBeats) {
    const lead = rng.range(0, 600);
    const muffle = beat.role === 'recovery' ? 0.6 : beat.role === 'release' ? 0.3 : 0;
    const steps = Math.max(1, Math.round(beat.duration / MIX_STEP_MS));
    for (let step = 0; step < steps; step++) {
      const moment = beat.start + (beat.duration * step) / steps;
      const ms = step === 0 ? at(beat.start - lead) : at(moment);
      if (ms === 0) continue;
      cue(ms, 'hum', 'set', { volume: lerp(0.25, 0.7, tensionAt(beat, moment)), muffle });
      for (const bed of BEDS) {
        const start = bedStart.get(bed);
        if (start !== undefined && start < ms) cue(ms, bed, 'set', bedParams(bed, moment));
      }
    }
  }

  // The swing creaks over every run of shots that shows it, starting before the cut.
  const swingRuns: { start: number; end: number }[] = [];
  for (const shot of shots) {
    if (shot.scare || !shot.asset.tags.motifs.includes('swing')) continue;
    const last = swingRuns[swingRuns.length - 1];
    if (last && last.end === shot.start) last.end = shot.start + shot.duration;
    else swingRuns.push({ start: shot.start, end: shot.start + shot.duration });
  }
  for (const run of swingRuns) {
    const pitch = rng.range(0.35, 0.65);
    let ms = at(run.start - rng.range(300, 1000));
    let first = true;
    while (ms < run.end) {
      if (!silent(ms)) {
        if (first) heard(ms, 'swing_creak');
        first = false;
        cue(ms, 'swing_creak', 'hit', { strength: lerp(0.4, 1, tension(ms)), pitch });
      }
      ms += rng.range(1100, 1800);
    }
  }

  // Waiting: the breath quickens, then is held as the mix drops into silence.
  for (const beat of beats) {
    const hush = hushes.get(beat) ?? 0;
    if (beat.role === 'anticipation') {
      cue(beat.start, 'breath', 'start', { volume: 0.4, rate: lerp(0.5, 0.9, beat.tensionTo) });
    }
    if (beat.role === 'false_alarm') {
      // Misdirection: a short hush, then something harmless and loud.
      const monitorOn = (bedStart.get('monitor') ?? Infinity) < beat.start;
      const creak = rng.next() < 0.5 || !monitorOn;
      cue(beat.start - hush, 'silence', 'start', { depth: 0.7 });
      cue(beat.start, 'silence', 'stop');
      if (creak) {
        cue(beat.start, 'swing_creak', 'hit', { strength: 1, pitch: rng.range(0.2, 0.4) });
        heard(beat.start, 'swing_creak');
      } else {
        cue(beat.start, 'monitor', 'hit', { volume: 1 });
      }
    }
    if (beat.role === 'scare') {
      cue(beat.start - hush, 'breath', 'stop');
      cue(beat.start - hush, 'silence', 'start', { depth: 1 });
      cue(beat.start, 'silence', 'stop');
      cue(beat.start, 'stinger', 'hit', { volume: 1 });
    }
  }

  // Reality before waking: the tea is being made in the kitchen.
  const kitchenLead = rng.range(1500, 4000);
  if (reason === 'tea_brought') cue(totalMs - kitchenLead, 'kitchen', 'start', { volume: 0.3 });

  for (const sound of ['hum', ...bedStart.keys()] as FilmSound[]) cue(totalMs, sound, 'stop');

  const byTime = <T extends { at: number; order: number }>(a: T, b: T): number => a.at - b.at || a.order - b.order;
  return {
    sounds: cues.sort(byTime).map(({ at: ms, cue: c }) => ({ at: ms / 1000, ...c })),
    intrusions: intrusions.sort(byTime).map(({ at: ms, motif }) => ({ motif, at: ms / 1000 })),
  };
}
