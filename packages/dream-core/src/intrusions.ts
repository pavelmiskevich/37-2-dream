/**
 * Intrusions of reality into the dream (vision, "Реальность → сон"; D-002,
 * D-020). The registry itself — which motif stands for which everyday sound —
 * is `MOTIF_SOURCES` in scenes.ts. This module keeps the record of what
 * actually sounded in a run, for the dream journal (#13) to reveal.
 *
 * Every scene has a schedule of the motifs it plays (`intrusionCues`). The
 * simulation goes through the schedule as the scene's ticks pass and appends
 * every cue it reaches to `SimState.intrusions`. A scene the hero never
 * reached, or left before a cue, does not record it: an early awakening in
 * the yard reveals the vacuum and the swing, not the monitor of the fall.
 * The record is part of the state, so a replay gives the same record.
 *
 * The schedule is the contract between the core and the scene views: a view
 * that plays a motif somewhere else must update `SCENE_MOTIFS` too.
 */
import { apartmentTimeline } from './apartment';
import {
  MOTIF_SOURCES,
  type DreamMotif,
  type DreamScene,
  type MotifReveal,
  type SceneId,
} from './scenes';
import type { SimState } from './simulation';

/** One motif sounding once in a run. */
export interface Intrusion {
  motif: DreamMotif;
  /** Scene it sounded in. */
  sceneIndex: number;
  /** Dream tick it was recorded on. */
  tick: number;
}

/**
 * Motifs every scene plays from its first tick on. The apartment's ventilator
 * (his breathing turning into it as he falls asleep) comes later and is
 * scheduled separately; the awakening is reality, nothing intrudes there.
 *
 * - yard: the vacuum behind the dream (the app's vacuum layer) and the swing,
 *   which creaks as soon as it sways (even empty, it sways by itself);
 * - fall: the vacuum and the monitor beeping all the way down;
 * - jam: the vacuum and the ventilator breathing through the jam.
 */
export const SCENE_MOTIFS: Readonly<Record<SceneId, readonly DreamMotif[]>> = {
  apartment: [],
  yard: ['vacuum', 'swing_creak'],
  fall: ['vacuum', 'monitor'],
  jam: ['vacuum', 'ventilator'],
  awakening: [],
};

/** Scenes whose views play the scene's `echoes` (the jam, D-018). */
export const ECHOING_SCENES: readonly SceneId[] = ['jam'];

/** A motif scheduled in a scene. */
export interface IntrusionCue {
  motif: DreamMotif;
  /** Ticks since the scene began. */
  at: number;
}

const cueCache = new WeakMap<DreamScene, Map<number, IntrusionCue[]>>();

/** Schedule of the motifs scene `scene` plays, in time order. Pure. */
export function intrusionCues(scene: DreamScene, tickDt: number): readonly IntrusionCue[] {
  let byTick = cueCache.get(scene);
  const cached = byTick?.get(tickDt);
  if (cached) return cached;

  const cues: IntrusionCue[] = SCENE_MOTIFS[scene.id].map((motif) => ({ motif, at: 0 }));
  if (scene.id === 'apartment') cues.push({ motif: 'ventilator', at: apartmentTimeline(scene, tickDt).sleepAt });
  if (ECHOING_SCENES.includes(scene.id)) {
    for (const echo of scene.echoes) cues.push({ motif: echo.motif, at: Math.round((echo.at * scene.duration) / tickDt) });
  }
  // Stable: cues of the same tick keep the order above.
  cues.sort((a, b) => a.at - b.at);

  if (!byTick) cueCache.set(scene, (byTick = new Map()));
  byTick.set(tickDt, cues);
  return cues;
}

/**
 * Records the cues of `scene` due on scene tick `sceneTick` (the tick just
 * simulated) into `next`. Returns `next` itself when nothing was due.
 */
export function recordIntrusions(
  scene: DreamScene,
  sceneTick: number,
  next: SimState,
  tickDt: number,
): SimState {
  const due = intrusionCues(scene, tickDt).filter((cue) => cue.at === sceneTick);
  if (due.length === 0) return next;
  const recorded = due.map((cue): Intrusion => ({ motif: cue.motif, sceneIndex: scene.index, tick: next.tick }));
  return { ...next, intrusions: [...next.intrusions, ...recorded] };
}

/** What the journal reveals about one motif heard in a run. */
export interface HeardMotif extends MotifReveal {
  /** How many times it sounded. */
  count: number;
  /** Scene it first sounded in. */
  firstSceneIndex: number;
}

/**
 * Motifs heard in a run with their real sources, in order of first
 * appearance — what the dream journal reveals ("Источник звука ИВЛ: ваш
 * храп"). Pass `state.intrusions` of the final state.
 */
export function heardMotifs(intrusions: readonly Intrusion[]): HeardMotif[] {
  const heard = new Map<DreamMotif, HeardMotif>();
  for (const { motif, sceneIndex } of intrusions) {
    const known = heard.get(motif);
    if (known) known.count += 1;
    else heard.set(motif, { motif, source: MOTIF_SOURCES[motif], count: 1, firstSceneIndex: sceneIndex });
  }
  return [...heard.values()];
}
