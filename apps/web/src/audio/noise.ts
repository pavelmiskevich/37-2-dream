import type { Rng } from './rng';

export type NoiseColor = 'white' | 'pink' | 'brown';

const PEAK = 0.9;

/**
 * Generates a loopable noise buffer from a seeded RNG. The result has no DC
 * offset, peaks at 0.9 and its last sample meets the first, so looping it in
 * an AudioBufferSourceNode does not click.
 */
export function generateNoise(color: NoiseColor, length: number, rng: Rng): Float32Array<ArrayBuffer> {
  const data = new Float32Array(length);
  // Pink: Paul Kellet's economy filter. Brown: leaky integrator.
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let brown = 0;
  for (let i = 0; i < length; i++) {
    const white = rng() * 2 - 1;
    if (color === 'white') {
      data[i] = white;
    } else if (color === 'pink') {
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = b0 + b1 + b2 + white * 0.1848;
    } else {
      brown = (brown + 0.02 * white) / 1.02;
      data[i] = brown;
    }
  }
  makeLoopable(data);
  normalizePeak(data, PEAK);
  return data;
}

/**
 * Removes the mean and the linear drift between the first and last sample so
 * the buffer loops without a step. Low-frequency noise (brown, pink) drifts
 * far enough for that step to be an audible click.
 */
export function makeLoopable(data: Float32Array): void {
  const n = data.length;
  if (n < 2) return;
  const first = data[0]!;
  const step = data[n - 1]! - first;
  let mean = 0;
  for (let i = 0; i < n; i++) {
    const value = data[i]! - (step * i) / (n - 1);
    data[i] = value;
    mean += value;
  }
  mean /= n;
  for (let i = 0; i < n; i++) data[i] = data[i]! - mean;
}

export function normalizePeak(data: Float32Array, peak: number): void {
  let max = 0;
  for (const value of data) max = Math.max(max, Math.abs(value));
  if (max === 0) return;
  const scale = peak / max;
  for (let i = 0; i < data.length; i++) data[i] = data[i]! * scale;
}
