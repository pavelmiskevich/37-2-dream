import type { CameraMove } from '@dream/core';
import { describe, expect, it } from 'vitest';
import {
  BASE_OVERSCAN,
  cameraAt,
  cameraRest,
  cameraVelocity,
  moveEase,
  NO_PARALLAX,
  parallaxAt,
  viewRect,
} from './camera';

const move = (patch: Partial<CameraMove>): CameraMove => ({
  kind: 'push',
  zoomFrom: 1,
  zoomTo: 1.2,
  panFrom: [0, 0],
  panTo: [0.2, -0.1],
  sway: 0,
  ...patch,
});

describe('cameraAt', () => {
  it('runs from the start of the move to its end', () => {
    const m = move({});
    expect(cameraAt(m, 0, 0)).toEqual({ zoom: 1, panX: 0, panY: 0, roll: 0 });
    const end = cameraAt(m, 1, 5);
    expect(end.zoom).toBeCloseTo(1.2, 9);
    expect(end.panX).toBeCloseTo(0.2, 9);
    expect(end.panY).toBeCloseTo(-0.1, 9);
  });

  it('pushes in steadily, easing only at the ends', () => {
    const m = move({});
    const zooms = [0, 0.25, 0.5, 0.75, 1].map((p) => cameraAt(m, p, 0).zoom);
    for (let i = 1; i < zooms.length; i++) expect(zooms[i]!).toBeGreaterThan(zooms[i - 1]!);
    expect(cameraAt(m, 0.5, 0).zoom).toBeCloseTo(1.1, 9);
    // Slower near the ends than in the middle.
    expect(moveEase('push', 0.1)).toBeLessThan(0.1);
    expect(moveEase('push', 0.6) - moveEase('push', 0.4)).toBeGreaterThan(0.2);
  });

  it('a still camera stays where it starts', () => {
    const m = move({ kind: 'still' });
    expect(cameraAt(m, 0.7, 3)).toEqual(cameraAt(m, 0, 0));
  });

  it('never zooms out past the whole frame', () => {
    expect(cameraAt(move({ zoomFrom: 0.5, zoomTo: 0.8 }), 0.5, 0).zoom).toBe(1);
  });

  it('adds a hand-held wobble with sway: bounded, smooth, deterministic', () => {
    const m = move({ kind: 'still', sway: 1 });
    const a = cameraAt(m, 0, 1.3, 7);
    expect(cameraAt(m, 0, 1.3, 7)).toEqual(a);
    expect(Math.abs(a.panX)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(a.roll)).toBeLessThanOrEqual(0.006);
    const b = cameraAt(m, 0, 1.31, 7);
    expect(Math.abs(b.panX - a.panX)).toBeLessThan(0.002);
    // Different shots wobble differently.
    expect(cameraAt(m, 0, 1.3, 8)).not.toEqual(a);
  });

  it('swings like a pendulum in a sway shot', () => {
    const m = move({ kind: 'sway', zoomFrom: 1.5, zoomTo: 1.5, panTo: [0, 0] });
    const xs = Array.from({ length: 37 }, (_, i) => cameraAt(m, i / 36, i * 0.1).panX);
    expect(Math.max(...xs)).toBeGreaterThan(0.05);
    expect(Math.min(...xs)).toBeLessThan(-0.05);
  });
});

describe('cameraVelocity', () => {
  it('measures the move per second', () => {
    const m = move({ kind: 'drift', zoomFrom: 1.2, zoomTo: 1.2, panFrom: [0, 0], panTo: [0.5, 0] });
    const v = cameraVelocity(m, 5, 2.5);
    expect(v.panX).toBeCloseTo(0.1, 6);
    expect(v.zoom).toBeCloseTo(0, 9);
  });
});

describe('viewRect', () => {
  it('covers a wider screen by cropping the image top and bottom', () => {
    const view = viewRect({ zoom: 1, panX: 0, panY: 0, roll: 0 }, 16 / 9, 2, 1);
    expect(view.width).toBeCloseTo(1, 9);
    expect(view.height).toBeCloseTo(16 / 9 / 2, 9);
    expect(view.centerX).toBe(0.5);
  });

  it('covers a phone by cropping the sides', () => {
    const view = viewRect({ zoom: 1, panX: 0, panY: 0, roll: 0 }, 16 / 9, 390 / 844, 1);
    expect(view.height).toBe(1);
    expect(view.width).toBeCloseTo(390 / 844 / (16 / 9), 9);
  });

  it('crops by zoom and overscan and moves by pan', () => {
    const view = viewRect({ zoom: 2, panX: 0.2, panY: -0.2, roll: 0 }, 16 / 9, 16 / 9);
    expect(view.width).toBeCloseTo(1 / (2 * BASE_OVERSCAN), 9);
    expect(view.centerX).toBeCloseTo(0.6, 9);
    expect(view.centerY).toBeCloseTo(0.4, 9);
  });

  it('never looks past the edge of the image', () => {
    const view = viewRect({ zoom: 1.2, panX: 1, panY: -1, roll: 0 }, 16 / 9, 16 / 9);
    expect(view.centerX + view.width / 2).toBeCloseTo(1, 9);
    expect(view.centerY - view.height / 2).toBeCloseTo(0, 9);
  });
});

describe('parallaxAt', () => {
  const m = move({ kind: 'drift', zoomFrom: 1.2, zoomTo: 1.2, panFrom: [-0.2, 0], panTo: [0.2, 0] });
  const rest = cameraRest(m);

  it('is flat without strength (no depth map, or a 2D shot)', () => {
    expect(parallaxAt(cameraAt(m, 1, 5), rest, 0, 5)).toEqual(NO_PARALLAX);
  });

  it('shifts layers along the camera travel, symmetric around the middle of the move', () => {
    const start = parallaxAt(cameraAt(m, 0, 0), rest, 1, 0);
    const end = parallaxAt(cameraAt(m, 1, 0), rest, 1, 0);
    expect(start.shiftX).toBeLessThan(0);
    expect(end.shiftX).toBeGreaterThan(0);
    expect(start.shiftX + end.shiftX).toBeCloseTo(2 * parallaxAt(rest, rest, 1, 0).shiftX, 9);
  });

  it('turns a push into a dolly: near layers grow faster than far ones', () => {
    const push = move({ zoomFrom: 1, zoomTo: 1.3, panTo: [0, 0] });
    const r = cameraRest(push);
    expect(parallaxAt(cameraAt(push, 1, 0), r, 1, 0).dolly).toBeGreaterThan(0);
    expect(parallaxAt(cameraAt(push, 0, 0), r, 1, 0).dolly).toBeLessThan(0);
  });

  it('keeps a still shot breathing in depth with a slow orbit', () => {
    const still = move({ kind: 'still', panTo: [0, 0], zoomTo: 1 });
    const r = cameraRest(still);
    const a = parallaxAt(cameraAt(still, 0, 0), r, 1, 0);
    const b = parallaxAt(cameraAt(still, 0.5, 2), r, 1, 2);
    expect(Math.hypot(a.shiftX - b.shiftX, a.shiftY - b.shiftY)).toBeGreaterThan(0);
  });
});
