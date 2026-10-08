import type { CutKind, Shot } from '@dream/core';
import { clamp01, smoothstep } from './math';

/**
 * Timing of the film on the player clock: which shot is on screen, how the
 * cuts between shots look at a given moment and how a scare hits. Pure: the
 * same film, settings and time always give the same picture.
 */

export interface PlayerSettings {
  /** "Без вспышек" (D-009): no white flashes, softened scares. */
  noFlash: boolean;
}

/** D-009: no more than three flashes a second. */
export const MIN_FLASH_GAP = 1 / 3;

export interface ShotAt {
  index: number;
  shot: Shot;
  /** Seconds since the shot started. */
  local: number;
  /** 0…1 through the shot. */
  progress: number;
}

/** The shot on screen at film time `t`; before the start — the first, after the end — the last. */
export function shotAt(shots: readonly Shot[], t: number): ShotAt | null {
  if (shots.length === 0) return null;
  let lo = 0;
  let hi = shots.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (shots[mid]!.start <= t) lo = mid;
    else hi = mid - 1;
  }
  const shot = shots[lo]!;
  const local = Math.max(0, Math.min(shot.duration, t - shot.start));
  return { index: lo, shot, local, progress: shot.duration > 0 ? local / shot.duration : 1 };
}

/**
 * A cut as the player shows it. The transition is centred on the boundary
 * between two shots: the outgoing shot owns the part before it, the incoming
 * one the part after. A cut into a scare happens entirely before the scare
 * (the scare itself always enters hard), and the last cut of the film ends it.
 */
export interface PlannedCut {
  /** Index of the shot the cut leaves. */
  shot: number;
  /** Boundary: end of the outgoing shot, start of the next one. */
  at: number;
  /** Kind after the safety rules (`flash` may have become `fade`). */
  kind: CutKind;
  /** Window of the transition, `from ≤ at ≤ to`. */
  from: number;
  to: number;
}

export interface FilmPlan {
  cuts: PlannedCut[];
  /** Per shot: whether its scare may open with a white flash. */
  scareFlash: boolean[];
}

/**
 * Applies the player rules to the film's cuts and scares: windows around the
 * boundaries, "без вспышек" and the D-009 flash rate (a flash closer than
 * `MIN_FLASH_GAP` to the previous one becomes a fade; a scare flash is
 * simply dropped).
 */
export function planFilm(shots: readonly Shot[], settings: PlayerSettings): FilmPlan {
  const cuts: PlannedCut[] = [];
  const scareFlash: boolean[] = [];
  let lastFlash = -Infinity;
  const flashFits = (time: number) => !settings.noFlash && time - lastFlash >= MIN_FLASH_GAP - 1e-9;

  shots.forEach((shot, i) => {
    // The scare opens its shot, so its flash comes before this shot's cut.
    const scareFlashes = shot.scare && flashFits(shot.start);
    if (scareFlashes) lastFlash = shot.start;
    scareFlash.push(scareFlashes);

    const next = shots[i + 1];
    const at = shot.start + shot.duration;
    const length = shot.cutOut === 'hard' ? 0 : Math.max(0, shot.cutDuration);
    let before: number;
    let after: number;
    if (!next || next.scare) {
      before = Math.min(length, shot.duration / 2);
      after = 0;
    } else {
      before = Math.min(length / 2, shot.duration / 2);
      after = Math.min(length / 2, next.duration / 2);
    }

    let kind: CutKind = before + after > 0 ? shot.cutOut : 'hard';
    if (kind === 'flash') {
      if (flashFits(at)) lastFlash = at;
      else kind = 'fade';
    }
    cuts.push({ shot: i, at, kind, from: at - before, to: at + after });
  });
  return { cuts, scareFlash };
}

/** What the cut puts over the picture at a moment, each 0…1. */
export interface CutOverlay {
  /** Through black (`fade`). */
  black: number;
  /** White flash (`flash`). */
  white: number;
  /** Eyelids closing (`blink`): 0 open, 1 shut. */
  lids: number;
}

export const NO_OVERLAY: Readonly<CutOverlay> = { black: 0, white: 0, lids: 0 };

/**
 * Envelope of one cut at time `t`. Before the boundary it closes (towards
 * black, white or shut lids), after it opens again on the next shot.
 */
export function cutOverlay(cut: PlannedCut, t: number): CutOverlay {
  if (cut.kind === 'hard' || t < cut.from || t > cut.to) return NO_OVERLAY;
  const closing = t < cut.at;
  // 0 at the window edge, 1 at the boundary.
  const depth = closing
    ? cut.at > cut.from
      ? clamp01((t - cut.from) / (cut.at - cut.from))
      : 1
    : cut.to > cut.at
      ? clamp01((cut.to - t) / (cut.to - cut.at))
      : 0;
  switch (cut.kind) {
    case 'fade':
      return { black: smoothstep(0, 1, depth), white: 0, lids: 0 };
    case 'flash':
      // A flash bursts in at the very end and fades out slower than it came.
      return { black: 0, white: closing ? depth ** 3 : depth ** 1.6, lids: 0 };
    case 'blink':
      // The lids hang shut for a moment around the boundary.
      return { black: 0, white: 0, lids: smoothstep(0, 0.85, depth) };
  }
}

/** Overlay of whichever cut covers `t` (windows never overlap). */
export function overlayAt(cuts: readonly PlannedCut[], t: number): CutOverlay {
  for (const cut of cuts) {
    if (t < cut.from) break;
    if (t <= cut.to) return cutOverlay(cut, t);
  }
  return NO_OVERLAY;
}

/** How a scare shot hits at `local` seconds into it. */
export interface ScareState {
  /** Contrast, exposure and zoom punch, 0…1. */
  punch: number;
  /** White flash at the onset, 0…1 (0 without a flash). */
  flash: number;
  /** Camera shake amplitude, 0…1. */
  shake: number;
}

export const NO_SCARE: Readonly<ScareState> = { punch: 0, flash: 0, shake: 0 };

/** The softened scare (D-009) eases in over this long instead of hitting at once. */
export const SOFT_SCARE_RISE = 0.12;
/** Length of the onset flash. */
export const SCARE_FLASH = 0.06;

export function scareAt(shot: Shot, local: number, flash: boolean, settings: PlayerSettings): ScareState {
  if (!shot.scare || local < 0 || local > shot.duration) return NO_SCARE;
  const decay = 1 - 0.4 * clamp01(local / Math.max(shot.duration, 1e-3));
  if (settings.noFlash) {
    // Softened: no flash, no shake, a dimmer frame that fades in.
    return { punch: 0.45 * smoothstep(0, SOFT_SCARE_RISE, local) * decay, flash: 0, shake: 0 };
  }
  return {
    punch: decay,
    flash: flash ? 1 - smoothstep(0, SCARE_FLASH, local) : 0,
    shake: decay,
  };
}
