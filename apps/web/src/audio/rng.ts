/**
 * Local seeded PRNG for audio. Sound must be reproducible from the dream seed,
 * so nothing in the audio module uses Math.random. Audio has its own streams
 * and never draws from the simulation RNG: turning sound on or off must not
 * change the dream.
 */

/** Seed as it comes from the dream (e.g. "DREAM-8F72-A19C-37B2") or a number. */
export type AudioSeed = string | number;

/** Returns a float in [0, 1). */
export type Rng = () => number;

/** 32-bit FNV-1a hash. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function seedToUint32(seed: AudioSeed): number {
  if (typeof seed === 'string') return hashString(seed);
  return Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
}

/** Mulberry32: tiny, fast and good enough for noise and parameter jitter. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Independent stream for one purpose ("noise:white", "profile", ...). Streams
 * do not depend on the order in which they are requested.
 */
export function deriveRng(seed: AudioSeed, stream: string): Rng {
  return createRng(hashString(`${seedToUint32(seed)}:${stream}`));
}

export function randomIn(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}
