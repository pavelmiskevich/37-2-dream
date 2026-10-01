import { describe, expect, it } from 'vitest';
import { findScene, generateDream, normalizeSeed } from '@dream/core';
import { FALLING_KINDS, fallLayout, pageReveal, pageRise, pageStay, visualDepth } from './layout';

const fallOf = (seed: string) => findScene(generateDream(normalizeSeed(seed)), 'fall')!;
const fall = fallOf('DREAM-8F72-A19C-37B2');

describe('fallLayout', () => {
  const layout = fallLayout(fall);

  it('is the same for the same scene and differs between seeds', () => {
    expect(fallLayout(fall)).toEqual(layout);
    expect(fallLayout(fallOf('DREAM-0000-0000-0000')).objects).not.toEqual(layout.objects);
  });

  it('fills the whole drop with every kind of object, keeping clear of the hero', () => {
    const lowest = Math.min(...layout.objects.map((slot) => slot.y));
    expect(lowest).toBeLessThan(-layout.depth);
    expect(new Set(layout.objects.map((slot) => slot.kind))).toEqual(new Set(FALLING_KINDS));
    for (const slot of layout.objects) expect(Math.hypot(slot.x, slot.z)).toBeGreaterThan(4);
    for (let i = 1; i < layout.objects.length; i++) {
      expect(layout.objects[i]!.kind).not.toBe(layout.objects[i - 1]!.kind);
    }
  });

  it('gives every will page its moment, in order, within the fall', () => {
    expect(layout.pages).toHaveLength(fall.params.willPages.length);
    for (const [i, page] of layout.pages.entries()) {
      expect(page.start).toBeGreaterThan(0);
      expect(page.end).toBeLessThanOrEqual(1);
      if (i > 0) expect(page.start).toBeGreaterThan(layout.pages[i - 1]!.start);
    }
  });

  it('rushes higher falls past faster', () => {
    expect(visualDepth({ ...fall.params, height: 180 }, 30)).toBeGreaterThan(visualDepth({ ...fall.params, height: 25 }, 30));
  });
});

describe('page motion', () => {
  it('rises from below, lingers at eye level, leaves upwards', () => {
    expect(pageRise(0)).toBeLessThan(-3);
    expect(pageRise(0.5)).toBe(0);
    expect(Math.abs(pageRise(0.4))).toBeLessThan(0.1);
    expect(pageRise(1)).toBeGreaterThan(3);
  });

  it('writes the text while the page is near and finishes it before it leaves', () => {
    expect(pageReveal(0.1)).toBe(0);
    expect(pageReveal(0.4)).toBeGreaterThan(0);
    expect(pageReveal(0.65)).toBe(1);
  });

  it('measures the stay in the page window', () => {
    const slot = { start: 0.2, end: 0.4, angle: 0, distance: 1, flutter: [0, 0, 0] as const };
    expect(pageStay(slot, 0.3)).toBeCloseTo(0.5, 9);
    expect(pageStay(slot, 0.1)).toBeLessThan(0);
  });
});
