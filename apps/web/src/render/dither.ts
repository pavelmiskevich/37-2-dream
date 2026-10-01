/**
 * The PlayStation GPU's 4×4 dither table, in 8-bit colour steps. It is added
 * to 8-bit colour before truncating to 5 bits per channel. Row-major.
 */
export const PS1_DITHER_MATRIX: readonly number[] = [
  -4, 0, -3, 1,
  2, -2, 3, -1,
  -3, 1, -4, 0,
  3, -1, 2, -2,
];

/** GLSL `const float[16]` literal of the dither table. */
export function ditherMatrixGlsl(matrix: readonly number[] = PS1_DITHER_MATRIX): string {
  return `float[16]( ${matrix.map((v) => v.toFixed(1)).join(', ')} )`;
}

/**
 * CPU reference of the quantiser the post shader runs: 8-bit channel value
 * plus dither, truncated to `bits` bits and mapped back to 0..1.
 */
export function quantizeChannel(value: number, x: number, y: number, bits: number, dither = true): number {
  const levels = 2 ** bits - 1;
  const step = 256 / (levels + 1);
  const offset = dither ? (PS1_DITHER_MATRIX[(y % 4) * 4 + (x % 4)] ?? 0) * (step / 8) : 0;
  const q = Math.floor((value * 255 + offset) / step);
  return Math.min(Math.max(q, 0), levels) / levels;
}
