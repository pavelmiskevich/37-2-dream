import * as THREE from 'three';
import type { Rng } from '@dream/core';

/**
 * Small procedural textures of the yard, painted texel by texel. The PS1
 * renderer makes them nearest-filtered; at this size every texel shows.
 * Randomness comes from the view's seeded stream, never from Math.random.
 */

type Rgb = readonly [number, number, number];

const rgb = (hex: number): Rgb => [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
const shade = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];

/** A texture canvas: RGBA bytes with painting helpers. Row 0 is the top. */
class Canvas {
  readonly data: Uint8Array<ArrayBuffer>;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4);
  }

  set(x: number, y: number, color: Rgb, alpha = 255): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    // DataTexture rows go bottom-up; flip so painting reads top-down.
    const i = ((this.height - 1 - Math.floor(y)) * this.width + Math.floor(x)) * 4;
    this.data[i] = Math.max(0, Math.min(255, color[0]));
    this.data[i + 1] = Math.max(0, Math.min(255, color[1]));
    this.data[i + 2] = Math.max(0, Math.min(255, color[2]));
    this.data[i + 3] = alpha;
  }

  rect(x: number, y: number, w: number, h: number, color: Rgb | ((x: number, y: number) => Rgb)): void {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) this.set(i, j, typeof color === 'function' ? color(i, j) : color);
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, color: Rgb): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      this.set(Math.round(x0 + ((x1 - x0) * s) / steps), Math.round(y0 + ((y1 - y0) * s) / steps), color);
    }
  }

  texture(repeat: readonly [number, number] = [1, 1]): THREE.DataTexture {
    const texture = new THREE.DataTexture(this.data, this.width, this.height);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
    texture.needsUpdate = true;
    return texture;
  }
}

/** Texels per facade cell (one window with its share of wall). */
export const CELL = 8;

export interface FacadeOptions {
  columns: number;
  floors: number;
  /** Share of lit windows. */
  lit: number;
  /** [floor (1-based, from the ground), column] of the hero's own window, always lit. */
  home?: readonly [number, number];
}

export interface Facade {
  texture: THREE.DataTexture;
  /** Emissive map: the lit windows only, black elsewhere. */
  glow: THREE.DataTexture;
  /** Lit windows with a curtain that will move: [floor, column]. */
  curtains: [number, number][];
}

const WALL = rgb(0xb0a898);
const SEAM = rgb(0x8a8478);
const GLASS = rgb(0x26303e);
const LIT_TONES = [0xe8c870, 0xf0d890, 0xd8a850, 0xe8b868].map(rgb);
const CURTAIN_TONES = [0xc8885a, 0xa8b878, 0xd0a0a0, 0xe0d0a0].map(rgb);

/**
 * Facade of a panel block: a grid of windows, panel seams between floors and
 * sections, entrance doors on the ground floor. Part of the windows are lit
 * yellow, a few lit ones get a curtain that will move (`curtains`).
 */
export function paintFacade({ columns, floors, lit, home }: FacadeOptions, rng: Rng): Facade {
  const canvas = new Canvas(columns * CELL, floors * CELL);
  const glow = new Canvas(columns * CELL, floors * CELL);
  glow.rect(0, 0, glow.width, glow.height, [0, 0, 0]);
  const curtains: [number, number][] = [];
  const entranceEvery = rng.int(5, 7);
  const entranceOffset = rng.int(1, entranceEvery - 1);
  for (let floor = 1; floor <= floors; floor++) {
    const top = (floors - floor) * CELL;
    for (let column = 0; column < columns; column++) {
      const left = column * CELL;
      // Concrete with a little grain; seams along the bottom and left edge of each panel.
      canvas.rect(left, top, CELL, CELL, () => shade(WALL, 0.92 + rng.next() * 0.12));
      canvas.rect(left, top + CELL - 1, CELL, 1, SEAM);
      if (column % 2 === 0) canvas.rect(left, top, 1, CELL, SEAM);

      if (floor === 1 && column % entranceEvery === entranceOffset) {
        // Entrance: a brown door under a concrete canopy.
        canvas.rect(left + 2, top + 1, 4, 1, shade(WALL, 0.7));
        canvas.rect(left + 2, top + 2, 4, 6, rgb(0x5a3e2a));
        continue;
      }

      const isHome = home !== undefined && home[0] === floor && home[1] === column;
      const on = isHome || rng.next() < lit;
      const glass = on ? (rng.pick(LIT_TONES) as Rgb) : shade(GLASS, 0.85 + rng.next() * 0.3);
      canvas.rect(left + 2, top + 2, 4, 4, glass);
      if (on) glow.rect(left + 2, top + 2, 4, 4, glass);
      // Window frame cross.
      canvas.rect(left + 4, top + 2, 1, 4, shade(on ? glass : GLASS, 0.6));
      if (on && (isHome || rng.next() < 0.12)) curtains.push([floor, column]);
      else if (on && rng.next() < 0.4) {
        // A curtain half drawn, still.
        const curtain = rng.pick(CURTAIN_TONES) as Rgb;
        canvas.rect(left + 2, top + 2, 2, 4, curtain);
        glow.rect(left + 2, top + 2, 2, 4, shade(curtain, 0.7));
      }
      // Some floors have a balcony rail under the window.
      if (floor > 1 && column % 4 === 1) canvas.rect(left + 1, top + 6, 6, 1, shade(WALL, 0.75));
    }
  }
  return { texture: canvas.texture(), glow: glow.texture(), curtains };
}

/** Wet asphalt: dark, grainy, with the odd crack. Repeats every 4 m. */
export function paintAsphalt(base: number, rng: Rng): THREE.DataTexture {
  const canvas = new Canvas(16, 16);
  const color = rgb(base);
  canvas.rect(0, 0, 16, 16, () => shade(color, 0.85 + rng.next() * 0.25));
  for (let i = 0; i < 2; i++) {
    const x = rng.int(0, 15);
    const y = rng.int(0, 15);
    canvas.line(x, y, x + rng.int(-4, 4), y + rng.int(2, 6), shade(color, 0.6));
  }
  return canvas.texture();
}

/** Plain material texture: a colour with grain. */
export function paintGrain(base: number, rng: Rng, size = 8): THREE.DataTexture {
  const canvas = new Canvas(size, size);
  const color = rgb(base);
  canvas.rect(0, 0, size, size, () => shade(color, 0.85 + rng.next() * 0.3));
  return canvas.texture();
}

/** A curtain: folds of a coloured fabric, lit from behind. */
export function paintCurtain(rng: Rng): THREE.DataTexture {
  const canvas = new Canvas(8, 8);
  const color = rng.pick(CURTAIN_TONES) as Rgb;
  canvas.rect(0, 0, 8, 8, (x) => shade(color, x % 2 === 0 ? 1 : 0.8));
  return canvas.texture();
}

/** A grey pigeon in profile, facing right; transparent around it. */
export function paintPigeon(): THREE.DataTexture {
  const canvas = new Canvas(12, 8);
  const body = rgb(0x8a8c94);
  const dark = rgb(0x5a5c66);
  const neck = rgb(0x6a8a7a);
  canvas.rect(2, 3, 7, 3, body);
  canvas.rect(1, 3, 2, 2, dark); // tail
  canvas.rect(4, 3, 4, 1, dark); // wing
  canvas.rect(8, 1, 2, 3, neck); // neck
  canvas.rect(9, 1, 2, 2, body); // head
  canvas.set(10, 1, rgb(0xd04020)); // eye
  canvas.set(11, 2, rgb(0x2a2a2a)); // beak
  canvas.rect(4, 6, 1, 2, rgb(0xb05050)); // legs
  canvas.rect(7, 6, 1, 2, rgb(0xb05050));
  return canvas.texture();
}

/**
 * The woman with the vacuum cleaner, flat as cardboard, facing right:
 * headscarf, housecoat, slippers; the canister rolls behind her, the brush
 * goes ahead on its wand. She is not explained (D-007).
 */
export function paintWoman(): THREE.DataTexture {
  const canvas = new Canvas(32, 64);
  const scarf = rgb(0x8a2e34);
  const skin = rgb(0xd8b090);
  const coat = rgb(0x4e5e8e);
  const flower = rgb(0xd8c870);
  const tights = rgb(0x7a6458);
  const slipper = rgb(0x6a3a4a);
  const metal = rgb(0x6e7e8c);
  const hose = rgb(0x3a3a40);

  canvas.rect(11, 3, 9, 7, scarf);
  canvas.rect(12, 7, 7, 6, skin);
  canvas.rect(10, 13, 11, 29, coat);
  canvas.rect(9, 20, 13, 22, coat);
  for (let y = 15; y < 42; y += 5) {
    for (let x = 10 + ((y / 5) % 2) * 2; x < 21; x += 4) canvas.set(x, y, flower);
  }
  canvas.rect(11, 42, 3, 13, tights);
  canvas.rect(17, 42, 3, 13, tights);
  canvas.rect(10, 55, 5, 3, slipper);
  canvas.rect(16, 55, 5, 3, slipper);
  // Arms reaching forward to the wand.
  canvas.rect(20, 16, 3, 4, coat);
  canvas.line(22, 19, 24, 26, skin);
  // Wand down to the brush on the floor, ahead of her.
  canvas.line(24, 25, 29, 55, metal);
  canvas.rect(26, 55, 6, 3, hose);
  // Canister behind her, on little wheels, and the hose to her hands.
  canvas.rect(1, 48, 8, 7, metal);
  canvas.rect(2, 46, 5, 2, shade(metal, 0.8));
  canvas.set(2, 56, hose);
  canvas.set(7, 56, hose);
  canvas.line(8, 50, 12, 45, hose);
  canvas.line(12, 45, 24, 26, hose);
  return canvas.texture();
}
