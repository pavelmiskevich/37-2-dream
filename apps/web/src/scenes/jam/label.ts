import * as THREE from 'three';
import type { JamFlavor } from '@dream/core';

/**
 * The paper label on the jar: a plain printed label of a Soviet-style jam,
 * drawn on a canvas. It is printed to be read from outside; the hero sees it
 * from inside the jar, through the glass, as its mirror image.
 */

/** Lines of the label's name by flavour. */
export const LABEL_NAMES: Readonly<Record<JamFlavor, readonly string[]>> = {
  raspberry: ['ВАРЕНЬЕ', 'МАЛИНОВОЕ'],
  cherry: ['ВАРЕНЬЕ', 'ВИШНЁВОЕ'],
  apricot: ['ВАРЕНЬЕ', 'АБРИКОСОВОЕ'],
  blackcurrant: ['ВАРЕНЬЕ ИЗ', 'ЧЁРНОЙ СМОРОДИНЫ'],
};

/** Small print, the same on every label. */
export const LABEL_SMALL_PRINT = ['Масса нетто 1000 г', 'Хранить в прохладном месте'] as const;

const WIDTH = 512;
const HEIGHT = 262;

export function createLabelTexture(flavor: JamFlavor, fruit: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ece4cc';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // Frame and band in the colour of the fruit.
    ctx.strokeStyle = fruit;
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, WIDTH - 24, HEIGHT - 24);
    ctx.fillStyle = fruit;
    ctx.fillRect(12, HEIGHT - 70, WIDTH - 24, 22);
    // A round fruit emblem on the left.
    ctx.beginPath();
    ctx.arc(84, 104, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ece4cc';
    ctx.beginPath();
    ctx.arc(70, 90, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2a1a14';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const name = LABEL_NAMES[flavor];
    const longest = Math.max(...name.map((line) => line.length));
    const size = Math.min(44, Math.floor(330 / (longest * 0.62)));
    ctx.font = `bold ${size}px "Arial Narrow", Arial, sans-serif`;
    name.forEach((line, i) => ctx.fillText(line, 152, 70 + i * (size + 8)));
    ctx.font = '20px "Courier New", Courier, monospace';
    ctx.textAlign = 'center';
    // One line above the band, one below it.
    const [above, below] = LABEL_SMALL_PRINT;
    ctx.fillText(above, WIDTH / 2, HEIGHT - 94);
    ctx.fillText(below, WIDTH / 2, HEIGHT - 31);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
