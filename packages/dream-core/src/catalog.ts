/**
 * Element catalogs and weighted selection (spec §18.5).
 *
 * The effective weight of an item is
 *
 *   baseWeight × (1 − rarity) × bias(item)      — or 0 while on cooldown.
 *
 * Cooldown is counted in scenes of the same dream only: history of previous
 * dreams never reaches the generator (D-004).
 */
import type { Rng } from './rng';

export type CatalogId = string | number;

export interface CatalogItem<Id extends CatalogId = string> {
  readonly id: Id;
  /** Relative selection weight before rarity and bias; must be >= 0. */
  readonly baseWeight: number;
  /** 0..1: 0 is common; the effective weight is scaled by `1 − rarity`. */
  readonly rarity: number;
  /**
   * Number of following scenes in which the item cannot be picked again after
   * being used. 0 means no cooldown (it can repeat even within one scene).
   */
  readonly cooldownScenes: number;
}

export type Catalog<Id extends CatalogId = string> = readonly CatalogItem<Id>[];

export interface PickContext<Id extends CatalogId> {
  /** Index of the scene the pick happens in. */
  readonly sceneIndex: number;
  /** Scene index where each item was last used in this dream. */
  readonly lastUsed?: ReadonlyMap<Id, number>;
  /** Extra multiplier, usually derived from the dream profile; must be >= 0. */
  readonly bias?: (item: CatalogItem<Id>) => number;
}

/** True while `item` may not be picked in `sceneIndex`. */
export function isOnCooldown<Id extends CatalogId>(
  item: CatalogItem<Id>,
  sceneIndex: number,
  lastUsed?: ReadonlyMap<Id, number>,
): boolean {
  if (item.cooldownScenes <= 0) return false;
  const last = lastUsed?.get(item.id);
  return last !== undefined && sceneIndex - last <= item.cooldownScenes;
}

/** Effective weight of `item` in the given context (0 = cannot be picked). */
export function itemWeight<Id extends CatalogId>(item: CatalogItem<Id>, context: PickContext<Id>): number {
  if (isOnCooldown(item, context.sceneIndex, context.lastUsed)) return 0;
  const bias = context.bias ? context.bias(item) : 1;
  return item.baseWeight * (1 - item.rarity) * bias;
}

/**
 * Picks one item with probability proportional to `weightOf(item)`. Items with
 * weight 0 are never picked. Throws if the list is empty, a weight is negative
 * or not finite, or all weights are 0.
 */
export function weightedPick<T>(items: readonly T[], weightOf: (item: T) => number, rng: Rng): T {
  const weights = items.map((item, i) => {
    const weight = weightOf(item);
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError(`weightedPick: weight of item ${i} is ${weight}.`);
    }
    return weight;
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) throw new RangeError('weightedPick: nothing to pick (total weight is 0).');

  const target = rng.next() * total;
  let cumulative = 0;
  let lastPickable = -1;
  for (let i = 0; i < items.length; i++) {
    const weight = weights[i] as number;
    if (weight === 0) continue;
    cumulative += weight;
    lastPickable = i;
    if (target < cumulative) return items[i] as T;
  }
  // Only reachable through floating-point rounding of the cumulative sum.
  return items[lastPickable] as T;
}

/**
 * Picks up to `count` distinct items, each draw weighted like `weightedPick`
 * among the items not drawn yet. Stops early when nothing pickable is left.
 */
export function weightedSample<T>(
  items: readonly T[],
  count: number,
  weightOf: (item: T) => number,
  rng: Rng,
): T[] {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.some((item) => weightOf(item) > 0)) {
    const item = weightedPick(pool, weightOf, rng);
    picked.push(item);
    pool.splice(pool.indexOf(item), 1);
  }
  return picked;
}

/**
 * Picks one catalog item honouring rarity, bias and cooldown. Returns
 * `undefined` when every item has weight 0 (e.g. all are on cooldown).
 */
export function pickFromCatalog<Id extends CatalogId>(
  catalog: Catalog<Id>,
  rng: Rng,
  context: PickContext<Id>,
): CatalogItem<Id> | undefined {
  const weightOf = (item: CatalogItem<Id>): number => itemWeight(item, context);
  if (!catalog.some((item) => weightOf(item) > 0)) return undefined;
  return weightedPick(catalog, weightOf, rng);
}
