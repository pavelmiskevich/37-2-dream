import type { FilmLook } from '@dream/core';
import { clamp01, hash01, lerp, valueNoise } from './math';

/**
 * Film look (D-022): grain, exposure flicker, gate weave, vignette, soft
 * focus and fever, turned from the shot's 0…1 knobs into shader values.
 * Everything stays photographic: no pixelation, no colour quantisation.
 * Lengths are shares of the screen height.
 */

/** Grain and gate weave change with every frame of the virtual projector. */
export const FILM_FPS = 24;

export interface LookParams {
  /** Grain amplitude in display values. */
  grain: number;
  /** Exposure multiplier for this moment (flicker). */
  exposure: number;
  /** Gate weave offset of this film frame, shares of the screen height. */
  weaveX: number;
  weaveY: number;
  /** Soft-focus radius. */
  blur: number;
  /** Vignette strength, 0…1. */
  vignette: number;
  /** Fever: colour fringes at the edges, heat-haze warp, the picture "breathing". */
  aberration: number;
  warp: number;
  breath: number;
  /** Warm, sickly tint of fever, 0…1. */
  feverTint: number;
  /** Index of the film frame: seeds the grain. */
  frame: number;
}

/** Each effect at its knob's full value. Tuned to stay a photograph, not a filter. */
export const MAX_LOOK = {
  grain: 0.11,
  flicker: 0.14,
  weave: 0.0012,
  blur: 0.004,
  aberration: 0.007,
  warp: 0.0035,
  breath: 0.012,
} as const;

/** Every frame has a little grain and weave even when the shot asks for none: it is film. */
const BASE_GRAIN = 0.025;
const BASE_WEAVE = 0.0003;

/**
 * Exposure flicker, −1…1: a fast shimmer of the projector lamp plus rare
 * deeper dips, both a pure function of time.
 */
export function flickerAt(time: number, key = 0): number {
  const shimmer = valueNoise(time * 11, key * 3 + 1) * 0.6;
  const drift = valueNoise(time * 1.7, key * 3 + 2) * 0.25;
  // A dip roughly every few seconds, a couple of film frames long.
  const slot = Math.floor(time * 2.5);
  const dip = hash01(slot * 31 + key) > 0.86 ? -0.5 * Math.sin(((time * 2.5) % 1) * Math.PI) : 0;
  return Math.max(-1, Math.min(1, shimmer + drift + dip));
}

export function lookAt(look: FilmLook, time: number, key = 0): LookParams {
  const frame = Math.floor(time * FILM_FPS);
  const flicker = clamp01(look.flicker);
  const fever = clamp01(look.fever);
  const weave = BASE_WEAVE + MAX_LOOK.weave * flicker;
  return {
    grain: lerp(BASE_GRAIN, MAX_LOOK.grain, clamp01(look.grain)),
    exposure: 1 + MAX_LOOK.flicker * flicker * flickerAt(time, key),
    weaveX: weave * (hash01(frame * 2 + key * 7919) * 2 - 1),
    weaveY: weave * (hash01(frame * 2 + 1 + key * 7919) * 2 - 1),
    blur: MAX_LOOK.blur * clamp01(look.blur),
    vignette: clamp01(look.vignette),
    // As in render/fever.ts: the fringes ease in, so a mild fever stays clean.
    aberration: MAX_LOOK.aberration * fever ** 1.5,
    warp: MAX_LOOK.warp * fever,
    breath: MAX_LOOK.breath * fever,
    feverTint: fever,
    frame,
  };
}

/** Motion blur: the share of a film frame the shutter is open (180°). */
export const SHUTTER = 0.5 / FILM_FPS;
/** Motion blur never smears further than this, shares of the screen height. */
export const MAX_MOTION_BLUR = 0.02;
