import { clamp01 } from './math';

/**
 * Relative amplitudes of mains harmonics (50 Hz first). A transformer hums
 * mostly at twice the mains frequency, and the upper harmonics keep the hum
 * audible on small speakers that cannot play 50–100 Hz.
 */
const BASE_HARMONICS: readonly number[] = [0.45, 1, 0.4, 0.22, 0.12, 0.07, 0.04];

/**
 * Harmonic amplitudes (index 0 = fundamental) for a PeriodicWave. `brightness`
 * 0…1 scales everything above the second harmonic. The sum is normalised to 1,
 * so brightness changes the timbre, not the loudness.
 */
export function humHarmonics(brightness: number): number[] {
  const b = clamp01(brightness);
  const raw = BASE_HARMONICS.map((amp, i) => (i >= 2 ? amp * (0.4 + 0.6 * b) : amp));
  const sum = raw.reduce((acc, amp) => acc + amp, 0);
  return raw.map((amp) => amp / sum);
}
