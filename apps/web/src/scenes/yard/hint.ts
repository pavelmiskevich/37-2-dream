import { SWING_HINT_MAX } from '@dream/core';

/**
 * How the yard calls the hero to the swing (#28) — only through the world:
 * the lamp over the swing burns brighter and starts to buzz, the rest of the
 * yard dims a little, the pigeons walk over to the swing and stare at it.
 * The swing itself swings harder (the rules do that) and creaks louder and
 * more often (`creakCue`). No text, no arrows (vision, "Не объяснять").
 *
 * Everything here is a pure function of the insistence level the rules keep
 * in `sceneVars.hint` (0…`SWING_HINT_MAX`); the view eases it with
 * `easeHint` so a new step glides in over a few seconds instead of popping.
 */

/** Levels per second the shown level moves towards the rules' level. */
export const HINT_EASE_RATE = 0.3;

/** What the yard looks like at a (smoothed) insistence level. */
export interface HintLook {
  /** 0…1: how much the lamp over the swing burns above an ordinary one. */
  lampGlow: number;
  /** 0…1: how hard that lamp buzzes and dips. */
  flicker: number;
  /** Brightness of the rest of the yard: 1 as usual, less when the swing calls. */
  dimming: number;
  /** 0…1: share of the pigeons gathered at the swing. */
  gathered: number;
}

/** Share of the yard's light left at the top level. */
export const DIMMEST = 0.5;
/** The lamp starts to buzz from this level on. */
export const FLICKER_FROM = 2;

export function hintLook(level: number): HintLook {
  const k = Math.min(1, Math.max(0, level / SWING_HINT_MAX));
  // Silent below the level before `FLICKER_FROM`, then growing to full at the top level.
  const buzz = (level - FLICKER_FROM + 1) / (SWING_HINT_MAX - FLICKER_FROM + 1);
  return {
    lampGlow: k,
    flicker: Math.min(1, Math.max(0, buzz)),
    dimming: 1 - (1 - DIMMEST) * k,
    // The first pigeons go at the first step; the whole flock by the top level.
    gathered: k,
  };
}

/** Moves the shown level towards `target` by at most `HINT_EASE_RATE · dt`. */
export function easeHint(shown: number, target: number, dt: number): number {
  const step = HINT_EASE_RATE * Math.max(0, dt);
  return Math.abs(target - shown) <= step ? target : shown + Math.sign(target - shown) * step;
}

/** A buzzing sodium lamp dips this often, seconds per cycle. */
export const FLICKER_CYCLE = 1.7;
/** Dips inside one cycle: [start, end] as shares of the cycle. Two dips per 1.7 s: well under three flashes a second (D-009). */
const DIPS: readonly (readonly [number, number])[] = [
  [0, 0.06],
  [0.32, 0.36],
];

/**
 * Brightness multiplier of the calling lamp at `time` seconds: 1 most of the
 * time, short dips when it buzzes. `flicker` 0…1 sets how deep they go.
 */
export function lampFlicker(time: number, flicker: number): number {
  if (flicker <= 0) return 1;
  const k = (((time / FLICKER_CYCLE) % 1) + 1) % 1;
  const dipping = DIPS.some(([a, b]) => k >= a && k < b);
  return dipping ? 1 - 0.75 * Math.min(1, flicker) : 1;
}

/**
 * Where pigeon `index` stands when it has come to the swing at
 * (`x`, `z`): on a ring around it, clear of the frame and the seat's sweep,
 * spread by the golden angle. No random draws: the view's stream stays as it was.
 */
export function gatherSpot(x: number, z: number, index: number): { x: number; z: number } {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const angle = index * golden + 0.4;
  const r = 2.3 + 0.7 * ((index * 0.618034) % 1);
  return { x: x + Math.cos(angle) * r, z: z + Math.sin(angle) * r };
}

/**
 * Whether pigeon `index` of `count` goes to the swing at a gathered share
 * `gathered`: the first ones go at once, the rest follow with the level.
 */
export function pigeonGoes(index: number, count: number, gathered: number): boolean {
  return gathered > 0 && index < Math.ceil(gathered * count - 1e-9);
}
