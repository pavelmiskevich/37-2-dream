import { describe, expect, it } from 'vitest';
import { gridAspect, pixelGridFor } from './pixel-grid';

describe('pixelGridFor', () => {
  it('renders 720p at 240 lines with a 3× upscale', () => {
    expect(pixelGridFor(1280, 720, 240)).toEqual({
      width: 427,
      height: 240,
      scale: 3,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it('keeps the short side near the target in portrait', () => {
    const grid = pixelGridFor(390, 844, 240);
    expect(grid.scale).toBe(2);
    expect(grid.width).toBe(195);
    expect(grid.height).toBe(422);
  });

  it('handles ultrawide screens', () => {
    expect(pixelGridFor(1280, 540, 240)).toMatchObject({ width: 640, height: 270, scale: 2 });
    expect(pixelGridFor(2560, 1080, 240)).toMatchObject({ width: 512, height: 216, scale: 5 });
  });

  it('keeps the short side within a reasonable band around the target', () => {
    for (let short = 360; short <= 3000; short += 7) {
      // k = 1 below 360 px; from there on k >= 2 keeps it within 180..300.
      const grid = pixelGridFor(short * 2, short, 240);
      expect(grid.height).toBeGreaterThanOrEqual(180);
      expect(grid.height).toBeLessThanOrEqual(300);
    }
  });

  it('always covers the output and crops less than one big pixel, centred', () => {
    for (const [w, h] of [
      [1281, 721],
      [1170, 2532],
      [3440, 1440],
      [1000, 1000],
    ] as const) {
      const grid = pixelGridFor(w, h, 240);
      const overX = grid.width * grid.scale - w;
      const overY = grid.height * grid.scale - h;
      expect(overX).toBeGreaterThanOrEqual(0);
      expect(overX).toBeLessThan(grid.scale);
      expect(overY).toBeGreaterThanOrEqual(0);
      expect(overY).toBeLessThan(grid.scale);
      expect(grid.offsetX).toBe(Math.floor(overX / 2));
      expect(grid.offsetY).toBe(Math.floor(overY / 2));
    }
  });

  it('keeps the screen aspect ratio to within one big pixel', () => {
    for (const [w, h] of [
      [1280, 720],
      [390, 844],
      [2560, 1080],
      [1440, 900],
      [1024, 768],
    ] as const) {
      const grid = pixelGridFor(w, h, 240);
      const covered = gridAspect(grid);
      expect(Math.abs(covered - w / h) / (w / h)).toBeLessThan(0.01);
    }
  });

  it('never upscales tiny outputs below 1×', () => {
    expect(pixelGridFor(300, 200, 240)).toMatchObject({ width: 300, height: 200, scale: 1 });
    expect(pixelGridFor(0, 0, 240)).toMatchObject({ width: 1, height: 1, scale: 1 });
  });
});
