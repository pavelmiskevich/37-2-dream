/**
 * Rules of the fall scene (spec §13, vision: slice step 3). The hero falls
 * from the scene's `height` into the jam; the fall lasts the scene's nominal
 * `duration` and speeds up towards the end. In the air he can drift a little
 * sideways (to get closer to a will page) and look around; the camera
 * tumbles as much as the scene's `tumble` says. Panic heats him a little as
 * the ground nears.
 *
 * Everything is data in `sceneVars`; the app draws it. Keys:
 *
 *   progress  0..1 share of the fall's time that has passed
 *   altitude  metres above the jam surface (`height` → 0)
 *   x, z      horizontal drift from the fall axis, metres (|x, z| ≤ FALL_DRIFT.radius)
 *   vx, vz    drift velocity, metres per second
 *   roll      camera roll, radians (tumble)
 *   sway      extra camera pitch, radians (tumble), on top of the player's own
 *   monitor   0..1 urgency of the monitor beeping, rising towards the landing
 *
 * plus the tumble constants drawn on entering: rollPhase, rollRate,
 * swayPhase, swayRate, spin.
 *
 * This module imports only types from `simulation.ts`, which registers the
 * rules; what it needs from there comes through `FallEnv` instead, so the two
 * modules never import each other at run time.
 */
import { clamp01 } from './math';
import type { SceneOf } from './scenes';
import type { SceneContext, SceneRules, SimState } from './simulation';
import { applyHeat } from './temperature';

/** What the fall rules take from the simulation. */
export interface FallEnv {
  /** Tick length, seconds. */
  readonly tickDt: number;
  /** Eye height of the hero above whatever he stands — or lands — on. */
  readonly eyeHeight: number;
  /** Ticks the scene lasts; the fall ends exactly when the scene does. */
  durationTicks(scene: SceneOf<'fall'>): number;
}

/** Steering in the air: a little, never a flight. */
export const FALL_DRIFT = {
  /** Acceleration at full stick, m/s². */
  accel: 3,
  /** Velocity damping per second (air drag). */
  drag: 1.6,
  /** Top drift speed, m/s. */
  maxSpeed: 1.6,
  /** Furthest the hero can drift from the fall axis, metres. */
  radius: 3,
} as const;

/** Camera tumble at `tumble = 1`. */
export const FALL_TUMBLE = {
  /** Amplitude of the roll swing, radians. */
  rollSwing: 0.55,
  /** Steady spin, radians per second (scaled by tumble²: only wild falls spin). */
  spinRate: 0.5,
  /** Amplitude of the pitch sway, radians. */
  sway: 0.22,
} as const;

/**
 * Heat of the fall at the landing, °C per second (D-014): it grows from 0 with
 * `progress`, so a whole fall adds about `FALL_HEAT × duration / 2` before
 * the drift pulls it back — a tenth or two of a degree, never a wake-up.
 */
export const FALL_HEAT = 0.01;

/** Share of the height fallen after `progress` of the time: the fall speeds up. */
export function fallenFraction(progress: number): number {
  const p = clamp01(progress);
  return 0.6 * p + 0.4 * p * p;
}

/** Monitor urgency during the fall: calm at the start, racing at the landing. */
export function fallMonitorIntensity(progress: number): number {
  const p = clamp01(progress);
  return 0.3 + 0.7 * p * p;
}

const vars = (state: SimState, key: string): number => state.sceneVars[key] ?? 0;

/** Tumble at `seconds` into the fall: [roll, sway]. */
function tumbleAt(state: SimState, tumble: number, seconds: number): [number, number] {
  const roll =
    tumble * FALL_TUMBLE.rollSwing * Math.sin(vars(state, 'rollRate') * seconds + vars(state, 'rollPhase')) +
    tumble * tumble * FALL_TUMBLE.spinRate * vars(state, 'spin') * seconds;
  const sway = tumble * FALL_TUMBLE.sway * Math.sin(vars(state, 'swayRate') * seconds + vars(state, 'swayPhase'));
  return [roll, sway];
}

/** Fall rules for the given simulation constants. */
export function createFallRules(env: FallEnv): SceneRules {
  const asFall = (context: SceneContext): SceneOf<'fall'> => {
    if (context.scene.id !== 'fall') throw new RangeError(`Fall rules run in scene ${context.scene.id}.`);
    return context.scene;
  };

  /** Writes the fall's pose and derived variables for the current `sceneTick`. */
  const settle = (state: SimState, scene: SceneOf<'fall'>, x: number, z: number, vx: number, vz: number): SimState => {
    const progress = Math.min(1, state.sceneTick / env.durationTicks(scene));
    const altitude = scene.params.height * (1 - fallenFraction(progress));
    const [roll, sway] = tumbleAt(state, scene.params.tumble, state.sceneTick * env.tickDt);
    return {
      ...state,
      player: { ...state.player, position: [x, env.eyeHeight + altitude, z] },
      sceneVars: {
        ...state.sceneVars,
        progress,
        altitude,
        x,
        z,
        vx,
        vz,
        roll,
        sway,
        monitor: fallMonitorIntensity(progress),
      },
    };
  };

  return {
    enter(state, context) {
      const scene = asFall(context);
      const { rng } = context;
      // The fall has its own space: it starts on the axis, at the full height.
      const entered: SimState = {
        ...state,
        sceneVars: {
          rollPhase: rng.range(0, 2 * Math.PI),
          rollRate: rng.range(0.35, 0.8),
          swayPhase: rng.range(0, 2 * Math.PI),
          swayRate: rng.range(0.5, 1.1),
          spin: rng.chance(0.5) ? 1 : -1,
        },
      };
      return settle(entered, scene, 0, 0, 0, 0);
    },

    update(state, context) {
      const scene = asFall(context);
      const dt = env.tickDt;
      // Steering is relative to where the hero looks, like walking.
      const [right, forward] = context.input.move;
      const sin = Math.sin(state.player.yaw);
      const cos = Math.cos(state.player.yaw);
      const ax = (right * cos - forward * sin) * FALL_DRIFT.accel;
      const az = (-right * sin - forward * cos) * FALL_DRIFT.accel;

      const damping = Math.max(0, 1 - FALL_DRIFT.drag * dt);
      let vx = (vars(state, 'vx') + ax * dt) * damping;
      let vz = (vars(state, 'vz') + az * dt) * damping;
      const speed = Math.hypot(vx, vz);
      if (speed > FALL_DRIFT.maxSpeed) {
        vx *= FALL_DRIFT.maxSpeed / speed;
        vz *= FALL_DRIFT.maxSpeed / speed;
      }

      // The common movement step walked the hero; in the air only the drift counts.
      let x = vars(state, 'x') + vx * dt;
      let z = vars(state, 'z') + vz * dt;
      const distance = Math.hypot(x, z);
      if (distance > FALL_DRIFT.radius) {
        const nx = x / distance;
        const nz = z / distance;
        x = nx * FALL_DRIFT.radius;
        z = nz * FALL_DRIFT.radius;
        const outward = vx * nx + vz * nz;
        if (outward > 0) {
          vx -= outward * nx;
          vz -= outward * nz;
        }
      }
      const next = settle(state, scene, x, z, vx, vz);
      // Panic: the closer the ground, the more the fall heats the hero.
      return applyHeat(next, FALL_HEAT * vars(next, 'progress') * dt);
    },

    // The landing in the jam. `progress` reaches 1 on the scene's last
    // tick, so the fall keeps the generated timeline.
    isComplete: (state) => vars(state, 'progress') >= 1,
  };
}
