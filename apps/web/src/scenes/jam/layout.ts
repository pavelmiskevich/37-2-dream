import { JAM_JAR, createSeededRng, streamKey, type JamFlavor, type Rng, type SceneOf } from '@dream/core';

/**
 * What hangs in the jam, decided once per scene. Pure: the layout depends
 * only on the scene and draws from the view's own stream `seed/scene/N/view`,
 * never from the simulation (rendering must not change the dream, D-005).
 *
 * The jar is the simulation's: bottom at y = 0, lid at `JAM_JAR.height`,
 * glass at `JAM_JAR.radius` around the vertical axis. Sizes are in metres;
 * the hero is small here.
 */

export type Vec3 = readonly [number, number, number];

/** A lemon the size of a meteorite, drifting round the jar. */
export interface LemonSlot {
  /** Centre at time 0. */
  position: Vec3;
  /** Length of the lemon, tip to tip, metres. */
  length: number;
  /** Initial rotation and tumble, radians and radians per second. */
  rotation: Vec3;
  spin: Vec3;
  /** Slow drift round the jar's axis, radians per second. */
  orbit: number;
}

/** A pip or a whole fruit suspended in the jam. */
export interface SuspendedSlot {
  position: Vec3;
  /** Overall size, metres. */
  size: number;
  rotation: Vec3;
  /** Phase of the slow bob. */
  phase: number;
}

export interface SpoonSlot {
  /** Direction from the axis to the bowl, radians (0 = −Z). */
  angle: number;
  /** Lean from the vertical, radians. */
  lean: number;
  /** Length, metres. */
  length: number;
}

export interface JamLayout {
  flavor: JamFlavor;
  lemons: LemonSlot[];
  pips: SuspendedSlot[];
  fruit: SuspendedSlot[];
  spoon: SpoonSlot;
  /** Direction from the axis to the middle of the label, radians (0 = −Z). */
  labelAngle: number;
}

export const LEMONS = { min: 3, max: 5, length: [3, 4.6] } as const;
export const PIPS = { count: 46, size: [0.18, 0.34] } as const;
export const FRUIT = { count: 9, size: [0.7, 1.3] } as const;
/** Things keep this far from the glass, the bottom and the lid, metres. */
const MARGIN = 0.4;
/** Where the hero comes to after the splash; lemons keep clear of it so he starts in the open. */
export const START: Vec3 = [0, JAM_JAR.startY, 0];
const CLEAR_START = 2.5;

/** A point inside the jar, at least `clear` from its boundary. */
function inside(rng: Rng, clear: number): Vec3 {
  const outer = JAM_JAR.radius - clear;
  // Uniform over the disc's area.
  const r = Math.sqrt(rng.next()) * outer;
  const a = rng.range(0, 2 * Math.PI);
  return [Math.sin(a) * r, rng.range(clear, JAM_JAR.height - clear), -Math.cos(a) * r];
}

const rotation = (rng: Rng): Vec3 => [rng.range(0, 2 * Math.PI), rng.range(0, 2 * Math.PI), rng.range(0, 2 * Math.PI)];
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function jamLayout(scene: SceneOf<'jam'>): JamLayout {
  const rng = createSeededRng(streamKey(scene.seed, 'view'));

  const lemons: LemonSlot[] = [];
  const count = rng.int(LEMONS.min, LEMONS.max);
  for (let attempt = 0; lemons.length < count && attempt < 200; attempt++) {
    const length = rng.range(...LEMONS.length);
    const position = inside(rng, length / 2 + MARGIN);
    if (distance(position, START) < CLEAR_START + length / 2) continue;
    // Meteorites do not touch: a little air between any two lemons.
    if (lemons.some((other) => distance(other.position, position) < (other.length + length) / 2 + 0.5)) continue;
    lemons.push({
      position,
      length,
      rotation: rotation(rng),
      spin: [rng.range(-0.08, 0.08), rng.range(-0.08, 0.08), rng.range(-0.08, 0.08)],
      orbit: rng.range(0.008, 0.02) * (rng.chance(0.5) ? 1 : -1),
    });
  }

  const suspended = (n: number, size: readonly [number, number]): SuspendedSlot[] =>
    Array.from({ length: n }, () => {
      const s = rng.range(...size);
      return { position: inside(rng, s + MARGIN), size: s, rotation: rotation(rng), phase: rng.range(0, 2 * Math.PI) };
    });

  return {
    flavor: scene.params.flavor,
    lemons,
    pips: suspended(PIPS.count, PIPS.size),
    fruit: suspended(FRUIT.count, FRUIT.size),
    spoon: { angle: rng.range(0, 2 * Math.PI), lean: rng.range(0.42, 0.55), length: rng.range(14, 15.5) },
    labelAngle: rng.range(0, 2 * Math.PI),
  };
}
