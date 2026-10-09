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

// Registry of intrusions and the planned awakening (D-020).
export {
  AWAKENING_REASONS,
  DREAM_MOTIFS,
  MOTIF_SOURCES,
  type AwakeningParams,
  type AwakeningReason,
  type DreamMotif,
  type MotifReveal,
  type PlannedAwakeningReason,
  type RealSource,
} from './scenes';

export {
  MIN_PROFILE_DISTANCE,
  RECENT_DREAMS,
  chooseFreshSeed,
  profileDistance,
  profileOfSeed,
  type FreshSeedOptions,
} from './fresh-seed';

// Dream film (D-022): library manifest and edit decision list contract.
export * from './film';
