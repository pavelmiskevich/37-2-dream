/**
 * Public API of the deterministic dream core. Everything here is pure and free
 * of DOM, storage and clock access (D-004, D-005).
 */
export { ENGINE_VERSION } from './version';

export { SEED_ENTROPY_BYTES, isDreamSeed, normalizeSeed, parseSeed, seedFromEntropy, type DreamSeed } from './seed';

export { createSeededRng, hashString, rngFromState, type Rng, type RngState } from './rng';

export {
  eventRng,
  eventSeed,
  profileRng,
  profileSeed,
  sceneRng,
  sceneSeed,
  streamKey,
  type StreamSegment,
} from './streams';

export {
  DREAM_LENGTH_MINUTES,
  DREAM_TEMPERATURE,
  PROFILE_INTENSITY_KEYS,
  generateProfile,
  type DreamProfile,
  type ProfileIntensityKey,
} from './profile';

export {
  isOnCooldown,
  itemWeight,
  pickFromCatalog,
  weightedPick,
  weightedSample,
  type Catalog,
  type CatalogId,
  type CatalogItem,
  type PickContext,
} from './catalog';

export {
  ECHO_CATALOG,
  ECHO_SCENES,
  MOTIF_SOURCES,
  SCENE_IDS,
  SLICE_SCENE_ORDER,
  WILL_PAGES,
  isSceneId,
  type ApartmentParams,
  type AwakeningParams,
  type AwakeningReason,
  type BuildingFloors,
  type DreamMotif,
  type DreamScene,
  type Echo,
  type EchoMotif,
  type FallParams,
  type GravityDirection,
  type JamFlavor,
  type JamParams,
  type MotifReveal,
  type RealSource,
  type RoomLight,
  type SceneId,
  type SceneOf,
  type SceneParams,
  type SceneParamsMap,
  type TimeOfDay,
  type WillClause,
  type YardParams,
} from './scenes';

export { findScene, generateDream, timelineSeed, type Dream, type DreamTransition, type TransitionKind } from './dream';
