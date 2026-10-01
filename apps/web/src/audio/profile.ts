import type { BreathBands } from './ventilator';
import type { VacuumCharacter } from './vacuum';
import { deriveRng, randomIn, type AudioSeed } from './rng';

/**
 * Seed-dependent character of every synthesised sound. Variations are small:
 * each sound must stay recognisable, the seed only gives the dream its own
 * "voice" (a slightly different monitor, a different snore rate).
 */
export interface SoundProfile {
  monitor: {
    /** Base beep pitch, Hz. */
    pitchHz: number;
  };
  ventilator: BreathBands & {
    breathsPerMinute: number;
  };
  vacuum: VacuumCharacter;
  hum: {
    /** Mains frequency with a little drift, Hz. */
    mainsHz: number;
    /** Upper harmonic content, 0…1. */
    brightness: number;
  };
}

export function soundProfileFromSeed(seed: AudioSeed): SoundProfile {
  const rng = deriveRng(seed, 'profile');
  return {
    monitor: {
      pitchHz: randomIn(rng, 880, 1000),
    },
    ventilator: {
      breathsPerMinute: randomIn(rng, 12, 16),
      inhaleHz: randomIn(rng, 900, 1300),
      exhaleHz: randomIn(rng, 2600, 3400),
    },
    vacuum: {
      motorHz: randomIn(rng, 160, 210),
      whineHz: randomIn(rng, 1300, 1700),
      wobbleHz: randomIn(rng, 0.25, 0.45),
    },
    hum: {
      mainsHz: randomIn(rng, 49.7, 50.3),
      brightness: randomIn(rng, 0.3, 0.8),
    },
  };
}
