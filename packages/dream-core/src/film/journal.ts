/**
 * Summary of a dream film for the dream journal (D-021, D-027): what the card
 * after the awakening states — temperatures, length, the locations the edit
 * went through, the strangest object, the sounds heard with their real
 * sources (D-020) and the reason of the awakening.
 *
 * Derived data: a pure function of the edit decision list and the library it
 * was cut from. Ids and numbers only, the app owns the words. Nothing here
 * feeds back into `generateFilm`, and the strangest object is drawn from its
 * own stream, so summarising never changes a film (no `ENGINE_VERSION` bump).
 * The dream number and the date belong to the app's journal, not to the core.
 */
import { MOTIF_SOURCES, type AwakeningReason, type DreamMotif, type MotifReveal } from '../scenes';
import type { DreamSeed } from '../seed';
import type { DreamFilm, DreamLength } from './film';
import type { LibraryAsset, LibraryManifest, LocationTag, MotifTag } from './library';
import { filmRng } from './streams';

/** Candidates for "Самый странный объект": things the film actually showed. */
export type FilmStrangeObject = { kind: 'motif'; motif: MotifTag } | { kind: 'location'; location: LocationTag };

/** Locations that are a thing rather than a place, so they can be the strangest object. */
export const OBJECT_LOCATIONS: readonly LocationTag[] = ['jam_jar', 'elevator'];

/** What the journal reveals about one motif heard in a film. */
export interface FilmHeardMotif extends MotifReveal {
  /** How many times it came in. */
  count: number;
  /** When it was first heard, seconds from the film start. */
  firstAt: number;
}

export interface FilmSummary {
  seed: DreamSeed;
  engineVersion: number;
  length: DreamLength;
  temperature: {
    /** When he fell asleep, °C (the premise: 37,2). */
    asleep: number;
    /** On waking up, °C. */
    awake: number;
  };
  /** Length of the film, seconds. */
  duration: number;
  /** Shots in the edit, scares included. */
  shots: number;
  scares: number;
  /** Locations shown, in order of first appearance. */
  locations: LocationTag[];
  /** Null only when the film showed nothing nameable. */
  strangestObject: FilmStrangeObject | null;
  wakeReason: AwakeningReason;
  /** Intrusions of reality heard in the film, in order of first appearance. */
  heard: FilmHeardMotif[];
}

/** Motifs heard in a film with their real sources, in order of first appearance. */
export function heardInFilm(film: Pick<DreamFilm, 'intrusions'>): FilmHeardMotif[] {
  const heard = new Map<DreamMotif, FilmHeardMotif>();
  for (const { motif, at } of film.intrusions) {
    const known = heard.get(motif);
    if (known) known.count += 1;
    else heard.set(motif, { motif, source: MOTIF_SOURCES[motif], count: 1, firstAt: at });
  }
  return [...heard.values()];
}

/**
 * Summary of `film`; `library` is the manifest it was cut from (shots whose
 * asset is not in it are skipped). Pure: the same input gives a deeply equal
 * result.
 */
export function summarizeFilm(film: DreamFilm, library: LibraryManifest): FilmSummary {
  const assets = new Map<string, LibraryAsset>(library.assets.map((asset) => [asset.id, asset]));
  const locations: LocationTag[] = [];
  const motifs: MotifTag[] = [];
  for (const shot of film.shots) {
    const tags = assets.get(shot.assetId)?.tags;
    if (!tags) continue;
    if (!locations.includes(tags.location)) locations.push(tags.location);
    for (const motif of tags.motifs) if (!motifs.includes(motif)) motifs.push(motif);
  }
  const candidates: FilmStrangeObject[] = [
    ...motifs.map((motif): FilmStrangeObject => ({ kind: 'motif', motif })),
    ...locations
      .filter((location) => OBJECT_LOCATIONS.includes(location))
      .map((location): FilmStrangeObject => ({ kind: 'location', location })),
  ];
  const pick = filmRng(film.seed, film.length, 'journal', 'strangest');

  return {
    seed: film.seed,
    engineVersion: film.engineVersion,
    length: film.length,
    temperature: { asleep: film.profile.temperature, awake: film.awakening.temperature },
    duration: film.duration,
    shots: film.shots.length,
    scares: film.shots.filter((shot) => shot.scare).length,
    locations,
    strangestObject: candidates.length > 0 ? (candidates[pick.int(0, candidates.length - 1)] ?? null) : null,
    wakeReason: film.awakening.reason,
    heard: heardInFilm(film),
  };
}
