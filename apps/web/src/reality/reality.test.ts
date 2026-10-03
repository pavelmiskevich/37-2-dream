import { describe, expect, it, vi } from 'vitest';
import {
  IDLE_INPUT,
  createInitialState,
  findScene,
  runInputs,
  generateDream,
  normalizeSeed,
  sceneRng,
  yardLayout,
  type AwakeningPhase,
  type Dream,
} from '@dream/core';
import type { AudioEngine, SoundEvent } from '../audio';
import { interpolateFrame } from '../loop';
import { fallLayout } from '../scenes/fall/layout';
import { YARD_VIEW_CHANNEL } from '../scenes/yard';
import { dressYard, womanAt } from '../scenes/yard/dressing';
import { createVacuumLayer, vacuumEvents } from './layer';
import { YARD_VIEW_STREAM, vacuumSighting } from './sightings';
import { VACUUM_LAYER, VACUUM_OFF, vacuumMixAt, vacuumProgress, vacuumScenes } from './vacuum';

const SEEDS = ['DREAM-8F72-A19C-37B2', 'DREAM-0000-0000-0000', 'DREAM-C0DE-BEEF-0451', 'DREAM-3720-3720-3720'];
const dreams = SEEDS.map((s) => generateDream(normalizeSeed(s)));
const dream = dreams[0]!;
const index = (d: Dream, id: Parameters<typeof findScene>[1]) => findScene(d, id)!.index;

describe('vacuum layer: across the scenes', () => {
  it('plays in the dreaming scenes only', () => {
    expect(vacuumScenes(dream)).toEqual([index(dream, 'yard'), index(dream, 'fall'), index(dream, 'jam')]);
    expect(vacuumMixAt(dream, index(dream, 'apartment'), 5, null, 0)).toEqual(VACUUM_OFF);
  });

  it('grows louder and more of a turbine from scene to scene, and within each', () => {
    for (const d of dreams) {
      let last = { turbine: -1, volume: -1 };
      for (const sceneIndex of vacuumScenes(d)) {
        const duration = d.scenes[sceneIndex]!.duration;
        for (const share of [0, 0.25, 0.5, 0.75, 1]) {
          const mix = vacuumMixAt(d, sceneIndex, share * duration, null, 0);
          expect(mix.on).toBe(true);
          expect(mix.turbine).toBeGreaterThanOrEqual(last.turbine);
          expect(mix.volume).toBeGreaterThanOrEqual(last.volume);
          last = mix;
        }
      }
      // A vacuum cleaner behind the wall in the yard, a turbine by the end of the jam.
      const yard = vacuumMixAt(d, index(d, 'yard'), 0, null, 0);
      expect(yard).toEqual({ on: true, ...VACUUM_LAYER.start });
      expect(last.turbine).toBeGreaterThanOrEqual(VACUUM_LAYER.peakTurbine[0]);
      expect(last.volume).toBeCloseTo(VACUUM_LAYER.peakVolume, 6);
    }
  });

  it('stays a vacuum cleaner for most of the yard', () => {
    const yard = findScene(dream, 'yard')!;
    expect(vacuumMixAt(dream, yard.index, yard.duration, null, 0).turbine).toBeLessThan(0.25);
  });

  it('counts the progress by the nominal duration, and holds it in a long yard', () => {
    const yard = findScene(dream, 'yard')!;
    expect(vacuumProgress(dream, yard.index, yard.duration / 2)).toBeCloseTo(1 / 6, 6);
    expect(vacuumProgress(dream, yard.index, yard.duration * 5)).toBeCloseTo(1 / 3, 6);
    expect(vacuumProgress(dream, index(dream, 'apartment'), 3)).toBe(0);
    expect(vacuumProgress(dream, index(dream, 'awakening'), 3)).toBe(1);
  });

  it('peaks higher in a more domestic dream', () => {
    const peak = (d: Dream) => vacuumMixAt(d, index(d, 'jam'), d.scenes[index(d, 'jam')]!.duration, null, 0).turbine;
    const sorted = [...dreams].sort((a, b) => a.profile.domesticIntensity - b.profile.domesticIntensity);
    expect(peak(sorted[0]!)).toBeLessThanOrEqual(peak(sorted.at(-1)!));
  });

  it('comes closer while its source is in sight', () => {
    const fall = findScene(dream, 'fall')!;
    const far = vacuumMixAt(dream, fall.index, 3, null, 0);
    const near = vacuumMixAt(dream, fall.index, 3, null, 1);
    expect(near.volume - far.volume).toBeCloseTo(VACUUM_LAYER.sighting.volume, 6);
    expect(near.turbine).toBeGreaterThan(far.turbine);
  });

  it('is an ordinary vacuum cleaner on awakening, until it is switched off', () => {
    const awakening = index(dream, 'awakening');
    const on: AwakeningPhase[] = ['waking', 'listening'];
    const off: AwakeningPhase[] = ['quiet', 'call', 'verdict', 'over'];
    for (const phase of on) expect(vacuumMixAt(dream, awakening, 1, phase, 0)).toEqual({ on: true, ...VACUUM_LAYER.awake });
    for (const phase of off) expect(vacuumMixAt(dream, awakening, 1, phase, 0).on).toBe(false);
    expect(VACUUM_LAYER.awake.turbine).toBe(0);
  });
});

describe('vacuum sightings', () => {
  it('reads the yard view’s own stream', () => {
    expect(YARD_VIEW_STREAM).toBe(YARD_VIEW_CHANNEL);
  });

  it('see the woman exactly while the yard view shows her', () => {
    for (const d of dreams) {
      const yard = findScene(d, 'yard')!;
      const dressing = dressYard(yardLayout(d.seed, yard.index), yard.params, sceneRng(d.seed, yard.index, 'view'));
      const sighting = vacuumSighting(d, yard)!;
      for (const pass of dressing.woman.passes) {
        const middle = pass.start + pass.duration / 2;
        expect(womanAt(dressing.woman, middle)).not.toBeNull();
        expect(sighting(middle)).toBe(1);
      }
      const first = dressing.woman.passes[0]!;
      expect(sighting(first.start - 0.2 * first.duration)).toBe(0);
    }
  });

  it('see a vacuum cleaner falling past', () => {
    for (const d of dreams) {
      const fall = findScene(d, 'fall')!;
      const layout = fallLayout(fall);
      const sighting = vacuumSighting(d, fall);
      if (!layout.objects.some((slot) => slot.kind === 'vacuum')) {
        expect(sighting).toBeNull();
        continue;
      }
      const peak = Math.max(...Array.from({ length: 600 }, (_, i) => sighting!((i / 600) * fall.duration)));
      expect(peak).toBeGreaterThan(0.9);
      expect(sighting!(0)).toBeLessThan(peak);
    }
  });

  it('are none in the jam: there it is a hum through the jam', () => {
    expect(vacuumSighting(dream, findScene(dream, 'jam')!)).toBeNull();
  });
});

describe('vacuumEvents', () => {
  it('sets the vacuum up before starting it, with a long fade', () => {
    const { events, sent } = vacuumEvents(null, { on: true, turbine: 0.1, volume: 0.3 });
    expect(events).toEqual<SoundEvent[]>([
      { type: 'vacuum.turbine', value: 0.1 },
      { type: 'vacuum.volume', value: 0.3 },
      { type: 'sound.start', sound: 'vacuum', fade: VACUUM_LAYER.fadeIn },
    ]);
    expect(sent).toEqual({ on: true, turbine: 0.1, volume: 0.3 });
  });

  it('holds back changes until they add up, and stops it with a spin-down', () => {
    const sent = { on: true, turbine: 0.1, volume: 0.3 };
    expect(vacuumEvents(sent, { on: true, turbine: 0.105, volume: 0.305 })).toEqual({ events: [], sent });
    expect(vacuumEvents(sent, { on: true, turbine: 0.12, volume: 0.305 }).events).toEqual([
      { type: 'vacuum.turbine', value: 0.12 },
    ]);
    expect(vacuumEvents(sent, VACUUM_OFF).events).toEqual([{ type: 'sound.stop', sound: 'vacuum', fade: VACUUM_LAYER.fadeOut }]);
    expect(vacuumEvents({ ...sent, on: false }, VACUUM_OFF).events).toEqual([]);
  });
});

describe('createVacuumLayer', () => {
  it('starts with the dream, grows, and is switched off on awakening', () => {
    const handled: SoundEvent[] = [];
    const audio = { handle: vi.fn((event: SoundEvent) => handled.push(event)) } as unknown as AudioEngine;
    const layer = createVacuumLayer(dream, audio);
    const at = (scene: number, ticks = 0) => {
      const start = createInitialState(dream, undefined, { startScene: scene });
      const state = runInputs(dream, start, Array.from({ length: ticks }, () => IDLE_INPUT));
      expect(state.sceneIndex).toBe(scene);
      layer.update(interpolateFrame(state, state, 0));
    };

    at(index(dream, 'apartment'));
    expect(handled).toEqual([]);
    at(index(dream, 'yard'));
    expect(handled.map((e) => e.type)).toEqual(['vacuum.turbine', 'vacuum.volume', 'sound.start']);
    handled.length = 0;
    at(index(dream, 'jam'), 600);
    expect(handled.some((e) => e.type === 'vacuum.turbine' && e.value > 0.4)).toBe(true);
    handled.length = 0;
    at(index(dream, 'awakening'));
    expect(handled).toContainEqual({ type: 'vacuum.turbine', value: 0 });
    handled.length = 0;
    at(index(dream, 'awakening'), 60 * 7);
    expect(handled).toEqual([{ type: 'sound.stop', sound: 'vacuum', fade: VACUUM_LAYER.fadeOut }]);
    layer.dispose();
  });
});
