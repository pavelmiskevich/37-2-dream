/** Clamps to [min, max]; non-finite input (NaN from a bad event) becomes `min`. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return value === Infinity ? max : min;
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Interpolates in the log domain: perceptually even for pitches and tempos. */
export function expLerp(from: number, to: number, t: number): number {
  return from * Math.pow(to / from, t);
}

/** Hermite smoothstep: 0 below `edge0`, 1 above `edge1`, flat at both ends. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
