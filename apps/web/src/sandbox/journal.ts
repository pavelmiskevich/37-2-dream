import {
  AWAKENING_REASONS,
  TEMPERATURE_MODEL,
  TICK_DT,
  TICK_RATE,
  createInitialState,
  findScene,
  generateDream,
  intrusionCues,
  isDreamingScene,
  isSceneId,
  summarizeDream,
  type AwakeningReason,
  type Dream,
  type DreamScene,
  type Intrusion,
  type SceneId,
  type SimState,
} from '@dream/core';
import { createDreamJournal, showJournalCard, type JournalEntry } from '../journal';
import { seedFromQuery } from '../loop';

/**
 * `?sandbox=journal` — the dream journal card for a dream nobody played:
 * the dream of `&seed=` with a made-up final state, to check the card
 * without sleeping through the dream. Nothing is recorded in the journal.
 *
 * - `&seed=DREAM-…` — the dream; without it a random one.
 * - `&wake=tea_brought|unknown|malingerer|overheated` — reason of the
 *   awakening (default: the one the dream plans).
 * - `&at=yard|fall|jam` — where the temperature cut the dream short
 *   (`malingerer`, `overheated`; default the yard and the fall).
 * - `&n=1847` — the dream number (default: the next one of this journal).
 *
 * The made-up run goes through every scene up to the awakening (or, woken
 * early, halfway through the `at` scene) and hears what those scenes
 * schedule (`intrusionCues`, D-020) — what a real run with that ending
 * would have recorded.
 */

/** Thermometer just past the threshold that woke him up. */
const EARLY_TEMPERATURE: Readonly<Partial<Record<AwakeningReason, number>>> = {
  malingerer: TEMPERATURE_MODEL.wakeBelow - 0.04,
  overheated: TEMPERATURE_MODEL.wakeAbove + 0.04,
};

const DEFAULT_EARLY_SCENE: Readonly<Partial<Record<AwakeningReason, SceneId>>> = {
  malingerer: 'yard',
  overheated: 'fall',
};

/** Intrusions a run records in `scene` over its first `ticks` ticks. */
function heardIn(scene: DreamScene, ticks: number, startTick: number): Intrusion[] {
  return intrusionCues(scene, TICK_DT)
    .filter((cue) => cue.at < ticks)
    .map((cue) => ({ motif: cue.motif, sceneIndex: scene.index, tick: startTick + cue.at }));
}

/** Final state of a run of `dream` that ended with `wake`. */
function madeUpEnding(dream: Dream, wake: AwakeningReason, atParam: string): SimState {
  const awakening = findScene(dream, 'awakening');
  if (!awakening) throw new Error('The dream has no awakening.');
  const early = EARLY_TEMPERATURE[wake];
  const atId = isSceneId(atParam) && isDreamingScene(atParam) ? atParam : DEFAULT_EARLY_SCENE[wake];
  const last = early !== undefined && atId ? (findScene(dream, atId)?.index ?? awakening.index - 1) : awakening.index - 1;

  let tick = 0;
  const intrusions: Intrusion[] = [];
  for (const scene of dream.scenes.slice(0, last + 1)) {
    // Woken early: halfway through the last scene.
    const ticks = Math.round(scene.duration * TICK_RATE * (early !== undefined && scene.index === last ? 0.5 : 1));
    intrusions.push(...heardIn(scene, ticks, tick));
    tick += ticks;
  }
  // The awakening itself (19 s, D-020) adds nothing to hear.
  tick += 19 * TICK_RATE;

  return {
    ...createInitialState(dream),
    tick,
    sceneIndex: awakening.index,
    finished: true,
    temperature: early ?? awakening.params.temperature,
    wakeReason: wake,
    intrusions,
  };
}

export function startJournalSandbox(): void {
  const params = new URLSearchParams(window.location.search);
  const seed = seedFromQuery(window.location.search);
  const dream = generateDream(seed);
  document.documentElement.dataset.seed = seed;

  const wakeParam = params.get('wake') ?? '';
  const planned = findScene(dream, 'awakening')?.params.reason ?? 'tea_brought';
  const wake = AWAKENING_REASONS.find((reason) => reason === wakeParam) ?? planned;
  const state = madeUpEnding(dream, wake, params.get('at') ?? '');

  const journal = createDreamJournal();
  const number = Math.max(1, Math.floor(Number(params.get('n'))) || journal.nextNumber());
  const entry: JournalEntry = { number, seed, date: new Date().toISOString(), summary: summarizeDream(dream, { state }) };
  showJournalCard(entry, journal);
}
