/** Helpers shared by the test files. Not part of the public API. */
import { ALL_BUTTONS, IDLE_INPUT, type SimInput } from './input';
import { createSeededRng } from './rng';
import { seedFromEntropy, type DreamSeed } from './seed';

/** `count` distinct pseudo-random seeds, the same on every run. */
export function testSeeds(count: number, key = 'test/seeds'): DreamSeed[] {
  const rng = createSeededRng(key);
  const seeds = new Set<DreamSeed>();
  while (seeds.size < count) {
    seeds.add(seedFromEntropy(Array.from({ length: 6 }, () => rng.int(0, 255))));
  }
  return [...seeds];
}

/**
 * `ticks` inputs of a restless player: the stick and buttons change every few
 * ticks, the mouse jitters, and sometimes nothing happens. Values are raw
 * (unquantized, sometimes out of range) on purpose. The same `key` always
 * gives the same sequence.
 */
export function randomInputs(ticks: number, key = 'test/inputs'): SimInput[] {
  const rng = createSeededRng(key);
  const inputs: SimInput[] = [];
  let held: SimInput = IDLE_INPUT;
  for (let tick = 0; tick < ticks; tick++) {
    if (rng.chance(0.08)) {
      held = rng.chance(0.2)
        ? IDLE_INPUT
        : { move: [rng.range(-1.2, 1.2), rng.range(-1.2, 1.2)], look: [0, 0], buttons: rng.int(0, ALL_BUTTONS) };
    }
    const look: [number, number] = rng.chance(0.5) ? [rng.range(-0.03, 0.03), rng.range(-0.02, 0.02)] : [0, 0];
    inputs.push({ ...held, look });
  }
  return inputs;
}
