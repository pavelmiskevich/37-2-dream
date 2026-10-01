import * as THREE from 'three';
import type { FallingKind } from './layout';

/**
 * Household objects falling past the hero, built from boxes and cylinders
 * (D-006). Sizes are in metres and deliberately a little too big: it is a
 * dream. Each builder returns a group centred on its middle.
 */

type Builder = (kit: Kit) => THREE.Group;

/** Shared geometry and materials of one view, freed together. */
export class Kit {
  private readonly materials = new Map<string, THREE.Material>();
  private readonly geometries = new Set<THREE.BufferGeometry>();

  /** Flat-shaded Lambert material of a colour, shared by colour and sidedness. */
  material(color: number, doubleSided = false): THREE.Material {
    const key = `${color.toString(16)}${doubleSided ? '/2' : ''}`;
    let material = this.materials.get(key);
    if (!material) {
      const side = doubleSided ? THREE.DoubleSide : THREE.FrontSide;
      material = new THREE.MeshLambertMaterial({ color, flatShading: true, side });
      this.materials.set(key, material);
    }
    return material;
  }

  /** Takes a material made elsewhere, to be freed with the kit. */
  own<M extends THREE.Material>(material: M): M {
    this.materials.set(`own:${material.uuid}`, material);
    return material;
  }

  geometry<G extends THREE.BufferGeometry>(geometry: G): G {
    this.geometries.add(geometry);
    return geometry;
  }

  /** Adds a box of size `w×h×d` at `(x, y, z)` to `group`. */
  box(group: THREE.Group, size: readonly [number, number, number], at: readonly [number, number, number], color: number) {
    const mesh = new THREE.Mesh(this.geometry(new THREE.BoxGeometry(...size)), this.material(color));
    mesh.position.set(...at);
    group.add(mesh);
    return mesh;
  }

  /** Adds an upright cylinder at `(x, y, z)` to `group`. */
  cylinder(
    group: THREE.Group,
    radius: number,
    height: number,
    at: readonly [number, number, number],
    color: number,
    segments = 8,
  ) {
    const geometry = this.geometry(new THREE.CylinderGeometry(radius, radius, height, segments));
    const mesh = new THREE.Mesh(geometry, this.material(color));
    mesh.position.set(...at);
    group.add(mesh);
    return mesh;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.geometries.clear();
    this.materials.clear();
  }
}

const sofa: Builder = (kit) => {
  const group = new THREE.Group();
  const fabric = 0x6b4a32;
  const cushion = 0x7d5a3e;
  kit.box(group, [2.2, 0.35, 0.95], [0, -0.2, 0], fabric);
  kit.box(group, [0.9, 0.18, 0.75], [-0.47, 0.06, 0.08], cushion);
  kit.box(group, [0.9, 0.18, 0.75], [0.47, 0.06, 0.08], cushion);
  kit.box(group, [2.2, 0.65, 0.25], [0, 0.3, -0.36], fabric);
  kit.box(group, [0.22, 0.55, 0.95], [-1.1, 0.05, 0], fabric);
  kit.box(group, [0.22, 0.55, 0.95], [1.1, 0.05, 0], fabric);
  for (const x of [-0.95, 0.95]) for (const z of [-0.35, 0.35]) kit.box(group, [0.08, 0.15, 0.08], [x, -0.45, z], 0x2a1e14);
  return group;
};

const fridge: Builder = (kit) => {
  const group = new THREE.Group();
  const enamel = 0xdedbd0;
  kit.box(group, [0.7, 1.75, 0.65], [0, 0, 0], enamel);
  // Freezer door gap and handles on the front (+Z).
  kit.box(group, [0.72, 0.025, 0.02], [0, 0.42, 0.33], 0x6a6a64);
  kit.box(group, [0.04, 0.22, 0.05], [0.27, 0.62, 0.35], 0x9a9a92);
  kit.box(group, [0.04, 0.4, 0.05], [0.27, 0.05, 0.35], 0x9a9a92);
  // Maker's plate.
  kit.box(group, [0.16, 0.04, 0.01], [-0.18, 0.75, 0.33], 0xa02a20);
  return group;
};

const thermometer: Builder = (kit) => {
  const group = new THREE.Group();
  kit.cylinder(group, 0.09, 2.2, [0, 0.12, 0], 0xc8d4d8);
  // The mercury column.
  kit.cylinder(group, 0.045, 1.55, [0, -0.2, 0.02], 0xb01818);
  const bulb = new THREE.Mesh(kit.geometry(new THREE.SphereGeometry(0.16, 8, 6)), kit.material(0xb01818));
  bulb.position.set(0, -1.02, 0);
  group.add(bulb);
  // Scale marks.
  for (let i = 0; i < 9; i++) kit.box(group, [0.06, 0.012, 0.02], [0.07, -0.5 + i * 0.16, 0.07], 0x303030);
  return group;
};

const vacuum: Builder = (kit) => {
  const group = new THREE.Group();
  // A Soviet canister vacuum: a horizontal drum on runners, hose, pipe, nozzle.
  const drum = kit.cylinder(group, 0.24, 0.62, [0, 0, 0], 0x3c6c8c, 10);
  drum.rotation.z = Math.PI / 2;
  const cap = kit.cylinder(group, 0.25, 0.05, [0.33, 0, 0], 0xb8b8b0, 10);
  cap.rotation.z = Math.PI / 2;
  kit.box(group, [0.5, 0.04, 0.08], [0, -0.25, -0.12], 0x2a2a2a);
  kit.box(group, [0.5, 0.04, 0.08], [0, -0.25, 0.12], 0x2a2a2a);
  const hose = new THREE.Mesh(
    kit.geometry(new THREE.TorusGeometry(0.42, 0.05, 6, 14, Math.PI * 1.2)),
    kit.material(0x2e2e2e),
  );
  hose.position.set(0.75, 0.25, 0);
  hose.rotation.z = -Math.PI * 0.35;
  group.add(hose);
  const pipe = kit.cylinder(group, 0.035, 1.1, [1.15, -0.25, 0], 0xa8a8a0, 6);
  pipe.rotation.z = 0.3;
  kit.box(group, [0.12, 0.06, 0.4], [1.33, -0.8, 0], 0x2a2a2a);
  return group;
};

const bed: Builder = (kit) => {
  const group = new THREE.Group();
  kit.box(group, [1.0, 0.25, 2.0], [0, -0.15, 0], 0x5a3c26);
  kit.box(group, [0.95, 0.2, 1.9], [0, 0.07, 0], 0xd8d8e8);
  kit.box(group, [0.97, 0.07, 1.3], [0, 0.2, 0.3], 0x7a3a3a);
  kit.box(group, [0.6, 0.12, 0.35], [0, 0.22, -0.72], 0xf0f0f0);
  kit.box(group, [1.0, 0.85, 0.07], [0, 0.2, -1.0], 0x5a3c26);
  for (const x of [-0.45, 0.45]) for (const z of [-0.95, 0.95]) kit.box(group, [0.07, 0.25, 0.07], [x, -0.4, z], 0x3a2618);
  return group;
};

const toiletPaper: Builder = (kit) => {
  const group = new THREE.Group();
  // A roll the size of a barrel, unwinding: a dream object, not a prop.
  const roll = kit.cylinder(group, 0.36, 0.34, [0, 0, 0], 0xf2f0ea, 12);
  roll.rotation.x = Math.PI / 2;
  const core = kit.cylinder(group, 0.13, 0.36, [0, 0, 0], 0x8a6a48, 8);
  core.rotation.x = Math.PI / 2;
  // The loose end trails above the roll in a slow wave.
  const tail = new THREE.PlaneGeometry(0.33, 3.2, 1, 12);
  const position = tail.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    position.setZ(i, Math.sin(y * 1.6) * 0.25);
  }
  tail.computeVertexNormals();
  const ribbon = new THREE.Mesh(kit.geometry(tail), kit.material(0xf2f0ea, true));
  ribbon.position.set(0, 1.6, 0.36);
  group.add(ribbon);
  return group;
};

const BUILDERS: Readonly<Record<FallingKind, Builder>> = {
  sofa,
  fridge,
  thermometer,
  vacuum,
  bed,
  toilet_paper: toiletPaper,
};

/**
 * Objects by kind, reused as they leave the view: only those near the hero
 * exist at any moment. Their geometry and materials belong to the kit.
 */
export class FallingPool {
  private readonly free = new Map<FallingKind, THREE.Group[]>();

  constructor(
    private readonly kit: Kit,
    private readonly parent: THREE.Object3D,
  ) {}

  take(kind: FallingKind): THREE.Group {
    const group = this.free.get(kind)?.pop() ?? this.build(kind);
    group.visible = true;
    return group;
  }

  give(kind: FallingKind, group: THREE.Group): void {
    group.visible = false;
    const list = this.free.get(kind) ?? [];
    list.push(group);
    this.free.set(kind, list);
  }

  private build(kind: FallingKind): THREE.Group {
    const group = BUILDERS[kind](this.kit);
    this.parent.add(group);
    return group;
  }
}
