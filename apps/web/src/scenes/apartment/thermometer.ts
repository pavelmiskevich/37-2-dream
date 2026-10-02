import * as THREE from 'three';
import type { Kit } from './kit';

/**
 * The bedside thermometer: a digital one, bigger than life, propped up close
 * to the pillow so that its "37,2" reads even at the PS1 resolution. Seven-
 * segment digits survive nearest filtering far better than a font.
 */

/** Segments a..g of each digit (a top, then clockwise, g middle). */
const SEGMENTS: Readonly<Record<string, string>> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  '-': 'g',
};

/** "37,2": the reading with a decimal comma, as the thermometer shows it. */
export function formatReading(celsius: number): string {
  return celsius.toFixed(1).replace('.', ',');
}

/** Lit segments of every character of `text`; a comma is a dot after the previous digit. */
export function segmentsOf(text: string): { segments: string; dot: boolean }[] {
  const digits: { segments: string; dot: boolean }[] = [];
  for (const char of text) {
    const last = digits.at(-1);
    if ((char === ',' || char === '.') && last) last.dot = true;
    else digits.push({ segments: SEGMENTS[char] ?? '', dot: false });
  }
  return digits;
}

const LCD_BACK = '#9aa78a';
const LCD_INK = '#1b2117';

function drawDigit(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, lit: string) {
  const half = h / 2;
  const rects: Record<string, [number, number, number, number]> = {
    a: [x + t, y, w - 2 * t, t],
    b: [x + w - t, y + t, t, half - t * 1.5],
    c: [x + w - t, y + half + t / 2, t, half - t * 1.5],
    d: [x + t, y + h - t, w - 2 * t, t],
    e: [x, y + half + t / 2, t, half - t * 1.5],
    f: [x, y + t, t, half - t * 1.5],
    g: [x + t, y + half - t / 2, w - 2 * t, t],
  };
  for (const segment of lit) {
    const rect = rects[segment];
    if (rect) g.fillRect(...rect);
  }
}

/** Builds the thermometer, its display facing +Z. Long side along X. */
export function buildThermometer(kit: Kit, celsius: number): THREE.Group {
  const group = new THREE.Group();
  const length = 0.34;
  const width = 0.1;
  // Body: a white plastic slab with a grey probe at one end.
  kit.box(group, [length, width, 0.03], [0, 0, 0], 0xe8e6de);
  const probe = kit.cylinder(group, 0.008, 0.09, [0, 0, 0], 0xb0b0aa, 6);
  probe.rotation.z = Math.PI / 2;
  probe.position.set(-length / 2 - 0.045, 0, 0);
  // A small blue button under the display.
  kit.box(group, [0.03, 0.014, 0.008], [0.12, -0.026, 0.017], 0x3a5a9a);

  const texture = kit.canvas(160, 64, (g) => {
    g.fillStyle = LCD_BACK;
    g.fillRect(0, 0, 160, 64);
    g.fillStyle = LCD_INK;
    const digits = segmentsOf(formatReading(celsius));
    const w = 26;
    const h = 44;
    const gap = 9;
    let x = 8;
    for (const digit of digits) {
      drawDigit(g, x, 10, w, h, 6, digit.segments);
      if (digit.dot) g.fillRect(x + w + 1, 10 + h - 6, 6, 6);
      x += w + gap;
    }
    // "°C", small, top right.
    g.fillRect(x - 2, 10, 5, 5);
    g.font = 'bold 18px monospace';
    g.fillText('C', x + 4, 26);
  });
  const display = new THREE.Mesh(
    kit.geometry(new THREE.PlaneGeometry(0.22, 0.088)),
    kit.own(new THREE.MeshBasicMaterial({ map: texture })),
  );
  display.position.set(-0.015, 0.002, 0.0155);
  group.add(display);
  return group;
}
