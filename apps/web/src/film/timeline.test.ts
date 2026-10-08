import type { CutKind, Shot } from '@dream/core';
import { describe, expect, it } from 'vitest';
import { MIN_FLASH_GAP, NO_OVERLAY, overlayAt, planFilm, scareAt, shotAt, SOFT_SCARE_RISE } from './timeline';

const FLASHES_ON = { noFlash: false };
const NO_FLASH = { noFlash: true };

function shot(index: number, start: number, duration: number, cutOut: CutKind = 'hard', cutDuration = 0, scare = false): Shot {
  return {
    index,
    assetId: `a${index}`,
    start,
    duration,
    camera: { kind: 'still', zoomFrom: 1, zoomTo: 1, panFrom: [0, 0], panTo: [0, 0], sway: 0 },
    parallax: 0,
    look: { grain: 0, flicker: 0, blur: 0, vignette: 0, fever: 0 },
    cutOut,
    cutDuration,
    scare,
  };
}

/** Builds contiguous shots from [duration, cut, cutDuration, scare?]. */
function film(...specs: [number, CutKind, number, boolean?][]): Shot[] {
  let start = 0;
  return specs.map(([duration, cut, length, scare], i) => {
    const s = shot(i, start, duration, cut, length, scare ?? false);
    start += duration;
    return s;
  });
}

describe('shotAt', () => {
  const shots = film([5, 'hard', 0], [3, 'hard', 0], [4, 'hard', 0]);

  it('finds the shot on screen and how far into it the film is', () => {
    expect(shotAt(shots, 0)).toMatchObject({ index: 0, local: 0, progress: 0 });
    expect(shotAt(shots, 6.5)).toMatchObject({ index: 1, local: 1.5, progress: 0.5 });
    // A boundary belongs to the next shot.
    expect(shotAt(shots, 8)!.index).toBe(2);
  });

  it('clamps before the start and after the end', () => {
    expect(shotAt(shots, -1)).toMatchObject({ index: 0, local: 0 });
    expect(shotAt(shots, 99)).toMatchObject({ index: 2, local: 4, progress: 1 });
    expect(shotAt([], 1)).toBeNull();
  });
});

describe('planFilm', () => {
  it('centres a transition on the boundary between two shots', () => {
    const { cuts } = planFilm(film([5, 'fade', 1], [5, 'hard', 0]), FLASHES_ON);
    expect(cuts[0]).toMatchObject({ kind: 'fade', at: 5, from: 4.5, to: 5.5 });
    expect(cuts[1]).toMatchObject({ kind: 'hard', at: 10, from: 10, to: 10 });
  });

  it('never lets a transition eat more than half of a short shot', () => {
    const { cuts } = planFilm(film([5, 'blink', 2], [0.6, 'hard', 0]), FLASHES_ON);
    expect(cuts[0]).toMatchObject({ from: 4, to: 5.3 });
  });

  it('puts a cut into a scare entirely before it: the scare enters hard', () => {
    const { cuts } = planFilm(film([6, 'fade', 0.8], [0.25, 'hard', 0, true], [5, 'hard', 0]), FLASHES_ON);
    expect(cuts[0]).toMatchObject({ kind: 'fade', from: 5.2, at: 6, to: 6 });
  });

  it('ends the film with its last cut closing', () => {
    const { cuts } = planFilm(film([5, 'hard', 0], [5, 'blink', 1.6]), FLASHES_ON);
    expect(cuts[1]).toMatchObject({ kind: 'blink', from: 8.4, at: 10, to: 10 });
  });

  it('turns flashes into fades without flashes (D-009)', () => {
    const plan = planFilm(film([5, 'flash', 0.5], [0.25, 'hard', 0, true], [5, 'hard', 0]), NO_FLASH);
    expect(plan.cuts[0]!.kind).toBe('fade');
    expect(plan.scareFlash).toEqual([false, false, false]);
  });

  it('keeps flashes at most three a second (D-009)', () => {
    // Flash cuts every 0.2 s: only every other one may stay a flash.
    const shots = film([1, 'flash', 0.1], [0.2, 'flash', 0.1], [0.2, 'flash', 0.1], [0.2, 'flash', 0.1], [1, 'hard', 0]);
    const { cuts } = planFilm(shots, FLASHES_ON);
    const flashes = cuts.filter((cut) => cut.kind === 'flash').map((cut) => cut.at);
    expect(flashes.length).toBeLessThan(4);
    for (let i = 1; i < flashes.length; i++) expect(flashes[i]! - flashes[i - 1]!).toBeGreaterThanOrEqual(MIN_FLASH_GAP - 1e-9);
    expect(cuts.filter((cut) => cut.kind === 'fade')).not.toHaveLength(0);
  });

  it('counts a scare flash against the rate too', () => {
    const plan = planFilm(film([5, 'hard', 0], [0.25, 'flash', 0.1, true], [5, 'hard', 0]), FLASHES_ON);
    expect(plan.scareFlash[1]).toBe(true);
    // 0.25 s after the scare flash: too soon for another one.
    expect(plan.cuts[1]!.kind).toBe('fade');
  });

  it('treats a zero-length transition as a hard cut', () => {
    expect(planFilm(film([5, 'fade', 0], [5, 'hard', 0]), FLASHES_ON).cuts[0]!.kind).toBe('hard');
  });
});

describe('overlayAt', () => {
  it('fades through black: closes to the boundary, opens after it', () => {
    const { cuts } = planFilm(film([5, 'fade', 1], [5, 'hard', 0]), FLASHES_ON);
    expect(overlayAt(cuts, 4)).toEqual(NO_OVERLAY);
    expect(overlayAt(cuts, 4.75).black).toBeCloseTo(0.5, 5);
    expect(overlayAt(cuts, 5).black).toBe(1);
    expect(overlayAt(cuts, 5.25).black).toBeCloseTo(0.5, 5);
    expect(overlayAt(cuts, 5.5).black).toBe(0);
    expect(overlayAt(cuts, 7)).toEqual(NO_OVERLAY);
  });

  it('flashes white with a sudden onset and a slower fall', () => {
    const { cuts } = planFilm(film([5, 'flash', 0.6], [5, 'hard', 0]), FLASHES_ON);
    expect(overlayAt(cuts, 5).white).toBe(1);
    // Symmetric moments: the rise is still low where the fall is already well lit.
    expect(overlayAt(cuts, 4.85).white).toBeLessThan(overlayAt(cuts, 5.15).white);
    expect(overlayAt(cuts, 5).black).toBe(0);
  });

  it('blinks: the lids shut around the boundary and open again', () => {
    const { cuts } = planFilm(film([5, 'blink', 1], [5, 'hard', 0]), FLASHES_ON);
    expect(overlayAt(cuts, 4.5).lids).toBe(0);
    expect(overlayAt(cuts, 4.95).lids).toBe(1);
    expect(overlayAt(cuts, 5.05).lids).toBe(1);
    expect(overlayAt(cuts, 5.5).lids).toBe(0);
    const half = overlayAt(cuts, 4.75).lids;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
  });

  it('a hard cut puts nothing over the picture', () => {
    const { cuts } = planFilm(film([5, 'hard', 0], [5, 'hard', 0]), FLASHES_ON);
    for (const t of [4.99, 5, 5.01]) expect(overlayAt(cuts, t)).toEqual(NO_OVERLAY);
  });
});

describe('scareAt', () => {
  const scare = shot(1, 6, 0.25, 'hard', 0, true);

  it('hits at once with a flash and a shake', () => {
    const onset = scareAt(scare, 0, true, FLASHES_ON);
    expect(onset.punch).toBe(1);
    expect(onset.flash).toBe(1);
    expect(onset.shake).toBe(1);
    expect(scareAt(scare, 0.1, true, FLASHES_ON).flash).toBe(0);
  });

  it('has no flash when the plan dropped it', () => {
    expect(scareAt(scare, 0, false, FLASHES_ON).flash).toBe(0);
  });

  it('is softened without flashes: no flash or shake, eases in, weaker', () => {
    expect(scareAt(scare, 0, true, NO_FLASH)).toEqual({ punch: 0, flash: 0, shake: 0 });
    const peak = scareAt(scare, SOFT_SCARE_RISE, true, NO_FLASH);
    expect(peak.flash).toBe(0);
    expect(peak.shake).toBe(0);
    expect(peak.punch).toBeGreaterThan(0);
    expect(peak.punch).toBeLessThan(0.5);
  });

  it('is nothing for an ordinary shot', () => {
    expect(scareAt(shot(0, 0, 5), 0, true, FLASHES_ON)).toEqual({ punch: 0, flash: 0, shake: 0 });
  });
});
