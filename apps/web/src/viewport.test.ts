import { describe, expect, it } from 'vitest';
import { horizontalFov, verticalFovFor } from './viewport';

describe('verticalFovFor', () => {
  it('keeps the base FOV on wide screens', () => {
    expect(verticalFovFor(16 / 9)).toBe(70);
    expect(verticalFovFor(21 / 9)).toBe(70);
  });

  it('widens the vertical FOV in portrait to keep the minimum horizontal FOV', () => {
    const aspect = 9 / 16;
    const vFov = verticalFovFor(aspect);
    expect(vFov).toBeGreaterThan(70);
    expect(horizontalFov(vFov, aspect)).toBeCloseTo(60, 6);
  });
});
