import { clamp01 } from './math';

/**
 * The sharp breath of waking from a fall (#134, D-037): one short gasp in
 * through the mouth, the way one jerks awake from falling in a dream. Noise
 * through two mouth resonances that open up as the air rushes in, rising
 * fast and stopping dead at the top of the breath — the throat catches.
 */
export interface GaspShape {
  /** Whole gasp, seconds: the rush of air, then the catch. */
  duration: number;
  /** The air comes in over this long, louder all the way. */
  rise: number;
  /** The catch at the top: from full to silence, seconds. */
  catch: number;
  /** Peak level, 0…1. */
  gain: number;
  /** The mouth resonance glides up as it opens, Hz. */
  mouth: { fromHz: number; toHz: number; q: number };
  /** A higher, thinner hiss of the throat, Hz, and its share of the level. */
  throat: { hz: number; q: number; gain: number };
  /** Low breathy body under it, Hz, and its share. */
  body: { hz: number; gain: number };
}

export const GASP: Omit<GaspShape, 'gain'> = {
  duration: 0.42,
  rise: 0.34,
  catch: 0.05,
  mouth: { fromHz: 750, toHz: 1900, q: 1.6 },
  throat: { hz: 3100, q: 2.2, gain: 0.35 },
  body: { hz: 420, gain: 0.25 },
};

/** One gasp at `strength` 0…1; null for silence. */
export function gaspShape(strength = 1): GaspShape | null {
  const s = clamp01(strength);
  if (s === 0) return null;
  return { ...GASP, gain: s };
}

/** Level of the gasp `t` seconds in, 0…1 of its peak: a rush that is cut off. */
export function gaspLevel(shape: GaspShape, t: number): number {
  if (t <= 0 || t >= shape.duration) return 0;
  if (t <= shape.rise) {
    const x = t / shape.rise;
    // Starts at once (the jolt), then keeps filling.
    return 0.35 + 0.65 * x * x;
  }
  return Math.max(0, 1 - (t - shape.rise) / shape.catch);
}
