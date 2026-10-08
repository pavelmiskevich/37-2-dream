import type { LibraryAsset, LibraryManifest, Shot } from '@dream/core';
import { clamp } from './math';

/** Shots ahead of the current one whose assets are loaded in advance, so cuts are instant. */
export const PRELOAD_AHEAD = 3;
/** Shots behind the current one kept in memory (a cut may still be fading out of it). */
export const KEEP_BEHIND = 1;

/**
 * Asset ids to have loaded while shot `current` plays, most urgent first:
 * the current shot, then the next ones, then the one just left. Everything
 * else may be released.
 */
export function assetWindow(shots: readonly Shot[], current: number, ahead = PRELOAD_AHEAD, behind = KEEP_BEHIND): string[] {
  const ids: string[] = [];
  const add = (index: number) => {
    const shot = shots[index];
    if (shot && !ids.includes(shot.assetId)) ids.push(shot.assetId);
  };
  for (let i = current; i <= current + ahead; i++) add(i);
  for (let i = current - 1; i >= current - behind; i--) add(i);
  return ids;
}

/** Library files are addressed relative to its root (`library.json` lives there). */
export function assetUrl(root: string, file: string): string {
  return root.endsWith('/') ? root + file : `${root}/${file}`;
}

export function assetIndex(manifest: LibraryManifest): Map<string, LibraryAsset> {
  return new Map(manifest.assets.map((asset) => [asset.id, asset]));
}

/**
 * How a clip fills a shot: a clip shorter than the shot is slowed down (to no
 * less than half speed — a dream may crawl) and then looped.
 */
export function clipPlayback(shotDuration: number, clipDuration: number): { rate: number; loop: boolean } {
  if (!(clipDuration > 0) || !(shotDuration > 0)) return { rate: 1, loop: true };
  const rate = clamp(clipDuration / shotDuration, 0.5, 1);
  return { rate, loop: shotDuration * rate > clipDuration + 1e-6 };
}

/** Where in the clip the picture should be `local` seconds into the shot. */
export function clipTime(local: number, clipDuration: number, playback: { rate: number; loop: boolean }): number {
  const t = Math.max(0, local) * playback.rate;
  if (!(clipDuration > 0)) return t;
  return playback.loop ? t % clipDuration : Math.min(t, clipDuration);
}
