/**
 * Rules of the apartment prologue (vision, slice item 1; D-017). The hero
 * lies in bed with 37.2, says "Передайте коту…" and falls asleep.
 *
 * He does not walk: the stick is ignored and his eyes stay on the pillow. He
 * can only turn his head as far as a man lying propped up on a pillow can.
 *
 * The prologue runs on its own clock rather than on the scene's nominal
 * `duration`, which is too short for it:
 *
 *   awake           he lies and looks around;
 *   speaking        he says his last words;
 *   silent          he falls silent for the scene's `sleepDelay`;
 *   falling_asleep  the eyes close, his breathing turns into the ventilator;
 *   asleep          the dream begins (the scene is complete).
 *
 * Everything is data in `sceneVars`; the app draws it. Keys:
 *
 *   phase  index into `APARTMENT_PHASES`
 *   sleep  0..1 progress of falling asleep
 *
 * Nothing here draws from the RNG. This module imports only types from
 * `simulation.ts`, which registers the rules; what it needs from there comes
 * through `ApartmentEnv`, so the two modules never import each other at run
 * time.
 */
import { clamp, round } from './math';
import type { SceneOf } from './scenes';
import type { PlayerState, SceneRules, SimState, Vec3 } from './simulation';

/** What the apartment rules take from the simulation. */
export interface ApartmentEnv {
  /** Tick length, seconds. */
  readonly tickDt: number;
  /** Eye height of the hero standing up: the dream begins on his feet. */
  readonly eyeHeight: number;
}

/** Phases of the prologue, in order; `sceneVars.phase` is an index into it. */
export const APARTMENT_PHASES = ['awake', 'speaking', 'silent', 'falling_asleep', 'asleep'] as const;

export type ApartmentPhase = (typeof APARTMENT_PHASES)[number];

/** Tunable numbers of the prologue. Placeholders until the playtest. */
export const APARTMENT = {
  /**
   * Eyes of the hero lying in bed, propped up on the pillow. The view builds
   * the room around this point; yaw 0 looks along the bed towards the window.
   */
  eye: [0, 0.82, 0] as Vec3,
  /** Where he looks when the prologue begins: at the bedside table, to the right. */
  startYaw: -0.85,
  startPitch: -0.28,
  /** How far he can turn his head: left (to the wall) is positive, right is negative. */
  yaw: { min: -2.1, max: 1.35 },
  pitch: { min: -0.85, max: 1.2 },
  /**
   * Seconds of looking around before the last words: a share of the scene's
   * nominal duration, within bounds. With the line, `sleepDelay` (1.5–4 s)
   * and falling asleep the prologue lasts 21–32 s.
   */
  awakeShare: 0.6,
  awakeMin: 8,
  awakeMax: 16,
  /** Seconds the last words take, the opening included. */
  speaking: 4.5,
  /** Seconds from closing the eyes to sleep. */
  fallingAsleep: 7,
} as const;

/** Moments of the prologue, in ticks since the scene began. */
export interface ApartmentTimeline {
  /** He starts saying his last words. */
  speakAt: number;
  /** He has said them and falls silent. */
  silentAt: number;
  /** He starts falling asleep (`sleepDelay` after the last words). */
  sleepAt: number;
  /** He is asleep: the scene is complete. */
  asleepAt: number;
}

/** Timeline of the prologue of `scene` at tick length `tickDt`. Pure. */
export function apartmentTimeline(scene: SceneOf<'apartment'>, tickDt: number): ApartmentTimeline {
  const ticks = (seconds: number): number => Math.round(seconds / tickDt);
  const awake = clamp(round(scene.duration * APARTMENT.awakeShare, 1), APARTMENT.awakeMin, APARTMENT.awakeMax);
  const speakAt = ticks(awake);
  const silentAt = speakAt + ticks(APARTMENT.speaking);
  const sleepAt = silentAt + ticks(scene.params.sleepDelay);
  return { speakAt, silentAt, sleepAt, asleepAt: sleepAt + ticks(APARTMENT.fallingAsleep) };
}

/** Phase of the prologue at `sceneTick`. */
export function apartmentPhaseAt(timeline: ApartmentTimeline, sceneTick: number): ApartmentPhase {
  if (sceneTick >= timeline.asleepAt) return 'asleep';
  if (sceneTick >= timeline.sleepAt) return 'falling_asleep';
  if (sceneTick >= timeline.silentAt) return 'silent';
  if (sceneTick >= timeline.speakAt) return 'speaking';
  return 'awake';
}

/** Phase stored in `sceneVars` (`awake` before the rules have run). */
export function apartmentPhase(state: Pick<SimState, 'sceneVars'>): ApartmentPhase {
  return APARTMENT_PHASES[state.sceneVars.phase ?? 0] ?? 'awake';
}

/** 0 while awake, rising to 1 as he falls asleep. */
export function apartmentSleep(state: Pick<SimState, 'sceneVars'>): number {
  return state.sceneVars.sleep ?? 0;
}

/** Keeps the hero on the pillow and his head within reach. Shared with the awakening. */
export function lyingPose(player: PlayerState): PlayerState {
  return {
    position: APARTMENT.eye,
    yaw: clamp(player.yaw, APARTMENT.yaw.min, APARTMENT.yaw.max),
    pitch: clamp(player.pitch, APARTMENT.pitch.min, APARTMENT.pitch.max),
  };
}

function apartmentScene(scene: { id: string }): SceneOf<'apartment'> {
  if (scene.id !== 'apartment') throw new RangeError(`Apartment rules ran in scene "${scene.id}".`);
  return scene as SceneOf<'apartment'>;
}

export function createApartmentRules(env: ApartmentEnv): SceneRules {
  const sceneVarsAt = (scene: SceneOf<'apartment'>, sceneTick: number) => {
    const timeline = apartmentTimeline(scene, env.tickDt);
    const phase = apartmentPhaseAt(timeline, sceneTick);
    const sleep = clamp((sceneTick - timeline.sleepAt) / (timeline.asleepAt - timeline.sleepAt), 0, 1);
    return { phase: APARTMENT_PHASES.indexOf(phase), sleep };
  };

  return {
    enter(state, { scene }) {
      return {
        ...state,
        player: { position: APARTMENT.eye, yaw: APARTMENT.startYaw, pitch: APARTMENT.startPitch },
        sceneVars: sceneVarsAt(apartmentScene(scene), state.sceneTick),
      };
    },

    update(state, { scene }) {
      const sceneVars = sceneVarsAt(apartmentScene(scene), state.sceneTick);
      // Asleep, he falls into the dream on his feet: the next scene gets the
      // default standing pose, not a man lying on a pillow.
      const player: PlayerState =
        APARTMENT_PHASES[sceneVars.phase] === 'asleep'
          ? { position: [0, env.eyeHeight, 0], yaw: 0, pitch: 0 }
          : lyingPose(state.player);
      return { ...state, player, sceneVars };
    },

    isComplete: (state) => apartmentPhase(state) === 'asleep',
  };
}
