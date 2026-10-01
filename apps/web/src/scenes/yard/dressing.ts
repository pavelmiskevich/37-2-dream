import type { BuildingFloors, Rng, YardLayout, YardParams } from '@dream/core';

/**
 * Where the view puts everything that does not take part in the rules: the
 * panel blocks around the yard, lamps, the bench, the bins, parked cars,
 * pigeons and the path of the woman with the vacuum cleaner. A pure function
 * of the layout (shared with the rules), the scene params and the view's own
 * random stream, so the same seed always dresses the yard the same way.
 */

/** Panel block: a box standing outside the yard, its facade turned to it. */
export interface BlockPlan {
  /** Centre of the footprint, metres. */
  x: number;
  z: number;
  /** Rotation about Y; the facade (local +Z) faces the yard. */
  yaw: number;
  /** Along the facade and across, metres. */
  length: number;
  depth: number;
  floors: number;
  /** Facade cell with the hero's own window: [floor (1-based), column]; only on the main block. */
  home?: readonly [number, number];
}

export interface Spot {
  x: number;
  z: number;
  yaw: number;
}

export interface WomanPass {
  /** Scene time she appears, seconds. */
  start: number;
  /** Seconds to cross. */
  duration: number;
  /** +1 crosses towards +X, −1 towards −X. */
  direction: 1 | -1;
}

export interface YardDressing {
  blocks: BlockPlan[];
  lamps: Spot[];
  benches: Spot[];
  /** A row of bins: the first one's spot, the rest follow along its yaw. */
  bins: Spot & { count: number };
  cars: (Spot & { color: number })[];
  sandbox: Spot;
  /** Centre of the flock and the number of pigeons. */
  pigeons: Spot & { count: number };
  /** The woman glides along `z` from −`halfSpan` to `halfSpan` (or back). */
  woman: { z: number; halfSpan: number; passes: WomanPass[] };
}

export const FLOOR_HEIGHT = 2.8;
export const BLOCK_DEPTH = 12;
/** Window columns are this far apart along a facade, metres. */
export const WINDOW_PITCH = 3;
/** The woman's gliding speed, m/s: unhurried, she is cleaning. */
export const WOMAN_SPEED = 0.55;

const CAR_COLORS = [0xd8d0b8, 0x7a2a22, 0x3a5a7a, 0x4a6a3a, 0xc8b070, 0x6a6a70] as const;

interface Circle {
  x: number;
  z: number;
  r: number;
}

/** Height of a block in metres for `floors` floors. */
export function blockHeight(floors: number): number {
  return floors * FLOOR_HEIGHT;
}

export function dressYard(layout: YardLayout, params: YardParams, rng: Rng): YardDressing {
  const { halfWidth: w, halfDepth: d, swing } = layout;
  const taken: Circle[] = [
    // The swing frame and the space it swings through.
    { x: swing.x, z: swing.z, r: 3.6 },
    { x: layout.start.x, z: layout.start.z, r: 1.6 },
  ];
  const free = (x: number, z: number, r: number) =>
    Math.abs(x) <= w - r && Math.abs(z) <= d - r && taken.every((c) => Math.hypot(c.x - x, c.z - z) >= c.r + r);
  /** Tries random spots from `propose`; the last try is kept even if crowded. */
  const place = (r: number, propose: () => Spot): Spot => {
    let spot = propose();
    for (let i = 0; i < 24 && !free(spot.x, spot.z, r); i++) spot = propose();
    taken.push({ x: spot.x, z: spot.z, r });
    return spot;
  };

  // Blocks: the main one behind the yard, two on the sides, a far one across the street.
  const sideFloors = (): BuildingFloors => rng.pick<BuildingFloors>([params.buildingFloors, params.buildingFloors, 5, 9]);
  const half = BLOCK_DEPTH / 2;
  const mainLength = 2 * w + 2 * BLOCK_DEPTH;
  const columns = Math.floor(mainLength / WINDOW_PITCH);
  const blocks: BlockPlan[] = [
    {
      x: 0,
      z: -d - half,
      yaw: 0,
      length: mainLength,
      depth: BLOCK_DEPTH,
      floors: params.buildingFloors,
      home: [Math.min(params.homeFloor, params.buildingFloors), rng.int(2, Math.max(2, columns - 3))],
    },
    { x: -w - half, z: 0, yaw: Math.PI / 2, length: 2 * d, depth: BLOCK_DEPTH, floors: sideFloors() },
  ];
  // Sometimes the right side is open: the next block stands further off, in the fog.
  const rightGap = rng.chance(0.35) ? rng.range(10, 22) : 0;
  blocks.push({ x: w + half + rightGap, z: 0, yaw: -Math.PI / 2, length: 2 * d, depth: BLOCK_DEPTH, floors: sideFloors() });
  blocks.push({
    x: rng.range(-8, 8),
    z: d + half + rng.range(14, 24),
    yaw: Math.PI,
    length: 2 * w + rng.range(10, 30),
    depth: BLOCK_DEPTH,
    floors: sideFloors(),
  });

  // The playground: a sandbox next to the swing.
  const sandbox = place(1.6, () => {
    const angle = rng.range(0, Math.PI * 2);
    return { x: swing.x + Math.cos(angle) * 4.6, z: swing.z + Math.sin(angle) * 4.6, yaw: rng.range(-0.3, 0.3) };
  });

  // A bench or two, facing the playground.
  const benches: Spot[] = [];
  const benchCount = rng.int(1, 2);
  for (let i = 0; i < benchCount; i++) {
    benches.push(
      place(1.3, () => {
        const angle = rng.range(0, Math.PI * 2);
        const r = rng.range(6, 9);
        const x = swing.x + Math.cos(angle) * r;
        const z = swing.z + Math.sin(angle) * r;
        // Seat faces the swing: its front (local +Z) points at it.
        return { x, z, yaw: Math.atan2(swing.x - x, swing.z - z) };
      }),
    );
  }

  // Bins in a row along one of the side walls.
  const side = rng.chance(0.5) ? -1 : 1;
  const binCount = rng.int(2, 4);
  const binsSpot = place(1.4 * binCount, () => ({
    x: side * (w - 1.2),
    z: rng.range(-d * 0.7, d * 0.6),
    yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2,
  }));

  // Lamps along the edges of the yard.
  const lamps: Spot[] = [];
  const lampCount = rng.int(3, 5);
  for (let i = 0; i < lampCount; i++) {
    lamps.push(
      place(0.8, () => {
        const edge = rng.int(0, 3);
        const t = rng.range(-0.8, 0.8);
        if (edge === 0) return { x: t * w, z: -d + 1.2, yaw: 0 };
        if (edge === 1) return { x: t * w, z: d - 1.2, yaw: Math.PI };
        if (edge === 2) return { x: -w + 1.2, z: t * d, yaw: Math.PI / 2 };
        return { x: w - 1.2, z: t * d, yaw: -Math.PI / 2 };
      }),
    );
  }

  // Parked cars along the open front edge.
  const cars: YardDressing['cars'] = [];
  const carCount = rng.int(1, 3);
  for (let i = 0; i < carCount; i++) {
    const spot = place(2.4, () => ({ x: rng.range(-w + 3, w - 3), z: d - 1.6, yaw: Math.PI / 2 + rng.range(-0.08, 0.08) }));
    cars.push({ ...spot, color: rng.pick(CAR_COLORS) });
  }

  // Pigeons: usually by a bench, where somebody fed them.
  const nearBench = benches[0]!;
  const pigeons = {
    x: nearBench.x + rng.range(-1.5, 1.5),
    z: nearBench.z + rng.range(-1.5, 1.5),
    yaw: 0,
    count: rng.int(5, 12),
  };

  // The woman with the vacuum cleaner crosses the far side of the yard.
  const halfSpan = w - 1;
  const duration = (2 * halfSpan) / WOMAN_SPEED;
  const passes: WomanPass[] = [];
  let at = rng.range(5, 12);
  let direction: 1 | -1 = rng.chance(0.5) ? 1 : -1;
  for (let i = 0; i < params.vacuumPasses; i++) {
    passes.push({ start: at, duration, direction });
    at += duration + rng.range(8, 25);
    direction = direction === 1 ? -1 : 1;
  }

  return {
    blocks,
    lamps,
    benches,
    bins: { ...binsSpot, count: binCount },
    cars,
    sandbox,
    pigeons,
    woman: { z: -d + rng.range(1.6, 3), halfSpan, passes },
  };
}

/**
 * Where the woman is at scene time `time`: her x along the far side, or
 * null when she is not in the yard.
 */
export function womanAt(woman: YardDressing['woman'], time: number): { x: number; direction: 1 | -1 } | null {
  for (const pass of woman.passes) {
    const t = (time - pass.start) / pass.duration;
    if (t < 0 || t > 1 + 1e-9) continue;
    return { x: pass.direction * (-woman.halfSpan + 2 * woman.halfSpan * t), direction: pass.direction };
  }
  return null;
}
