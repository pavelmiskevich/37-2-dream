/**
 * Seeded pseudo-random numbers: a string key is hashed with cyrb128 into a
 * 128-bit state for the sfc32 generator. Both use only 32-bit integer
 * arithmetic, so results are identical on every JS engine and platform.
 */

/** Full generator state: four unsigned 32-bit integers. */
export type RngState = readonly [number, number, number, number];

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform unsigned 32-bit integer. */
  nextUint32(): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** True with probability `p`; `p <= 0` never, `p >= 1` always. */
  chance(p: number): boolean;
  /** Uniformly chosen element; throws on an empty list. */
  pick<T>(items: readonly T[]): T;
  /** Snapshot of the current state; `rngFromState` resumes from it exactly. */
  state(): RngState;
}

const UINT32_RANGE = 0x1_0000_0000;
/** Outputs discarded after seeding so that similar keys diverge fully. */
const WARM_UP = 15;

/** cyrb128: hashes a string into four unsigned 32-bit words. */
export function hashString(key: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < key.length; i++) {
    const k = key.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Resumes a generator from a state captured with `Rng.state()`. */
export function rngFromState(state: RngState): Rng {
  let [a, b, c, d] = state;

  const nextUint32 = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  const next = (): number => nextUint32() / UINT32_RANGE;

  return {
    next,
    nextUint32,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
        throw new RangeError(`rng.int: invalid bounds [${min}, ${max}].`);
      }
      return min + Math.floor(next() * (max - min + 1));
    },
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new RangeError('rng.pick: empty list.');
      return items[Math.floor(next() * items.length)] as T;
    },
    state: () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
  };
}

/** Creates a generator whose whole output is determined by `key`. */
export function createSeededRng(key: string): Rng {
  const rng = rngFromState(hashString(key));
  for (let i = 0; i < WARM_UP; i++) rng.nextUint32();
  return rng;
}
