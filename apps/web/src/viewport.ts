const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Horizontal field of view (degrees) for a vertical FOV and aspect ratio. */
export function horizontalFov(verticalFovDeg: number, aspect: number): number {
  return toDeg(2 * Math.atan(Math.tan(toRad(verticalFovDeg) / 2) * aspect));
}

/**
 * Vertical FOV that keeps the camera usable on any screen shape: the base
 * vertical FOV on wide screens, widened on tall (portrait) screens so the
 * horizontal FOV never drops below `minHorizontalFovDeg`.
 */
export function verticalFovFor(
  aspect: number,
  baseVerticalFovDeg = 70,
  minHorizontalFovDeg = 60,
): number {
  if (horizontalFov(baseVerticalFovDeg, aspect) >= minHorizontalFovDeg) {
    return baseVerticalFovDeg;
  }
  return toDeg(2 * Math.atan(Math.tan(toRad(minHorizontalFovDeg) / 2) / aspect));
}
