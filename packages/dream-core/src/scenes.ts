/**
 * What is left of the first slice's scene module after the game was removed
 * (D-022, D-029): the registry of intrusions and the plan of the awakening.
 * The dream film (film/) uses both.
 *
 * Content is described by ids, never by display text: the app maps ids to
 * words and sounds.
 */
import { pickFromCatalog, type Catalog } from './catalog';
import type { Rng } from './rng';

// ---------------------------------------------------------------------------
// Motifs: dream sounds and their real-world sources ("Реальность → сон", D-002, D-020)

/**
 * Every recurring sound motif a dream can contain: an intrusion of reality
 * into the dream. `lift_voice` is not played by the film yet; it is in the
 * registry because the table below is the contract.
 */
export type DreamMotif = 'vacuum' | 'swing_creak' | 'ventilator' | 'monitor' | 'lift_voice';

/** What a motif really was, revealed on awakening. */
export type RealSource = 'cleaning' | 'bed_creak' | 'snoring' | 'microwave' | 'tea_offer';

/**
 * Registry of intrusions (D-002, D-020): each dream motif and the everyday
 * sound of the real flat behind it.
 *
 *   vacuum       vacuum turning turbine  ← cleaning   cleaning in the next room
 *   swing_creak  the swing's creak       ← bed_creak  the bed as he turns over
 *   ventilator   "ф-ф-ф… шшш…"           ← snoring    his own snore
 *   monitor      "пип… пип…"             ← microwave  the microwave in the kitchen
 *   lift_voice   a voice from the lift   ← tea_offer  "Ты чай будешь?" from the kitchen
 *
 * Ids only; the app owns the words.
 */
export const MOTIF_SOURCES: Readonly<Record<DreamMotif, RealSource>> = {
  vacuum: 'cleaning',
  swing_creak: 'bed_creak',
  ventilator: 'snoring',
  monitor: 'microwave',
  lift_voice: 'tea_offer',
};

/** Every motif of the registry, in its order. */
export const DREAM_MOTIFS = Object.keys(MOTIF_SOURCES) as readonly DreamMotif[];

export interface MotifReveal {
  motif: DreamMotif;
  source: RealSource;
}

// ---------------------------------------------------------------------------
// Awakening

/**
 * Why the hero woke up. The generator plans how a dream that runs its course
 * ends: mostly `tea_brought`, now and then `unknown` (he just woke up —
 * "ПРИЧИНА: НЕИЗВЕСТНО", spec §35). `malingerer` (recovered: "ПРИЧИНА:
 * СИМУЛЯНТ") and `overheated` (the brain decided it had had enough) were the
 * early awakenings of the v1.2 temperature model; the film does not plan them
 * (D-023), the app still has their words. Ids only: texts live in the app.
 */
export type AwakeningReason = 'tea_brought' | 'unknown' | 'malingerer' | 'overheated';

/** Reasons the generator may plan for a dream that runs its course. */
export type PlannedAwakeningReason = Extract<AwakeningReason, 'tea_brought' | 'unknown'>;

/** Every awakening reason. */
export const AWAKENING_REASONS: readonly AwakeningReason[] = ['tea_brought', 'unknown', 'malingerer', 'overheated'];

export interface AwakeningParams {
  /** How the dream ends. */
  reason: PlannedAwakeningReason;
  /** Temperature measured on waking up, °C. */
  temperature: number;
  /** Motifs heard in this dream with their real sources, in order of first appearance. */
  reveals: MotifReveal[];
}

const AWAKENING_REASON_CATALOG: Catalog<PlannedAwakeningReason> = [
  { id: 'tea_brought', baseWeight: 7, rarity: 0, cooldownScenes: 0 },
  { id: 'unknown', baseWeight: 1, rarity: 0, cooldownScenes: 0 },
];

/**
 * The temperature is fixed by the vision (36,9: the fever has broken). The
 * reason is mostly the tea and rarely unknown (spec §35, D-020); the reveals
 * list the motifs planned for this dream. The single draw from `rng` is part
 * of the engine contract.
 */
export function generateAwakeningParams(heard: readonly DreamMotif[], rng: Rng): AwakeningParams {
  // The catalog has no cooldowns, so a result always exists.
  const reason = pickFromCatalog(AWAKENING_REASON_CATALOG, rng, { sceneIndex: 0 });
  if (reason === undefined) throw new Error('Catalog has no pickable items.');
  return {
    reason: reason.id,
    temperature: 36.9,
    reveals: heard.map((motif) => ({ motif, source: MOTIF_SOURCES[motif] })),
  };
}
