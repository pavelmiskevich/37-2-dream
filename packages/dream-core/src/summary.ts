/**
 * Summary of a played dream for the dream journal (spec §34, vision "Реальность
 * → сон", D-021): what the card after the awakening states — temperatures,
 * duration, locations, events, the strangest object, the sounds heard with
 * their real sources and the reason of the awakening.
 *
 * It is derived data: a pure function of the dream and the end of a run. Ids
 * and numbers only, the app owns the words. Nothing here feeds back into the
 * generation or the simulation, so summarising never changes a dream or a
 * replay (no `ENGINE_VERSION` bump). The dream number and the date belong to
 * the app's journal, not to the core.
 */
import type { Dream } from './dream';
import { heardMotifs, type HeardMotif } from './intrusions';
import { round } from './math';
import { createSeededRng } from './rng';
import type { AwakeningReason, DreamScene, JamFlavor, NightstandItem, SceneId, WillClause } from './scenes';
import type { DreamSeed } from './seed';
import { TICK_RATE, type SimState } from './simulation';
import { streamKey } from './streams';
import { isDreamingScene, thermometerReading } from './temperature';

/** Reasons with which the temperature cuts the dream short (D-014). */
const EARLY_REASONS: readonly AwakeningReason[] = ['malingerer', 'overheated'];

/** The end of a run: everything the summary is derived from besides the dream. */
export interface DreamRun {
  /** Final simulation state (`DreamEnding.state`, D-020). */
  state: Pick<SimState, 'seed' | 'tick' | 'sceneIndex' | 'temperature' | 'finished' | 'wakeReason' | 'intrusions'>;
  /** Scene the run started in (`?scene=`, D-013). Default 0. */
  startScene?: number;
}

/** Things the card counts under "События", in dream order. */
export type DreamEventId = 'thermometer' | 'vacuum' | 'fall' | 'will_page' | 'jam_jar';

export interface DreamEventCount {
  id: DreamEventId;
  count: number;
}

/** Candidates for "Самый странный объект": things the hero actually came across. */
export type StrangeObject =
  | { kind: 'nightstand'; item: NightstandItem }
  | { kind: 'swing' }
  | { kind: 'will_clause'; clause: WillClause }
  | { kind: 'jam_jar'; flavor: JamFlavor };

export interface DreamSummary {
  seed: DreamSeed;
  engineVersion: number;
  temperature: {
    /** When he fell asleep, °C (the premise: 37,2). */
    asleep: number;
    /**
     * On waking up, °C, to a tenth as a thermometer shows it: 36,9 when the
     * dream ran its course (the fever broke), the temperature that woke him
     * when it cut the dream short (D-020).
     */
    awake: number;
  };
  /** Length of the run, seconds. */
  duration: number;
  /** Dream locations he went through, in order (the flat itself is not one). */
  locations: SceneId[];
  /** Non-zero counts only, in dream order. */
  events: DreamEventCount[];
  /** Null only when he went through no scene with anything in it. */
  strangestObject: StrangeObject | null;
  /**
   * Why he woke up. A state that never got a reason (made up by hand, or
   * the dream not over yet) is "ПРИЧИНА: НЕИЗВЕСТНО" (spec §35).
   */
  wakeReason: AwakeningReason;
  /** Intrusions of reality heard in the run, in order of first appearance (`heardMotifs`). */
  heard: HeardMotif[];
}

/** Key of the stream the strangest object is drawn from; no other consumer reads it. */
export function strangestObjectSeed(seed: DreamSeed): string {
  return streamKey(seed, 'journal', 'strangest');
}

/** The reason of the awakening as the card states it. */
export function summaryWakeReason(state: Pick<SimState, 'wakeReason'>): AwakeningReason {
  return state.wakeReason ?? 'unknown';
}

/**
 * Indices of the scenes the run went through, in order. The chain is linear:
 * from the start scene on until the dream either ran its course into the
 * awakening, or the temperature cut it short and jumped there. In the latter
 * case the final state no longer says where he was, but its intrusions do:
 * every dreaming scene records the vacuum on its first tick (D-020).
 */
export function visitedScenes(dream: Dream, run: DreamRun): number[] {
  const start = run.startScene ?? 0;
  const { state } = run;
  const awakening = dream.scenes.findIndex((scene) => scene.id === 'awakening');
  const woke = state.wakeReason !== undefined || state.finished;
  const atAwakening = awakening >= 0 && state.sceneIndex === awakening;

  if (!woke || !atAwakening || start >= awakening) return range(start, state.sceneIndex);

  const reason = summaryWakeReason(state);
  let last = awakening - 1;
  if (EARLY_REASONS.includes(reason)) {
    last = start;
    for (const { sceneIndex } of state.intrusions) if (sceneIndex < awakening) last = Math.max(last, sceneIndex);
  }
  return [...range(start, last), awakening];
}

function range(from: number, to: number): number[] {
  const indices: number[] = [];
  for (let index = from; index <= to; index++) indices.push(index);
  return indices;
}

function eventsOf(scenes: readonly DreamScene[]): DreamEventCount[] {
  const counts = new Map<DreamEventId, number>();
  const add = (id: DreamEventId, count: number) => counts.set(id, (counts.get(id) ?? 0) + count);
  for (const scene of scenes) {
    switch (scene.id) {
      case 'apartment':
        add('thermometer', 1);
        break;
      case 'yard':
        add('vacuum', scene.params.vacuumPasses);
        break;
      case 'fall':
        add('fall', 1);
        add('will_page', scene.params.willPages.length);
        break;
      case 'jam':
        add('jam_jar', 1);
        break;
      case 'awakening':
        break;
    }
  }
  return [...counts].filter(([, count]) => count > 0).map(([id, count]) => ({ id, count }));
}

function strangeObjectsOf(scenes: readonly DreamScene[]): StrangeObject[] {
  const objects: StrangeObject[] = [];
  for (const scene of scenes) {
    switch (scene.id) {
      case 'apartment':
        for (const item of scene.params.nightstand) objects.push({ kind: 'nightstand', item });
        break;
      case 'yard':
        objects.push({ kind: 'swing' });
        break;
      case 'fall':
        for (const clause of scene.params.willPages) objects.push({ kind: 'will_clause', clause });
        break;
      case 'jam':
        objects.push({ kind: 'jam_jar', flavor: scene.params.flavor });
        break;
      case 'awakening':
        break;
    }
  }
  return objects;
}

/** Summary of the run `run` of `dream`. Pure: the same input gives a deeply equal result. */
export function summarizeDream(dream: Dream, run: DreamRun): DreamSummary {
  if (run.state.seed !== dream.seed) throw new RangeError(`Run of ${run.state.seed} summarised with dream ${dream.seed}.`);
  const scenes = visitedScenes(dream, run).flatMap((index) => dream.scenes[index] ?? []);
  const candidates = strangeObjectsOf(scenes);
  const pick = createSeededRng(strangestObjectSeed(dream.seed));

  return {
    seed: dream.seed,
    engineVersion: dream.engineVersion,
    temperature: { asleep: dream.profile.temperature, awake: thermometerReading(run.state.temperature) },
    duration: round(run.state.tick / TICK_RATE, 1),
    locations: scenes.filter((scene) => isDreamingScene(scene.id)).map((scene) => scene.id),
    events: eventsOf(scenes),
    strangestObject: candidates.length > 0 ? (candidates[pick.int(0, candidates.length - 1)] ?? null) : null,
    wakeReason: summaryWakeReason(run.state),
    heard: heardMotifs(run.state.intrusions),
  };
}
