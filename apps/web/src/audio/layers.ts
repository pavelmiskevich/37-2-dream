import { clamp01 } from './math';

/** Audio layers from the spec (§21), bottom to top. */
export const LAYERS = ['ambient', 'location', 'recurring', 'tension', 'transition'] as const;
export type LayerName = (typeof LAYERS)[number];

export type LayerVolumes = Record<LayerName, number>;
export type LayerGains = Record<LayerName, number>;

export const DEFAULT_LAYER_VOLUMES: Readonly<LayerVolumes> = {
  ambient: 0.6,
  location: 0.8,
  recurring: 0.9,
  tension: 1,
  transition: 1,
};

/**
 * Compatibility rules: while the layer on the left is active (has a playing
 * sound), the layers on the right are multiplied by the factor. 0 means
 * incompatible: that layer is silenced. Missing pairs are compatible (1).
 *
 * - Tension pushes the room tone and the location back.
 * - A transition replaces the location, so ambient and location go silent;
 *   recurring motifs survive transitions (the vacuum keeps going "behind the
 *   wall" through the whole dream) but step back.
 */
export const LAYER_RULES: Readonly<Record<LayerName, Partial<Record<LayerName, number>>>> = {
  ambient: {},
  location: {},
  recurring: {},
  tension: { ambient: 0.4, location: 0.6 },
  transition: { ambient: 0, location: 0, recurring: 0.7, tension: 0.5 },
};

export function areCompatible(
  a: LayerName,
  b: LayerName,
  rules: Readonly<Record<LayerName, Partial<Record<LayerName, number>>>> = LAYER_RULES,
): boolean {
  return rules[a][b] !== 0 && rules[b][a] !== 0;
}

/**
 * Effective gain of every layer: its volume, ducked by every other active
 * layer per the rules, times the master volume. Inactive layers keep their
 * gain, so a sound that starts in them fades in at the right level.
 */
export function mixLayers(
  volumes: Readonly<LayerVolumes>,
  active: ReadonlySet<LayerName>,
  master: number,
  rules: Readonly<Record<LayerName, Partial<Record<LayerName, number>>>> = LAYER_RULES,
): LayerGains {
  const gains = {} as LayerGains;
  for (const layer of LAYERS) {
    let gain = clamp01(volumes[layer]) * clamp01(master);
    for (const other of active) {
      if (other !== layer) gain *= rules[other][layer] ?? 1;
    }
    gains[layer] = gain;
  }
  return gains;
}
