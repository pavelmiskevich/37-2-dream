/**
 * Casting the film (D-023): which library asset each shot shows.
 *
 * The weight of an asset for a shot is
 *
 *   mood(role) × people(role) × leaning(profile) × compatibility(previous shot)
 *     × same light × clip bonus × 0.7^uses        — or 0 while on cooldown.
 *
 * - `mood` and `people` follow the beat: calm frames open and let go, dread
 *   frames build and peak, empty frames wait. `scare` frames are cast only
 *   as scares and nothing else is.
 * - `leaning` is the dream profile (spec §4): medical dreams lean to hospital
 *   corridors and monitors, Soviet dreams to yards and stairwells, and so on.
 * - `compatibility` is the matrix of spec §19 between the previous shot and
 *   this one; `absurdity` flattens it, so absurd dreams jump more freely.
 * - Cooldown (spec §18.5) goes through the catalog: an asset is not reused
 *   for a number of shots that grows with the library.
 *
 * The edit stays in a location for a few shots, then jumps; a location left
 * recently is avoided, so every film wanders the library differently.
 */
import { pickFromCatalog, weightedPick, type CatalogItem } from '../catalog';
import { clamp, lerp } from '../math';
import type { DreamProfile, ProfileIntensityKey } from '../profile';
import type { Rng } from '../rng';
import type { BeatRole } from './beats';
import type { LibraryAsset, LocationTag, MoodTag, MotifTag, PeopleTag } from './library';

type Leaning = 'medical' | 'soviet' | 'domestic' | 'physics' | 'absurd';

const LEANING_KEY: Readonly<Record<Leaning, ProfileIntensityKey>> = {
  medical: 'medicalIntensity',
  soviet: 'sovietIntensity',
  domestic: 'domesticIntensity',
  physics: 'physicsInstability',
  absurd: 'absurdity',
};

type Leanings = Readonly<Partial<Record<Leaning, number>>>;

/** Which sides of the profile pull a location into the dream (spec §4). */
export const LOCATION_LEANINGS: Readonly<Record<LocationTag, Leanings>> = {
  yard: { soviet: 1 },
  stairwell: { soviet: 1 },
  stairs: { soviet: 0.5, physics: 1 },
  hospital_corridor: { medical: 1 },
  thermometer_corridor: { medical: 1, absurd: 0.5 },
  jam_jar: { domestic: 0.5, absurd: 1, physics: 0.5 },
  bedroom: { domestic: 1, medical: 0.3 },
  kitchen: { domestic: 1 },
  elevator: { soviet: 0.6, physics: 0.6 },
};

/** Which sides of the profile pull a motif into the dream. */
export const MOTIF_LEANINGS: Readonly<Record<MotifTag, Leanings>> = {
  swing: { soviet: 1 },
  vacuum_woman: { domestic: 1, soviet: 0.4 },
  ventilator: { medical: 1 },
  monitor: { medical: 1 },
  thermometer: { medical: 1 },
  pigeons: { soviet: 0.7, absurd: 0.3 },
  will_papers: { domestic: 1, absurd: 0.4 },
};

/** `+`, `++`, `+++` of the compatibility matrix (spec §19). */
const PLUS = 1.3;
const PLUS2 = 1.7;
const PLUS3 = 2.2;

type Tag = LocationTag | MotifTag;

/**
 * Compatibility of neighbouring shots (spec §19), symmetric. The first rows
 * are the matrix itself in library tags; the rest extend it to the tags the
 * library has.
 */
export const COMPATIBILITY: readonly (readonly [Tag, Tag, number])[] = [
  // Spec §19.
  ['yard', 'swing', PLUS3],
  ['yard', 'vacuum_woman', PLUS2],
  ['hospital_corridor', 'ventilator', PLUS3],
  ['hospital_corridor', 'yard', PLUS2],
  ['swing', 'jam_jar', PLUS],
  // Extension.
  ['hospital_corridor', 'monitor', PLUS3],
  ['hospital_corridor', 'thermometer_corridor', PLUS2],
  ['thermometer_corridor', 'thermometer', PLUS3],
  ['stairwell', 'stairs', PLUS3],
  ['stairwell', 'elevator', PLUS2],
  ['stairwell', 'vacuum_woman', PLUS],
  ['stairs', 'elevator', PLUS],
  ['yard', 'pigeons', PLUS2],
  ['yard', 'stairwell', PLUS2],
  ['bedroom', 'ventilator', PLUS2],
  ['bedroom', 'monitor', PLUS2],
  ['bedroom', 'thermometer', PLUS2],
  ['bedroom', 'will_papers', PLUS2],
  ['kitchen', 'jam_jar', PLUS2],
  ['kitchen', 'vacuum_woman', PLUS],
];

const MOOD_WEIGHTS: Readonly<Record<BeatRole, Readonly<Record<Exclude<MoodTag, 'scare'>, number>>>> = {
  opening: { calm: 3, uneasy: 2, dread: 0.5 },
  build: { calm: 0.8, uneasy: 3, dread: 1.5 },
  anticipation: { calm: 0.5, uneasy: 2, dread: 2.5 },
  false_alarm: { calm: 1, uneasy: 2, dread: 1 },
  release: { calm: 4, uneasy: 1, dread: 0.2 },
  scare: { calm: 0, uneasy: 0, dread: 0 },
  recovery: { calm: 2, uneasy: 2, dread: 0.7 },
  climax: { calm: 0.3, uneasy: 1.5, dread: 3 },
};

const PEOPLE_WEIGHTS: Readonly<Record<BeatRole, Readonly<Record<PeopleTag, number>>>> = {
  opening: { none: 1.5, distant: 1, face: 0.4 },
  build: { none: 1, distant: 1.3, face: 0.8 },
  // Waiting is best in an empty space.
  anticipation: { none: 2, distant: 1.2, face: 0.3 },
  // The misdirection is something harmless that moves: a distant figure, a pigeon.
  false_alarm: { none: 1, distant: 1.8, face: 0.5 },
  release: { none: 1.5, distant: 1, face: 0.3 },
  scare: { none: 1, distant: 1, face: 1.5 },
  recovery: { none: 1.5, distant: 1, face: 0.5 },
  climax: { none: 0.8, distant: 1.2, face: 1.6 },
};

/** Weight of a set of leanings for a profile: from ×0.25 (absent) to ×3 (strong). */
function leaningWeight(leanings: Leanings, profile: DreamProfile): number {
  let weight = 1;
  for (const [leaning, power] of Object.entries(leanings) as [Leaning, number][]) {
    weight *= lerp(0.25, 3, profile[LEANING_KEY[leaning]]) ** power;
  }
  return weight;
}

/** How strongly the profile pulls `asset` into the dream. */
export function profileWeight(asset: LibraryAsset, profile: DreamProfile): number {
  let weight = leaningWeight(LOCATION_LEANINGS[asset.tags.location], profile);
  for (const motif of asset.tags.motifs) weight *= leaningWeight(MOTIF_LEANINGS[motif], profile) ** 0.6;
  return weight;
}

function tagsOf(asset: LibraryAsset): Tag[] {
  return [asset.tags.location, ...asset.tags.motifs];
}

/** Compatibility of `next` following `prev` (spec §19), flattened by absurdity. */
export function compatibility(prev: LibraryAsset | undefined, next: LibraryAsset, absurdity: number): number {
  if (!prev) return 1;
  const a = tagsOf(prev);
  const b = tagsOf(next);
  let factor = 1;
  for (const [x, y, plus] of COMPATIBILITY) {
    if ((a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x))) factor *= plus;
  }
  return factor ** (1 - 0.7 * absurdity);
}

/** Shots an asset rests after being used: longer for a bigger library. */
export function assetCooldown(poolSize: number): number {
  return clamp(Math.floor(poolSize * 0.4), 1, 12);
}

/** Locations recently left are avoided for this many location changes. */
export const LOCATION_COOLDOWN = 2;
/** Longest stay in one location, shots. */
export const MAX_LOCATION_RUN = 3;

export interface CastRequest {
  shotIndex: number;
  role: BeatRole;
  /** Shot length, ms: a clip shorter than the shot is not cast. */
  ms: number;
}

/** Stateful caster of one film. Every pick draws from `rng` in a fixed order. */
export interface Caster {
  pick(request: CastRequest): LibraryAsset;
}

export function createCaster(assets: readonly LibraryAsset[], profile: DreamProfile, rng: Rng): Caster {
  const frames = assets.filter((asset) => asset.tags.mood !== 'scare');
  const scares = assets.filter((asset) => asset.tags.mood === 'scare');
  if (frames.length === 0) throw new RangeError('generateFilm: the library has no frames besides scares.');

  const frameCooldown = assetCooldown(frames.length);
  const scareCooldown = Math.max(0, scares.length - 1);
  const items = new Map<LibraryAsset, CatalogItem>();
  for (const asset of frames) items.set(asset, { id: asset.id, baseWeight: 1, rarity: 0, cooldownScenes: frameCooldown });
  for (const asset of scares) items.set(asset, { id: asset.id, baseWeight: 1, rarity: 0, cooldownScenes: scareCooldown });
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  if (byId.size !== assets.length) throw new RangeError('generateFilm: asset ids in the library are not unique.');

  // What depends only on the film, the role or the pair of assets is computed once.
  const fixedWeight = new Map<BeatRole, Map<LibraryAsset, number>>();
  const fixed = (asset: LibraryAsset, role: BeatRole): number => {
    let row = fixedWeight.get(role);
    if (!row) fixedWeight.set(role, (row = new Map()));
    let w = row.get(asset);
    if (w === undefined) {
      const { mood, people, motifs } = asset.tags;
      w = (mood === 'scare' ? 1 : MOOD_WEIGHTS[role][mood]) * PEOPLE_WEIGHTS[role][people] * profileWeight(asset, profile);
      if (role === 'false_alarm' && motifs.includes('pigeons')) w *= 4;
      if (asset.kind === 'clip' && (role === 'build' || role === 'anticipation' || role === 'climax')) w *= 1.5;
      row.set(asset, w);
    }
    return w;
  };
  const compatCache = new Map<LibraryAsset, Map<LibraryAsset, number>>();
  const compatible = (asset: LibraryAsset): number => {
    if (!prev) return 1;
    let row = compatCache.get(prev);
    if (!row) compatCache.set(prev, (row = new Map()));
    let factor = row.get(asset);
    if (factor === undefined) row.set(asset, (factor = compatibility(prev, asset, profile.absurdity)));
    return factor;
  };

  const lastUsed = new Map<string, number>();
  const uses = new Map<string, number>();
  let prev: LibraryAsset | undefined;
  let run = 0;
  const recentLocations: LocationTag[] = [];

  const fits = (asset: LibraryAsset, ms: number): boolean =>
    asset.kind !== 'clip' || asset.duration === undefined || asset.duration * 1000 >= ms;

  const weight = (asset: LibraryAsset, role: BeatRole): number => {
    let w = fixed(asset, role) * compatible(asset);
    if (prev && prev.tags.time === asset.tags.time) w *= 1.3;
    if (asset.tags.location !== prev?.tags.location && recentLocations.includes(asset.tags.location)) w *= 0.15;
    const used = uses.get(asset.id);
    return used === undefined ? w : w * 0.7 ** used;
  };

  /** Picks from `pool` honouring cooldown; `undefined` when everything there is resting. */
  const choose = (pool: readonly LibraryAsset[], shotIndex: number, role: BeatRole): LibraryAsset | undefined => {
    if (pool.length === 0) return undefined;
    const catalog = pool.map((asset) => items.get(asset) as CatalogItem);
    const bias = (item: CatalogItem): number => weight(byId.get(item.id) as LibraryAsset, role);
    const picked = pickFromCatalog(catalog, rng, { sceneIndex: shotIndex, lastUsed, bias });
    return picked && byId.get(picked.id);
  };

  /** Last resort for a tiny library: anything but the previous shot's asset. */
  const relaxed = (pool: readonly LibraryAsset[], role: BeatRole): LibraryAsset => {
    const others = pool.filter((asset) => asset.id !== prev?.id);
    return weightedPick(others.length > 0 ? others : pool, (asset) => weight(asset, role) || 1e-6, rng);
  };

  const remember = (asset: LibraryAsset, shotIndex: number): void => {
    lastUsed.set(asset.id, shotIndex);
    uses.set(asset.id, (uses.get(asset.id) ?? 0) + 1);
  };

  return {
    pick({ shotIndex, role, ms }) {
      if (role === 'scare' && scares.length > 0) {
        // A scare is an insert: it does not move the edit to another location.
        const asset = choose(scares, shotIndex, role) ?? relaxed(scares, role);
        remember(asset, shotIndex);
        return asset;
      }

      let pool = frames.filter((asset) => fits(asset, ms));
      if (pool.length === 0) pool = frames;
      const here = prev ? pool.filter((asset) => asset.tags.location === prev?.tags.location) : [];
      const elsewhere = prev ? pool.filter((asset) => asset.tags.location !== prev?.tags.location) : pool;
      const stayChance = run < MAX_LOCATION_RUN ? lerp(0.5, 0.2, profile.absurdity) : 0;
      const stay = rng.chance(stayChance);

      const asset =
        (stay ? choose(here, shotIndex, role) : undefined) ??
        choose(elsewhere, shotIndex, role) ??
        choose(pool, shotIndex, role) ??
        relaxed(pool, role);

      if (prev && asset.tags.location === prev.tags.location) {
        run += 1;
      } else {
        if (prev) {
          recentLocations.push(prev.tags.location);
          if (recentLocations.length > LOCATION_COOLDOWN) recentLocations.shift();
        }
        run = 1;
      }
      prev = asset;
      remember(asset, shotIndex);
      return asset;
    },
  };
}
