/**
 * Low internal resolution with uniform, square "big pixels".
 *
 * The scene is rendered into a small target and then blown up by an integer
 * factor, so every internal pixel covers exactly `scale × scale` output pixels
 * on any screen shape (portrait, 16:9, 21:9). The internal size is rounded up
 * to cover the whole output; the overshoot (less than one big pixel) is
 * cropped evenly on both sides.
 */
export interface PixelGrid {
  /** Internal render width in pixels. */
  readonly width: number;
  /** Internal render height in pixels. */
  readonly height: number;
  /** Output pixels per internal pixel along each axis (integer, >= 1). */
  readonly scale: number;
  /** Output pixels cropped from the left edge (and roughly as many from the right). */
  readonly offsetX: number;
  /** Output pixels cropped from the bottom edge (and roughly as many from the top). */
  readonly offsetY: number;
}

/**
 * Picks the integer upscale factor that brings the short side of the output
 * closest to `targetShortSide`, and the internal size that covers the output.
 *
 * @param outputWidth drawing-buffer width in pixels
 * @param outputHeight drawing-buffer height in pixels
 * @param targetShortSide desired internal size of the short side (~240 for PS1)
 */
export function pixelGridFor(
  outputWidth: number,
  outputHeight: number,
  targetShortSide: number,
): PixelGrid {
  const width = Math.max(1, Math.floor(outputWidth));
  const height = Math.max(1, Math.floor(outputHeight));
  const target = Math.max(1, targetShortSide);
  const shortSide = Math.min(width, height);

  const scale = Math.max(1, Math.round(shortSide / target));
  const gridWidth = Math.ceil(width / scale);
  const gridHeight = Math.ceil(height / scale);

  return {
    width: gridWidth,
    height: gridHeight,
    scale,
    offsetX: Math.floor((gridWidth * scale - width) / 2),
    offsetY: Math.floor((gridHeight * scale - height) / 2),
  };
}

/** Aspect ratio of the internal image (what the camera must render). */
export function gridAspect(grid: PixelGrid): number {
  return grid.width / grid.height;
}
