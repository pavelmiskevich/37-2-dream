import * as THREE from 'three';
import {
  APARTMENT,
  TICK_DT,
  apartmentPhase,
  apartmentSleep,
  apartmentTimeline,
  createSeededRng,
  type RoomLight,
} from '@dream/core';
import { feverLevel } from '../../fever';
import type { FrameView } from '../../loop';
import { applyPlayerCamera } from '../camera';
import { applyCameraSway, feverSway } from '../sway';
import type { SceneView, SceneViewFactory } from '../types';
import { eyesAt } from './eyes';
import { Kit } from './kit';
import { subtitleAt } from './lines';
import { LIGHT_SPOTS, buildRoom } from './room';
import { apartmentExitEvents, apartmentSoundEvents, type ApartmentSound } from './sound';
import { createSubtitleLine } from './subtitle';

/**
 * The apartment prologue (vision, slice item 1): a bedroom in a panel block,
 * the hero in bed with 37,2 on the thermometer. He looks around, says
 * "Передайте коту…" and falls asleep: the eyelids close, the picture goes
 * dark, his breathing turns into the ventilator; then the dream begins.
 *
 * The core's apartment rules own the pose and the timeline (`sceneVars`);
 * this view only draws and sounds them.
 */

interface Lighting {
  background: number;
  ambient: [color: number, intensity: number];
  /** Night outside (lit windows across the yard) or an overcast day. */
  day: boolean;
}

const LIGHTING: Readonly<Record<RoomLight, Lighting>> = {
  lamp: { background: 0x050608, ambient: [0x5a4a3a, 0.7], day: false },
  tv_glow: { background: 0x040508, ambient: [0x30384a, 0.55], day: false },
  daylight: { background: 0x6a6e74, ambient: [0xa8acb4, 2.6], day: true },
};

/** Distance of the eyelids and the darkness from the eye, metres: just past the near plane. */
const LID_DISTANCE = 0.08;

/** TV light flicker, 0.7..1: two slow unrelated waves, never repeating visibly. */
const flicker = (time: number) => 0.85 + 0.09 * Math.sin(time * 5.3) + 0.06 * Math.sin(time * 13.1 + 1.7);

export const createApartmentView: SceneViewFactory<'apartment'> = ({ scene: apartment, audio }) => {
  const { params } = apartment;
  const timeline = apartmentTimeline(apartment, TICK_DT);
  const lighting = LIGHTING[params.roomLight];
  const eye = new THREE.Vector3(...APARTMENT.eye);

  const kit = new Kit();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(lighting.background);
  scene.fog = new THREE.Fog(lighting.background, 6, 30);

  const room = buildRoom(kit, {
    items: params.nightstand,
    celsius: params.thermometer,
    day: lighting.day,
    rng: createSeededRng(`${apartment.seed}/view`),
    eye,
  });
  scene.add(room.root);
  scene.add(new THREE.AmbientLight(...lighting.ambient));

  // Every room keeps a little light from the window and from under the door.
  const doorSpill = new THREE.PointLight(0xffc070, 0.3, 1.6, 1.5);
  doorSpill.position.set(2.52, 0.08, -2.38);
  scene.add(doorSpill);

  let tvLight: THREE.PointLight | null = null;
  switch (params.roomLight) {
    case 'lamp': {
      const lamp = new THREE.PointLight(0xffc078, 3.2, 0, 1.3);
      lamp.position.copy(LIGHT_SPOTS.lamp);
      scene.add(lamp);
      room.lampShade.color.set(0xffd8a0);
      break;
    }
    case 'tv_glow': {
      tvLight = new THREE.PointLight(0x8ab0ff, 2.6, 0, 1.2);
      tvLight.position.copy(LIGHT_SPOTS.tv);
      scene.add(tvLight);
      room.tvScreen.color.set(0x9ab8e8);
      break;
    }
    case 'daylight': {
      const sky = new THREE.DirectionalLight(0xd8e0ea, 2.2);
      sky.position.set(1.2, 2.5, -6);
      sky.target.position.set(0.6, 0.4, -1);
      scene.add(sky, sky.target);
      break;
    }
  }
  if (!lighting.day) {
    // Night: the dim blue of the yard through the window.
    const night = new THREE.PointLight(0x4a5a8a, 0.8, 0, 1.2);
    night.position.set(1.05, 1.6, -3.2);
    scene.add(night);
  }

  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 120);
  scene.add(camera);

  // Eyelids and darkness ride on the camera, in front of everything.
  // Transparent, so that they are drawn after everything else, the window glass included.
  const overlay = (color: number) => {
    const material = kit.own(
      new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false, fog: false }),
    );
    const mesh = new THREE.Mesh(kit.geometry(new THREE.PlaneGeometry(1, 1)), material);
    mesh.renderOrder = 1000;
    mesh.frustumCulled = false;
    mesh.visible = false;
    camera.add(mesh);
    return { mesh, material };
  };
  const upperLid = overlay(0x000000);
  const lowerLid = overlay(0x000000);
  const dark = overlay(0x000000);

  const subtitle = createSubtitleLine();

  let sound: ApartmentSound | null = null;
  let sentTempo: number | null = null;
  const tempo = audio
    ? { breath: audio.profile.breath.breathsPerMinute, ventilator: audio.profile.ventilator.breathsPerMinute }
    : null;

  function update(frame: FrameView): void {
    applyPlayerCamera(camera, frame.player);
    applyCameraSway(camera, feverSway(feverLevel(frame.state.temperature), frame.time));

    if (tvLight) tvLight.intensity = 2.6 * flicker(frame.time);

    const phase = apartmentPhase(frame.state);
    const sleep = apartmentSleep(frame.state);

    // Eyelids: planes as tall as the view, sliding in from above and below.
    const eyes = eyesAt(sleep);
    const halfHeight = LID_DISTANCE * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
    const halfWidth = halfHeight * camera.aspect * 1.05;
    const lidOffset = halfHeight * (2 - eyes.lids);
    for (const [lid, sign] of [
      [upperLid, 1],
      [lowerLid, -1],
    ] as const) {
      lid.mesh.visible = eyes.lids > 0.001;
      lid.mesh.scale.set(halfWidth * 2, halfHeight * 2, 1);
      lid.mesh.position.set(0, sign * lidOffset, -LID_DISTANCE);
    }
    dark.mesh.visible = eyes.dark > 0.001;
    dark.mesh.scale.set(halfWidth * 2, halfHeight * 2, 1);
    dark.mesh.position.set(0, 0, -LID_DISTANCE * 1.01);
    dark.material.opacity = eyes.dark;

    subtitle.show(subtitleAt(params.lastWords, timeline, TICK_DT, frame.sceneTime, sleep));

    if (audio && tempo) {
      const next = { phase, sleep };
      const result = apartmentSoundEvents(sound, next, tempo, sentTempo);
      for (const event of result.events) audio.handle(event);
      sentTempo = result.tempo;
      sound = next;
    }
  }

  const view: SceneView = {
    scene,
    camera,
    update,
    dispose() {
      if (audio) for (const event of apartmentExitEvents()) audio.handle(event);
      subtitle.dispose();
      kit.dispose();
    },
  };
  return view;
};
