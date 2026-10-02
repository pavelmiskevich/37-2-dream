/**
 * Rules of the jam scene (spec §8, vision: slice step 4). The hero has
 * splashed into a giant jar and moves as if under water, only slower: every
 * stroke takes a while to get going and a while to die down, and when he does
 * nothing he slowly floats up towards the lid. From time to time gravity
 * turns to another side of the jar, and with it the direction he floats in;
 * his sense of "up" — the camera — follows it no faster than a calm turn of
 * the head. The way out is the lid: it gives only after the first turn of
 * gravity, and towards the end of the scene the jam carries the hero up to it
 * anyway, so the scene never hangs.
 *
 * Everything is data in `sceneVars`; the app draws it. Keys:
 *
 *   progress   0..1 share of the scene's nominal time that has passed
 *   x, y, z    eye position inside the jar, metres (bottom at y = 0, axis at x = z = 0)
 *   vx, vy, vz velocity, metres per second
 *   gravity    index of the current gravity direction in `JAM_GRAVITY_DIRECTIONS`
 *   gx, gy, gz unit vector gravity pulls along (the hero floats the other way)
 *   nextFlip   scene tick of the next change of gravity
 *   flips      changes of gravity so far
 *   qx, qy, qz, qw  the hero's felt frame: rotation of the world's "up" to his
 *              own, a unit quaternion; the camera is this frame times his look
 *   turn       how fast the felt frame is turning now, radians per second
 *   carry      0..1 how much the jam carries the hero to the lid (end of scene)
 *   lidOpen    1 once the lid gives, 0 before
 *
 * This module imports only types from `simulation.ts`, which registers the
 * rules; what it needs from there comes through `JamEnv` instead.
 */
import { clamp, clamp01, lerp } from './math';
import type { GravityDirection, SceneOf } from './scenes';
import type { SceneContext, SceneRules, SimState } from './simulation';
import { isHeld } from './input';

/** What the jam rules take from the simulation. */
export interface JamEnv {
  /** Tick length, seconds. */
  readonly tickDt: number;
  /** Ticks the scene nominally lasts; the carry brings the hero to the lid by then. */
  durationTicks(scene: SceneOf<'jam'>): number;
}

/** The jar from the inside, metres. The hero is small in it. */
export const JAM_JAR = {
  /** Inner radius of the glass. */
  radius: 7,
  /** Height of the lid above the bottom. */
  height: 12,
  /** How close the eyes come to the glass, the bottom or the lid. */
  body: 0.5,
  /** Eye height after the splash, and the speed he is still sinking at. */
  startY: 3.5,
  startSink: 0.9,
} as const;

/**
 * Movement in the jam, from runny (`viscosity` 0) to thick (1). The jam's own
 * `viscosity` lies in 0.4..0.95. Every motion approaches its top speed with
 * the time constant `inertia`: a stroke takes that long to get going, and the
 * hero keeps gliding about as long after letting go.
 */
export const JAM_MOTION = {
  /** Top swimming speed at full stick, m/s: [runny, thick]. */
  swimSpeed: [1.2, 0.4],
  /** Time constant of every change of velocity, seconds: [runny, thick]. */
  inertia: [0.6, 1.8],
  /** Speed of floating up when nothing is done, m/s: [runny, thick]. */
  floatSpeed: [0.22, 0.06],
  /** Velocity a jump adds towards the felt "up", m/s: [runny, thick]. */
  kick: [1, 0.5],
} as const;

/** Directions gravity can pull in; index 0 is the ordinary one. */
export const JAM_GRAVITY_DIRECTIONS = ['down', 'up', 'left', 'right', 'forward', 'back'] as const;
export type JamGravity = (typeof JAM_GRAVITY_DIRECTIONS)[number];

const GRAVITY_VECTORS: Readonly<Record<JamGravity, readonly [number, number, number]>> = {
  down: [0, -1, 0],
  up: [0, 1, 0],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  forward: [0, 0, -1],
  back: [0, 0, 1],
};

/** Timing of the changes of gravity after the first one (`gravityFlipAt`). */
export const JAM_GRAVITY = {
  /** A turned gravity holds for this long, seconds: [min, max). */
  hold: [7, 12],
  /** Then the ordinary one holds for this long before the next turn: [min, max). */
  calm: [7, 13],
} as const;

/**
 * Turning of the felt frame (the camera) after gravity, radians and seconds.
 * The turn speeds up and slows down smoothly and never goes faster than
 * `maxRate`: a quarter turn takes about three seconds, a half turn about six.
 */
export const JAM_TURN = {
  maxRate: 0.7,
  /** Angular acceleration, rad/s². */
  accel: 1,
  /** Near the target the rate is at most `ease × remaining angle`. */
  ease: 2,
} as const;

/** The end of the scene: the lid and the carry. Shares of the nominal duration. */
export const JAM_EXIT = {
  /** The lid gives this long after the first turn of gravity. */
  lidAfterFlip: 0.15,
  /** From here the jam carries the hero to the lid, reaching it at progress 1. */
  carryFrom: 0.8,
  /** Eyes this close to their highest point count as touching the lid, metres. */
  reach: 0.05,
} as const;

type Vec = readonly [number, number, number];
type Quat = readonly [number, number, number, number];

const UP: Vec = [0, 1, 0];
const ROLL_AXIS: Vec = [0, 0, 1];

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Rotates `v` by the unit quaternion `q`. */
export function rotateByQuat(q: Quat, v: Vec): Vec {
  const u: Vec = [q[0], q[1], q[2]];
  const w = q[3];
  const c = cross(u, v);
  const t: Vec = [2 * c[0], 2 * c[1], 2 * c[2]];
  const ut = cross(u, t);
  return [v[0] + w * t[0] + ut[0], v[1] + w * t[1] + ut[1], v[2] + w * t[2] + ut[2]];
}

/** `a × b`: rotation `b`, then `a`. */
function multiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function normalizeQuat(q: Quat): Quat {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}

/** Angle between the felt "up" of `q` and `target`, radians. */
export function frameAngle(q: Quat, target: Vec): number {
  return Math.acos(clamp(dot(rotateByQuat(q, UP), target), -1, 1));
}

/** Top speed, inertia, float and kick for a jam of `viscosity`. */
export function jamMotion(viscosity: number) {
  const v = clamp01(viscosity);
  return {
    swimSpeed: lerp(...JAM_MOTION.swimSpeed, v),
    inertia: lerp(...JAM_MOTION.inertia, v),
    floatSpeed: lerp(...JAM_MOTION.floatSpeed, v),
    kick: lerp(...JAM_MOTION.kick, v),
  };
}

/** Smooth 0..1 ramp. */
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/** How much the jam carries the hero to the lid at `progress`. */
export function jamCarry(progress: number): number {
  return smooth((progress - JAM_EXIT.carryFrom) / (1 - JAM_EXIT.carryFrom));
}

/** Progress at which the lid gives, for a scene whose gravity first turns at `gravityFlipAt`. */
export function jamLidOpensAt(gravityFlipAt: number): number {
  return Math.min(JAM_EXIT.carryFrom, gravityFlipAt + JAM_EXIT.lidAfterFlip);
}

/** Highest eye height in the jar: the eyes just under the lid. */
export const JAM_CEILING = JAM_JAR.height - JAM_JAR.body;

const vars = (state: SimState, key: string): number => state.sceneVars[key] ?? 0;

const gravityIndex = (direction: JamGravity) => JAM_GRAVITY_DIRECTIONS.indexOf(direction);

/** Jam rules for the given simulation constants. */
export function createJamRules(env: JamEnv): SceneRules {
  const asJam = (context: SceneContext): SceneOf<'jam'> => {
    if (context.scene.id !== 'jam') throw new RangeError(`Jam rules run in scene ${context.scene.id}.`);
    return context.scene;
  };
  const ticks = (seconds: number) => Math.max(1, Math.round(seconds / env.tickDt));
  const gravityVars = (direction: JamGravity) => {
    const [gx, gy, gz] = GRAVITY_VECTORS[direction];
    return { gravity: gravityIndex(direction), gx, gy, gz };
  };

  /** Turns gravity if its time has come; draws the next moment from the scene stream. */
  const turnGravity = (
    state: SimState,
    scene: SceneOf<'jam'>,
    context: SceneContext,
    carrying: boolean,
  ): Record<string, number> => {
    const current = JAM_GRAVITY_DIRECTIONS[vars(state, 'gravity')] ?? 'down';
    // The carry brings back the ordinary gravity and keeps it.
    if (carrying) return current === 'down' ? {} : gravityVars('down');
    if (state.sceneTick < vars(state, 'nextFlip')) return {};
    const { rng } = context;
    const flips = vars(state, 'flips') + 1;
    if (current !== 'down') {
      return { ...gravityVars('down'), flips, nextFlip: state.sceneTick + ticks(rng.range(...JAM_GRAVITY.calm)) };
    }
    // The first turn is the dream's own; later ones come from the scene stream.
    const turned: GravityDirection =
      vars(state, 'flips') === 0 ? scene.params.gravity : (rng.pick(JAM_GRAVITY_DIRECTIONS.slice(1)) as GravityDirection);
    return { ...gravityVars(turned), flips, nextFlip: state.sceneTick + ticks(rng.range(...JAM_GRAVITY.hold)) };
  };

  /** Turns the felt frame towards the "up" of gravity, no faster than `JAM_TURN` allows. */
  const turnFrame = (q: Quat, turn: number, target: Vec): { q: Quat; turn: number } => {
    const dt = env.tickDt;
    const up = rotateByQuat(q, UP);
    const angle = Math.acos(clamp(dot(up, target), -1, 1));
    const wanted = Math.min(JAM_TURN.maxRate, angle * JAM_TURN.ease);
    const step = JAM_TURN.accel * dt;
    const rate = turn < wanted ? Math.min(wanted, turn + step) : Math.max(wanted, turn - step);
    const by = Math.min(angle, rate * dt);
    if (by <= 0) return { q, turn: rate };
    let axis = cross(up, target);
    const length = Math.hypot(...axis);
    // Upside down: no shortest way, so roll over the hero's own view axis.
    if (length < 1e-9) axis = rotateByQuat(q, ROLL_AXIS);
    else axis = [axis[0] / length, axis[1] / length, axis[2] / length];
    const s = Math.sin(by / 2);
    const r: Quat = [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(by / 2)];
    return { q: normalizeQuat(multiply(r, q)), turn: rate };
  };

  return {
    enter(state, context) {
      const scene = asJam(context);
      const y = JAM_JAR.startY;
      return {
        ...state,
        player: { ...state.player, position: [0, y, 0] },
        sceneVars: {
          progress: 0,
          x: 0,
          y,
          z: 0,
          vx: 0,
          vy: -JAM_JAR.startSink,
          vz: 0,
          ...gravityVars('down'),
          nextFlip: Math.round(scene.params.gravityFlipAt * env.durationTicks(scene)),
          flips: 0,
          qx: 0,
          qy: 0,
          qz: 0,
          qw: 1,
          turn: 0,
          carry: 0,
          lidOpen: 0,
        },
      };
    },

    update(state, context) {
      const scene = asJam(context);
      const dt = env.tickDt;
      const motion = jamMotion(scene.params.viscosity);
      const progress = Math.min(1, state.sceneTick / env.durationTicks(scene));
      const carry = jamCarry(progress);
      const carried = jamCarry(Math.min(1, (state.sceneTick - 1) / env.durationTicks(scene)));
      const gravity: Record<string, number> = { ...state.sceneVars, ...turnGravity(state, scene, context, carry > 0) };
      const g: Vec = [gravity.gx ?? 0, gravity.gy ?? -1, gravity.gz ?? 0];

      // The felt frame follows gravity slowly; the hero looks and swims in it.
      const felt: Quat = [vars(state, 'qx'), vars(state, 'qy'), vars(state, 'qz'), vars(state, 'qw')];
      const frame = turnFrame(felt, vars(state, 'turn'), [-g[0], -g[1], -g[2]]);
      const { yaw, pitch } = state.player;
      const [right, forward] = context.input.move;
      const cosPitch = Math.cos(pitch);
      const along: Vec = [
        right * Math.cos(yaw) - forward * Math.sin(yaw) * cosPitch,
        forward * Math.sin(pitch),
        -right * Math.sin(yaw) - forward * Math.cos(yaw) * cosPitch,
      ];
      const swim = rotateByQuat(frame.q, along);

      // Velocity approaches its target with the time constant `inertia`: the
      // stroke (and the float) fade out while the jam carries the hero.
      const control = 1 - carry;
      const toward = (i: 0 | 1 | 2) => (swim[i] * motion.swimSpeed - g[i] * motion.floatSpeed) * control;
      const damping = Math.max(0, 1 - dt / motion.inertia);
      const pull = dt / motion.inertia;
      const v: [number, number, number] = [
        (vars(state, 'vx') + toward(0) * pull) * damping,
        (vars(state, 'vy') + toward(1) * pull) * damping,
        (vars(state, 'vz') + toward(2) * pull) * damping,
      ];
      if (isHeld(context.pressed, 'jump') && control > 0) {
        const up = rotateByQuat(frame.q, UP);
        for (const i of [0, 1, 2] as const) v[i] += up[i] * motion.kick * control;
      }

      let x = vars(state, 'x') + v[0] * dt;
      let y = vars(state, 'y') + v[1] * dt;
      let z = vars(state, 'z') + v[2] * dt;

      // The glass, the bottom and the lid stop him; the push into them is lost.
      const wall = JAM_JAR.radius - JAM_JAR.body;
      const distance = Math.hypot(x, z);
      if (distance > wall) {
        const nx = x / distance;
        const nz = z / distance;
        x = nx * wall;
        z = nz * wall;
        const outward = v[0] * nx + v[2] * nz;
        if (outward > 0) {
          v[0] -= outward * nx;
          v[2] -= outward * nz;
        }
      }
      if (y < JAM_JAR.body) {
        y = JAM_JAR.body;
        v[1] = Math.max(0, v[1]);
      }
      if (y > JAM_CEILING) {
        y = JAM_CEILING;
        v[1] = Math.min(0, v[1]);
      }

      // The carry closes the remaining way to the lid on a smooth schedule,
      // so the eyes reach it exactly at the end of the nominal duration.
      if (carry > carried) {
        const share = carry >= 1 ? 1 : (carry - carried) / (1 - carried);
        y += (JAM_CEILING - y) * share;
        for (const i of [0, 1, 2] as const) v[i] *= 1 - share;
      }

      const lidOpen = progress >= jamLidOpensAt(scene.params.gravityFlipAt) ? 1 : 0;
      return {
        ...state,
        player: { ...state.player, position: [x, y, z] },
        sceneVars: {
          ...gravity,
          progress,
          x,
          y,
          z,
          vx: v[0],
          vy: v[1],
          vz: v[2],
          qx: frame.q[0],
          qy: frame.q[1],
          qz: frame.q[2],
          qw: frame.q[3],
          turn: frame.turn,
          carry,
          lidOpen,
        },
      };
    },

    // Out through the lid once it gives; once the jam carries him, it does so
    // exactly at the end of the nominal duration.
    isComplete: (state) =>
      vars(state, 'progress') >= 1 ||
      (vars(state, 'lidOpen') === 1 && vars(state, 'carry') === 0 && vars(state, 'y') >= JAM_CEILING - JAM_EXIT.reach),
  };
}
