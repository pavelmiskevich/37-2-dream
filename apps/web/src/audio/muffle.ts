import { clamp01, expLerp } from './math';

/**
 * Muffling of the whole mix: one low-pass filter in front of the limiter, as
 * if the dream were heard through something — a wall, water, a jar of jam.
 * `amount` 0 leaves the sound open, 1 muffles it as much as the dream ever
 * does. The cutoff moves in the log domain, so equal steps of `amount` sound
 * like equal steps of muffling.
 */
export const MUFFLE = {
  /** Cutoff with no muffling, Hz: above hearing, the filter is transparent. */
  open: 20_000,
  /** Cutoff at full muffling, Hz: speech is gone, breathing and thumps remain. */
  closed: 280,
  /** Resonance of the filter: a gentle, non-ringing slope. */
  q: 0.7,
  /** Time constant of a change of muffling, seconds: a dive, not a switch. */
  glide: 0.6,
} as const;

/** Cutoff frequency for muffling `amount` (0..1); non-finite input counts as open. */
export function muffleCutoff(amount: number): number {
  return expLerp(MUFFLE.open, MUFFLE.closed, Number.isFinite(amount) ? clamp01(amount) : 0);
}
