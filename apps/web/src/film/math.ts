export { clamp, clamp01, lerp, smoothstep } from '../audio/math';

/** 32-bit integer hash → [0, 1). Cheap, stateless, the same in GLSL-free code paths and tests. */
export function hash01(n: number): number {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in −1…1 over `t` (one random knot per unit), keyed by `key`. */
export function valueNoise(t: number, key: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const a = hash01(i * 7919 + key * 104729) * 2 - 1;
  const b = hash01((i + 1) * 7919 + key * 104729) * 2 - 1;
  const s = f * f * (3 - 2 * f);
  return a + (b - a) * s;
}
