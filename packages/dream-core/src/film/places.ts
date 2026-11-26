/**
 * Where the dream happens (#77, D-040): every dream keeps to a few of the
 * library's locations, so two dreams differ in their places and not only in
 * the order of the same frames. The profile leans the choice — a medical
 * dream is likelier to be in the hospital, a Soviet one in the yard — and
 * the seed decides the rest.
 */
import type { DreamProfile } from '../profile';
import type { Rng } from '../rng';
import { castFrames, profileWeight } from './cast';
import type { DreamLength } from './film';
import { LOCATION_TAGS, type LibraryAsset, type LocationTag } from './library';

export const DREAM_PLACES = {
  /** How many locations a dream keeps to, inclusive range. */
  count: { short: [4, 5], long: [5, 6] },
  /** Fewest frames its locations must have between them; more locations are taken until they do. */
  minFrames: { short: 14, long: 30 },
} as const satisfies {
  count: Record<DreamLength, readonly [number, number]>;
  minFrames: Record<DreamLength, number>;
};

/**
 * The locations of one dream, in `LOCATION_TAGS` order; `undefined` when the
 * library has no more locations than the dream would take (it keeps them all).
 * Draws the same number of times whatever the library.
 */
export function planPlaces(profile: DreamProfile, assets: readonly LibraryAsset[], length: DreamLength, rng: Rng): LocationTag[] | undefined {
  const [min, max] = DREAM_PLACES.count[length];
  const count = rng.int(min, max);
  const rolls = LOCATION_TAGS.map(() => rng.next());

  const frames = new Map<LocationTag, LibraryAsset[]>();
  for (const asset of castFrames(assets)) {
    const list = frames.get(asset.tags.location);
    if (list) list.push(asset);
    else frames.set(asset.tags.location, [asset]);
  }
  if (frames.size <= count) return undefined;

  // Weighted sampling without replacement (Efraimidis–Spirakis): the largest keys win.
  // A location pulls by how the profile leans to its frames and, gently, by how many it has.
  const ranked = LOCATION_TAGS.flatMap((location, i) => {
    const list = frames.get(location);
    if (!list) return [];
    const lean = list.reduce((sum, asset) => sum + profileWeight(asset, profile), 0) / list.length;
    const weight = lean * list.length ** 0.25;
    return [{ location, size: list.length, key: Math.log(1 - (rolls[i] as number)) / weight }];
  }).sort((a, b) => b.key - a.key);

  const chosen = new Set<LocationTag>();
  let size = 0;
  for (const { location, size: n } of ranked) {
    if (chosen.size >= count && size >= DREAM_PLACES.minFrames[length]) break;
    chosen.add(location);
    size += n;
  }
  return LOCATION_TAGS.filter((location) => chosen.has(location));
}
