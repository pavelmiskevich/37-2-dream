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
import { BACKWARD_PITCH, creakCue } from './creak-cue';
import { dressYard, womanAt, type YardDressing } from './dressing';
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
