import * as THREE from 'three';
import { SWING_RELEASE, YARD_VARS, sceneRng, yardLayout, type Rng, type SimState } from '@dream/core';
import { feverLevel } from '../../fever';
import { applyPlayerCamera } from '../camera';
import { applyCameraSway, feverSway } from '../sway';
import type { SceneView, SceneViewFactory } from '../types';
import { creakCue, type SwingSample } from './creak-cue';
import { FLOOR_HEIGHT, WINDOW_PITCH, blockHeight, dressYard, womanAt, type BlockPlan } from './dressing';
import { easeHint, gatherSpot, hintLook, lampFlicker, pigeonGoes } from './hint';
import { mixColor, yardLook, type YardLook } from './look';
import { Kit, buildBench, buildBins, buildCar, buildLamp, buildSandbox, buildSwing } from './props';
import { paintAsphalt, paintCurtain, paintFacade, paintGrain, paintPigeon, paintWoman } from './textures';

/**
 * The yard (spec §7, vision: slice step 2): panel blocks around a wet
 * courtyard, lamps, a bench, bins, parked cars, pigeons, a swing — and,
 * now and then, the woman with the vacuum cleaner gliding past at the far
 * side like a piece of cardboard. Everything is built from code and the
 * seed: the layout the rules use (`yardLayout`), the scene params (time of
 * day, floors, fog) and the view's own stream `scene/N/view`.
 *
 * The view only reads the simulation: the swing angle, the transition and
 * the swing's insistence come from `sceneVars` (dream-core `yard.ts`). The
 * swing creaks through the sound engine whenever the seat passes the bottom
 * (`creakCue`). When the hero does not find the swing, the yard calls him to
 * it (`hint.ts`): the lamp over the swing burns brighter and buzzes, the rest
 * of the yard dims, the pigeons walk over and stare at the swing.
 */

/** The view's random stream inside the scene (never the simulation's). */
export const YARD_VIEW_CHANNEL = 'view';

const RAIN_BOX = { half: 14, height: 12 } as const;
const RAIN_SPEED = 7;
const RAIN_DROPS = 900;
/** The hero this close scares the pigeons up, metres. */
const PIGEON_FRIGHT = 2.6;
/** Pigeons walk to the swing at this speed, m/s: unhurried, with little hops. */
const PIGEON_WALK = 0.45;
/** Light of a burning street lamp, candela. */
const LAMP_LIGHT = 14;
/** The lamp over the swing at the top insistence adds this much. */
const CALLING_LAMP_LIGHT = 70;
/** The lamp over the swing stands this far along the swing's bar, metres, its arm reaching back over it. */
const CALLING_LAMP = { out: 2.7, reach: 2.4 } as const;

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

const swingOf = (state: SimState): SwingSample => ({
  angle: state.sceneVars[YARD_VARS.angle] ?? 0,
  speed: state.sceneVars[YARD_VARS.speed] ?? 0,
});

interface Pigeon {
  mesh: THREE.Mesh;
  base: THREE.Vector3;
  /** Where it stands when it has come to the swing. */
  spot: THREE.Vector3;
  /** 0…1: how far it has walked from `base` to `spot`. */
  walk: number;
  /** Which way its beak points (`scale.x`) when it is not staring at the swing. */
  side: 1 | -1;
  phase: number;
  /** Flight velocity once scared; null on the ground. */
  flight: THREE.Vector3 | null;
}

interface Curtain {
  mesh: THREE.Mesh;
  rate: number;
  phase: number;
}

/** Where a moving curtain hangs, collected while the blocks are built. */
interface CurtainPlan {
  position: THREE.Vector3;
  width: number;
  height: number;
  yaw: number;
}

export const createYardView: SceneViewFactory<'yard'> = ({ dream, scene: dreamScene, audio }) => {
  const params = dreamScene.params;
  const rng = sceneRng(dream.seed, dreamScene.index, YARD_VIEW_CHANNEL);
  const layout = yardLayout(dream.seed, dreamScene.index);
  const dressing = dressYard(layout, params, rng);
  const look = yardLook(params);
  const kit = new Kit();

  const scene = new THREE.Scene();
  scene.name = 'yard';
  scene.background = new THREE.Color(look.sky);
  scene.fog = new THREE.Fog(look.fog, look.fogNear, look.fogFar);

  // Everything but the sky lives in `world`, so the transition can scale it.
  const world = new THREE.Group();
  scene.add(world);

  const hemi = new THREE.HemisphereLight(look.hemiSky, look.hemiGround, look.hemiIntensity);
  world.add(hemi);
  const sun = new THREE.DirectionalLight(look.sun, look.sunIntensity);
  sun.position.set(...look.sunFrom);
  world.add(sun);

  buildGround(kit, world, look, layout, rng);
  const curtainPlans: CurtainPlan[] = [];
  const facades: THREE.MeshLambertMaterial[] = [];
  for (const block of dressing.blocks) world.add(buildBlock(kit, block, look, rng, curtainPlans, facades));
  const windowGlow = look.lampsOn ? 1 : 0.25;

  const swingPaint = rng.pick([0x6a8aa8, 0xb04a3a, 0xc8a83a, 0x5a8a5a]);
  const swing = buildSwing(kit, swingPaint);
  swing.root.position.set(layout.swing.x, 0, layout.swing.z);
  swing.root.rotation.y = layout.swing.yaw;
  world.add(swing.root);

  const sandbox = buildSandbox(kit);
  sandbox.position.set(dressing.sandbox.x, 0, dressing.sandbox.z);
  sandbox.rotation.y = dressing.sandbox.yaw;
  world.add(sandbox);

  for (const spot of dressing.benches) {
    const bench = buildBench(kit);
    bench.position.set(spot.x, 0, spot.z);
    bench.rotation.y = spot.yaw;
    world.add(bench);
  }

  const bins = buildBins(kit, dressing.bins.count);
  bins.position.set(dressing.bins.x, 0, dressing.bins.z);
  bins.rotation.y = dressing.bins.yaw;
  world.add(bins);

  const lampLights: THREE.PointLight[] = [];
  for (const spot of dressing.lamps) {
    const { lamp, head } = buildLamp(kit, look.lampsOn);
    lamp.position.set(spot.x, 0, spot.z);
    lamp.rotation.y = spot.yaw;
    world.add(lamp);
    if (look.lampsOn) {
      // Sodium-orange pools of light on the wet asphalt.
      const light = new THREE.PointLight(0xffb060, LAMP_LIGHT, 16, 1.2);
      light.position.copy(head);
      lamp.add(light);
      lampLights.push(light);
    }
  }

  // The lamp over the swing: an ordinary one, until the swing starts calling.
  // Placed by the layout alone (no draws), beside the frame, its arm over the bar.
  const calling = buildLamp(kit, true, CALLING_LAMP.reach);
  const callingX = layout.swing.x + Math.cos(layout.swing.yaw) * CALLING_LAMP.out;
  const callingZ = layout.swing.z - Math.sin(layout.swing.yaw) * CALLING_LAMP.out;
  calling.lamp.position.set(callingX, 0, callingZ);
  calling.lamp.rotation.y = Math.atan2(layout.swing.x - callingX, layout.swing.z - callingZ);
  world.add(calling.lamp);
  const callingLight = new THREE.PointLight(0xffc070, look.lampsOn ? LAMP_LIGHT : 0, 11, 1.4);
  callingLight.position.copy(calling.head);
  calling.lamp.add(callingLight);
  const callingGlass = calling.glass.color;
  const glassBase = look.lampsOn ? 0xffd090 : 0x9a9a90;

  for (const spot of dressing.cars) {
    const car = buildCar(kit, spot.color);
    car.position.set(spot.x, 0, spot.z);
    car.rotation.y = spot.yaw;
    world.add(car);
  }

  // Curtains in a few lit windows, moving now and then.
  const curtains: Curtain[] = curtainPlans.map(({ position, width, height, yaw }) => {
    const material = kit.basic({ map: kit.own(paintCurtain(rng)), color: 0xd8c8a0 });
    const mesh = kit.plane(width * 0.5, height, material);
    mesh.position.copy(position);
    mesh.rotation.y = yaw;
    world.add(mesh);
    return { mesh, rate: rng.range(0.15, 0.5), phase: rng.range(0, Math.PI * 2) };
  });

  // Pigeons: cardboard birds pecking at the asphalt.
  const pigeonTexture = kit.own(paintPigeon());
  const pigeonMaterial = kit.lambert({ map: pigeonTexture, alphaTest: 0.5, side: THREE.DoubleSide });
  const pigeons: Pigeon[] = [];
  for (let i = 0; i < dressing.pigeons.count; i++) {
    const mesh = kit.plane(0.36, 0.24, pigeonMaterial);
    const base = new THREE.Vector3(
      dressing.pigeons.x + rng.range(-1.4, 1.4),
      0.12,
      dressing.pigeons.z + rng.range(-1.4, 1.4),
    );
    mesh.position.copy(base);
    const side = rng.chance(0.5) ? 1 : -1;
    mesh.scale.x = side;
    world.add(mesh);
    const at = gatherSpot(layout.swing.x, layout.swing.z, i);
    pigeons.push({ mesh, base, spot: new THREE.Vector3(at.x, base.y, at.z), walk: 0, side, phase: rng.range(0, 10), flight: null });
  }

  // The woman with the vacuum cleaner: flat, unexplained (D-007).
  const womanMaterial = kit.lambert({ map: kit.own(paintWoman()), alphaTest: 0.5, side: THREE.DoubleSide });
  const woman = kit.plane(1.0, 2.0, womanMaterial);
  woman.visible = false;
  world.add(woman);

  // Drizzle: short streaks around the hero.
  const rain = look.drizzle > 0 ? buildRain(kit, look, rng) : null;
  if (rain) scene.add(rain.lines);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 600);

  // Swing angle of the last two ticks the view has seen, for interpolation and creaks.
  let shownTick = -1;
  let before: SwingSample | null = null;
  let now: SwingSample | null = null;
  let lastTime: number | null = null;
  // Insistence of the swing as shown: eased towards the rules' level; null before the first frame.
  let shownHint: number | null = null;
  const ground = new THREE.Vector3();

  const view: SceneView = {
    scene,
    camera,
    update(frame) {
      const { state } = frame;
      if (state.tick !== shownTick) {
        const sample = swingOf(state);
        before = now ?? sample;
        now = sample;
        shownTick = state.tick;
        const cue = creakCue(before, now, state.sceneVars[YARD_VARS.hint] ?? 0);
        if (cue && audio) audio.handle({ type: 'swing.creak', strength: cue.strength, pitch: params.swingCreakPitch * cue.pitch });
      }
      const angle = before && now ? before.angle + (now.angle - before.angle) * frame.alpha : 0;
      swing.seat.rotation.x = angle;

      const dt = lastTime === null ? 0 : Math.min(0.1, Math.max(0, frame.time - lastTime));
      lastTime = frame.time;
      const t = frame.sceneTime;

      // Transition: after letting go the world swells around the swing and gravity turns over.
      const released = (state.sceneVars[YARD_VARS.released] ?? 0) === 1;
      const progress = released ? smooth((state.sceneVars[YARD_VARS.releaseTime] ?? 0) / SWING_RELEASE.duration) : 0;
      const scale = 1 + 3.5 * progress * progress;
      world.scale.setScalar(scale);
      world.position.set(layout.swing.x * (1 - scale), 0, layout.swing.z * (1 - scale));
      const gravity = 1 - 2 * progress; // 1: down as usual, −1: up.

      // The swing calls: its lamp brightens and buzzes, the rest of the yard dims.
      const targetHint = state.sceneVars[YARD_VARS.hint] ?? 0;
      const first = shownHint === null;
      shownHint = first ? targetHint : easeHint(shownHint ?? 0, targetHint, dt);
      const hint = hintLook(shownHint);
      hemi.intensity = look.hemiIntensity * hint.dimming;
      sun.intensity = look.sunIntensity * hint.dimming;
      for (const light of lampLights) light.intensity = LAMP_LIGHT * hint.dimming;
      for (const facade of facades) facade.emissiveIntensity = windowGlow * hint.dimming;
      const dusk = mixColor(look.sky, 0x000000, (1 - hint.dimming) * 0.6);
      (scene.background as THREE.Color).setHex(dusk);
      scene.fog!.color.setHex(dusk);
      const buzz = lampFlicker(frame.time, hint.flicker);
      callingLight.intensity = ((look.lampsOn ? LAMP_LIGHT : 0) + CALLING_LAMP_LIGHT * hint.lampGlow) * buzz;
      callingGlass.setHex(mixColor(glassBase, 0xfff6e0, hint.lampGlow)).multiplyScalar(0.35 + 0.65 * buzz);

      for (const curtain of curtains) {
        // Mostly still; now and then somebody draws it.
        const wave = Math.sin(t * curtain.rate + curtain.phase);
        const drawn = Math.max(0, wave) ** 3;
        curtain.mesh.scale.x = 0.4 + 0.6 * drawn;
      }

      const [px, , pz] = frame.player.position;
      pigeons.forEach((pigeon, index) => {
        // The calling swing draws the flock over, a few birds at a time.
        const goes = pigeonGoes(index, pigeons.length, hint.gathered);
        const distance = Math.max(0.5, pigeon.base.distanceTo(pigeon.spot));
        const walking = !pigeon.flight && (goes ? pigeon.walk < 1 : pigeon.walk > 0);
        const stride = ((goes ? 1 : -1) * PIGEON_WALK * dt) / distance;
        pigeon.walk = first ? (goes ? 1 : 0) : Math.min(1, Math.max(0, pigeon.walk + stride));
        ground.lerpVectors(pigeon.base, pigeon.spot, pigeon.walk);
        if (!pigeon.flight && (Math.hypot(ground.x - px, ground.z - pz) < PIGEON_FRIGHT || released)) {
          const away = new THREE.Vector3(ground.x - px, 0, ground.z - pz).normalize();
          pigeon.flight = new THREE.Vector3(away.x * 3.5, released ? 0 : 3, away.z * 3.5);
        }
        if (pigeon.flight) {
          pigeon.flight.y += (released ? 9 * (1 - gravity) : 1.5) * dt;
          pigeon.mesh.position.addScaledVector(pigeon.flight, dt);
          pigeon.mesh.rotation.z = Math.sin(t * 30 + pigeon.phase) * 0.3;
        } else if (walking) {
          // Little hops on the way to the swing.
          const hop = Math.abs(Math.sin(t * 9 + pigeon.phase)) * 0.06;
          pigeon.mesh.position.set(ground.x, ground.y + hop, ground.z);
          pigeon.mesh.rotation.z = 0;
        } else if (pigeon.walk >= 1) {
          // Arrived: it stands still and stares at the swing; no pecking.
          pigeon.mesh.position.copy(ground);
          pigeon.mesh.rotation.z = 0;
        } else {
          // Pecking: a quick dip now and then.
          const peck = Math.max(0, Math.sin(t * 3 + pigeon.phase)) ** 8;
          pigeon.mesh.position.set(ground.x, ground.y - peck * 0.05, ground.z);
          pigeon.mesh.rotation.z = -peck * 0.4 * Math.sign(pigeon.mesh.scale.x);
        }
        // Cardboard birds turn to the hero around the vertical only.
        const facing = Math.atan2(px - pigeon.mesh.position.x, pz - pigeon.mesh.position.z);
        pigeon.mesh.rotation.y = facing;
        if (!pigeon.flight && pigeon.walk > 0) {
          // On its way or arrived, the beak (the texture's +X) points at the swing as the hero sees it.
          const toSwing = (layout.swing.x - ground.x) * Math.cos(facing) - (layout.swing.z - ground.z) * Math.sin(facing);
          if (Math.abs(toSwing) > 0.05) pigeon.mesh.scale.x = Math.sign(toSwing);
        } else if (!pigeon.flight) {
          pigeon.mesh.scale.x = pigeon.side;
        }
      });

      const at = womanAt(dressing.woman, t);
      woman.visible = at !== null;
      if (at) {
        woman.position.set(at.x, 1.0 + Math.abs(Math.sin(t * 2.2)) * 0.015, dressing.woman.z);
        woman.scale.x = at.direction;
      }

      if (rain) rain.update(frame.player.position, dt, gravity);

      applyPlayerCamera(camera, frame.player);
      applyCameraSway(camera, feverSway(feverLevel(state.temperature), frame.time));
      // Letting go: the horizon slowly tips over.
      camera.rotation.z += progress * progress * 0.6;
    },
    dispose() {
      kit.dispose();
    },
  };
  return view;
};

function buildGround(kit: Kit, world: THREE.Group, look: YardLook, layout: ReturnType<typeof yardLayout>, rng: Rng) {
  const size = 160;
  const asphalt = kit.own(paintAsphalt(look.asphalt, rng));
  asphalt.repeat.set(size / 4, size / 4);
  // Subdivided into 2 m cells so the PS1 affine warping stays small.
  const geometry = kit.own(new THREE.PlaneGeometry(size, size, size / 2, size / 2).rotateX(-Math.PI / 2));
  world.add(new THREE.Mesh(geometry, kit.lambert({ map: asphalt })));

  // Muddy lawn strips along the blocks.
  const mud = kit.lambert({ map: kit.own(paintGrain(0x4a4a34, rng)) });
  const { halfWidth: w, halfDepth: d } = layout;
  world.add(kit.box(2 * w, 0.06, 1.6, mud, 0, 0, -d + 0.8));
  world.add(kit.box(1.6, 0.06, 2 * d, mud, -w + 0.8, 0, 0));
  world.add(kit.box(1.6, 0.06, 2 * d, mud, w - 0.8, 0, 0));

  // Puddles: flat patches of the sky lying on the asphalt.
  const puddle = kit.basic({ color: look.puddle });
  const puddles = rng.int(4, 9);
  for (let i = 0; i < puddles; i++) {
    const mesh = new THREE.Mesh(kit.own(new THREE.CircleGeometry(rng.range(0.5, 1.6), 7).rotateX(-Math.PI / 2)), puddle);
    mesh.position.set(rng.range(-w + 2, w - 2), 0.012, rng.range(-d + 2, d - 2));
    mesh.scale.set(1, 1, rng.range(0.5, 1));
    mesh.rotation.y = rng.range(0, Math.PI);
    world.add(mesh);
  }
}

function buildBlock(
  kit: Kit,
  plan: BlockPlan,
  look: YardLook,
  rng: Rng,
  curtains: CurtainPlan[],
  facades: THREE.MeshLambertMaterial[],
): THREE.Group {
  const block = new THREE.Group();
  block.position.set(plan.x, 0, plan.z);
  block.rotation.y = plan.yaw;
  const columns = Math.max(1, Math.floor(plan.length / WINDOW_PITCH));
  const height = blockHeight(plan.floors);
  const facade = paintFacade(
    { columns, floors: plan.floors, lit: look.litWindows, ...(plan.home ? { home: plan.home } : {}) },
    rng,
  );
  kit.own(facade.texture);
  kit.own(facade.glow);
  const glowStrength = look.lampsOn ? 1 : 0.25;
  const front = kit.lambert({ map: facade.texture, emissiveMap: facade.glow, emissive: 0xffffff, emissiveIntensity: glowStrength });
  facades.push(front);
  const wall = kit.lambert({ color: 0x9a9488 });
  const roof = kit.lambert({ color: 0x4a4a48 });
  // Box faces: +X, −X, +Y, −Y, +Z (the facade, towards the yard), −Z.
  // One segment per window cell: big faces would warp wildly under PS1 affine texturing.
  const geometry = kit.own(new THREE.BoxGeometry(plan.length, height, plan.depth, columns, plan.floors, 4));
  const body = new THREE.Mesh(geometry, [wall, wall, roof, roof, front, wall]);
  body.position.y = height / 2;
  block.add(body);

  const cell = plan.length / columns;
  const toWorld = (local: THREE.Vector3) => local.applyAxisAngle(new THREE.Vector3(0, 1, 0), plan.yaw).add(new THREE.Vector3(plan.x, 0, plan.z));
  for (const [floor, column] of facade.curtains) {
    const local = new THREE.Vector3(-plan.length / 2 + (column + 0.5) * cell, (floor - 0.5) * FLOOR_HEIGHT, plan.depth / 2 + 0.03);
    curtains.push({ position: toWorld(local), width: cell * 0.5, height: FLOOR_HEIGHT * 0.5, yaw: plan.yaw });
  }
  return block;
}

function buildRain(kit: Kit, look: YardLook, rng: Rng) {
  const count = Math.round(RAIN_DROPS * look.drizzle);
  const offsets = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    offsets[i * 3] = rng.range(-RAIN_BOX.half, RAIN_BOX.half);
    offsets[i * 3 + 1] = rng.range(0, RAIN_BOX.height);
    offsets[i * 3 + 2] = rng.range(-RAIN_BOX.half, RAIN_BOX.half);
  }
  const positions = new Float32Array(count * 6);
  const geometry = kit.own(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = kit.own(new THREE.LineBasicMaterial({ color: 0xa8b0bc, transparent: true, opacity: 0.55, fog: true }));
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  let fall = 0;
  return {
    lines,
    update(eye: readonly [number, number, number], dt: number, gravity: number) {
      fall += RAIN_SPEED * gravity * dt;
      const streak = 0.28 * gravity;
      for (let i = 0; i < count; i++) {
        // Drops stay in a box around the hero, wrapping as they fall (or rise).
        const wrapX = (offsets[i * 3]! - eye[0]) % (2 * RAIN_BOX.half);
        const wrapZ = (offsets[i * 3 + 2]! - eye[2]) % (2 * RAIN_BOX.half);
        const x = eye[0] + (wrapX < -RAIN_BOX.half ? wrapX + 2 * RAIN_BOX.half : wrapX > RAIN_BOX.half ? wrapX - 2 * RAIN_BOX.half : wrapX);
        const z = eye[2] + (wrapZ < -RAIN_BOX.half ? wrapZ + 2 * RAIN_BOX.half : wrapZ > RAIN_BOX.half ? wrapZ - 2 * RAIN_BOX.half : wrapZ);
        const h = (((offsets[i * 3 + 1]! - fall) % RAIN_BOX.height) + RAIN_BOX.height) % RAIN_BOX.height;
        const y = eye[1] - RAIN_BOX.height / 2 + h;
        positions.set([x, y, z, x, y + streak, z], i * 6);
      }
      geometry.attributes.position!.needsUpdate = true;
    },
  };
}
