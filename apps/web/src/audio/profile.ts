import type { CreakCharacter } from './creak';
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
  /** The yard swing's creak. Drawn after the older sounds, so adding it left them as they were. */
  swing: CreakCharacter;
  /** The hero's own breathing in the apartment: lower and softer than the ventilator it turns into. */
  breath: BreathBands & {
    breathsPerMinute: number;
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
    swing: {
      rubHz: randomIn(rng, 150, 260),
      ringHz: randomIn(rng, 700, 1100),
    },
    // Drawn after the others, so adding it kept every older value of the profile.
    breath: {
      breathsPerMinute: randomIn(rng, 16, 19),
      inhaleHz: randomIn(rng, 380, 520),
      exhaleHz: randomIn(rng, 650, 900),
    },
  };
}
