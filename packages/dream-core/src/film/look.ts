/**
 * How a shot moves, looks and hands over (D-023): camera, depth parallax,
 * film look with fever, and the cut at its end. Everything follows the beat
 * and its tension, so long waiting shots creep in slowly, the climax shakes
 * and flickers, and the fever burns hottest at the peaks of tension.
 */
import { weightedPick } from '../catalog';
import { clamp, clamp01, lerp, round } from '../math';
import type { DreamProfile } from '../profile';
import type { Rng } from '../rng';
import type { BeatRole } from './beats';
import type { CameraMove, CutKind, DreamLength, FilmLook } from './film';

type CameraKind = CameraMove['kind'];

const CAMERA_WEIGHTS: Readonly<Record<BeatRole, Readonly<Partial<Record<CameraKind, number>>>>> = {
  opening: { drift: 3, push: 2, still: 1, pull: 1 },
  build: { push: 3, drift: 2, sway: 1.5 },
  // The shot that lasts too long: a slow creep towards something.
  anticipation: { push: 5, still: 1 },
  false_alarm: { sway: 2, push: 1, still: 1 },
  release: { pull: 2, drift: 2, still: 1.5 },
  scare: { push: 2, still: 2 },
  recovery: { drift: 2, pull: 2, sway: 1 },
  climax: { sway: 3, push: 3, drift: 1 },
};

/** Largest centre offset that keeps the frame edges out of view at `zoom`. */
function panLimit(zoom: number): number {
  return Math.max(0, 1 - 1 / zoom) * 0.9;
}

/** A rounded frame coordinate; `+ 0` turns `-0` into `0`, which JSON cannot tell apart. */
function coord(value: number): number {
  return round(value, 3) + 0;
}

function point(limit: number, rng: Rng): [number, number] {
  return [coord(rng.range(-limit, limit)), coord(rng.range(-limit, limit))];
}

export function cameraFor(role: BeatRole, tension: number, ms: number, rng: Rng): CameraMove {
  const kinds = Object.entries(CAMERA_WEIGHTS[role]) as [CameraKind, number][];
  const [kind] = weightedPick(kinds, ([, weight]) => weight, rng);
  const seconds = ms / 1000;
  // Zoom per second: creeping when calm, lunging at the peaks.
  const rate = role === 'anticipation' ? rng.range(0.02, 0.04) : lerp(0.012, 0.07, tension) * rng.range(0.7, 1.3);
  const travel = clamp(rate * seconds, 0.03, role === 'scare' ? 0.25 : 0.35);
  const sway = round(clamp01(lerp(0.03, 0.45, tension) * rng.range(0.5, 1.2) + (kind === 'sway' ? 0.4 : 0)), 3);

  let zoomFrom: number;
  let zoomTo: number;
  switch (kind) {
    case 'push':
      zoomFrom = rng.range(1, 1.1);
      zoomTo = zoomFrom + travel;
      break;
    case 'pull':
      zoomTo = rng.range(1, 1.08);
      zoomFrom = zoomTo + travel;
      break;
    case 'drift':
    case 'sway':
      zoomFrom = rng.range(1.1, 1.22);
      zoomTo = zoomFrom + rng.range(-0.02, 0.02);
      break;
    case 'still':
      zoomFrom = rng.range(1.02, 1.08);
      zoomTo = zoomFrom;
      break;
  }
  zoomFrom = round(zoomFrom, 3);
  zoomTo = round(zoomTo, 3);
  const limit = Math.floor(panLimit(Math.min(zoomFrom, zoomTo)) * 1000) / 1000;
  const panFrom = point(limit, rng);
  // A drift travels across the frame; the other moves barely shift their centre.
  const reach = kind === 'drift' ? 1 : 0.25;
  const panTo: [number, number] = [
    coord(clamp(panFrom[0] + rng.range(-limit, limit) * reach, -limit, limit)),
    coord(clamp(panFrom[1] + rng.range(-limit, limit) * reach * 0.5, -limit, limit)),
  ];
  return { kind, zoomFrom, zoomTo, panFrom, panTo, sway };
}

/** Depth parallax: strongest on long slow shots and in unstable dreams; 0 without a depth map. */
export function parallaxFor(role: BeatRole, ms: number, hasDepth: boolean, profile: DreamProfile, rng: Rng): number {
  const roll = rng.next();
  if (!hasDepth) return 0;
  const slow = clamp01(ms / 6000);
  const base = role === 'scare' ? 0.1 : lerp(0.2, 0.55, roll) + slow * 0.25;
  return round(clamp01(base + profile.physicsInstability * 0.2), 3);
}

export function lookFor(role: BeatRole, tension: number, profile: DreamProfile, rng: Rng): FilmLook {
  const soft = role === 'release' || role === 'recovery' ? rng.range(0.2, 0.4) : role === 'opening' ? rng.range(0.1, 0.25) : 0;
  const motion = role === 'climax' ? rng.range(0.1, 0.3) * tension : rng.range(0, 0.12);
  const fever = 0.05 + 0.75 * tension ** 1.4 * lerp(0.7, 1.1, profile.anxiety) + rng.range(-0.04, 0.04);
  return {
    grain: round(clamp01(lerp(0.3, 0.75, tension * 0.6 + rng.next() * 0.4)), 3),
    flicker: round(clamp01(lerp(0.05, 0.6, tension) * rng.range(0.6, 1)), 3),
    blur: round(clamp01(soft + motion), 3),
    vignette: round(clamp01(lerp(0.35, 0.85, tension) + rng.range(-0.05, 0.05)), 3),
    fever: round(clamp01(fever), 3),
  };
}

const CUT_WEIGHTS: Readonly<Record<BeatRole, Readonly<Partial<Record<CutKind, number>>>>> = {
  opening: { fade: 3, blink: 2, hard: 1 },
  build: { hard: 4, blink: 1.5, fade: 1 },
  anticipation: { fade: 1, hard: 1 },
  false_alarm: { flash: 3, hard: 1 },
  release: { fade: 3, blink: 2 },
  scare: { hard: 1 },
  recovery: { blink: 2, fade: 2, hard: 1 },
  climax: { hard: 5, flash: 1.5, blink: 1 },
};

/** Transition lengths, ms. */
const CUT_MS: Readonly<Record<DreamLength, Readonly<Record<Exclude<CutKind, 'hard'>, readonly [number, number]>>>> = {
  short: { fade: [300, 800], blink: [200, 400], flash: [80, 150] },
  long: { fade: [500, 1500], blink: [250, 450], flash: [80, 150] },
};

/** Flashes are at least this far apart (D-009: never more than three a second). */
export const MIN_FLASH_GAP_MS = 1000;

export interface CutRequest {
  role: BeatRole;
  /** Role of the next shot; `undefined` for the last shot of the film. */
  nextRole: BeatRole | undefined;
  /** Ends of this and the next shot, ms. */
  ms: number;
  nextMs: number;
  /** When this shot ends, ms from the film start. */
  end: number;
  /** When the last flash happened, ms from the film start. */
  lastFlash: number;
}

export interface Cut {
  kind: CutKind;
  /** Transition length, ms; 0 for `hard`. */
  ms: number;
}

export function cutFor(request: CutRequest, length: DreamLength, rng: Rng): Cut {
  const { role, nextRole, ms, nextMs, end, lastFlash } = request;
  const roll = rng.next();
  const lengthRoll = rng.next();

  let kind: CutKind;
  if (nextRole === undefined) {
    // The film ends on waking up: the eyes open, or the dream dissolves.
    kind = roll < 0.65 ? 'blink' : 'fade';
  } else if (nextRole === 'scare' || nextRole === 'false_alarm' || role === 'scare') {
    // Into a scare, a misdirection or out of a scare: nothing softens it.
    kind = 'hard';
  } else {
    const weights = Object.entries(CUT_WEIGHTS[role]) as [CutKind, number][];
    const allowed = weights.filter(([cut]) => cut !== 'flash' || end - lastFlash >= MIN_FLASH_GAP_MS);
    // `roll` stands in for the RNG so that every cut draws the same number of times.
    const total = allowed.reduce((sum, [, weight]) => sum + weight, 0);
    let target = roll * total;
    kind = 'hard';
    for (const [cut, weight] of allowed) {
      if (target < weight) {
        kind = cut;
        break;
      }
      target -= weight;
    }
    if (nextRole === 'release' && kind === 'hard') kind = 'fade';
  }
  if (kind === 'hard') return { kind, ms: 0 };

  const [min, max] = CUT_MS[length][kind];
  // The transition takes the end of this shot and never eats more than 40 % of either neighbour.
  const room = Math.floor(0.4 * Math.min(ms, nextRole === undefined ? ms : nextMs));
  const cutMs = Math.min(Math.round(lerp(min, max, lengthRoll)), room);
  if (cutMs < 50) return { kind: 'hard', ms: 0 };
  return { kind, ms: cutMs };
}
