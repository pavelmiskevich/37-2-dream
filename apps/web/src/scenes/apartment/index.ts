import * as THREE from 'three';
import { APARTMENT, TICK_DT, apartmentPhase, apartmentSleep, apartmentTimeline, createSeededRng } from '@dream/core';
import { feverLevel } from '../../fever';
import type { FrameView } from '../../loop';
import { applyPlayerCamera } from '../camera';
import { applyCameraSway, feverSway } from '../sway';
import type { SceneView, SceneViewFactory } from '../types';
import { eyesAt } from './eyes';
import { Kit } from './kit';
import { createLids } from './lids';
import { LIGHTING, flicker, lightRoom } from './lighting';
import { subtitleAt } from './lines';
import { buildRoom } from './room';
import { apartmentExitEvents, apartmentSoundEvents, type ApartmentSound } from './sound';
import { createSubtitleLine } from './subtitle';

/**
 * The apartment prologue (vision, slice item 1): a bedroom in a panel block,
 * the hero in bed with 37,2 on the thermometer. He looks around, says
 * "Передайте коту…" and falls asleep: the eyelids close, the picture goes
 * dark, his breathing turns into the ventilator; then the dream begins.
 *
 * The core's apartment rules own the pose and the timeline (`sceneVars`);
 * this view only draws and sounds them. The room, its light and the eyelids
 * are shared with the awakening (`scenes/awakening`).
 */
export const createApartmentView: SceneViewFactory<'apartment'> = ({ scene: apartment, audio }) => {
  const { params } = apartment;
  const timeline = apartmentTimeline(apartment, TICK_DT);
  const eye = new THREE.Vector3(...APARTMENT.eye);

  const kit = new Kit();
  const scene = new THREE.Scene();

  const room = buildRoom(kit, {
    items: params.nightstand,
    celsius: params.thermometer,
    day: LIGHTING[params.roomLight].day,
    rng: createSeededRng(`${apartment.seed}/view`),
    eye,
  });
  scene.add(room.root);
  const lights = lightRoom(scene, room, params.roomLight);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 120);
  scene.add(camera);
  const lids = createLids(kit, camera);

  const subtitle = createSubtitleLine();

  let sound: ApartmentSound | null = null;
  let sentTempo: number | null = null;
  const tempo = audio
    ? { breath: audio.profile.breath.breathsPerMinute, ventilator: audio.profile.ventilator.breathsPerMinute }
    : null;

  function update(frame: FrameView): void {
    applyPlayerCamera(camera, frame.player);
    applyCameraSway(camera, feverSway(feverLevel(frame.state.temperature), frame.time));

    if (lights.tv) lights.tv.intensity = 2.6 * flicker(frame.time);

    const phase = apartmentPhase(frame.state);
    const sleep = apartmentSleep(frame.state);
    lids.update(eyesAt(sleep));

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
