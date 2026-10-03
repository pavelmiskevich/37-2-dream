import { fallenFraction, sceneRng, yardLayout, type Dream, type DreamScene } from '@dream/core';
import { smoothstep } from '../audio/math';
import { fallLayout } from '../scenes/fall/layout';
import { dressYard, type YardDressing } from '../scenes/yard/dressing';

/**
 * Moments when a scene shows the source of the vacuum (vision, "Реальность →
 * сон"): the woman with the vacuum cleaner gliding across the yard, a vacuum
 * cleaner falling past in the fall. While it is in sight, the vacuum layer
 * comes closer. The scenes already draw these; here the same plans are read
 * again from the same pure functions and streams, so sound and picture agree
 * without the views knowing about the layer.
 */

/** 0..1: how much the source is in sight at scene time `sceneTime`, seconds. */
export type VacuumSighting = (sceneTime: number) => number;

/**
 * Channel of the yard view's stream (`YARD_VIEW_CHANNEL` of the yard view;
 * not imported from there, which would pull the whole view into this chunk).
 */
export const YARD_VIEW_STREAM = 'view';

/** How far around a falling vacuum cleaner it is heard closer, metres of visual depth. */
const FALL_REACH = 8;

/** The woman is in sight from shortly before she enters the yard until shortly after she leaves. */
export function womanSighting(woman: YardDressing['woman']): VacuumSighting {
  return (time) => {
    let sighting = 0;
    for (const pass of woman.passes) {
      const u = (time - pass.start) / pass.duration;
      sighting = Math.max(sighting, smoothstep(-0.1, 0.15, u) * (1 - smoothstep(0.85, 1.1, u)));
    }
    return sighting;
  };
}

/** Sighting function of `scene`, or null if the scene never shows the source. */
export function vacuumSighting(dream: Dream, scene: DreamScene): VacuumSighting | null {
  switch (scene.id) {
    case 'yard': {
      const layout = yardLayout(dream.seed, scene.index);
      const dressing = dressYard(layout, scene.params, sceneRng(dream.seed, scene.index, YARD_VIEW_STREAM));
      return womanSighting(dressing.woman);
    }
    case 'fall': {
      const layout = fallLayout(scene);
      const heights = layout.objects.filter((slot) => slot.kind === 'vacuum').map((slot) => slot.y);
      if (heights.length === 0) return null;
      return (time) => {
        // Where the fall view puts the camera at this moment.
        const cameraY = -fallenFraction(Math.min(1, time / scene.duration)) * layout.depth;
        let sighting = 0;
        for (const y of heights) {
          const d = (y - cameraY) / FALL_REACH;
          sighting = Math.max(sighting, Math.exp(-d * d));
        }
        return sighting;
      };
    }
    default:
      return null;
  }
}
