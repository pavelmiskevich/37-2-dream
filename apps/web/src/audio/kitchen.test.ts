import { describe, expect, it } from 'vitest';
import { drawKitchenSound, KITCHEN_GAP, KITCHEN_SOUNDS, kitchenSoundLength, type KitchenSound } from './kitchen';
import { deriveRng } from './rng';

const draw = (seed: string, count: number): KitchenSound[] => {
  const rng = deriveRng(seed, 'kitchen');
  return Array.from({ length: count }, () => drawKitchenSound(rng));
};

describe('drawKitchenSound', () => {
  it('is reproducible from the seed', () => {
    expect(draw('DREAM-8F72-A19C-37B2', 50)).toEqual(draw('DREAM-8F72-A19C-37B2', 50));
    expect(draw('DREAM-8F72-A19C-37B2', 50)).not.toEqual(draw('DREAM-0000-0000-0000', 50));
  });

  it('plays every kind of kitchen sound', () => {
    const kinds = new Set(draw('kinds', 400).map((sound) => sound.kind));
    expect([...kinds].sort()).toEqual([...KITCHEN_SOUNDS].sort());
  });

  it('never starts a sound on top of the previous one, and keeps the kitchen sparse', () => {
    for (const sound of draw('gaps', 400)) {
      const length = kitchenSoundLength(sound);
      expect(sound.gap - length).toBeGreaterThanOrEqual(KITCHEN_GAP.min - 1e-9);
      expect(sound.gap - length).toBeLessThanOrEqual(KITCHEN_GAP.max + 1e-9);
    }
  });

  it('keeps struck china quiet and in time order', () => {
    for (const sound of draw('hits', 400)) {
      if (sound.kind !== 'stir' && sound.kind !== 'clink') continue;
      for (const hit of sound.hits) {
        expect(hit.offset).toBeGreaterThanOrEqual(0);
        expect(hit.gain).toBeGreaterThan(0);
        expect(hit.gain).toBeLessThanOrEqual(1);
      }
      for (let i = 1; i < sound.hits.length; i++) {
        expect(sound.hits[i]!.offset).toBeGreaterThan(sound.hits[i - 1]!.offset);
      }
    }
  });
});
