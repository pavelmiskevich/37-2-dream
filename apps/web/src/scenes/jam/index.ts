import * as THREE from 'three';
import { JAM_JAR, createSeededRng, streamKey } from '@dream/core';
import type { FrameView } from '../../loop';
import { feverLevel } from '../../fever';
import { applyPlayerCamera } from '../camera';
import { applyCameraSway, feverSway } from '../sway';
import type { SceneView, SceneViewFactory } from '../types';
import { Bubbles } from './bubbles';
import { MUFFLE_STEP, cuesBetween, jamEchoCues, jamMuffle } from './cues';
import { createLabelTexture } from './label';
import { jamLayout } from './layout';
import { JAM_PALETTES, Kit, buildFruit, buildGlass, buildLabel, buildLemon, buildLid, buildPip, buildSpoon } from './objects';

/**
 * The jar of jam (spec §8, slice step 4): the hero swims inside a giant jar
 * of jam of the dream's flavour. The jam is a dense, translucent medium of
 * its colour, darker towards the bottom; through it show the glass with the
 * label seen backwards from inside, pips and berries hanging in the jam,
 * bubbles, lemons the size of meteorites and a giant spoon. Everything looks
 * almost believable — until gravity turns and the bubbles go sideways.
 *
 * The simulation (dream-core jam rules) owns the swimming, gravity and the
 * hero's felt "up"; the camera is that frame times his own look, and it
 * already turns no faster than the rules allow. The view only draws, and
 * plays the jam's sound: the whole mix muffled, the ventilator breathing
 * through it, the scene's echoes.
 */

/** Fog of the jam: how far one sees in runny and in thick jam, metres. */
const SIGHT = { runny: 19, thick: 12 } as const;
/** Visual smoothing of the felt frame between simulation ticks, per second. */
const FRAME_SMOOTHING = 18;
/** Particles hanging in the jam. */
const PARTICLES = 700;

const tmpColor = new THREE.Color();

export const createJamView: SceneViewFactory<'jam'> = ({ scene: jam, audio }) => {
  const layout = jamLayout(jam);
  const palette = JAM_PALETTES[jam.params.flavor];
  const viscosity = jam.params.viscosity;
  const deep = new THREE.Color(palette.deep);
  const body = new THREE.Color(palette.body);
  const light = new THREE.Color(palette.light);

  const kit = new Kit();
  const scene = new THREE.Scene();
  const sight = SIGHT.runny + (SIGHT.thick - SIGHT.runny) * viscosity;
  scene.background = body.clone();
  scene.fog = new THREE.Fog(body.clone(), 0.8, sight);

  // Daylight falls through the lid and the glass: bright above, the jam's own colour below.
  scene.add(new THREE.HemisphereLight(light.clone().lerp(new THREE.Color(0xffffff), 0.35), deep, 1.6));
  scene.add(new THREE.AmbientLight(body, 0.7));
  const sun = new THREE.DirectionalLight(0xfff0dc, 1.1);
  sun.position.set(3, 12, 2);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 60);

  scene.add(buildGlass(kit));
  const { lid, light: lidLight } = buildLid(kit);
  scene.add(lid, lidLight);
  const labelTexture = createLabelTexture(jam.params.flavor, `#${new THREE.Color(palette.fruit).getHexString()}`);
  scene.add(buildLabel(kit, labelTexture, layout.labelAngle));
  scene.add(buildSpoon(kit, layout.spoon.angle));

  // Lemons the size of meteorites, tumbling slowly round the jar.
  const lemons = layout.lemons.map((slot) => {
    const lemon = buildLemon(kit);
    lemon.scale.setScalar(slot.length);
    scene.add(lemon);
    return { slot, lemon };
  });

  // Pips and berries hang in the jam, bobbing a little.
  const suspended = [
    ...layout.pips.map((slot) => ({ slot, object: buildPip(kit) as THREE.Object3D })),
    ...layout.fruit.map((slot) => ({ slot, object: buildFruit(kit, layout.flavor, palette.fruit) as THREE.Object3D })),
  ];
  for (const { slot, object } of suspended) {
    object.scale.multiplyScalar(slot.size);
    object.rotation.set(...slot.rotation);
    scene.add(object);
  }

  // Specks hanging in the jam: they make the medium visible as the hero moves.
  const specks = new THREE.BufferGeometry();
  const specksRng = createSeededRng(streamKey(jam.seed, 'view', 'specks'));
  const positions: number[] = [];
  for (let i = 0; i < PARTICLES; i++) {
    const r = Math.sqrt(specksRng.next()) * (JAM_JAR.radius - 0.2);
    const a = specksRng.range(0, Math.PI * 2);
    positions.push(Math.sin(a) * r, specksRng.range(0.1, JAM_JAR.height - 0.1), -Math.cos(a) * r);
  }
  specks.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const speckMaterial = kit.own(
    // One low-resolution pixel each: attenuated sizes are computed for the full canvas, not the PS1 target.
    new THREE.PointsMaterial({ color: light.clone().lerp(new THREE.Color(0xffffff), 0.3), size: 1, sizeAttenuation: false }),
  );
  scene.add(new THREE.Points(kit.geometry(specks), speckMaterial));

  const bubbleRoot = new THREE.Group();
  scene.add(bubbleRoot);
  const bubbles = new Bubbles(
    kit,
    bubbleRoot,
    jam.params.bubbleRate,
    viscosity,
    createSeededRng(streamKey(jam.seed, 'view', 'bubbles')),
    palette.light,
  );
  const up = new THREE.Vector3(0, 1, 0);
  // The jam has been bubbling long before the hero fell in.
  for (let i = 0; i < 120; i++) bubbles.update(0.1, up);

  // Sound: the world through jam, the ventilator breathing through it all.
  const cues = jamEchoCues(jam.echoes, jam.duration);
  let startedVentilator = false;
  let sentMuffle = -1;
  if (audio) {
    if (!audio.isPlaying('ventilator')) {
      audio.handle({ type: 'sound.start', sound: 'ventilator', fade: 2 });
      startedVentilator = true;
    }
  }

  const frameTarget = new THREE.Quaternion();
  const felt = new THREE.Quaternion();
  let feltReady = false;
  let lastTime: number | null = null;
  let lastSceneTime = -Infinity;

  function update(frame: FrameView): void {
    const inJam = frame.state.sceneIndex === jam.index;
    const vars = frame.state.sceneVars;
    const dt = lastTime === null ? 0 : Math.max(0, Math.min(0.1, frame.time - lastTime));
    lastTime = frame.time;
    const seconds = frame.sceneTime;

    // The felt frame: the simulation turns it at a limited rate; here it is
    // only smoothed between ticks.
    if (inJam) frameTarget.set(vars.qx ?? 0, vars.qy ?? 0, vars.qz ?? 0, vars.qw ?? 1).normalize();
    if (!feltReady) felt.copy(frameTarget);
    else felt.slerp(frameTarget, 1 - Math.exp(-FRAME_SMOOTHING * dt));
    feltReady = true;

    applyPlayerCamera(camera, frame.player);
    applyCameraSway(camera, feverSway(feverLevel(frame.state.temperature), frame.time));
    camera.quaternion.premultiply(felt);

    // Deeper is darker: the medium takes the colour of the depth the eyes are at.
    const height = Math.min(1, Math.max(0, camera.position.y / JAM_JAR.height));
    tmpColor
      .copy(deep)
      .lerp(body, Math.min(1, 0.5 + height))
      .lerp(light, Math.max(0, height - 0.6) * 0.9);
    (scene.background as THREE.Color).copy(tmpColor);
    scene.fog?.color.copy(tmpColor);

    // Bubbles rise against gravity, whichever way it pulls now.
    if (inJam) up.set(-(vars.gx ?? 0), -(vars.gy ?? -1), -(vars.gz ?? 0)).normalize();
    bubbles.update(dt, up);

    for (const { slot, lemon } of lemons) {
      const a = slot.orbit * seconds;
      const [x, y, z] = slot.position;
      lemon.position.set(x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a));
      lemon.rotation.set(
        slot.rotation[0] + slot.spin[0] * seconds,
        slot.rotation[1] + slot.spin[1] * seconds,
        slot.rotation[2] + slot.spin[2] * seconds,
      );
    }
    for (const { slot, object } of suspended) {
      const [x, y, z] = slot.position;
      object.position.set(x, y + 0.06 * Math.sin(seconds * 0.5 + slot.phase), z);
    }

    // The lid gives: daylight round its rim, the lid lifted a little.
    const open = inJam ? (vars.lidOpen ?? 0) : 1;
    lidLight.visible = open > 0;
    lid.position.y = JAM_JAR.height + (open > 0 ? 0.25 : 0);

    if (audio && inJam) {
      const muffle = jamMuffle(frame.player.position[1]);
      if (Math.abs(muffle - sentMuffle) >= MUFFLE_STEP) {
        audio.handle({ type: 'master.muffle', value: muffle });
        sentMuffle = muffle;
      }
      for (const cue of cuesBetween(cues, lastSceneTime, seconds)) audio.handle(cue.event);
    }
    if (inJam) lastSceneTime = seconds;
  }

  const view: SceneView = {
    scene,
    camera,
    update,
    dispose() {
      if (audio) {
        audio.handle({ type: 'master.muffle', value: 0 });
        if (startedVentilator) audio.handle({ type: 'sound.stop', sound: 'ventilator', fade: 1.5 });
      }
      labelTexture.dispose();
      kit.dispose();
    },
  };
  return view;
};
