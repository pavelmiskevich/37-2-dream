import * as THREE from 'three';
import {
  APARTMENT,
  TICK_DT,
  awakeningTimeline,
  awakeningWake,
  createSeededRng,
  findScene,
  thermometerReading,
} from '@dream/core';
import { feverLevel } from '../../fever';
import type { FrameView } from '../../loop';
import { eyesAt } from '../apartment/eyes';
import { Kit } from '../apartment/kit';
import { createLids } from '../apartment/lids';
import { lightRoom } from '../apartment/lighting';
import { buildRoom, type Room } from '../apartment/room';
import { createSubtitleLine } from '../apartment/subtitle';
import { applyPlayerCamera } from '../camera';
import { applyCameraSway, feverSway } from '../sway';
import type { SceneView, SceneViewFactory } from '../types';
import { callSubtitle, verdictLines, verdictOpacity } from './lines';
import { awakeningCues, awakeningExitEvents } from './sound';
import { createVerdictCard } from './verdict';

/**
 * The awakening (vision, slice item 6): the same bedroom as the prologue, by
 * daylight. The eyes open; the thermometer on the bedside table shows the
 * temperature he woke up with (36,9 when the dream ran its course); the
 * vacuum behind the wall is an ordinary vacuum cleaner and goes quiet (the
 * runtime's vacuum layer); the kitchen clinks, the microwave beeps; somebody
 * asks "Ты чай будешь?"; and the reason of the awakening is stated. Then the
 * dream is over (`finished`).
 *
 * The core's awakening rules own the pose, the timeline, the reason and the
 * temperature; this view only draws and sounds them. The room is the
 * prologue's (`scenes/apartment`), built from the apartment scene of the same
 * dream, so the bedside table and the block across the yard are the same.
 */
export const createAwakeningView: SceneViewFactory<'awakening'> = ({ dream, scene: awakening, audio }) => {
  const timeline = awakeningTimeline(TICK_DT);
  const apartment = findScene(dream, 'apartment');
  const kit = new Kit();
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 120);
  scene.add(camera);
  const lids = createLids(kit, camera);

  const subtitle = createSubtitleLine();
  subtitle.element.classList.add('subtitle--offscreen');
  const verdict = createVerdictCard();

  // The thermometer shows the temperature of this run, known from the first frame.
  let room: Room | null = null;
  const furnish = (celsius: number) => {
    room = buildRoom(kit, {
      items: apartment?.params.nightstand ?? [],
      celsius,
      day: true,
      rng: createSeededRng(`${(apartment ?? awakening).seed}/view`),
      eye: new THREE.Vector3(...APARTMENT.eye),
    });
    scene.add(room.root);
    lightRoom(scene, room, 'daylight');
  };

  const cues = audio ? awakeningCues(timeline, TICK_DT, audio.profile.breath.breathsPerMinute) : [];
  let lastSceneTime = -Infinity;

  function update(frame: FrameView): void {
    const here = frame.state.sceneIndex === awakening.index;
    const celsius = here ? frame.state.temperature : awakening.params.temperature;
    if (!room) furnish(thermometerReading(celsius));

    applyPlayerCamera(camera, frame.player);
    applyCameraSway(camera, feverSway(feverLevel(celsius), frame.time));

    // Waking up is falling asleep backwards: the dark lifts, the lids part, blink twice.
    lids.update(eyesAt(1 - (here ? awakeningWake(frame.state) : 1)));

    subtitle.show(callSubtitle(timeline, TICK_DT, frame.sceneTime));
    const reason = (here ? frame.state.wakeReason : undefined) ?? awakening.params.reason;
    verdict.show(verdictLines(reason, celsius), verdictOpacity(timeline, TICK_DT, frame.sceneTime));

    if (audio) {
      for (const cue of cues) if (cue.at > lastSceneTime && cue.at <= frame.sceneTime) audio.handle(cue.event);
    }
    lastSceneTime = frame.sceneTime;
  }

  const view: SceneView = {
    scene,
    camera,
    update,
    dispose() {
      if (audio) for (const event of awakeningExitEvents()) audio.handle(event);
      subtitle.dispose();
      verdict.dispose();
      kit.dispose();
    },
  };
  return view;
};
