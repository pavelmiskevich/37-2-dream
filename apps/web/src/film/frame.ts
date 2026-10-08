import type { DreamFilm, Shot } from '@dream/core';
import {
  BASE_OVERSCAN,
  cameraAt,
  cameraRest,
  NO_PARALLAX,
  PARALLAX_OVERSCAN,
  parallaxAt,
  viewRect,
  type CameraState,
  type Parallax,
  type ViewRect,
} from './camera';
import { lookAt, MAX_MOTION_BLUR, SHUTTER, type LookParams } from './look';
import { hash01 } from './math';
import { NO_OVERLAY, overlayAt, scareAt, shotAt, type CutOverlay, type FilmPlan, type PlayerSettings, type ScareState } from './timeline';

/**
 * Everything the screen shows at one moment of the film, as plain numbers:
 * the renderer only uploads them. Pure, so any moment can be checked (and
 * screenshotted) without playing up to it.
 */
export interface FrameState {
  /** Film time, seconds. */
  time: number;
  shot: Shot;
  /** Seconds into the shot. */
  local: number;
  view: ViewRect;
  roll: number;
  parallax: Parallax;
  /** Motion blur: travel of the view centre during the shutter, image UV (y down). */
  motionX: number;
  motionY: number;
  /** Radial blur of a zooming camera: relative change of the view size during the shutter. */
  zoomBlur: number;
  look: LookParams;
  overlay: CutOverlay;
  scare: ScareState;
  /** Scare shake of the whole frame, shares of the screen height. */
  shakeX: number;
  shakeY: number;
}

/** What the player knows about the asset of the shot on screen. */
export interface FrameAsset {
  /** Width / height of the image or clip. */
  aspect: number;
  /** A depth map is loaded (stills only). */
  depth: boolean;
}

/** Scare: how much further it pushes in, and how hard it shakes (shares of the screen height). */
export const SCARE_PUNCH_ZOOM = 0.1;
export const SCARE_SHAKE = 0.012;

/** Per-shot key that decorrelates the sway, weave and flicker of different shots. */
const shotKey = (shot: Shot) => shot.index * 17 + 3;

function cameraOf(shot: Shot, local: number, scare: ScareState): CameraState {
  const camera = cameraAt(shot.camera, shot.duration > 0 ? local / shot.duration : 1, local, shotKey(shot));
  return scare.punch > 0 ? { ...camera, zoom: camera.zoom * (1 + SCARE_PUNCH_ZOOM * scare.punch) } : camera;
}

export function frameAt(
  film: DreamFilm,
  plan: FilmPlan,
  time: number,
  screenAspect: number,
  asset: FrameAsset | null,
  settings: PlayerSettings,
): FrameState | null {
  const at = shotAt(film.shots, time);
  if (!at) return null;
  const { shot, local } = at;
  const ended = time >= film.duration;
  // After the end the last cut holds closed (black, white or shut lids).
  const lastCut = plan.cuts[plan.cuts.length - 1];
  const overlay = ended ? (lastCut ? overlayAt(plan.cuts, lastCut.at - 1e-6) : NO_OVERLAY) : overlayAt(plan.cuts, time);
  const scare = scareAt(shot, local, plan.scareFlash[at.index] ?? false, settings);

  const imageAspect = asset?.aspect ?? 16 / 9;
  const strength = asset?.depth ? shot.parallax : 0;
  const overscan = BASE_OVERSCAN + PARALLAX_OVERSCAN * strength;
  const camera = cameraOf(shot, local, scare);
  const view = viewRect(camera, imageAspect, screenAspect, overscan);

  // Where the view was when the shutter opened.
  const before = viewRect(cameraOf(shot, Math.max(0, local - SHUTTER), scare), imageAspect, screenAspect, overscan);
  let motionX = view.centerX - before.centerX;
  let motionY = view.centerY - before.centerY;
  const travel = Math.hypot(motionX, motionY);
  const maxTravel = MAX_MOTION_BLUR * view.height;
  if (travel > maxTravel) {
    motionX *= maxTravel / travel;
    motionY *= maxTravel / travel;
  }

  const key = shotKey(shot);
  const jolt = Math.floor(time * 40);
  return {
    time,
    shot,
    local,
    view,
    roll: camera.roll,
    parallax: strength > 0 ? parallaxAt(camera, cameraRest(shot.camera), strength, local, key) : NO_PARALLAX,
    motionX,
    motionY,
    zoomBlur: before.height > 0 ? Math.min(0.02, Math.abs(1 - view.height / before.height)) : 0,
    look: lookAt(shot.look, time, key),
    overlay,
    scare,
    shakeX: SCARE_SHAKE * scare.shake * (hash01(jolt * 2) * 2 - 1),
    shakeY: SCARE_SHAKE * scare.shake * (hash01(jolt * 2 + 1) * 2 - 1),
  };
}
