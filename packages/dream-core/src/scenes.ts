/**
 * Scenes of the first vertical slice (vision.md, "Первый вертикальный срез").
 * The order is fixed for now; the seed only sets each scene's parameters.
 *
 * Content is described by ids, never by display text: the app maps ids to
 * words, sounds and geometry.
 */
import { pickFromCatalog, weightedSample, type Catalog, type CatalogId, type CatalogItem } from './catalog';
import { clamp01, lerp, round } from './math';
import type { DreamProfile } from './profile';
import type { Rng } from './rng';

// ---------------------------------------------------------------------------
// Scene ids

/** Scene ids, in slice order. Also used by the app as `?scene=<id>`. */
export const SCENE_IDS = ['apartment', 'yard', 'fall', 'jam', 'awakening'] as const;

export type SceneId = (typeof SCENE_IDS)[number];

/** Fixed scene order of the first slice. */
export const SLICE_SCENE_ORDER: readonly SceneId[] = SCENE_IDS;

export function isSceneId(value: string): value is SceneId {
  return (SCENE_IDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Motifs: dream sounds and their real-world sources (vision.md, "Реальность → сон")

/** Motifs that may leak into dream scenes as short "echoes". */
export type EchoMotif = 'ventilator' | 'monitor';

/** Every recurring sound motif the first slice can contain. */
export type DreamMotif = 'vacuum' | 'swing_creak' | EchoMotif;

/** What a motif really was, revealed on awakening. */
export type RealSource = 'cleaning' | 'bed_creak' | 'snoring' | 'microwave';

export const MOTIF_SOURCES: Readonly<Record<DreamMotif, RealSource>> = {
  vacuum: 'cleaning',
  swing_creak: 'bed_creak',
  ventilator: 'snoring',
  monitor: 'microwave',
};

/** A motif sounding once inside a scene. */
export interface Echo {
  motif: EchoMotif;
  /** Moment within the scene, as a fraction of its duration (0..1). */
  at: number;
}

export const ECHO_CATALOG: Catalog<EchoMotif> = [
  { id: 'ventilator', baseWeight: 1, rarity: 0.2, cooldownScenes: 1 },
  { id: 'monitor', baseWeight: 1, rarity: 0.2, cooldownScenes: 1 },
];

// ---------------------------------------------------------------------------
// Scene parameters

export type RoomLight = 'lamp' | 'tv_glow' | 'daylight';

export interface ApartmentParams {
  /** What the bedside thermometer shows, °C. */
  thermometer: number;
  roomLight: RoomLight;
  /** Seconds between "Передайте коту…" and falling asleep. */
  sleepDelay: number;
}

export type TimeOfDay = 'dawn' | 'noon' | 'dusk' | 'night';
export type BuildingFloors = 5 | 9 | 12 | 16;

export interface YardParams {
  timeOfDay: TimeOfDay;
  /** Height of the panel block around the yard. */
  buildingFloors: BuildingFloors;
  /** Floor of the hero's window, 1..buildingFloors. */
  homeFloor: number;
  /** 0..1 fog density. */
  fog: number;
  /** Pitch multiplier of the swing creak (1 = nominal). */
  swingCreakPitch: number;
  /** How many times the woman with the vacuum glides across the yard. */
  vacuumPasses: number;
}

/** Clauses of the will whose pages fly past during the fall. */
export type WillClause =
  | 'cat'
  | 'wifi_password'
  | 'tv_remote'
  | 'slippers'
  | 'balcony_jars'
  | 'garage_key'
  | 'soup_in_fridge'
  | 'neighbor_debt'
  | 'sofa_side'
  | 'phone_charger';

export interface FallParams {
  /** Nominal fall height, metres. */
  height: number;
  /** Camera tumble, 0 (straight down) .. 1 (spinning). */
  tumble: number;
  /** Will pages flying past, in order of appearance; no clause repeats. */
  willPages: WillClause[];
}

export type JamFlavor = 'raspberry' | 'cherry' | 'apricot' | 'blackcurrant';
/** Direction gravity switches to inside the jar ("down" would be no change). */
export type GravityDirection = 'up' | 'left' | 'right' | 'forward' | 'back';

export interface JamParams {
  flavor: JamFlavor;
  /** 0..1, how much the jam resists movement. */
  viscosity: number;
  /** Bubbles per second. */
  bubbleRate: number;
  gravity: GravityDirection;
  /** Moment of the gravity switch, as a fraction of the scene duration. */
  gravityFlipAt: number;
}

/**
 * Why the hero woke up. The generator always plans `tea_brought` (the dream
 * runs its course); the temperature model (temperature.ts) wakes him up early
 * with `malingerer` (recovered: "ПРИЧИНА: СИМУЛЯНТ") or `overheated` (the
 * brain decided it had had enough). Ids only: texts live in the app.
 */
export type AwakeningReason = 'tea_brought' | 'malingerer' | 'overheated';

export interface MotifReveal {
  motif: DreamMotif;
  source: RealSource;
}

export interface AwakeningParams {
  reason: AwakeningReason;
  /** Temperature measured on waking up, °C. */
  temperature: number;
  /** Motifs heard in this dream with their real sources, in order of first appearance. */
  reveals: MotifReveal[];
}

export interface SceneParamsMap {
  apartment: ApartmentParams;
  yard: YardParams;
  fall: FallParams;
  jam: JamParams;
  awakening: AwakeningParams;
}

export type SceneParams<Id extends SceneId = SceneId> = SceneParamsMap[Id];

// ---------------------------------------------------------------------------
// Scenes

export interface SceneOf<Id extends SceneId> {
  id: Id;
  /** Position in the dream, 0-based. */
  index: number;
  /** Scene seed (§18.2): the key of this scene's random stream. */
  seed: string;
  /** Nominal duration, seconds. */
  duration: number;
  /** 0..1 dramatic intensity. */
  intensity: number;
  /** Motifs leaking into the scene, sorted by `at`. */
  echoes: Echo[];
  params: SceneParamsMap[Id];
}

/** A scene of any kind; narrow it with `scene.id`. */
export type DreamScene = { [Id in SceneId]: SceneOf<Id> }[SceneId];

// ---------------------------------------------------------------------------
// Catalogs of variations

const ROOM_LIGHT_CATALOG: Catalog<RoomLight> = [
  { id: 'lamp', baseWeight: 1, rarity: 0, cooldownScenes: 0 },
  { id: 'tv_glow', baseWeight: 1, rarity: 0.3, cooldownScenes: 0 },
  { id: 'daylight', baseWeight: 1, rarity: 0.2, cooldownScenes: 0 },
];

const TIME_OF_DAY_CATALOG: Catalog<TimeOfDay> = [
  { id: 'dawn', baseWeight: 1, rarity: 0.3, cooldownScenes: 0 },
  { id: 'noon', baseWeight: 1, rarity: 0, cooldownScenes: 0 },
  { id: 'dusk', baseWeight: 1, rarity: 0, cooldownScenes: 0 },
  { id: 'night', baseWeight: 1, rarity: 0.3, cooldownScenes: 0 },
];

const BUILDING_FLOORS_CATALOG: Catalog<BuildingFloors> = [
  { id: 5, baseWeight: 1, rarity: 0, cooldownScenes: 0 },
  { id: 9, baseWeight: 1, rarity: 0, cooldownScenes: 0 },
  { id: 12, baseWeight: 1, rarity: 0.4, cooldownScenes: 0 },
  { id: 16, baseWeight: 1, rarity: 0.5, cooldownScenes: 0 },
];

const WILL_CATALOG: Catalog<WillClause> = [
  { id: 'cat', baseWeight: 3, rarity: 0, cooldownScenes: 0 },
  { id: 'wifi_password', baseWeight: 2, rarity: 0, cooldownScenes: 0 },
  { id: 'tv_remote', baseWeight: 2, rarity: 0, cooldownScenes: 0 },
  { id: 'slippers', baseWeight: 1, rarity: 0.2, cooldownScenes: 0 },
  { id: 'balcony_jars', baseWeight: 1, rarity: 0.3, cooldownScenes: 0 },
  { id: 'garage_key', baseWeight: 1, rarity: 0.3, cooldownScenes: 0 },
  { id: 'soup_in_fridge', baseWeight: 1, rarity: 0.4, cooldownScenes: 0 },
  { id: 'neighbor_debt', baseWeight: 1, rarity: 0.5, cooldownScenes: 0 },
  { id: 'sofa_side', baseWeight: 1, rarity: 0.5, cooldownScenes: 0 },
  { id: 'phone_charger', baseWeight: 1, rarity: 0.6, cooldownScenes: 0 },
];

/** Bounds of the number of will pages in the fall. */
export const WILL_PAGES = { min: 3, max: 9 } as const;

const JAM_FLAVOR_CATALOG: Catalog<JamFlavor> = [
  { id: 'raspberry', baseWeight: 1, rarity: 0, cooldownScenes: 0 },
  { id: 'cherry', baseWeight: 1, rarity: 0.1, cooldownScenes: 0 },
  { id: 'apricot', baseWeight: 1, rarity: 0.3, cooldownScenes: 0 },
  { id: 'blackcurrant', baseWeight: 1, rarity: 0.3, cooldownScenes: 0 },
];

const GRAVITY_CATALOG: Catalog<GravityDirection> = [
  { id: 'up', baseWeight: 2, rarity: 0, cooldownScenes: 0 },
  { id: 'left', baseWeight: 1, rarity: 0.2, cooldownScenes: 0 },
  { id: 'right', baseWeight: 1, rarity: 0.2, cooldownScenes: 0 },
  { id: 'forward', baseWeight: 1, rarity: 0.4, cooldownScenes: 0 },
  { id: 'back', baseWeight: 1, rarity: 0.4, cooldownScenes: 0 },
];

/** Picks from a catalog that has no cooldowns, so a result always exists. */
function pick<Id extends CatalogId>(
  catalog: Catalog<Id>,
  rng: Rng,
  bias?: (item: CatalogItem<Id>) => number,
): Id {
  const item = pickFromCatalog(catalog, rng, { sceneIndex: 0, bias });
  if (item === undefined) throw new Error('Catalog has no pickable items.');
  return item.id;
}

/** Bias towards items in `favoured` when `level` is high, away from them when low. */
function favour<Id extends CatalogId>(favoured: readonly Id[], level: number) {
  return (item: CatalogItem<Id>): number => (favoured.includes(item.id) ? 0.5 + level : 1.5 - level);
}

// ---------------------------------------------------------------------------
// Parameter generators. Each one reads only its own scene stream, and the
// order of draws inside it is part of the engine contract.

export function generateApartmentParams(profile: DreamProfile, rng: Rng): ApartmentParams {
  return {
    thermometer: profile.temperature,
    roomLight: pick(ROOM_LIGHT_CATALOG, rng, favour<RoomLight>(['tv_glow'], profile.domesticIntensity)),
    sleepDelay: round(rng.range(1.5, 4), 1),
  };
}

export function generateYardParams(profile: DreamProfile, rng: Rng): YardParams {
  const timeOfDay = pick(TIME_OF_DAY_CATALOG, rng, favour<TimeOfDay>(['dusk', 'night'], profile.anxiety));
  const buildingFloors = pick(BUILDING_FLOORS_CATALOG, rng, favour<BuildingFloors>([5, 9], profile.sovietIntensity));
  return {
    timeOfDay,
    buildingFloors,
    homeFloor: rng.int(1, buildingFloors),
    fog: round(clamp01(lerp(0.15, 0.85, profile.anxiety) + rng.range(-0.15, 0.15)), 2),
    swingCreakPitch: round(rng.range(0.8, 1.25), 2),
    // 1..3; a domestic dream lets her come back more often.
    vacuumPasses: 1 + Math.min(2, Math.floor(rng.next() * (1 + 2 * profile.domesticIntensity))),
  };
}

export function generateFallParams(profile: DreamProfile, rng: Rng): FallParams {
  const height = round(lerp(25, 180, clamp01(profile.physicsInstability * 0.7 + rng.next() * 0.3)), 0);
  const tumble = round(clamp01(profile.physicsInstability * 0.6 + rng.next() * 0.4), 2);
  const span = WILL_PAGES.max - WILL_PAGES.min;
  const pageCount =
    WILL_PAGES.min + Math.min(span, Math.floor((profile.domesticIntensity * 0.6 + rng.next() * 0.4) * (span + 1)));
  // Absurd dreams reach deeper into the rare clauses.
  const willPages = weightedSample(
    WILL_CATALOG,
    pageCount,
    (item) => item.baseWeight * (1 - item.rarity) * (item.rarity > 0 ? 0.5 + profile.absurdity : 1),
    rng,
  ).map((item) => item.id);
  return { height, tumble, willPages };
}

export function generateJamParams(profile: DreamProfile, rng: Rng): JamParams {
  return {
    flavor: pick(JAM_FLAVOR_CATALOG, rng),
    viscosity: round(lerp(0.4, 0.95, clamp01(profile.physicsInstability * 0.5 + rng.next() * 0.5)), 2),
    bubbleRate: round(lerp(0.5, 4, clamp01(profile.absurdity * 0.5 + rng.next() * 0.5)), 2),
    gravity: pick(GRAVITY_CATALOG, rng, favour<GravityDirection>(['up'], 1 - profile.physicsInstability)),
    gravityFlipAt: round(rng.range(0.2, 0.6), 2),
  };
}

/** Awakening reason and temperature are fixed by the vision; only the reveals vary. */
export function generateAwakeningParams(heard: readonly DreamMotif[]): AwakeningParams {
  return {
    reason: 'tea_brought',
    temperature: 36.9,
    reveals: heard.map((motif) => ({ motif, source: MOTIF_SOURCES[motif] })),
  };
}

/** Scenes in which echoes of reality may sound. */
export const ECHO_SCENES: readonly SceneId[] = ['yard', 'fall', 'jam'];

/**
 * Draws up to two echoes for a scene. `medicalIntensity` sets how often they
 * appear; `lastUsed` carries cooldowns between scenes of the same dream and is
 * updated in place.
 */
export function generateEchoes(
  profile: DreamProfile,
  sceneIndex: number,
  lastUsed: Map<EchoMotif, number>,
  rng: Rng,
): Echo[] {
  const echoes: Echo[] = [];
  const chance = lerp(0.2, 0.85, profile.medicalIntensity);
  for (let slot = 0; slot < 2; slot++) {
    if (!rng.chance(chance)) continue;
    const item = pickFromCatalog(ECHO_CATALOG, rng, { sceneIndex, lastUsed });
    if (item === undefined) continue;
    lastUsed.set(item.id, sceneIndex);
    echoes.push({ motif: item.id, at: round(rng.range(0.15, 0.85), 2) });
  }
  return echoes.sort((a, b) => a.at - b.at);
}
