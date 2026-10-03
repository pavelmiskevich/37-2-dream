/**
 * Seed → dream (spec §30, as changed by D-004): a pure function of the seed
 * and the engine version. No history, storage or clock is consulted.
 */
import { clamp01, round } from './math';
import { generateProfile, type DreamProfile } from './profile';
import { createSeededRng, type Rng } from './rng';
import type { DreamSeed } from './seed';
import {
  ECHO_SCENES,
  SLICE_SCENE_ORDER,
  generateApartmentParams,
  generateAwakeningParams,
  generateEchoes,
  generateFallParams,
  generateJamParams,
  generateYardParams,
  type DreamMotif,
  type DreamScene,
  type EchoMotif,
  type SceneId,
  type SceneOf,
} from './scenes';
import { profileRng, sceneRng, sceneSeed, streamKey } from './streams';
import { ENGINE_VERSION } from './version';

export type TransitionKind = 'fall_asleep' | 'swing_release' | 'splash' | 'wake_up';

/** Edge of the scene graph. In the first slice the graph is a fixed chain. */
export interface DreamTransition {
  from: SceneId;
  to: SceneId;
  kind: TransitionKind;
}

export interface Dream {
  /** `ENGINE_VERSION` that produced this dream; the same seed may differ across versions. */
  engineVersion: number;
  seed: DreamSeed;
  profile: DreamProfile;
  /** Scenes in playing order. */
  scenes: DreamScene[];
  transitions: DreamTransition[];
  /** Sum of scene durations, seconds. */
  duration: number;
}

const SLICE_TRANSITIONS: readonly DreamTransition[] = [
  { from: 'apartment', to: 'yard', kind: 'fall_asleep' },
  { from: 'yard', to: 'fall', kind: 'swing_release' },
  { from: 'fall', to: 'jam', kind: 'splash' },
  { from: 'jam', to: 'awakening', kind: 'wake_up' },
];

/** Share of the dream length each scene gets, before normalisation: [min, max). */
const DURATION_SHARE: Readonly<Record<SceneId, readonly [number, number]>> = {
  apartment: [0.08, 0.12],
  yard: [0.28, 0.36],
  fall: [0.14, 0.2],
  jam: [0.22, 0.3],
  awakening: [0.08, 0.1],
};

/** Dramatic arc of the slice: base intensity of each scene. */
const INTENSITY_ARC: Readonly<Record<SceneId, number>> = {
  apartment: 0.15,
  yard: 0.45,
  fall: 0.7,
  jam: 0.85,
  awakening: 0.05,
};

/** Profile traits that drive each scene's intensity. */
function intensityDrive(id: SceneId, p: DreamProfile): number {
  switch (id) {
    case 'apartment':
    case 'awakening':
      return p.domesticIntensity;
    case 'yard':
      return (p.sovietIntensity + p.anxiety) / 2;
    case 'fall':
      return (p.physicsInstability + p.anxiety) / 2;
    case 'jam':
      return (p.physicsInstability + p.absurdity) / 2;
  }
}

/** Key of the stream scene durations are drawn from. */
export function timelineSeed(seed: DreamSeed): string {
  return streamKey(seed, 'timeline');
}

/** Scene durations in seconds, adding up to `profile.dreamLength` minutes (up to rounding). */
function sceneDurations(order: readonly SceneId[], profile: DreamProfile, rng: Rng): number[] {
  const shares = order.map((id) => rng.range(...DURATION_SHARE[id]));
  const total = shares.reduce((sum, share) => sum + share, 0);
  return shares.map((share) => round((share / total) * profile.dreamLength * 60, 1));
}

/** Generates the dream for `seed`. Pure: equal seeds give deeply equal dreams. */
export function generateDream(seed: DreamSeed): Dream {
  const profile = generateProfile(profileRng(seed));
  const order = SLICE_SCENE_ORDER;
  const durations = sceneDurations(order, profile, createSeededRng(timelineSeed(seed)));
  const echoCooldowns = new Map<EchoMotif, number>();
  const heard: DreamMotif[] = ['vacuum'];

  const scenes = order.map((id, index): DreamScene => {
    const rng = sceneRng(seed, index);
    const base = {
      index,
      seed: sceneSeed(seed, index),
      duration: durations[index] as number,
      intensity: round(clamp01(INTENSITY_ARC[id] + (intensityDrive(id, profile) - 0.5) * 0.4 + rng.range(-0.08, 0.08)), 3),
      echoes: ECHO_SCENES.includes(id) ? generateEchoes(profile, index, echoCooldowns, sceneRng(seed, index, 'echoes')) : [],
    };
    if (id === 'yard') heard.push('swing_creak');
    for (const echo of base.echoes) if (!heard.includes(echo.motif)) heard.push(echo.motif);

    switch (id) {
      case 'apartment':
        return { id, ...base, params: generateApartmentParams(profile, rng) };
      case 'yard':
        return { id, ...base, params: generateYardParams(profile, rng) };
      case 'fall':
        return { id, ...base, params: generateFallParams(profile, rng) };
      case 'jam':
        return { id, ...base, params: generateJamParams(profile, rng) };
      case 'awakening':
        return { id, ...base, params: generateAwakeningParams(heard, rng) };
    }
  });

  return {
    engineVersion: ENGINE_VERSION,
    seed,
    profile,
    scenes,
    transitions: SLICE_TRANSITIONS.map((transition) => ({ ...transition })),
    duration: round(
      durations.reduce((sum, duration) => sum + duration, 0),
      1,
    ),
  };
}

/** The scene with the given id (e.g. for `?scene=yard`), typed by that id. */
export function findScene<Id extends SceneId>(dream: Dream, id: Id): SceneOf<Id> | undefined {
  // The cast is sound: a scene whose `id` equals `id` is exactly a SceneOf<Id>.
  return dream.scenes.find((scene) => scene.id === id) as SceneOf<Id> | undefined;
}
