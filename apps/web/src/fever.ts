/**
 * Fever level: the one mapping from the hero's temperature (°C, from
 * `SimState.temperature`) to how strongly the dream shows it, 0..1. Every
 * manifestation of fever — the post pass (`Ps1Renderer.setFever`), the camera
 * sway (`feverSway`), the sound mix (`feverSoundMix`) — takes this level, so
 * they all grow together and are tuned in one place.
 */

/** Temperatures where the fever starts to show and where it is at full strength. */
export const FEVER_SCALE = {
  /** At or below this the dream looks and sounds calm. */
  calm: 37.0,
  /** At or above this every effect is at its maximum; the brain gives up around here. */
  full: 39.5,
} as const;

/**
 * 0 at `FEVER_SCALE.calm` and below, 1 at `FEVER_SCALE.full` and above,
 * linear in between: 37.2 → 0.08 (barely there), 38.5 → 0.6 (obvious),
 * 39.0 → 0.8. Non-finite input counts as calm.
 */
export function feverLevel(temperature: number): number {
  if (!Number.isFinite(temperature)) return 0;
  const level = (temperature - FEVER_SCALE.calm) / (FEVER_SCALE.full - FEVER_SCALE.calm);
  return Math.min(1, Math.max(0, level));
}
