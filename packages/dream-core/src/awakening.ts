/**
 * Rules of the awakening (vision, slice item 6; D-014, D-020). The hero opens
 * his eyes in the same bed of the same flat, by daylight. The vacuum cleaner
 * that grew into a turbine is a vacuum cleaner in the next room again, and it
 * goes quiet; somebody in the kitchen asks "Ты чай будешь?"; the reason of
 * the awakening is stated. Then the dream is over.
 *
 * Like the prologue, the awakening runs on its own clock:
 *
 *   waking     the eyes open, the daylight comes in;
 *   listening  he lies there; the vacuum is still on behind the wall;
 *   quiet      the vacuum is switched off;
 *   call       the voice from the kitchen;
 *   verdict    the reason of the awakening;
 *   over       the scene is complete, the dream is finished.
 *
 * On entering, the rules settle how the dream ended: `wakeReason` is the
 * temperature's verdict if it woke him up early, otherwise the reason the
 * generator planned; and when the dream ran its course the fever is gone —
 * the temperature becomes the scene's `temperature` (36,9). An early
 * awakening keeps the temperature that caused it.
 *
 * Everything is data in `sceneVars`; the app draws it. Keys:
 *
 *   phase  index into `AWAKENING_PHASES`
 *   wake   0..1 progress of opening the eyes
 *
 * Nothing here draws from the RNG. Like apartment.ts, this module imports
 * only types from `simulation.ts`.
 */
import { APARTMENT, lyingPose } from './apartment';
import { clamp } from './math';
import type { AwakeningReason, PlannedAwakeningReason, SceneOf } from './scenes';
import type { SceneRules, SimState } from './simulation';

/** What the awakening rules take from the simulation. */
export interface AwakeningEnv {
  /** Tick length, seconds. */
  readonly tickDt: number;
}

/** Phases of the awakening, in order; `sceneVars.phase` is an index into it. */
export const AWAKENING_PHASES = ['waking', 'listening', 'quiet', 'call', 'verdict', 'over'] as const;

export type AwakeningPhase = (typeof AWAKENING_PHASES)[number];

/**
 * Moments of the awakening, seconds since the scene began. Placeholders until
 * the playtest. The whole scene lasts 19 s whatever the seed: its nominal
 * `duration` (8–10 % of the dream) only sizes the timeline of the dream.
 */
export const AWAKENING = {
  /** The eyes are open. */
  listeningAt: 3.5,
  /** The vacuum next door is switched off. */
  quietAt: 6.5,
  /** The voice from the kitchen. */
  callAt: 9,
  /** The reason of the awakening is stated. */
  verdictAt: 12.5,
  /** The scene is over and so is the dream. */
  overAt: 19,
} as const;

/** Moments of the awakening, in ticks since the scene began. */
export interface AwakeningTimeline {
  listeningAt: number;
  quietAt: number;
  callAt: number;
  verdictAt: number;
  overAt: number;
}

/** Timeline of the awakening at tick length `tickDt`. Pure. */
export function awakeningTimeline(tickDt: number): AwakeningTimeline {
  const ticks = (seconds: number): number => Math.round(seconds / tickDt);
  return {
    listeningAt: ticks(AWAKENING.listeningAt),
    quietAt: ticks(AWAKENING.quietAt),
    callAt: ticks(AWAKENING.callAt),
    verdictAt: ticks(AWAKENING.verdictAt),
    overAt: ticks(AWAKENING.overAt),
  };
}

/** Phase of the awakening at `sceneTick`. */
export function awakeningPhaseAt(timeline: AwakeningTimeline, sceneTick: number): AwakeningPhase {
  if (sceneTick >= timeline.overAt) return 'over';
  if (sceneTick >= timeline.verdictAt) return 'verdict';
  if (sceneTick >= timeline.callAt) return 'call';
  if (sceneTick >= timeline.quietAt) return 'quiet';
  if (sceneTick >= timeline.listeningAt) return 'listening';
  return 'waking';
}

/** Phase stored in `sceneVars` (`waking` before the rules have run). */
export function awakeningPhase(state: Pick<SimState, 'sceneVars'>): AwakeningPhase {
  return AWAKENING_PHASES[state.sceneVars.phase ?? 0] ?? 'waking';
}

/** 0 with the eyes shut, rising to 1 as he opens them. */
export function awakeningWake(state: Pick<SimState, 'sceneVars'>): number {
  return state.sceneVars.wake ?? 0;
}

/** True for the reasons a dream that ran its course ends with (the generator plans them). */
export function isPlannedReason(reason: AwakeningReason): reason is PlannedAwakeningReason {
  return reason === 'tea_brought' || reason === 'unknown';
}

function awakeningScene(scene: { id: string }): SceneOf<'awakening'> {
  if (scene.id !== 'awakening') throw new RangeError(`Awakening rules ran in scene "${scene.id}".`);
  return scene as SceneOf<'awakening'>;
}

export function createAwakeningRules(env: AwakeningEnv): SceneRules {
  const timeline = awakeningTimeline(env.tickDt);
  const sceneVarsAt = (sceneTick: number) => ({
    phase: AWAKENING_PHASES.indexOf(awakeningPhaseAt(timeline, sceneTick)),
    wake: clamp(sceneTick / timeline.listeningAt, 0, 1),
  });

  return {
    enter(state, { scene }) {
      const { params } = awakeningScene(scene);
      const wakeReason = state.wakeReason ?? params.reason;
      return {
        ...state,
        wakeReason,
        // The dream ran its course: the fever has broken. An early awakening
        // keeps the temperature that caused it.
        temperature: isPlannedReason(wakeReason) ? params.temperature : state.temperature,
        player: { position: APARTMENT.eye, yaw: APARTMENT.startYaw, pitch: APARTMENT.startPitch },
        sceneVars: sceneVarsAt(state.sceneTick),
      };
    },

    update(state) {
      return { ...state, player: lyingPose(state.player), sceneVars: sceneVarsAt(state.sceneTick) };
    },

    isComplete: (state) => awakeningPhase(state) === 'over',
  };
}
