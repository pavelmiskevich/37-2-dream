import * as THREE from 'three';
import type { NightstandItem, Rng } from '@dream/core';
import type { Kit } from './kit';
import { buildThermometer } from './thermometer';

/**
 * The bedroom of a panel-block flat, built around the hero's eyes on the
 * pillow (`APARTMENT.eye`, at the origin in X/Z). Yaw 0 looks along the bed
 * at the window; the bed stands against the left wall with a carpet on it,
 * the bedside table and the thermometer are on the right, the closed kitchen
 * door is in the right wall, the TV in the far right corner.
 */
export const ROOM = {
  left: -0.62,
  right: 2.6,
  back: 0.55,
  front: -3.6,
  height: 2.6,
  /** Window in the front wall. */
  window: { x0: 0.25, x1: 1.85, y0: 0.85, y1: 2.2 },
  /** Kitchen door in the right wall. */
  door: { z0: -2.8, z1: -1.95, height: 2.02 },
  /** Top of the bedside table. */
  nightstand: { x0: 0.5, x1: 1.06, z0: -0.66, z1: -0.04, height: 0.55 },
} as const;

/** Where the lights of the room sit. */
export const LIGHT_SPOTS = {
  lamp: new THREE.Vector3(0.9, 0.9, -0.52),
  tv: new THREE.Vector3(2.05, 0.95, -2.85),
} as const;

/** Positions on the bedside table for its things, nearest to the pillow first. */
const ITEM_SLOTS: readonly [number, number][] = [
  [0.88, -0.16],
  [0.62, -0.58],
  [0.98, -0.32],
];

export interface Room {
  readonly root: THREE.Group;
  /** Lamp shade: glows when the lamp is on. */
  readonly lampShade: THREE.MeshBasicMaterial;
  /** TV screen: glows when the TV is on. */
  readonly tvScreen: THREE.MeshBasicMaterial;
}

function wallpaper(kit: Kit) {
  return kit.canvas(
    32,
    32,
    (g) => {
      g.fillStyle = '#8a7a5c';
      g.fillRect(0, 0, 32, 32);
      g.fillStyle = '#7a6a4e';
      for (let x = 0; x < 32; x += 8) g.fillRect(x, 0, 2, 32);
      g.fillStyle = '#9a8a68';
      for (let y = 4; y < 32; y += 16) for (let x = 4; x < 32; x += 16) g.fillRect(x, y, 3, 3);
    },
    [8, 3],
  );
}

function linoleum(kit: Kit) {
  return kit.canvas(
    32,
    32,
    (g) => {
      g.fillStyle = '#6a4630';
      g.fillRect(0, 0, 32, 32);
      g.fillStyle = '#5a3a26';
      for (let y = 0; y < 32; y += 8) g.fillRect(0, y, 32, 1);
      for (let y = 0; y < 32; y += 8) g.fillRect(((y / 8) % 2) * 16 + 4, y, 1, 8);
    },
    [6, 8],
  );
}

/** The wall carpet: burgundy field, a border and rows of diamonds. */
function carpet(kit: Kit) {
  return kit.canvas(64, 48, (g) => {
    g.fillStyle = '#5e1a1e';
    g.fillRect(0, 0, 64, 48);
    g.strokeStyle = '#c8a060';
    g.lineWidth = 2;
    g.strokeRect(3, 3, 58, 42);
    g.fillStyle = '#20304a';
    g.fillRect(7, 7, 50, 34);
    const diamond = (cx: number, cy: number, r: number, color: string) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(cx, cy - r);
      g.lineTo(cx + r, cy);
      g.lineTo(cx, cy + r);
      g.lineTo(cx - r, cy);
      g.closePath();
      g.fill();
    };
    diamond(32, 24, 14, '#8a2a24');
    diamond(32, 24, 8, '#d8b070');
    diamond(32, 24, 3, '#5e1a1e');
    for (const x of [14, 50]) for (const y of [14, 34]) diamond(x, y, 5, '#b04030');
  });
}

/** The panel block across the yard: a grid of windows, some of them lit. */
function facade(kit: Kit, rng: Rng, litShare: number) {
  const cols = 24;
  const rows = 20;
  return kit.canvas(cols * 8, rows * 8, (g) => {
    g.fillStyle = '#2a2c30';
    g.fillRect(0, 0, cols * 8, rows * 8);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const lit = rng.chance(litShare);
        const tv = lit && rng.chance(0.15);
        g.fillStyle = lit ? (tv ? '#8aa0d8' : rng.chance(0.5) ? '#e8c060' : '#d89a48') : '#14161a';
        // Balcony rows every fourth column look a little different.
        const w = col % 4 === 3 ? 3 : 4;
        g.fillRect(col * 8 + 2, row * 8 + 2, w, 4);
      }
    }
  });
}

function buildBed(kit: Kit, root: THREE.Group): void {
  const x0 = ROOM.left + 0.01;
  const x1 = 0.45;
  // Frame, mattress, sheet, headboard.
  kit.span(root, [x0, 0, -1.98], [x1, 0.32, ROOM.back - 0.02], 0x5a3a24);
  kit.span(root, [x0 + 0.02, 0.32, -1.95], [x1 - 0.02, 0.48, ROOM.back - 0.06], 0xd8d4c4);
  kit.span(root, [x0, 0.32, ROOM.back - 0.08], [x1, 1.05, ROOM.back - 0.02], 0x4a2e1c);
  kit.span(root, [x0, 0.32, -1.98], [x1, 0.72, -1.94], 0x4a2e1c);
  // Pillow behind the head.
  kit.span(root, [-0.42, 0.48, 0.1], [0.22, 0.64, ROOM.back - 0.1], 0xb8b4a8);
  // The blanket over him: a heavy checked quilt with knees and feet under it.
  const quilt = kit.own(
    new THREE.MeshLambertMaterial({
      map: kit.canvas(
        16,
        16,
        (g) => {
          g.fillStyle = '#4a6a8a';
          g.fillRect(0, 0, 16, 16);
          g.fillStyle = '#3a5470';
          g.fillRect(0, 0, 8, 8);
          g.fillRect(8, 8, 8, 8);
        },
        [3, 5],
      ),
      flatShading: true,
    }),
  );
  kit.span(root, [x0 + 0.04, 0.48, -1.9], [x1 - 0.01, 0.6, -0.12], quilt);
  kit.span(root, [-0.38, 0.6, -1.15], [0.28, 0.7, -0.8], quilt);
  kit.span(root, [-0.32, 0.6, -1.82], [-0.08, 0.72, -1.66], quilt);
  kit.span(root, [0.0, 0.6, -1.82], [0.24, 0.72, -1.66], quilt);
  // His chest under the blanket, rising towards the pillow.
  kit.span(root, [-0.3, 0.6, -0.42], [0.22, 0.66, -0.12], quilt);
}

/** One thing on the bedside table, standing on `(x, top, z)`. */
function buildItem(kit: Kit, root: THREE.Group, item: NightstandItem, x: number, top: number, z: number): void {
  switch (item) {
    case 'water_glass': {
      const glass = kit.own(new THREE.MeshLambertMaterial({ color: 0xc8dce8, transparent: true, opacity: 0.55 }));
      kit.cylinder(root, 0.034, 0.12, [x, top, z], glass, 8, 0.04);
      kit.cylinder(root, 0.03, 0.07, [x, top + 0.005, z], 0x9ab8cc, 8);
      break;
    }
    case 'pill_blister':
      kit.box(root, [0.1, 0.008, 0.05], [x, top + 0.004, z], 0xc0c4c8).rotation.y = 0.4;
      kit.box(root, [0.05, 0.05, 0.03], [x + 0.05, top + 0.025, z - 0.06], 0xe0e0e0);
      break;
    case 'tea_mug': {
      kit.cylinder(root, 0.045, 0.1, [x, top, z], 0xc04a3a, 10);
      kit.cylinder(root, 0.04, 0.01, [x, top + 0.085, z], 0x4a2a14, 10);
      const handle = new THREE.Mesh(kit.geometry(new THREE.TorusGeometry(0.025, 0.008, 4, 8)), kit.material(0xc04a3a));
      handle.position.set(x + 0.05, top + 0.05, z);
      root.add(handle);
      break;
    }
    case 'jam_jar':
      // Raspberry jam against the cold: a glass jar with a tin lid and a spoon in it.
      kit.cylinder(root, 0.05, 0.11, [x, top, z], 0x8c1634, 10);
      kit.cylinder(root, 0.052, 0.02, [x, top + 0.11, z], 0xb8b8b0, 10);
      kit.box(root, [0.012, 0.14, 0.012], [x + 0.03, top + 0.15, z], 0xc8c8c0).rotation.z = -0.3;
      break;
    case 'tissues':
      kit.box(root, [0.12, 0.06, 0.07], [x, top + 0.03, z], 0x7a9ab8);
      for (const [dx, dz, r] of [
        [0.07, 0.05, 0.03],
        [-0.04, 0.07, 0.025],
        [0.02, 0.1, 0.028],
      ] as const) {
        const ball = new THREE.Mesh(kit.geometry(new THREE.IcosahedronGeometry(r, 0)), kit.material(0xf0f0ea));
        ball.position.set(x + dx, top + r * 0.8, z + dz);
        root.add(ball);
      }
      break;
    case 'lemon_saucer':
      kit.cylinder(root, 0.07, 0.012, [x, top, z], 0xf0eee6, 12);
      kit.cylinder(root, 0.03, 0.012, [x - 0.015, top + 0.012, z], 0xe8d040, 8);
      kit.cylinder(root, 0.03, 0.012, [x + 0.025, top + 0.012, z + 0.02], 0xe8d040, 8);
      break;
    case 'mustard_plasters':
      for (let i = 0; i < 3; i++) {
        kit.box(root, [0.12, 0.005, 0.08], [x, top + 0.003 + i * 0.006, z], 0xc8a040).rotation.y = i * 0.2 - 0.2;
      }
      break;
    case 'tv_remote':
      kit.box(root, [0.05, 0.02, 0.17], [x, top + 0.01, z], 0x222222).rotation.y = 0.5;
      break;
    case 'phone':
      kit.box(root, [0.07, 0.012, 0.14], [x, top + 0.006, z], 0x1a1a1e).rotation.y = -0.3;
      break;
  }
}

function buildNightstand(kit: Kit, root: THREE.Group, items: readonly NightstandItem[], celsius: number, eye: THREE.Vector3) {
  const n = ROOM.nightstand;
  const top = n.height;
  kit.span(root, [n.x0, 0, n.z0], [n.x1, top, n.z1], 0x6a4428);
  kit.span(root, [n.x0 - 0.005, 0.28, n.z0 + 0.04], [n.x0, 0.5, n.z1 - 0.04], 0x5a3820);
  kit.box(root, [0.01, 0.03, 0.08], [n.x0 - 0.01, 0.4, (n.z0 + n.z1) / 2], 0xb8a060);

  items.forEach((item, i) => {
    const slot = ITEM_SLOTS[i];
    if (slot) buildItem(kit, root, item, slot[0], top, slot[1]);
  });

  // The thermometer, propped up at the near edge and turned to his eyes.
  const thermometer = buildThermometer(kit, celsius);
  thermometer.position.set(0.66, top + 0.06, -0.36);
  thermometer.lookAt(eye);
  root.add(thermometer);
}

function buildLamp(kit: Kit, root: THREE.Group): THREE.MeshBasicMaterial {
  const { x, z } = LIGHT_SPOTS.lamp;
  const top = ROOM.nightstand.height;
  kit.cylinder(root, 0.06, 0.03, [x, top, z], 0x3a3a34, 8);
  kit.cylinder(root, 0.01, 0.25, [x, top + 0.03, z], 0x8a8270, 6);
  const shade = kit.own(new THREE.MeshBasicMaterial({ color: 0x5a4a30 }));
  kit.cylinder(root, 0.1, 0.13, [x, top + 0.24, z], shade, 10, 0.055);
  return shade;
}

function buildTv(kit: Kit, root: THREE.Group): THREE.MeshBasicMaterial {
  const tv = new THREE.Group();
  kit.span(tv, [-0.32, 0, -0.26], [0.32, 0.6, 0.26], 0x4a3020);
  kit.span(tv, [-0.27, 0.6, -0.24], [0.27, 1.02, 0.2], 0x2a2420);
  const screen = kit.own(new THREE.MeshBasicMaterial({ color: 0x1a1e1c }));
  kit.plane(tv, [0.38, 0.3], [-0.03, 0.81, 0.201], screen);
  kit.box(tv, [0.05, 0.05, 0.01], [0.19, 0.9, 0.205], 0x6a6050);
  tv.position.set(2.15, 0, -3.18);
  tv.rotation.y = -0.6;
  root.add(tv);
  return screen;
}

function buildWindow(kit: Kit, root: THREE.Group, wall: THREE.Material): void {
  const w = ROOM.window;
  const z = ROOM.front;
  const d = 0.12;
  // The front wall around the opening.
  kit.span(root, [ROOM.left, 0, z - d], [w.x0, ROOM.height, z], wall);
  kit.span(root, [w.x1, 0, z - d], [ROOM.right, ROOM.height, z], wall);
  kit.span(root, [w.x0, 0, z - d], [w.x1, w.y0, z], wall);
  kit.span(root, [w.x0, w.y1, z - d], [w.x1, ROOM.height, z], wall);
  // Sill, double frame with a transom and the small "форточка".
  kit.span(root, [w.x0 - 0.05, w.y0 - 0.03, z - 0.02], [w.x1 + 0.05, w.y0, z + 0.2], 0xd8d8d0);
  const frame = 0xe0dcd0;
  const t = 0.05;
  const fz0 = z - 0.07;
  const fz1 = z - 0.03;
  kit.span(root, [w.x0, w.y0, fz0], [w.x0 + t, w.y1, fz1], frame);
  kit.span(root, [w.x1 - t, w.y0, fz0], [w.x1, w.y1, fz1], frame);
  kit.span(root, [w.x0, w.y0, fz0], [w.x1, w.y0 + t, fz1], frame);
  kit.span(root, [w.x0, w.y1 - t, fz0], [w.x1, w.y1, fz1], frame);
  const mid = (w.x0 + w.x1) / 2;
  kit.span(root, [mid - t / 2, w.y0, fz0], [mid + t / 2, w.y1, fz1], frame);
  kit.span(root, [w.x0, 1.75, fz0], [w.x1, 1.75 + t, fz1], frame);
  kit.span(root, [mid + 0.3, 1.75, fz0], [mid + 0.3 + t, w.y1, fz1], frame);
  // Glass: barely there.
  const glass = kit.own(new THREE.MeshBasicMaterial({ color: 0x8a9aa8, transparent: true, opacity: 0.08 }));
  kit.plane(root, [w.x1 - w.x0, w.y1 - w.y0], [mid, (w.y0 + w.y1) / 2, fz0 + 0.01], glass);
  // Radiator under the window.
  for (let i = 0; i < 9; i++) kit.span(root, [mid - 0.45 + i * 0.1, 0.15, z + 0.03], [mid - 0.38 + i * 0.1, 0.7, z + 0.11], 0xd0ccc0);
  // Curtains, drawn to the sides.
  const curtain = kit.material(0x7a5a3a);
  kit.span(root, [w.x0 - 0.35, 0.3, z + 0.06], [w.x0 + 0.05, 2.4, z + 0.12], curtain);
  kit.span(root, [w.x1 - 0.05, 0.3, z + 0.06], [w.x1 + 0.3, 2.4, z + 0.12], curtain);
  kit.span(root, [w.x0 - 0.4, 2.42, z + 0.05], [w.x1 + 0.35, 2.45, z + 0.14], 0x8a8a80);
}

function buildDoor(kit: Kit, root: THREE.Group): void {
  const { z0, z1, height } = ROOM.door;
  const x = ROOM.right;
  kit.span(root, [x - 0.04, 0.012, z0], [x - 0.01, height, z1], 0xc8bca0);
  // Casing and the handle.
  kit.span(root, [x - 0.05, 0, z0 - 0.07], [x - 0.02, height + 0.07, z0], 0xd8d0b8);
  kit.span(root, [x - 0.05, 0, z1], [x - 0.02, height + 0.07, z1 + 0.07], 0xd8d0b8);
  kit.span(root, [x - 0.05, height, z0], [x - 0.02, height + 0.07, z1], 0xd8d0b8);
  kit.box(root, [0.05, 0.02, 0.12], [x - 0.07, 1.0, z1 - 0.12], 0xb8a060);
  // The kitchen light is on: a warm line under the door.
  const glow = kit.own(new THREE.MeshBasicMaterial({ color: 0xffc870 }));
  const line = kit.plane(root, [z1 - z0, 0.012], [x - 0.012, 0.006, (z0 + z1) / 2], glow, -Math.PI / 2);
  line.renderOrder = 1;
  kit.span(root, [x - 0.4, 0.001, z0], [x - 0.02, 0.003, z1], kit.own(new THREE.MeshBasicMaterial({ color: 0x4a3420, transparent: true, opacity: 0.5 })));
}

function buildWardrobe(kit: Kit, root: THREE.Group): void {
  kit.span(root, [2.0, 0, -1.4], [ROOM.right - 0.01, 2.15, 0.25], 0x6a4a2e);
  kit.span(root, [1.995, 0.1, -1.36], [2.0, 2.1, -0.6], 0x7a5636);
  kit.span(root, [1.995, 0.1, -0.56], [2.0, 2.1, 0.21], 0x7a5636);
  kit.box(root, [0.02, 0.12, 0.02], [1.985, 1.1, -0.64], 0xb8a060);
  kit.box(root, [0.02, 0.12, 0.02], [1.985, 1.1, -0.52], 0xb8a060);
}

/** Night or an overcast day behind the window: sky and the block across the yard. */
function buildOutside(kit: Kit, root: THREE.Group, rng: Rng, day: boolean): void {
  const sky = kit.own(new THREE.MeshBasicMaterial({ color: day ? 0x9aa2aa : 0x0b1020, fog: false }));
  kit.plane(root, [200, 120], [0, 10, -70], sky);
  const front = kit.own(
    new THREE.MeshBasicMaterial({ map: facade(kit, rng, day ? 0.12 : 0.42), fog: false, color: day ? 0x9a9a98 : 0xffffff }),
  );
  kit.plane(root, [48, 40], [2, 2, -30], front);
  const ground = kit.own(new THREE.MeshBasicMaterial({ color: day ? 0x3a3c38 : 0x08090c, fog: false }));
  const yard = kit.plane(root, [200, 40], [0, -14, -12], ground);
  yard.rotation.x = -Math.PI / 2;
}

/** Builds the whole room. `rng` varies only what nobody plays with: the lit windows across the yard. */
export function buildRoom(
  kit: Kit,
  options: { items: readonly NightstandItem[]; celsius: number; day: boolean; rng: Rng; eye: THREE.Vector3 },
): Room {
  const root = new THREE.Group();
  const wall = kit.own(new THREE.MeshLambertMaterial({ map: wallpaper(kit) }));
  const floor = kit.own(new THREE.MeshLambertMaterial({ map: linoleum(kit) }));
  const width = ROOM.right - ROOM.left;
  const depth = ROOM.back - ROOM.front;
  const cx = (ROOM.left + ROOM.right) / 2;
  const cz = (ROOM.back + ROOM.front) / 2;

  const floorMesh = kit.plane(root, [width, depth], [cx, 0, cz], floor);
  floorMesh.rotation.x = -Math.PI / 2;
  const ceiling = kit.plane(root, [width, depth], [cx, ROOM.height, cz], kit.own(new THREE.MeshLambertMaterial({ color: 0xd8d4c8 })));
  ceiling.rotation.x = Math.PI / 2;
  kit.plane(root, [depth, ROOM.height], [ROOM.left, ROOM.height / 2, cz], wall, Math.PI / 2);
  kit.plane(root, [depth, ROOM.height], [ROOM.right, ROOM.height / 2, cz], wall, -Math.PI / 2);
  kit.plane(root, [width, ROOM.height], [cx, ROOM.height / 2, ROOM.back], wall, Math.PI);
  // Skirting boards.
  kit.span(root, [ROOM.left, 0, ROOM.front], [ROOM.left + 0.015, 0.07, ROOM.back], 0x4a3020);
  kit.span(root, [ROOM.right - 0.015, 0, ROOM.front], [ROOM.right, 0.07, ROOM.back], 0x4a3020);

  // The carpet on the wall beside the bed.
  const rug = kit.own(new THREE.MeshLambertMaterial({ map: carpet(kit) }));
  kit.plane(root, [2.1, 1.45], [ROOM.left + 0.012, 1.4, -0.75], rug, Math.PI / 2);

  // A three-armed chandelier, switched off.
  kit.cylinder(root, 0.01, 0.35, [1.0, ROOM.height - 0.35, -1.6], 0x6a6050, 4);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    kit.cylinder(root, 0.07, 0.1, [1.0 + Math.cos(a) * 0.16, ROOM.height - 0.42, -1.6 + Math.sin(a) * 0.16], 0xd8ccb0, 6, 0.03);
  }

  buildBed(kit, root);
  buildNightstand(kit, root, options.items, options.celsius, options.eye);
  const lampShade = buildLamp(kit, root);
  const tvScreen = buildTv(kit, root);
  buildWindow(kit, root, wall);
  buildDoor(kit, root);
  buildWardrobe(kit, root);
  buildOutside(kit, root, options.rng, options.day);

  return { root, lampShade, tvScreen };
}
