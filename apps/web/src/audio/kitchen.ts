import { randomIn, type Rng } from './rng';

/**
 * Kitchen behind the closed door of the apartment: someone quietly making
 * tea. Sparse, everyday sounds — a spoon stirring in a glass, a cup set down,
 * a cupboard door, the tap. Nothing here touches Web Audio: this module only
 * decides what sounds when, from the seeded audio stream (D-011).
 */
export const KITCHEN_SOUNDS = ['stir', 'clink', 'cupboard', 'tap'] as const;
export type KitchenSoundKind = (typeof KITCHEN_SOUNDS)[number];

/** One struck glass or china: a short decaying ring. */
export interface KitchenHit {
  /** Seconds after the start of the sound. */
  offset: number;
  /** Base frequency of the ring, Hz; upper partials follow `KITCHEN_PARTIALS`. */
  frequency: number;
  /** 0…1. */
  gain: number;
  /** Time for the ring to die away, seconds. */
  decay: number;
}

export type KitchenSound =
  | { kind: 'stir' | 'clink'; hits: KitchenHit[]; gap: number }
  | { kind: 'cupboard'; gain: number; gap: number }
  | { kind: 'tap'; duration: number; frequency: number; gap: number };

/** Partials of a struck cup or glass: [frequency ratio, relative gain]. Inharmonic, like real china. */
export const KITCHEN_PARTIALS: readonly (readonly [number, number])[] = [
  [1, 1],
  [2.71, 0.45],
  [5.2, 0.2],
];

/** Silence after a sound before the next one starts, seconds. */
export const KITCHEN_GAP = { min: 2.5, max: 7 } as const;

/** How often each kind is heard. Stirring tea is the point of it all. */
const WEIGHTS: Readonly<Record<KitchenSoundKind, number>> = { stir: 3, clink: 3, cupboard: 2, tap: 1.5 };

function pickKind(rng: Rng): KitchenSoundKind {
  const total = KITCHEN_SOUNDS.reduce((sum, kind) => sum + WEIGHTS[kind], 0);
  let roll = rng() * total;
  for (const kind of KITCHEN_SOUNDS) {
    roll -= WEIGHTS[kind];
    if (roll < 0) return kind;
  }
  return 'clink';
}

/** Length of the sound itself, seconds, so the next one never starts on top of it. */
export function kitchenSoundLength(sound: KitchenSound): number {
  switch (sound.kind) {
    case 'stir':
    case 'clink':
      return Math.max(...sound.hits.map((hit) => hit.offset + hit.decay));
    case 'cupboard':
      return 0.3;
    case 'tap':
      return sound.duration;
  }
}

/**
 * Draws the next kitchen sound. `gap` is the time from its start to the start
 * of the following one: its own length plus a pause within `KITCHEN_GAP`.
 */
export function drawKitchenSound(rng: Rng): KitchenSound {
  const kind = pickKind(rng);
  const pause = randomIn(rng, KITCHEN_GAP.min, KITCHEN_GAP.max);
  switch (kind) {
    case 'stir': {
      // A teaspoon going round a glass: 4–8 light, high taps, slightly uneven.
      const count = 4 + Math.floor(rng() * 5);
      const pitch = randomIn(rng, 2000, 2600);
      const period = randomIn(rng, 0.28, 0.36);
      const hits = Array.from({ length: count }, (_, i) => ({
        offset: i * period + randomIn(rng, -0.03, 0.03) + 0.03,
        frequency: pitch * randomIn(rng, 0.97, 1.03),
        gain: randomIn(rng, 0.25, 0.45),
        decay: 0.12,
      }));
      return { kind, hits, gap: kitchenSoundLength({ kind, hits, gap: 0 }) + pause };
    }
    case 'clink': {
      // A cup put down on its saucer: one knock, sometimes a little second one.
      const pitch = randomIn(rng, 900, 1400);
      const hits: KitchenHit[] = [{ offset: 0, frequency: pitch, gain: randomIn(rng, 0.6, 0.9), decay: 0.35 }];
      if (rng() < 0.5) hits.push({ offset: randomIn(rng, 0.07, 0.12), frequency: pitch * 1.02, gain: 0.3, decay: 0.2 });
      return { kind, hits, gap: kitchenSoundLength({ kind, hits, gap: 0 }) + pause };
    }
    case 'cupboard':
      return { kind, gain: randomIn(rng, 0.6, 1), gap: 0.3 + pause };
    case 'tap': {
      const duration = randomIn(rng, 1.2, 3);
      return { kind, duration, frequency: randomIn(rng, 900, 1400), gap: duration + pause };
    }
  }
}
