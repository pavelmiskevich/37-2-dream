import { describe, expect, it } from 'vitest';
import { areCompatible, DEFAULT_LAYER_VOLUMES, LAYERS, mixLayers, type LayerName } from './layers';

const mix = (active: LayerName[], master = 1) => mixLayers(DEFAULT_LAYER_VOLUMES, new Set(active), master);

describe('mixLayers', () => {
  it('passes volumes through when nothing conflicts', () => {
    expect(mix(['ambient', 'recurring'])).toEqual(DEFAULT_LAYER_VOLUMES);
  });

  it('scales every layer by the master volume', () => {
    const gains = mix([], 0.5);
    for (const layer of LAYERS) expect(gains[layer]).toBeCloseTo(DEFAULT_LAYER_VOLUMES[layer] * 0.5);
  });

  it('tension pushes ambient and location back', () => {
    const gains = mix(['ambient', 'location', 'tension']);
    expect(gains.ambient).toBeLessThan(DEFAULT_LAYER_VOLUMES.ambient);
    expect(gains.location).toBeLessThan(DEFAULT_LAYER_VOLUMES.location);
    expect(gains.tension).toBe(DEFAULT_LAYER_VOLUMES.tension);
  });

  it('a transition silences incompatible layers but keeps recurring motifs', () => {
    const gains = mix(['ambient', 'location', 'recurring', 'transition']);
    expect(gains.ambient).toBe(0);
    expect(gains.location).toBe(0);
    expect(gains.recurring).toBeGreaterThan(0);
    expect(gains.transition).toBe(DEFAULT_LAYER_VOLUMES.transition);
  });

  it('a layer never ducks itself', () => {
    expect(mix(['transition']).transition).toBe(DEFAULT_LAYER_VOLUMES.transition);
  });

  it('clamps bad volumes', () => {
    const gains = mixLayers({ ...DEFAULT_LAYER_VOLUMES, ambient: 5, location: -1 }, new Set(), 1);
    expect(gains.ambient).toBe(1);
    expect(gains.location).toBe(0);
  });
});

describe('areCompatible', () => {
  it('transition is incompatible with ambient and location', () => {
    expect(areCompatible('transition', 'ambient')).toBe(false);
    expect(areCompatible('location', 'transition')).toBe(false);
    expect(areCompatible('transition', 'recurring')).toBe(true);
    expect(areCompatible('ambient', 'recurring')).toBe(true);
  });
});
