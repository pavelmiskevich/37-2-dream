/**
 * Fever in the final pass (spec §20): chromatic aberration and a heat-haze
 * distortion, both growing with the fever level. Sizes are fractions of the
 * internal image height, so the look does not depend on the quality preset;
 * the shader rounds them to whole internal pixels, which keeps them PS1-blocky.
 */
export interface FeverPostParams {
  /** Red/blue split at the top and bottom edges (more in the corners, none in the centre). */
  readonly aberration: number;
  /** Amplitude of the sliding waves that bend rows and columns. */
  readonly warp: number;
  /** Depth of the slow zoom in and out, as a share of the image ("the picture breathes"). */
  readonly breath: number;
}

/** Strength of every effect at full fever. */
export const MAX_FEVER_POST: FeverPostParams = {
  aberration: 0.016,
  warp: 0.012,
  breath: 0.02,
};

export const NO_FEVER_POST: FeverPostParams = { aberration: 0, warp: 0, breath: 0 };

/** Post-pass parameters for fever level `fever` (0..1, see `feverLevel`). */
export function feverPostParams(fever: number): FeverPostParams {
  const level = Math.min(1, Math.max(0, Number.isFinite(fever) ? fever : 0));
  return {
    // The split eases in, so the baseline 37.2 stays clean.
    aberration: MAX_FEVER_POST.aberration * level ** 1.5,
    warp: MAX_FEVER_POST.warp * level,
    breath: MAX_FEVER_POST.breath * level,
  };
}
