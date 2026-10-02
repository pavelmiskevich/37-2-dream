import * as THREE from 'three';
import { JAM_JAR, type JamFlavor } from '@dream/core';
import { Kit } from '../fall/objects';

/**
 * The jar and what floats in it, built from spheres, cones, boxes and
 * cylinders (D-006). Coordinates are the simulation's: bottom at y = 0, lid
 * at `JAM_JAR.height`, glass at `JAM_JAR.radius`. Everything is built to be
 * believable first: a jar, glass, a tin lid, pips, berries. The lemons and
 * the spoon are simply too big.
 */

export { Kit };

/** Colours of the jam by flavour: deep (bottom), body (the medium), light (near the lid), fruit. */
export interface JamPalette {
  deep: number;
  body: number;
  light: number;
  fruit: number;
}

export const JAM_PALETTES: Readonly<Record<JamFlavor, JamPalette>> = {
  raspberry: { deep: 0x2c0510, body: 0x8c1634, light: 0xd8506a, fruit: 0xb0203e },
  cherry: { deep: 0x1c0208, body: 0x5e0c1e, light: 0xa02a40, fruit: 0x6a0a1a },
  apricot: { deep: 0x46220a, body: 0xc4701c, light: 0xf4b458, fruit: 0xe48a24 },
  blackcurrant: { deep: 0x0e0312, body: 0x2e0c30, light: 0x744080, fruit: 0x1c0a22 },
};

const GLASS = 0x9ab8b2;
const TIN = 0xbcb8a8;
const TIN_DARK = 0x8a8678;
const LEMON = 0xe8c832;
const LEMON_TIP = 0xc8a826;
const PIP = 0xc09458;
const STEEL = 0xb4bcc0;
const STEM = 0x4a5a22;

/** The glass from the inside: walls, a thick bottom, the thread under the lid. */
export function buildGlass(kit: Kit): THREE.Group {
  const { radius, height } = JAM_JAR;
  const glass = new THREE.Group();
  const wallMaterial = kit.own(
    new THREE.MeshLambertMaterial({ color: GLASS, transparent: true, opacity: 0.3, side: THREE.BackSide, depthWrite: false }),
  );
  const wall = new THREE.Mesh(kit.geometry(new THREE.CylinderGeometry(radius, radius, height, 32, 4, true)), wallMaterial);
  wall.position.y = height / 2;
  glass.add(wall);

  // Glints along the glass: thin pale strips catch the light from outside.
  const glintMaterial = kit.own(
    new THREE.MeshBasicMaterial({ color: 0xe8f0ec, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false }),
  );
  for (const [angle, width] of [
    [0.4, 0.35],
    [0.62, 0.12],
    [3.3, 0.25],
    [4.9, 0.18],
  ] as const) {
    const strip = new THREE.Mesh(kit.geometry(new THREE.PlaneGeometry(width, height * 0.92)), glintMaterial);
    const r = radius - 0.03;
    strip.position.set(Math.sin(angle) * r, height / 2, Math.cos(angle) * r);
    strip.lookAt(0, height / 2, 0);
    glass.add(strip);
  }

  // The thick bottom of the jar with its moulded ring.
  const bottom = new THREE.Mesh(
    kit.geometry(new THREE.CircleGeometry(radius, 32).rotateX(-Math.PI / 2)),
    kit.own(new THREE.MeshLambertMaterial({ color: 0x5a7a74, transparent: true, opacity: 0.85 })),
  );
  glass.add(bottom);
  const ring = new THREE.Mesh(
    kit.geometry(new THREE.TorusGeometry(radius * 0.72, 0.18, 4, 32).rotateX(Math.PI / 2)),
    kit.material(0x7a9a92),
  );
  ring.position.y = 0.05;
  glass.add(ring);

  // The neck's thread just under the lid.
  for (const y of [height - 0.35, height - 0.75]) {
    const threadGeometry = new THREE.TorusGeometry(radius - 0.05, 0.12, 4, 32).rotateX(Math.PI / 2);
    const thread = new THREE.Mesh(kit.geometry(threadGeometry), kit.material(GLASS));
    thread.position.y = y;
    glass.add(thread);
  }
  return glass;
}

/** The tin lid seen from below, with its pressed rings and rubber seal. */
export function buildLid(kit: Kit): { lid: THREE.Group; light: THREE.Group } {
  const { radius, height } = JAM_JAR;
  const lid = new THREE.Group();
  const disc = new THREE.Mesh(kit.geometry(new THREE.CircleGeometry(radius, 32).rotateX(Math.PI / 2)), kit.material(TIN, true));
  lid.add(disc);
  for (const [r, tube, color] of [
    [radius - 0.25, 0.22, 0x7a3a2a], // rubber seal
    [radius * 0.78, 0.1, TIN_DARK],
    [radius * 0.55, 0.08, TIN_DARK],
    [radius * 0.3, 0.06, TIN_DARK],
  ] as const) {
    const ring = new THREE.Mesh(kit.geometry(new THREE.TorusGeometry(r, tube, 4, 32).rotateX(Math.PI / 2)), kit.material(color));
    ring.position.y = -tube * 0.6;
    lid.add(ring);
  }
  lid.position.y = height;

  // Daylight through the gap once the lid gives: a bright rim and soft shafts.
  const light = new THREE.Group();
  const glow = kit.own(new THREE.MeshBasicMaterial({ color: 0xfff2d6, fog: false, side: THREE.DoubleSide }));
  const rim = new THREE.Mesh(kit.geometry(new THREE.TorusGeometry(radius - 0.05, 0.16, 4, 48).rotateX(Math.PI / 2)), glow);
  rim.position.y = height - 0.05;
  light.add(rim);
  const shaftMaterial = kit.own(
    new THREE.MeshBasicMaterial({
      color: 0xfff0d0,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const shaft = new THREE.Mesh(kit.geometry(new THREE.CylinderGeometry(0.25, 1.1, 9, 6, 1, true)), shaftMaterial);
    const r = radius - 1.2;
    shaft.position.set(Math.sin(a) * r, height - 4.5, Math.cos(a) * r);
    shaft.rotation.set(0.12 * Math.cos(a), 0, -0.12 * Math.sin(a));
    light.add(shaft);
  }
  light.visible = false;
  return { lid, light };
}

/** A lemon one unit long along X, centred on the origin. */
export function buildLemon(kit: Kit): THREE.Group {
  const lemon = new THREE.Group();
  const body = new THREE.Mesh(kit.geometry(new THREE.SphereGeometry(0.5, 12, 8)), kit.material(LEMON, true));
  body.scale.set(1, 0.74, 0.74);
  lemon.add(body);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(kit.geometry(new THREE.ConeGeometry(0.11, 0.16, 6)), kit.material(LEMON_TIP, true));
    tip.rotation.z = -side * (Math.PI / 2);
    tip.position.x = side * 0.52;
    lemon.add(tip);
  }
  // A dimpled peel: a few darker pores.
  for (let i = 0; i < 10; i++) {
    const a = i * 2.399963;
    const pore = new THREE.Mesh(kit.geometry(new THREE.SphereGeometry(0.035, 4, 3)), kit.material(LEMON_TIP));
    pore.position.set(((i * 37) % 9) / 9 - 0.45, Math.cos(a) * 0.36, Math.sin(a) * 0.36);
    lemon.add(pore);
  }
  return lemon;
}

/** A raspberry pip: a little drop, one unit tall. */
export function buildPip(kit: Kit): THREE.Mesh {
  const pip = new THREE.Mesh(kit.geometry(new THREE.SphereGeometry(0.5, 5, 4)), kit.material(PIP));
  pip.scale.set(0.62, 1, 0.55);
  return pip;
}

/** A whole fruit of the jam's flavour, about one unit across. */
export function buildFruit(kit: Kit, flavor: JamFlavor, color: number): THREE.Group {
  const fruit = new THREE.Group();
  switch (flavor) {
    case 'raspberry': {
      // Drupelets on a cone-shaped berry.
      const drupelet = kit.geometry(new THREE.SphereGeometry(0.17, 5, 4));
      for (let row = 0; row < 4; row++) {
        const y = -0.3 + row * 0.2;
        const r = 0.42 - row * 0.08;
        const n = 8 - row;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + row * 0.4;
          const d = new THREE.Mesh(drupelet, kit.material(color));
          d.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
          fruit.add(d);
        }
      }
      break;
    }
    case 'cherry':
    case 'blackcurrant': {
      const berry = new THREE.Mesh(kit.geometry(new THREE.SphereGeometry(0.5, 10, 7)), kit.material(color));
      fruit.add(berry);
      if (flavor === 'cherry') {
        const stem = new THREE.Mesh(kit.geometry(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 4)), kit.material(STEM));
        stem.position.set(0.1, 0.75, 0);
        stem.rotation.z = -0.3;
        fruit.add(stem);
      } else {
        const crown = new THREE.Mesh(kit.geometry(new THREE.ConeGeometry(0.1, 0.14, 5)), kit.material(0x3a2a20));
        crown.position.y = 0.52;
        fruit.add(crown);
      }
      break;
    }
    case 'apricot': {
      // An apricot half: the skin and the flat cut.
      const skin = new THREE.Mesh(
        kit.geometry(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
        kit.material(color, true),
      );
      fruit.add(skin);
      const cutGeometry = new THREE.CircleGeometry(0.5, 10).rotateX(Math.PI / 2);
      const cut = new THREE.Mesh(kit.geometry(cutGeometry), kit.material(0xf2a64a, true));
      fruit.add(cut);
      break;
    }
  }
  return fruit;
}

/**
 * A tablespoon of `length` metres lying diagonally across the jar: the bowl
 * on the bottom by the glass, the handle leaning on the opposite side under
 * the lid. `angle` is the direction from the axis to the handle's end
 * (0 = −Z). Returns the spoon already in place.
 */
export function buildSpoon(kit: Kit, angle: number): THREE.Group {
  const { radius, height } = JAM_JAR;
  const dir = new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle));
  const bowlAt = dir.clone().multiplyScalar(-(radius - 2.1)).setY(0.75);
  const topAt = dir.clone().multiplyScalar(radius - 0.5).setY(height - 1.1);
  const along = topAt.clone().sub(bowlAt);
  const length = along.length();

  const spoon = new THREE.Group();
  const steel = kit.material(STEEL, true);
  // The bowl: half an ellipsoid, open side up, 3.6 × 2.4 m.
  const bowl = new THREE.Mesh(kit.geometry(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), steel);
  bowl.scale.set(1.2, 0.5, 1.8);
  bowl.position.y = 0;
  spoon.add(bowl);
  // Neck and handle along +Z of the group, widening towards the end.
  const neckLength = 2.2;
  const neck = new THREE.Mesh(kit.geometry(new THREE.BoxGeometry(0.32, 0.12, neckLength)), steel);
  neck.position.set(0, 0.05, 1.8 + neckLength / 2 - 0.2);
  spoon.add(neck);
  const handleLength = length - 1.8 - neckLength + 0.2;
  const handleGeometry = new THREE.CylinderGeometry(0.42, 0.22, handleLength, 4, 1);
  handleGeometry.rotateY(Math.PI / 4).rotateX(Math.PI / 2);
  const handle = new THREE.Mesh(kit.geometry(handleGeometry), steel);
  handle.scale.set(1.4, 0.3, 1);
  handle.position.set(0, 0.05, 1.8 + neckLength - 0.2 + handleLength / 2);
  spoon.add(handle);

  // Lay the group's +Z along the diagonal, the bowl at its start.
  spoon.position.copy(bowlAt);
  spoon.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), along.normalize());
  return spoon;
}

/** The mirror image of a printed label, seen through the glass from the inside. */
export function buildLabel(kit: Kit, texture: THREE.CanvasTexture, angle: number): THREE.Mesh {
  const { radius } = JAM_JAR;
  const width = 9;
  const height = 4.6;
  // three.js puts theta 0 at +Z and turns towards +X; our angle 0 looks along −Z.
  const theta = Math.PI - angle;
  const arc = width / radius;
  const geometry = new THREE.CylinderGeometry(radius + 0.04, radius + 0.04, height, 24, 1, true, theta - arc / 2, arc);
  // Printed to be read from outside; from inside the same surface reads mirrored.
  const label = new THREE.Mesh(
    kit.geometry(geometry),
    kit.own(new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, opacity: 0.92 })),
  );
  label.position.y = 5.4;
  return label;
}
