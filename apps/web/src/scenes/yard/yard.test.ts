import { describe, expect, it } from 'vitest';
import {
  SWING_RELEASE,
  findScene,
  generateDream,
  normalizeSeed,
  sceneRng,
  yardLayout,
  type DreamSeed,
  type TimeOfDay,
} from '@dream/core';
import { BACKWARD_PITCH, TURN_CREAK_FROM, TURN_PITCH, creakCue } from './creak-cue';
import { dressYard, womanAt, type YardDressing } from './dressing';
import { DIMMEST, FLICKER_CYCLE, HINT_EASE_RATE, easeHint, gatherSpot, hintLook, lampFlicker, pigeonGoes } from './hint';
import { DRIZZLE_FROM_FOG, yardLook } from './look';

const SEEDS = ['DREAM-8F72-A19C-37B2', 'DREAM-0000-0000-0000', 'DREAM-C0DE-BEEF-0451', 'DREAM-3720-3720-3720'].map(
  (s) => normalizeSeed(s),
);

function dress(seed: DreamSeed): { dressing: YardDressing; layout: ReturnType<typeof yardLayout> } {
  const dream = generateDream(seed);
  const scene = findScene(dream, 'yard')!;
  const layout = yardLayout(seed, scene.index);
  return { layout, dressing: dressYard(layout, scene.params, sceneRng(seed, scene.index, 'view')) };
}

describe('creakCue', () => {
  it('creaks when the seat passes the bottom, either way, and only then', () => {
    expect(creakCue({ angle: -0.01, speed: 1 }, { angle: 0.01, speed: 1 })).not.toBeNull();
    expect(creakCue({ angle: 0.01, speed: -1 }, { angle: -0.01, speed: -1 })).not.toBeNull();
    expect(creakCue({ angle: 0.2, speed: 0.1 }, { angle: 0.21, speed: 0.05 })).toBeNull();
    expect(creakCue({ angle: 0, speed: 0 }, { angle: 0, speed: 0 })).toBeNull();
  });

  it('is as strong as the swing is high, and lower on the way back', () => {
    const omega = Math.sqrt(9.81 / 2.2);
    const high = creakCue({ angle: -0.001, speed: SWING_RELEASE.amplitude * omega }, { angle: 0.001, speed: SWING_RELEASE.amplitude * omega })!;
    const low = creakCue({ angle: -0.001, speed: 0.2 * omega }, { angle: 0.001, speed: 0.2 * omega })!;
    expect(high.strength).toBeCloseTo(1, 2);
    expect(low.strength).toBeCloseTo(0.2 / SWING_RELEASE.amplitude, 2);
    expect(high.pitch).toBe(1);
    expect(creakCue({ angle: 0.001, speed: -1 }, { angle: -0.001, speed: -1 })!.pitch).toBe(BACKWARD_PITCH);
  });

  it('creaks louder and more often when the swing calls the hero', () => {
    const bottom = [{ angle: -0.001, speed: 0.6 }, { angle: 0.001, speed: 0.6 }] as const;
    const top = [{ angle: 0.3, speed: 0.01 }, { angle: 0.3, speed: -0.01 }] as const;
    expect(creakCue(...bottom, 3)!.strength).toBeGreaterThan(creakCue(...bottom, 0)!.strength * 1.5);
    // The top of a swing is silent for a quiet swing and squeaks for a calling one.
    expect(creakCue(...top, 0)).toBeNull();
    expect(creakCue(...top, TURN_CREAK_FROM - 1)).toBeNull();
    const squeak = creakCue(...top, TURN_CREAK_FROM)!;
    expect(squeak.pitch).toBe(TURN_PITCH);
    expect(squeak.strength).toBeLessThan(creakCue(...bottom, TURN_CREAK_FROM)!.strength + 1e-9);
    expect(creakCue(...bottom, 100)!.strength).toBeLessThanOrEqual(1);
  });
});

describe('the yard calling the hero', () => {
  it('is quiet at level 0 and grows with every level', () => {
    expect(hintLook(0)).toEqual({ lampGlow: 0, flicker: 0, dimming: 1, gathered: 0 });
    let previous = hintLook(0);
    for (const level of [1, 2, 3, 4]) {
      const look = hintLook(level);
      expect(look.lampGlow).toBeGreaterThan(previous.lampGlow);
      expect(look.dimming).toBeLessThan(previous.dimming);
      expect(look.gathered).toBeGreaterThan(previous.gathered);
      expect(look.flicker).toBeGreaterThanOrEqual(previous.flicker);
      previous = look;
    }
    // The rest of the yard only dims a little; the lamp buzzes at the top level.
    expect(previous.dimming).toBe(DIMMEST);
    expect(previous.flicker).toBe(1);
    expect(hintLook(1).flicker).toBe(0);
  });

  it('glides from one step to the next instead of popping', () => {
    expect(easeHint(0, 1, 0.5)).toBeCloseTo(HINT_EASE_RATE * 0.5, 9);
    expect(easeHint(1, 0, 0.5)).toBeCloseTo(1 - HINT_EASE_RATE * 0.5, 9);
    expect(easeHint(0.99, 1, 1)).toBe(1);
  });

  it('dips the buzzing lamp fewer than three times a second (D-009)', () => {
    expect(lampFlicker(1.23, 0)).toBe(1);
    let dips = 0;
    let lit = true;
    for (let i = 0; i < 6000; i++) {
      const on = lampFlicker(i / 1000, 1) === 1;
      if (lit && !on) dips++;
      lit = on;
    }
    expect(dips).toBeGreaterThan(0);
    expect(dips / 6).toBeLessThan(3);
    expect(Math.min(...Array.from({ length: 100 }, (_, i) => lampFlicker((i / 100) * FLICKER_CYCLE, 1)))).toBeGreaterThan(0);
  });

  it('gathers the pigeons around the swing, clear of its frame, a few at a time', () => {
    for (let i = 0; i < 12; i++) {
      const spot = gatherSpot(3, -2, i);
      const r = Math.hypot(spot.x - 3, spot.z + 2);
      expect(r).toBeGreaterThan(2.2);
      expect(r).toBeLessThan(3.1);
    }
    expect(pigeonGoes(0, 8, 0)).toBe(false);
    expect(pigeonGoes(0, 8, 0.25)).toBe(true);
    expect(pigeonGoes(2, 8, 0.25)).toBe(false);
    expect(Array.from({ length: 8 }, (_, i) => pigeonGoes(i, 8, 1)).every(Boolean)).toBe(true);
  });
});

describe('yardLook', () => {
  it('lights the lamps and the windows at night, not at noon', () => {
    const night = yardLook({ timeOfDay: 'night', fog: 0.2 });
    const noon = yardLook({ timeOfDay: 'noon', fog: 0.2 });
    expect(night.lampsOn).toBe(true);
    expect(noon.lampsOn).toBe(false);
    expect(night.litWindows).toBeGreaterThan(noon.litWindows * 5);
  });

  it('closes in the fog and drizzles only when it is thick', () => {
    const clear = yardLook({ timeOfDay: 'dusk', fog: 0.15 });
    const thick = yardLook({ timeOfDay: 'dusk', fog: 0.85 });
    expect(thick.fogFar).toBeLessThan(clear.fogFar);
    expect(clear.drizzle).toBe(0);
    expect(yardLook({ timeOfDay: 'dusk', fog: DRIZZLE_FROM_FOG }).drizzle).toBe(0);
    expect(thick.drizzle).toBeGreaterThan(0.5);
  });

  it('gives every time of day its own sky', () => {
    const times: TimeOfDay[] = ['dawn', 'noon', 'dusk', 'night'];
    expect(new Set(times.map((t) => yardLook({ timeOfDay: t, fog: 0.3 }).sky)).size).toBe(4);
  });
});

describe('dressYard', () => {
  it('is the same for the same seed', () => {
    expect(dress(SEEDS[0]!).dressing).toEqual(dress(SEEDS[0]!).dressing);
  });

  it.each(SEEDS)('keeps the swing clear and everything inside the yard for %s', (seed) => {
    const { dressing, layout } = dress(seed);
    const props = [dressing.sandbox, ...dressing.benches, dressing.bins, ...dressing.lamps, ...dressing.cars];
    for (const prop of props) {
      expect(Math.hypot(prop.x - layout.swing.x, prop.z - layout.swing.z)).toBeGreaterThan(3);
      expect(Math.abs(prop.x)).toBeLessThanOrEqual(layout.halfWidth);
      expect(Math.abs(prop.z)).toBeLessThanOrEqual(layout.halfDepth);
    }
    // Blocks stand outside the yard.
    for (const block of dressing.blocks) {
      const outside = Math.abs(block.x) >= layout.halfWidth || Math.abs(block.z) >= layout.halfDepth;
      expect(outside).toBe(true);
    }
  });

  it('gives different seeds visibly different yards', () => {
    const keys = SEEDS.map((seed) => {
      const { dressing, layout } = dress(seed);
      return JSON.stringify([layout.swing, dressing.blocks.map((b) => b.floors), dressing.benches.length, dressing.cars.length]);
    });
    expect(new Set(keys).size).toBe(SEEDS.length);
  });

  it('marks the hero\'s own window on the main block, at his floor', () => {
    const dream = generateDream(SEEDS[0]!);
    const scene = findScene(dream, 'yard')!;
    const { dressing } = dress(SEEDS[0]!);
    expect(dressing.blocks[0]!.floors).toBe(scene.params.buildingFloors);
    expect(dressing.blocks[0]!.home?.[0]).toBe(scene.params.homeFloor);
  });

  it('sends the woman across vacuumPasses times, one pass at a time', () => {
    for (const seed of SEEDS) {
      const scene = findScene(generateDream(seed), 'yard')!;
      const { woman } = dress(seed).dressing;
      expect(woman.passes).toHaveLength(scene.params.vacuumPasses);
      for (let i = 1; i < woman.passes.length; i++) {
        const before = woman.passes[i - 1]!;
        expect(woman.passes[i]!.start).toBeGreaterThan(before.start + before.duration);
      }
      const first = woman.passes[0]!;
      expect(womanAt(woman, first.start - 1)).toBeNull();
      const start = womanAt(woman, first.start)!;
      const end = womanAt(woman, first.start + first.duration)!;
      expect(start.x).toBeCloseTo(-first.direction * woman.halfSpan, 9);
      expect(end.x).toBeCloseTo(first.direction * woman.halfSpan, 9);
    }
  });
});
