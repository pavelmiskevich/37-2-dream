import { generateFilm, normalizeSeed, type LibraryManifest } from '@dream/core';
import { describe, expect, it } from 'vitest';
import { TEST_LIBRARY } from '../../../../packages/dream-core/src/film/test-library';
import manifestJson from '../../public/film-fixture/library.json?raw';
import { devLibrary } from './dev-library';
import { fixtureFilm } from './fixture';
import { frameAt } from './frame';
import { MAX_MOTION_BLUR } from './look';
import { planFilm } from './timeline';

const manifest = JSON.parse(manifestJson) as LibraryManifest;
const film = fixtureFilm(normalizeSeed('DREAM-8F72-A19C-37B2'), 'short', manifest);
const FLASHES_ON = { noFlash: false };
const plan = planFilm(film.shots, FLASHES_ON);
const STILL = { aspect: 16 / 9, depth: true };
const FLAT = { aspect: 16 / 9, depth: false };

const at = (time: number, asset = STILL, settings = FLASHES_ON, p = plan) => frameAt(film, p, time, 16 / 9, asset, settings)!;

describe('frameAt', () => {
  it('is a pure function of the moment', () => {
    expect(at(3.21)).toEqual(at(3.21));
  });

  it('moves in depth only when the shot has a depth map', () => {
    expect(Math.abs(at(3).parallax.dolly) + Math.abs(at(3).parallax.shiftX)).toBeGreaterThan(0);
    expect(at(3, FLAT).parallax).toEqual({ shiftX: 0, shiftY: 0, dolly: 0 });
  });

  it('shows each cut of the test film at its boundary', () => {
    const [fade, blink, flash] = plan.cuts;
    expect(at(fade!.at).overlay.black).toBe(1);
    expect(at(blink!.at).overlay.lids).toBe(1);
    expect(at(flash!.at).overlay.white).toBe(1);
  });

  it('hits the scare at its first frame and softens it without flashes', () => {
    const scare = film.shots.find((shot) => shot.scare)!;
    const hit = at(scare.start + 0.01);
    expect(hit.scare.punch).toBeGreaterThan(0.9);
    expect(hit.scare.flash).toBeGreaterThan(0);
    expect(Math.hypot(hit.shakeX, hit.shakeY)).toBeGreaterThan(0);
    const soft = at(scare.start + 0.01, STILL, { noFlash: true }, planFilm(film.shots, { noFlash: true }));
    expect(soft.scare.flash).toBe(0);
    expect(Math.hypot(soft.shakeX, soft.shakeY)).toBe(0);
  });

  it('keeps motion blur within its limit', () => {
    for (let t = 0; t < film.duration; t += 0.37) {
      const frame = at(t);
      expect(Math.hypot(frame.motionX, frame.motionY)).toBeLessThanOrEqual(MAX_MOTION_BLUR * frame.view.height + 1e-9);
    }
  });

  it('holds the last cut closed after the end', () => {
    expect(at(film.duration + 1).overlay.lids).toBe(1);
  });
});

describe('frameAt over films from generateFilm', () => {
  const library = devLibrary(TEST_LIBRARY, manifest);
  for (const seed of ['DREAM-8F72-A19C-37B2', 'DREAM-C0DE-BEEF-0451']) {
    for (const length of ['short', 'long'] as const) {
      it(`plays ${seed} ${length} end to end`, () => {
        const generated = generateFilm(normalizeSeed(seed), length, library);
        for (const settings of [FLASHES_ON, { noFlash: true }]) {
          const p = planFilm(generated.shots, settings);
          // Transition windows never overlap, so one shot is on screen at a time.
          for (let i = 1; i < p.cuts.length; i++) expect(p.cuts[i]!.from).toBeGreaterThanOrEqual(p.cuts[i - 1]!.to - 1e-9);
          for (let t = 0; t <= generated.duration; t += 0.05) {
            const frame = frameAt(generated, p, t, 16 / 9, STILL, settings)!;
            for (const value of Object.values(frame.overlay)) {
              expect(value).toBeGreaterThanOrEqual(0);
              expect(value).toBeLessThanOrEqual(1);
            }
            if (settings.noFlash) expect(frame.overlay.white + frame.scare.flash).toBe(0);
          }
        }
      });
    }
  }
});
