import * as THREE from 'three';
import { EYE_HEIGHT, fallenFraction, findScene, willOfScene, type JamFlavor } from '@dream/core';
import type { FrameView } from '../../loop';
import { feverLevel } from '../../fever';
import { applyPlayerCamera } from '../camera';
import { applyCameraSway, feverSway } from '../sway';
import type { SceneView, SceneViewFactory } from '../types';
import { fallLayout, pageReveal, pageRise, pageStay } from './layout';
import { FallingPool, Kit } from './objects';
import { WillSheet } from './pages';

/**
 * The fall (spec §13–14, slice step 3): an endless drop through a dark void
 * past a sofa, a fridge, a thermometer, a vacuum cleaner, a bed and toilet
 * paper, with pages of the will rising alongside and their text appearing.
 * The monitor races towards the landing in the jam.
 *
 * The simulation (dream-core fall rules) owns the pose, the drift and the
 * tumble; this view only stretches the honest height into a long visual drop
 * and draws it.
 */

const VOID_COLOR = 0x15142a;
const FOG = { near: 7, far: 42 } as const;
/** Objects exist from this far below the eyes to this far above. */
const VISIBLE_BELOW = 48;
const VISIBLE_ABOVE = 14;
/** Speed streaks: vertical span of one tile, number of streaks per tile. */
const STREAK_TILE = 60;
const STREAK_COUNT = 70;
/** Smallest change of monitor urgency worth an event. */
const MONITOR_STEP = 0.02;
/** A page within this cone of the view (cosine of the half-angle) comes up close. */
const FOCUS_CONE = Math.cos((24 * Math.PI) / 180);
/** How fast a page comes up close or goes back, shares per second. */
const FOCUS_RATE = 1.2;
/** From this share of the fall the camera turns down to the jar, to this pitch. */
const LOOK_DOWN_FROM = 0.86;
const LOOK_DOWN_PITCH = -1.2;
/** Distance from the eyes a page is read at, metres. */
const READ_DISTANCE = 0.95;

const approach = (value: number, target: number, step: number) =>
  value < target ? Math.min(target, value + step) : Math.max(target, value - step);

/** Jam colours by flavour; the jar waiting below is the next scene's. */
const JAM_COLORS: Readonly<Record<JamFlavor, number>> = {
  raspberry: 0x8c1634,
  cherry: 0x5e0c1e,
  apricot: 0xc4701c,
  blackcurrant: 0x2e0c30,
};

function buildStreaks(kit: Kit): THREE.BufferGeometry {
  // Deterministic placement; the streaks only sell the speed.
  const points: number[] = [];
  for (let i = 0; i < STREAK_COUNT; i++) {
    const a = i * 2.399963; // golden angle
    const r = 2.5 + ((i * 7919) % 97) / 9.7;
    const y = ((i * 104729) % 600) / 10;
    const length = 1.5 + ((i * 31) % 7) * 0.5;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    points.push(x, y, z, x, y + length, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return kit.geometry(geometry);
}

function buildJar(kit: Kit, color: number, surfaceY: number): THREE.Group {
  const jar = new THREE.Group();
  const radius = 16;
  const jam = new THREE.Mesh(
    kit.geometry(new THREE.CircleGeometry(radius, 24).rotateX(-Math.PI / 2)),
    kit.own(new THREE.MeshBasicMaterial({ color })),
  );
  jar.add(jam);
  // Bubbles on the surface.
  for (let i = 0; i < 9; i++) {
    const a = i * 2.399963;
    const r = 1.5 + i * 1.4;
    const bubble = new THREE.Mesh(kit.geometry(new THREE.SphereGeometry(0.35 + (i % 3) * 0.2, 6, 4)), kit.material(color));
    bubble.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r);
    bubble.scale.y = 0.45;
    jar.add(bubble);
  }
  // The glass wall above the jam and the thread of the neck.
  const wall = new THREE.Mesh(
    kit.geometry(new THREE.CylinderGeometry(radius, radius, 9, 24, 1, true)),
    kit.own(new THREE.MeshLambertMaterial({ color: 0x9ab4b0, transparent: true, opacity: 0.35, side: THREE.DoubleSide })),
  );
  wall.position.y = 4.5;
  jar.add(wall);
  const rim = new THREE.Mesh(kit.geometry(new THREE.TorusGeometry(radius, 0.35, 4, 24).rotateX(Math.PI / 2)), kit.material(0xb8ccc8));
  rim.position.y = 9;
  jar.add(rim);
  jar.position.y = surfaceY;
  return jar;
}

export const createFallView: SceneViewFactory<'fall'> = ({ dream, scene: fall, audio }) => {
  const layout = fallLayout(fall);
  const pages = willOfScene(dream.seed, fall);
  const jamFlavor = findScene(dream, 'jam')?.params.flavor ?? 'raspberry';

  const kit = new Kit();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(VOID_COLOR);
  scene.fog = new THREE.Fog(VOID_COLOR, FOG.near, FOG.far);
  // Tumbling objects show every side: a strong ambient keeps their undersides readable.
  scene.add(new THREE.HemisphereLight(0xc8c4e0, 0x5a4860, 1.4));
  scene.add(new THREE.AmbientLight(0x8a86a0, 0.9));
  const key = new THREE.DirectionalLight(0xfff0dc, 1.6);
  key.position.set(-3, 8, 4);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 80);

  // Falling household objects, created near the hero and reused.
  const objectsRoot = new THREE.Group();
  scene.add(objectsRoot);
  const pool = new FallingPool(kit, objectsRoot);
  const live = new Map<number, THREE.Group>();

  // Speed streaks: three stacked tiles that follow the camera.
  const streakGeometry = buildStreaks(kit);
  const streakMaterial = kit.own(new THREE.LineBasicMaterial({ color: 0x5a5880 }));
  const streaks = [0, 1, 2].map(() => {
    const lines = new THREE.LineSegments(streakGeometry, streakMaterial);
    scene.add(lines);
    return lines;
  });

  // The jar of jam waiting at the bottom. The eyes land EYE_HEIGHT above it.
  const jar = buildJar(kit, JAM_COLORS[jamFlavor], -layout.depth - EYE_HEIGHT);
  scene.add(jar);

  const sheets = pages.map((page) => new WillSheet(page));
  for (const sheet of sheets) {
    sheet.object.visible = false;
    scene.add(sheet.object);
  }

  // The monitor: started here if nothing else is playing it, and sped up.
  let startedMonitor = false;
  let lastMonitor = -1;
  if (audio && !audio.isPlaying('monitor')) {
    audio.handle({ type: 'sound.start', sound: 'monitor' });
    startedMonitor = true;
  }

  const target = new THREE.Vector3();
  const base = new THREE.Vector3();
  const near = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const toPage = new THREE.Vector3();
  /** 0..1 per page: how far it has come up close to be read. */
  const focus: number[] = sheets.map(() => 0);
  let lastTime: number | null = null;

  function update(frame: FrameView): void {
    const inFall = frame.state.sceneIndex === fall.index;
    const progress = inFall ? Math.min(1, frame.sceneTime / fall.duration) : 1;
    const cameraY = -fallenFraction(progress) * layout.depth;
    const vars = frame.state.sceneVars;
    const seconds = progress * fall.duration;

    applyPlayerCamera(camera, frame.player);
    camera.position.y = cameraY;
    if (inFall) {
      // Just before the landing the gaze is pulled down to the jar.
      const t = Math.min(1, Math.max(0, (progress - LOOK_DOWN_FROM) / (1 - LOOK_DOWN_FROM)));
      const pull = t * t * (3 - 2 * t);
      const pitch = frame.player.pitch + (vars.sway ?? 0);
      camera.rotation.set(pitch + (LOOK_DOWN_PITCH - pitch) * pull, frame.player.yaw, (vars.roll ?? 0) * (1 - pull));
    }
    // Fever sway (D-013, D-014) on top of the fall's own tumble.
    applyCameraSway(camera, feverSway(feverLevel(frame.state.temperature), frame.time));

    // Objects within reach of the fog.
    layout.objects.forEach((slot, index) => {
      const near = slot.y > cameraY - VISIBLE_BELOW && slot.y < cameraY + VISIBLE_ABOVE;
      const group = live.get(index);
      if (near && !group) {
        live.set(index, pool.take(slot.kind));
      } else if (!near && group) {
        pool.give(slot.kind, group);
        live.delete(index);
      }
      const shown = live.get(index);
      if (!shown) return;
      shown.position.set(slot.x, slot.y, slot.z);
      shown.rotation.set(
        slot.rotation[0] + slot.spin[0] * seconds,
        slot.rotation[1] + slot.spin[1] * seconds,
        slot.rotation[2] + slot.spin[2] * seconds,
      );
    });

    const tile = Math.floor(cameraY / STREAK_TILE) * STREAK_TILE;
    streaks.forEach((lines, i) => lines.position.set(0, tile + (i - 1) * STREAK_TILE, 0));

    // Will pages: each rises into view, lingers facing the hero, then leaves
    // upwards. A page the hero looks at drifts up close and straightens, so
    // its text can be read at the PS1 resolution.
    const dt = lastTime === null ? 0 : Math.max(0, Math.min(0.1, frame.time - lastTime));
    lastTime = frame.time;
    camera.updateMatrixWorld();
    camera.getWorldDirection(forward);
    sheets.forEach((sheet, i) => {
      const slot = layout.pages[i]!;
      const u = pageStay(slot, progress);
      sheet.object.visible = inFall && u > 0 && u < 1;
      if (!sheet.object.visible) {
        focus[i] = 0;
        return;
      }
      const x = Math.sin(slot.angle) * slot.distance;
      const z = -Math.cos(slot.angle) * slot.distance;
      const y = cameraY + pageRise(u) - 0.1;
      base.set(x, y, z);

      toPage.subVectors(base, camera.position).normalize();
      const looking = toPage.dot(forward) > FOCUS_CONE;
      const wanted = looking && u > 0.15 && u < 0.85 ? 1 : 0;
      const f = (focus[i] = approach(focus[i] ?? 0, wanted, dt * FOCUS_RATE));
      const ease = f * f * (3 - 2 * f);

      // Far pose: at its slot, turned to the hero, fluttering.
      sheet.object.position.copy(base);
      target.set(camera.position.x, y, camera.position.z);
      sheet.object.lookAt(target);
      const [a, b, c] = slot.flutter;
      const calm = 1 - 0.85 * ease;
      sheet.object.rotateY(calm * 0.25 * Math.sin(seconds * 1.3 + a));
      sheet.object.rotateX(calm * 0.18 * Math.sin(seconds * 1.7 + b));
      sheet.object.rotateZ(calm * 0.12 * Math.sin(seconds * 0.9 + c));

      if (ease > 0) {
        // Near pose: in front of the eyes, upright to the camera.
        near.copy(camera.position).addScaledVector(forward, READ_DISTANCE);
        sheet.object.position.lerp(near, ease);
        sheet.object.quaternion.slerp(camera.quaternion, ease);
      }
      sheet.reveal(pageReveal(u));
    });

    if (audio) {
      const monitor = vars.monitor ?? 1;
      if (Math.abs(monitor - lastMonitor) >= MONITOR_STEP || (monitor === 1 && lastMonitor !== 1)) {
        audio.handle({ type: 'monitor.intensity', value: monitor });
        lastMonitor = monitor;
      }
    }
  }

  const view: SceneView = {
    scene,
    camera,
    update,
    dispose() {
      if (audio && startedMonitor) audio.handle({ type: 'sound.stop', sound: 'monitor' });
      for (const sheet of sheets) sheet.dispose();
      kit.dispose();
    },
  };
  return view;
};
