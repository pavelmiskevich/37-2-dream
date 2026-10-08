import type { CameraMove } from '@dream/core';
import { clamp, clamp01, lerp, smoothstep, valueNoise } from './math';

/**
 * Camera over a still: zoom and pan across the frame, hand-held sway,
 * and how that turns into a crop of the image and a depth parallax.
 * Frame-relative units of the contract: zoom 1 shows the whole frame, pan
 * −1…1 is the centre offset in frame half-sizes, x to the right, y down.
 */

export interface CameraState {
  zoom: number;
  panX: number;
  panY: number;
  /** Roll, radians. */
  roll: number;
}

/** Hand-held sway at `sway = 1`: centre wander in half-sizes and roll in radians. */
export const HANDHELD = { pan: 0.03, roll: 0.006 } as const;
/** `sway` kind: a slow pendulum, as if the camera hung on the swing. */
export const PENDULUM = { period: 3.6, pan: 0.07, roll: 0.018, zoom: 0.025 } as const;

/** Progress eased for each kind of move. */
export function moveEase(kind: CameraMove['kind'], progress: number): number {
  const p = clamp01(progress);
  switch (kind) {
    case 'still':
      return 0;
    // A creeping dolly: starts and stops softly, but mostly moves at an even, relentless speed.
    case 'push':
    case 'pull':
      return lerp(p, smoothstep(0, 1, p), 0.5);
    case 'drift':
    case 'sway':
      return p;
  }
}

/**
 * Camera at `progress` 0…1 through the shot, `time` seconds into it.
 * `phase` (any number) decorrelates the sway of different shots.
 */
export function cameraAt(move: CameraMove, progress: number, time: number, phase = 0): CameraState {
  const e = moveEase(move.kind, progress);
  let zoom = lerp(move.zoomFrom, move.zoomTo, e);
  let panX = lerp(move.panFrom[0], move.panTo[0], e);
  let panY = lerp(move.panFrom[1], move.panTo[1], e);
  let roll = 0;

  const sway = clamp01(move.sway);
  if (sway > 0) {
    // Three incommensurate wobbles: a hand never repeats itself.
    panX += sway * HANDHELD.pan * valueNoise(time * 0.45 + phase, 1);
    panY += sway * HANDHELD.pan * valueNoise(time * 0.38 + phase, 2);
    roll += sway * HANDHELD.roll * valueNoise(time * 0.3 + phase, 3);
  }
  if (move.kind === 'sway') {
    const swing = Math.sin(((time / PENDULUM.period) * 2 + phase) * Math.PI);
    panX += PENDULUM.pan * swing;
    roll += PENDULUM.roll * swing;
    // Closest at the bottom of the arc.
    zoom *= 1 + PENDULUM.zoom * (1 - Math.abs(swing));
  }
  return { zoom: Math.max(1, zoom), panX, panY, roll };
}

/** Change of the camera per second around `time` (for motion blur). */
export function cameraVelocity(
  move: CameraMove,
  duration: number,
  time: number,
  phase = 0,
  dt = 1 / 60,
): CameraState {
  const at = (t: number) => cameraAt(move, duration > 0 ? t / duration : 1, t, phase);
  const a = at(time - dt);
  const b = at(time + dt);
  const k = 1 / (2 * dt);
  return { zoom: (b.zoom - a.zoom) * k, panX: (b.panX - a.panX) * k, panY: (b.panY - a.panY) * k, roll: (b.roll - a.roll) * k };
}

/** Camera halfway through the move: the depth parallax is measured from it, so it is symmetric. */
export function cameraRest(move: CameraMove): CameraState {
  const e = moveEase(move.kind, 0.5);
  return {
    zoom: Math.max(1, lerp(move.zoomFrom, move.zoomTo, e)),
    panX: lerp(move.panFrom[0], move.panTo[0], e),
    panY: lerp(move.panFrom[1], move.panTo[1], e),
    roll: 0,
  };
}

/** Always-on crop: a hair of overscan hides the edges when the camera rolls or shakes. */
export const BASE_OVERSCAN = 1.04;
/** Extra overscan at full parallax: layers move further than the frame. */
export const PARALLAX_OVERSCAN = 0.08;

/** Which part of the image fills the screen, in image UV (0…1, y down). */
export interface ViewRect {
  centerX: number;
  centerY: number;
  /** Visible share of the image width and height. */
  width: number;
  height: number;
}

/**
 * Cover-fit of an image of aspect `imageAspect` (w/h) on a screen of
 * `screenAspect`, cropped further by the camera zoom and moved by its pan.
 * The centre is clamped so the view never leaves the image.
 */
export function viewRect(camera: CameraState, imageAspect: number, screenAspect: number, overscan = BASE_OVERSCAN): ViewRect {
  const coverW = screenAspect > imageAspect ? 1 : screenAspect / imageAspect;
  const coverH = screenAspect > imageAspect ? imageAspect / screenAspect : 1;
  const scale = Math.max(1, camera.zoom) * Math.max(1, overscan);
  const width = coverW / scale;
  const height = coverH / scale;
  return {
    centerX: clamp(0.5 + camera.panX * 0.5, width / 2, 1 - width / 2),
    centerY: clamp(0.5 + camera.panY * 0.5, height / 2, 1 - height / 2),
    width,
    height,
  };
}

/** Depth parallax for the shader, in image UV. */
export interface Parallax {
  /** Extra shift of a layer per unit of (depth − focus). */
  shiftX: number;
  shiftY: number;
  /** Extra zoom of a layer per unit of (depth − focus): a dolly, not a zoom. */
  dolly: number;
}

export const NO_PARALLAX: Readonly<Parallax> = { shiftX: 0, shiftY: 0, dolly: 0 };

/** Gain of the layer shift relative to the camera travel. */
export const PARALLAX_SHIFT = 0.6;
/** Gain of the dolly relative to the zoom travel. */
export const PARALLAX_DOLLY = 1.6;
/** Slow orbit that keeps even a still shot breathing in depth, in half-sizes. */
export const PARALLAX_ORBIT = { radius: 0.04, period: 9 } as const;

/**
 * The camera travels away from its rest position; near layers (bright in the
 * depth map) move further than far ones. Without a depth map or with
 * `strength` 0 the picture only moves in 2D.
 */
export function parallaxAt(camera: CameraState, rest: CameraState, strength: number, time: number, phase = 0): Parallax {
  const s = clamp01(strength);
  if (s === 0) return NO_PARALLAX;
  const angle = ((time / PARALLAX_ORBIT.period) * 2 + phase) * Math.PI;
  const travelX = camera.panX - rest.panX + PARALLAX_ORBIT.radius * Math.cos(angle);
  const travelY = camera.panY - rest.panY + PARALLAX_ORBIT.radius * 0.6 * Math.sin(angle);
  return {
    // Half-sizes → UV is a factor of 0.5.
    shiftX: s * PARALLAX_SHIFT * travelX * 0.5,
    shiftY: s * PARALLAX_SHIFT * travelY * 0.5,
    dolly: s * PARALLAX_DOLLY * (camera.zoom / rest.zoom - 1),
  };
}
