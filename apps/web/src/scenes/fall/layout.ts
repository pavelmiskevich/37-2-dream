import { streamKey, createSeededRng, type FallParams, type Rng, type SceneOf, type WillPaper } from '@dream/core';

/**
 * Where things are in the fall, decided once per scene. Pure: the layout
 * depends only on the scene, and draws from the view's own stream
 * `seed/scene/N/view`, never from the simulation (rendering must not change
 * the dream, D-005).
 *
 * The simulation falls the honest `height` in metres; the view stretches it
 * into a long visual drop, so a 25-metre fall still rushes past furniture.
 */

/** Furniture and household objects falling alongside the hero (spec §13). */
export const FALLING_KINDS = ['sofa', 'fridge', 'thermometer', 'vacuum', 'bed', 'toilet_paper'] as const;
export type FallingKind = (typeof FALLING_KINDS)[number];

export interface FallingSlot {
  kind: FallingKind;
  /** World height of the object's centre, metres (0 = start of the fall, negative = below). */
  y: number;
  /** Horizontal position. */
  x: number;
  z: number;
  /** Initial rotation and spin, radians and radians per second. */
  rotation: readonly [number, number, number];
  spin: readonly [number, number, number];
}

export interface PageSlot {
  /** Progress of the fall (0..1) when the page rises into view and when it is gone. */
  start: number;
  end: number;
  /** Direction from the fall axis, radians; 0 is straight ahead (−Z). */
  angle: number;
  /** Distance from the fall axis, metres. */
  distance: number;
  /** Phases of the flutter. */
  flutter: readonly [number, number, number];
}

export interface FallLayout {
  /** Visual depth of the whole fall, metres. */
  depth: number;
  objects: FallingSlot[];
  pages: PageSlot[];
}

/** Visual fall speed, metres per second, for the lowest and the highest fall. */
const VISUAL_SPEED = { low: 9, high: 18 } as const;
const HEIGHT_RANGE = { low: 25, high: 180 } as const;

/** Vertical gap between consecutive falling objects, metres. */
const OBJECT_GAP = { min: 5, max: 9 } as const;
/** Objects keep clear of the hero's drift circle. */
const OBJECT_RADIUS = { min: 4.5, max: 10 } as const;

/** Share of the fall the pages are spread over, and how long each one stays. */
const PAGES_FROM = 0.04;
const PAGES_SPAN = 0.88;
const PAGE_STAY = 1.7;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Visual depth for a fall: higher falls rush past faster. */
export function visualDepth(params: FallParams, duration: number): number {
  const t = clamp01((params.height - HEIGHT_RANGE.low) / (HEIGHT_RANGE.high - HEIGHT_RANGE.low));
  return duration * (VISUAL_SPEED.low + (VISUAL_SPEED.high - VISUAL_SPEED.low) * t);
}

/** Every kind once per round, in a shuffled order, so all of them show up. */
function kindSequence(rng: Rng, count: number): FallingKind[] {
  const kinds: FallingKind[] = [];
  while (kinds.length < count) {
    const round = [...FALLING_KINDS];
    for (let i = round.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [round[i], round[j]] = [round[j]!, round[i]!];
    }
    // Never the same kind twice in a row across rounds.
    if (kinds.length > 0 && round[0] === kinds[kinds.length - 1]) round.push(round.shift()!);
    kinds.push(...round);
  }
  return kinds.slice(0, count);
}

export function fallLayout(scene: SceneOf<'fall'>): FallLayout {
  const rng = createSeededRng(streamKey(scene.seed, 'view'));
  const depth = visualDepth(scene.params, scene.duration);

  // Objects from just below the start to below the jam surface.
  const heights: number[] = [];
  for (let y = -8; y > -depth - 10; y -= rng.range(OBJECT_GAP.min, OBJECT_GAP.max)) heights.push(y);
  const kinds = kindSequence(rng, heights.length);
  const objects = heights.map((y, i): FallingSlot => {
    // Mostly in front, where the hero starts looking; some all around.
    const angle = rng.chance(0.7) ? rng.range(-1.3, 1.3) : rng.range(0, 2 * Math.PI);
    const radius = rng.range(OBJECT_RADIUS.min, OBJECT_RADIUS.max);
    return {
      kind: kinds[i]!,
      y,
      x: Math.sin(angle) * radius,
      z: -Math.cos(angle) * radius,
      rotation: [rng.range(0, 2 * Math.PI), rng.range(0, 2 * Math.PI), rng.range(0, 2 * Math.PI)],
      spin: [rng.range(-0.8, 0.8), rng.range(-0.8, 0.8), rng.range(-0.8, 0.8)],
    };
  });

  const count = scene.params.willPages.length;
  const gap = PAGES_SPAN / Math.max(1, count);
  const pages = scene.params.willPages.map((_, i): PageSlot => {
    const start = PAGES_FROM + i * gap;
    // Mostly in front of the hero, alternating sides, so the next page is easy to find.
    const side = i % 2 === 0 ? 1 : -1;
    return {
      start,
      end: Math.min(1, start + gap * PAGE_STAY),
      angle: i === 0 ? rng.range(-0.15, 0.15) : side * rng.range(0.15, 0.75),
      distance: rng.range(1.25, 1.6),
      flutter: [rng.range(0, 2 * Math.PI), rng.range(0, 2 * Math.PI), rng.range(0, 2 * Math.PI)],
    };
  });

  return { depth, objects, pages };
}

/**
 * Height of a page relative to the hero's eyes while it is in view, `u` in
 * 0..1: it rises from below, lingers at eye level to be read, then leaves
 * upwards. A cubic is flat in the middle.
 */
export function pageRise(u: number): number {
  const c = 2 * clamp01(u) - 1;
  return 5 * c * c * c;
}

/**
 * Share of a page's text that has appeared, `u` in 0..1 of its stay: it
 * starts appearing as the page comes up and is complete before it leaves.
 */
export function pageReveal(u: number): number {
  return clamp01((u - 0.2) / 0.4);
}

/** Share of the page's stay passed at fall progress `progress`; outside 0..1 it is not shown. */
export function pageStay(slot: PageSlot, progress: number): number {
  return (progress - slot.start) / (slot.end - slot.start);
}

/** Size of a sheet, metres: [width, height]. */
export const PAPER_SIZE: Readonly<Record<WillPaper, readonly [number, number]>> = {
  document: [0.8, 1.13],
  napkin: [0.9, 0.9],
  receipt: [0.55, 1.25],
  toilet_paper: [0.5, 1.4],
};
