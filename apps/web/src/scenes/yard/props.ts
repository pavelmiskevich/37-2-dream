import * as THREE from 'three';
import { SWING } from '@dream/core';

/**
 * Low-poly props of the yard, built from boxes and a few cylinders. Every
 * geometry, material and texture goes through a `Kit`, which frees them all
 * at once when the scene is disposed.
 */
export class Kit {
  private readonly owned: { dispose(): void }[] = [];

  own<T extends { dispose(): void }>(resource: T): T {
    this.owned.push(resource);
    return resource;
  }

  lambert(parameters: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial {
    return this.own(new THREE.MeshLambertMaterial(parameters));
  }

  basic(parameters: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
    return this.own(new THREE.MeshBasicMaterial(parameters));
  }

  /** A box mesh whose bottom sits at `y` (its centre at `y + h / 2`). */
  box(w: number, h: number, d: number, material: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(this.own(new THREE.BoxGeometry(w, h, d)), material);
    mesh.position.set(x, y + h / 2, z);
    return mesh;
  }

  /** A box stretched between two points, `thickness` across. */
  beam(from: THREE.Vector3, to: THREE.Vector3, thickness: number, material: THREE.Material): THREE.Mesh {
    const length = from.distanceTo(to);
    const mesh = new THREE.Mesh(this.own(new THREE.BoxGeometry(thickness, length, thickness)), material);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    return mesh;
  }

  plane(w: number, h: number, material: THREE.Material): THREE.Mesh {
    return new THREE.Mesh(this.own(new THREE.PlaneGeometry(w, h)), material);
  }

  dispose(): void {
    for (const resource of this.owned) resource.dispose();
    this.owned.length = 0;
  }
}

export interface SwingModel {
  /** Placed at the pivot point on the ground, turned to the seat's facing. */
  root: THREE.Group;
  /** Rotates about X by the swing angle. */
  seat: THREE.Group;
}

/**
 * The swing: an A-frame of steel pipes, a top bar, two chains and a wooden
 * seat. The seat group hangs at the pivot; `rotation.x = angle` swings it
 * forward (local −Z) for a positive angle, matching the rules.
 */
export function buildSwing(kit: Kit, paint: number): SwingModel {
  const root = new THREE.Group();
  const pipe = kit.lambert({ color: paint, flatShading: true });
  const steel = kit.lambert({ color: 0x5a5c60, flatShading: true });
  const wood = kit.lambert({ color: 0x7a5434, flatShading: true });
  const top = SWING.pivotHeight + 0.05;
  const halfBar = 1.3;
  for (const side of [-1, 1]) {
    for (const leg of [-1, 1]) {
      root.add(kit.beam(new THREE.Vector3(side * halfBar, top, 0), new THREE.Vector3(side * (halfBar + 0.15), 0, leg * 1.15), 0.08, pipe));
    }
  }
  root.add(kit.beam(new THREE.Vector3(-halfBar - 0.1, top, 0), new THREE.Vector3(halfBar + 0.1, top, 0), 0.1, pipe));

  const seat = new THREE.Group();
  seat.position.y = SWING.pivotHeight;
  for (const side of [-1, 1]) {
    seat.add(kit.beam(new THREE.Vector3(side * 0.27, 0, 0), new THREE.Vector3(side * 0.27, -SWING.chainLength, 0), 0.025, steel));
  }
  seat.add(kit.box(0.62, 0.05, 0.26, wood, 0, -SWING.chainLength - 0.05, 0));
  root.add(seat);
  return { root, seat };
}

/** Soviet park bench: concrete legs, wooden slats; its front faces local +Z. */
export function buildBench(kit: Kit): THREE.Group {
  const bench = new THREE.Group();
  const concrete = kit.lambert({ color: 0x9a968c, flatShading: true });
  const wood = kit.lambert({ color: 0x5e7a4a, flatShading: true });
  for (const x of [-0.8, 0.8]) bench.add(kit.box(0.12, 0.45, 0.5, concrete, x, 0, 0));
  for (let i = 0; i < 3; i++) bench.add(kit.box(1.9, 0.04, 0.12, wood, 0, 0.45, 0.17 - i * 0.15));
  for (let i = 0; i < 2; i++) bench.add(kit.box(1.9, 0.12, 0.04, wood, 0, 0.62 + i * 0.18, -0.24));
  return bench;
}

/** A row of `count` dumpsters along local +X. */
export function buildBins(kit: Kit, count: number): THREE.Group {
  const row = new THREE.Group();
  const greens = [0x3e5a3a, 0x4a5e44, 0x34503a];
  const lid = kit.lambert({ color: 0x2a3228, flatShading: true });
  for (let i = 0; i < count; i++) {
    const body = kit.lambert({ color: greens[i % greens.length], flatShading: true });
    const x = (i - (count - 1) / 2) * 1.35;
    row.add(kit.box(1.2, 1.05, 0.9, body, x, 0, 0));
    const cover = kit.box(1.24, 0.05, 0.94, lid, x, 1.05, 0);
    cover.rotation.x = i % 2 === 0 ? -0.12 : 0;
    row.add(cover);
  }
  return row;
}

/** Street lamp: a concrete pole with an arm over the yard (local +Z). */
export function buildLamp(kit: Kit, on: boolean): { lamp: THREE.Group; head: THREE.Vector3 } {
  const lamp = new THREE.Group();
  const pole = kit.lambert({ color: 0x8a8880, flatShading: true });
  lamp.add(kit.box(0.14, 5, 0.14, pole, 0, 0, 0));
  lamp.add(kit.box(0.08, 0.08, 0.9, pole, 0, 4.9, 0.45));
  const glass = on ? kit.basic({ color: 0xffd090 }) : kit.lambert({ color: 0x9a9a90 });
  lamp.add(kit.box(0.3, 0.12, 0.45, glass, 0, 4.75, 0.85));
  return { lamp, head: new THREE.Vector3(0, 4.6, 0.85) };
}

/** A parked car, bonnet along local +X. */
export function buildCar(kit: Kit, color: number): THREE.Group {
  const car = new THREE.Group();
  const paint = kit.lambert({ color, flatShading: true });
  const glass = kit.lambert({ color: 0x2a3038, flatShading: true });
  const tyre = kit.lambert({ color: 0x1a1a1a, flatShading: true });
  car.add(kit.box(4, 0.65, 1.65, paint, 0, 0.3, 0));
  car.add(kit.box(2.1, 0.55, 1.5, glass, -0.3, 0.95, 0));
  car.add(kit.box(2.0, 0.08, 1.52, paint, -0.3, 1.5, 0));
  for (const x of [-1.3, 1.3]) for (const z of [-0.78, 0.78]) car.add(kit.box(0.6, 0.6, 0.2, tyre, x, 0, z));
  return car;
}

/** Sandbox: a low frame of boards with grey wet sand. */
export function buildSandbox(kit: Kit): THREE.Group {
  const box = new THREE.Group();
  const board = kit.lambert({ color: 0x8a6a3a, flatShading: true });
  const sand = kit.lambert({ color: 0x8a826a, flatShading: true });
  box.add(kit.box(2.4, 0.12, 2.4, sand, 0, 0, 0));
  for (const s of [-1, 1]) {
    box.add(kit.box(2.6, 0.25, 0.1, board, 0, 0, s * 1.25));
    box.add(kit.box(0.1, 0.25, 2.6, board, s * 1.25, 0, 0));
  }
  return box;
}
