/**
 * Rules of the yard scene (spec §7, vision: slice step 2). The hero wakes up
 * in a courtyard between panel blocks; somewhere in it stands a swing. He
 * walks up to it, sits down with "use" and pumps it with rhythmic
 * forward/back input. The swing heats him up; once it flies high enough
 * *and* the thermometer shows 37.2 or more, he lets go, gravity turns
 * upside down and the dream moves on to the fall.
 *
 * The swing is a damped linear pendulum (D-005: own kinematics, no physics
 * engine), stepped with semi-implicit Euler. Pumping is a push along the
 * seat's facing: `pump * input.move[1]`. Its work per tick is
 * `push · speed`, so input in step with the swing (forward while it moves
 * forward, back while it moves back) feeds it, random input averages out and
 * a held key only shifts the rest position a little. Without input the swing
 * dies out with `damping`.
 *
 * Everything lives in `sceneVars` (keys in `YARD_VARS`); the app draws it.
 * The yard's geometry that the rules need — its bounds, the swing and the
 * hero's starting point — comes from `yardLayout`, a pure function of the
 * seed and the scene index on its own stream, so the view draws the swing
 * exactly where the rules put it.
 *
 * This module imports only types from `simulation.ts`, which registers the
 * rules; the constants it needs from there come through `YardEnv`, so the two
 * modules never import each other at run time.
 */
import { buttonBit } from './input';
import { clamp, lerp } from './math';
import type { DreamSeed } from './seed';
import type { SceneContext, SceneRules, SimState, Vec3 } from './simulation';
import { sceneRng } from './streams';
import { applyHeat, temperatureAtLeast } from './temperature';

/** What the yard rules take from the simulation. */
export interface YardEnv {
  /** Tick length, seconds. */
  readonly tickDt: number;
  /** Eye height of the standing hero, metres. */
  readonly eyeHeight: number;
  /** Pitch limit, radians. */
  readonly maxPitch: number;
}

/** The swing: geometry and the pendulum. Placeholders until the playtest. */
export const SWING = {
  /** Pivot (top bar) height above the asphalt, metres. */
  pivotHeight: 2.65,
  /** Pivot to seat along the chains, metres; sets the period (≈ 3 s). */
  chainLength: 2.2,
  /** Eye of the seated hero above the seat, along the chains, metres. */
  seatedEye: 0.8,
  /** Gravity for the pendulum, m/s². */
  gravity: 9.81,
  /** Velocity damping, 1/s: an amplitude halves in ≈ 5.5 s without input. */
  damping: 0.25,
  /** Angular push at full stick, rad/s². Steady amplitude with perfect pumping ≈ 1.33 rad. */
  pump: 0.55,
  /** Hard stop of the swing angle, radians (the chains never go over the bar). */
  maxAngle: 1.45,
  /** How close (horizontally, metres) the hero must stand to the seat to sit down. */
  reach: 1.5,
  /** The hero only sits on a swing moving less than this, radians. */
  sitBelow: 0.45,
  /** Seconds the hero takes to sit down: the camera glides onto the seat. */
  mountTime: 0.5,
  /** Share of the swing angle that tilts the hero's view. */
  viewTilt: 0.6,
  /** The empty swing keeps swinging by itself up to an amplitude in this range (by seed), radians. */
  emptyAmplitude: [0.06, 0.22],
  /** Push that keeps the empty swing going, rad/s². */
  emptyPush: 0.12,
} as const;

/** How the swing heats the hero: `rate * (amplitude / SWING_RELEASE.amplitude)²` °C per second, seated. */
export const SWING_HEAT = {
  rate: 0.06,
} as const;

/** The transition to the fall. */
export const SWING_RELEASE = {
  /** Amplitude the swing must reach, radians (≈ 52°). */
  amplitude: 0.9,
  /** And the thermometer must show at least this, °C ("НЕ ОТКРЫВАТЬ ПРИ ТЕМПЕРАТУРЕ НИЖЕ 37,2"). */
  temperature: 37.2,
  /** Seconds between letting go and the fall scene. */
  duration: 2.5,
  /** Upside-down gravity after letting go, m/s² upwards. */
  lift: 4,
  /** Pitch the hero's head settles to while flying up: looking down at the yard. */
  lookDown: -1.05,
  /** Rate of that settling, 1/s. */
  lookRate: 1.2,
} as const;

/** Keys of the yard's `sceneVars`. Absent keys read as 0. */
export const YARD_VARS = {
  /** Swing pivot on the ground plane, metres, and the seat's facing (player yaw convention). */
  swingX: 'swingX',
  swingZ: 'swingZ',
  swingYaw: 'swingYaw',
  /** Swing angle, radians; positive swings the seat forward (along its facing) and up. */
  angle: 'angle',
  /** Angular velocity, rad/s. */
  speed: 'speed',
  /** 1 while the hero sits on the swing. */
  seated: 'seated',
  /** 0..1: progress of sitting down (camera glide onto the seat). */
  mount: 'mount',
  /** Eye position and yaw where the hero sat down from, for the glide. */
  fromX: 'fromX',
  fromY: 'fromY',
  fromZ: 'fromZ',
  fromYaw: 'fromYaw',
  /** Yaw the hero turns to while sitting down (the seat's facing, unwrapped near his own). */
  toYaw: 'toYaw',
  /** The empty swing's own amplitude, radians (drawn on entering). */
  emptyAmplitude: 'emptyAmplitude',
  /** 1 once the hero has let go: the transition is running. */
  released: 'released',
  /** Seconds since letting go. */
  releaseTime: 'releaseTime',
  /** Walkable half-extents of the yard, metres (from `yardLayout`). */
  halfWidth: 'halfWidth',
  halfDepth: 'halfDepth',
  /** Eye position of the hero flying after letting go, metres. */
  flyX: 'flyX',
  flyY: 'flyY',
  flyZ: 'flyZ',
  /** Velocity of the hero after letting go, m/s. */
  vx: 'vx',
  vy: 'vy',
  vz: 'vz',
} as const;

type YardVar = keyof typeof YARD_VARS;

/** Where things are in the yard: what the rules need, shared with the view. */
export interface YardLayout {
  /** Walkable half-extents around the origin, metres (X across, Z along). */
  halfWidth: number;
  halfDepth: number;
  /** Swing pivot on the ground plane and the seat's facing (yaw). */
  swing: { x: number; z: number; yaw: number };
  /** Where the hero appears, eyes at standing height, and his heading. */
  start: { x: number; z: number; yaw: number };
}

/** Channel of the scene stream the layout is drawn from. */
export const YARD_LAYOUT_CHANNEL = 'layout';

/**
 * Layout of the yard of scene `sceneIndex` in the dream of `seed`. Pure, on
 * its own stream: the dream's generation and the simulation stream never see
 * these draws, and the view calls it to draw the same yard.
 */
export function yardLayout(seed: DreamSeed, sceneIndex: number): YardLayout {
  const rng = sceneRng(seed, sceneIndex, YARD_LAYOUT_CHANNEL);
  const halfWidth = Math.round(rng.range(13, 19) * 10) / 10;
  const halfDepth = Math.round(rng.range(11, 16) * 10) / 10;
  // The swing stands in the playground somewhere in the middle of the yard,
  // its frame turned a little off the buildings' grid.
  const swing = {
    x: Math.round(rng.range(-0.45, 0.45) * halfWidth * 10) / 10,
    z: Math.round(rng.range(-0.5, 0.1) * halfDepth * 10) / 10,
    yaw: Math.round(rng.range(-0.6, 0.6) * 100) / 100,
  };
  // The hero appears near the open side of the yard (+Z), more or less facing the swing.
  const startX = Math.round(rng.range(-0.5, 0.5) * halfWidth * 10) / 10;
  const startZ = Math.round((halfDepth - rng.range(1.5, 3)) * 10) / 10;
  const facing = Math.atan2(-(swing.x - startX), -(swing.z - startZ));
  const start = { x: startX, z: startZ, yaw: Math.round((facing + rng.range(-0.35, 0.35)) * 100) / 100 };
  return { halfWidth, halfDepth, swing, start };
}

const read = (state: SimState, key: YardVar): number => state.sceneVars[YARD_VARS[key]] ?? 0;

/** Angular frequency of the swing, rad/s. */
export const SWING_OMEGA = Math.sqrt(SWING.gravity / SWING.chainLength);

/** Amplitude of a swing at `angle` moving at `speed`: its energy as an angle. */
export function swingAmplitude(angle: number, speed: number): number {
  return Math.hypot(angle, speed / SWING_OMEGA);
}

/** Amplitude of the yard swing in `state`. */
export function yardSwingAmplitude(state: SimState): number {
  return swingAmplitude(read(state, 'angle'), read(state, 'speed'));
}

/**
 * One tick of the pendulum: `push` is the angular push, rad/s². Returns
 * `[angle, speed]`. Semi-implicit Euler keeps an undamped swing's energy
 * from creeping up over thousands of ticks.
 */
export function stepSwing(angle: number, speed: number, push: number, dt: number): [number, number] {
  let nextSpeed = speed + (-SWING_OMEGA * SWING_OMEGA * angle - SWING.damping * speed + push) * dt;
  let nextAngle = angle + nextSpeed * dt;
  if (Math.abs(nextAngle) > SWING.maxAngle) {
    nextAngle = Math.sign(nextAngle) * SWING.maxAngle;
    nextSpeed = 0;
  }
  return [nextAngle, nextSpeed];
}

/** Heat of the swing per second at `amplitude`, °C/s. */
export function swingHeatRate(amplitude: number): number {
  const k = amplitude / SWING_RELEASE.amplitude;
  return SWING_HEAT.rate * k * k;
}

/** The standing hero keeps this far from the buildings around the yard, metres. */
const WALL_MARGIN = 0.6;

/** Smooth 0..1 ease of the sitting-down glide. */
const ease = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/** Forward unit vector on the ground of a yaw (yaw 0 looks along −Z). */
const forwardOf = (yaw: number): [number, number] => [-Math.sin(yaw), -Math.cos(yaw)];

/** Eye of the hero sitting on a swing at `angle`. */
function seatedEye(state: SimState, angle: number): Vec3 {
  const [fx, fz] = forwardOf(read(state, 'swingYaw'));
  const r = SWING.chainLength - SWING.seatedEye;
  const out = Math.sin(angle) * r;
  return [read(state, 'swingX') + fx * out, SWING.pivotHeight - Math.cos(angle) * r, read(state, 'swingZ') + fz * out];
}

/** Pitch the swing adds to the seated hero's own. */
const seatTilt = (angle: number, mount: number): number => SWING.viewTilt * angle * ease(mount);

/** True when the yard's transition condition holds right now. */
export function swingReleaseReady(state: SimState): boolean {
  return (
    read(state, 'seated') === 1 &&
    read(state, 'mount') >= 1 &&
    yardSwingAmplitude(state) >= SWING_RELEASE.amplitude &&
    temperatureAtLeast(state, SWING_RELEASE.temperature)
  );
}

/** Yard rules for the given simulation constants. */
export function createYardRules(env: YardEnv): SceneRules {
  const use = buttonBit('use');
  const dt = env.tickDt;
  const clampPitch = (pitch: number) => clamp(pitch, -env.maxPitch, env.maxPitch);

  const set = (state: SimState, values: Partial<Record<YardVar, number>>): SimState => {
    const vars: Record<string, number> = { ...state.sceneVars };
    for (const [key, value] of Object.entries(values) as [YardVar, number][]) vars[YARD_VARS[key]] = value;
    return { ...state, sceneVars: vars };
  };

  /** Standing hero: he has walked already (the simulation did it), within the yard; maybe he sits down. */
  const standing = (state: SimState, context: SceneContext): SimState => {
    const [x, y, z] = state.player.position;
    const w = read(state, 'halfWidth') - WALL_MARGIN;
    const d = read(state, 'halfDepth') - WALL_MARGIN;
    const walked: SimState = {
      ...state,
      player: { ...state.player, position: [clamp(x, -w, w), y, clamp(z, -d, d)] },
    };
    if (!(context.pressed & use) || yardSwingAmplitude(walked) > SWING.sitBelow) return walked;
    const dx = walked.player.position[0] - read(walked, 'swingX');
    const dz = walked.player.position[2] - read(walked, 'swingZ');
    if (Math.hypot(dx, dz) > SWING.reach) return walked;
    // Turn to the seat's facing the short way round: yaw is never wrapped.
    const swingYaw = read(walked, 'swingYaw');
    const turns = Math.round((walked.player.yaw - swingYaw) / (2 * Math.PI));
    return set(walked, {
      seated: 1,
      mount: 0,
      fromX: walked.player.position[0],
      fromY: walked.player.position[1],
      fromZ: walked.player.position[2],
      fromYaw: walked.player.yaw,
      toYaw: swingYaw + turns * 2 * Math.PI,
    });
  };

  return {
    enter(state, context) {
      const layout = yardLayout(context.dream.seed, context.scene.index);
      const empty = context.rng.range(SWING.emptyAmplitude[0], SWING.emptyAmplitude[1]);
      return {
        ...state,
        player: { position: [layout.start.x, env.eyeHeight, layout.start.z], yaw: layout.start.yaw, pitch: 0 },
        sceneVars: {
          [YARD_VARS.swingX]: layout.swing.x,
          [YARD_VARS.swingZ]: layout.swing.z,
          [YARD_VARS.swingYaw]: layout.swing.yaw,
          // The empty swing is already swinging when the hero arrives.
          [YARD_VARS.angle]: empty,
          [YARD_VARS.speed]: 0,
          [YARD_VARS.emptyAmplitude]: empty,
          [YARD_VARS.halfWidth]: layout.halfWidth,
          [YARD_VARS.halfDepth]: layout.halfDepth,
        },
      };
    },

    update(state, context) {
      const angle = read(state, 'angle');
      const speed = read(state, 'speed');
      const seated = read(state, 'seated') === 1;
      const released = read(state, 'released') === 1;

      if (released) {
        // Flying up: gravity points to the sky now; the empty swing swings on below.
        const [nextAngle, nextSpeed] = stepSwing(angle, speed, 0, dt);
        const vy = read(state, 'vy') + SWING_RELEASE.lift * dt;
        const fly: Vec3 = [
          read(state, 'flyX') + read(state, 'vx') * dt,
          read(state, 'flyY') + vy * dt,
          read(state, 'flyZ') + read(state, 'vz') * dt,
        ];
        // The head sinks to look down at the yard falling away; the mouse still turns it.
        const pitch = clampPitch(
          state.player.pitch + (SWING_RELEASE.lookDown - state.player.pitch) * Math.min(1, SWING_RELEASE.lookRate * dt),
        );
        return set(
          { ...state, player: { ...state.player, position: fly, pitch } },
          {
            angle: nextAngle,
            speed: nextSpeed,
            vy,
            flyX: fly[0],
            flyY: fly[1],
            flyZ: fly[2],
            releaseTime: read(state, 'releaseTime') + dt,
          },
        );
      }

      if (!seated) {
        // The empty swing keeps itself going, a little: nobody pushes it.
        const amplitude = swingAmplitude(angle, speed);
        const push = amplitude < read(state, 'emptyAmplitude') ? SWING.emptyPush * Math.sign(speed) : 0;
        const [nextAngle, nextSpeed] = stepSwing(angle, speed, push, dt);
        return standing(set(state, { angle: nextAngle, speed: nextSpeed }), context);
      }

      // Seated: pumping. Getting off with "use" once settled.
      const mount = read(state, 'mount');
      if (mount >= 1 && context.pressed & use) {
        const [fx, fz] = forwardOf(read(state, 'swingYaw'));
        const seat = seatedEye(state, angle);
        const [nextAngle, nextSpeed] = stepSwing(angle, speed, 0, dt);
        return set(
          {
            ...state,
            player: {
              ...state.player,
              position: [seat[0] + fx * 0.6, env.eyeHeight, seat[2] + fz * 0.6],
              pitch: clampPitch(state.player.pitch - seatTilt(angle, mount)),
            },
          },
          { seated: 0, mount: 0, angle: nextAngle, speed: nextSpeed },
        );
      }

      const push = mount >= 1 ? SWING.pump * context.input.move[1] : 0;
      const [nextAngle, nextSpeed] = stepSwing(angle, speed, push, dt);
      const nextMount = Math.min(1, mount + dt / SWING.mountTime);
      const e = ease(nextMount);
      const eye = seatedEye(state, nextAngle);
      const from: Vec3 = [read(state, 'fromX'), read(state, 'fromY'), read(state, 'fromZ')];
      const position: Vec3 = [lerp(from[0], eye[0], e), lerp(from[1], eye[1], e), lerp(from[2], eye[2], e)];
      // While sitting down the hero turns to the seat's facing; then the mouse is his again.
      const yaw = nextMount < 1 || mount < 1 ? lerp(read(state, 'fromYaw'), read(state, 'toYaw'), e) : state.player.yaw;
      // The view rides the swing: remove last tick's tilt, add this tick's.
      const pitch = clampPitch(state.player.pitch - seatTilt(angle, mount) + seatTilt(nextAngle, nextMount));

      let next = set({ ...state, player: { position, yaw, pitch } }, { angle: nextAngle, speed: nextSpeed, mount: nextMount });
      next = applyHeat(next, swingHeatRate(swingAmplitude(nextAngle, nextSpeed)) * dt);

      if (swingReleaseReady(next)) {
        // Let go: off the seat with its velocity, along the chains' tangent.
        const [fx, fz] = forwardOf(read(next, 'swingYaw'));
        const tangential = nextSpeed * (SWING.chainLength - SWING.seatedEye);
        next = set(next, {
          released: 1,
          releaseTime: 0,
          vx: fx * Math.cos(nextAngle) * tangential,
          vy: Math.sin(nextAngle) * tangential,
          vz: fz * Math.cos(nextAngle) * tangential,
          flyX: position[0],
          flyY: position[1],
          flyZ: position[2],
        });
      }
      return next;
    },

    isComplete(state) {
      return read(state, 'released') === 1 && read(state, 'releaseTime') >= SWING_RELEASE.duration - 1e-9;
    },
  };
}
