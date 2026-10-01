import { isSceneId, type DreamSeed, type SceneId } from '@dream/core';

/**
 * Playtest entry `?scene=<id>` (e.g. `?seed=DREAM-8F72-A19C-37B2&scene=yard`):
 * the scene to start the dream in, or null for a normal dream from the first
 * scene. Unknown ids are ignored.
 */
export function sceneFromQuery(search: string): SceneId | null {
  const id = new URLSearchParams(search).get('scene')?.trim().toLowerCase() ?? '';
  return isSceneId(id) ? id : null;
}

/**
 * The query string with `seed` set to the dream being played, other
 * parameters kept, so the address always names the dream and reloading or
 * sharing it opens the same one.
 */
export function queryWithSeed(search: string, seed: DreamSeed): string {
  const params = new URLSearchParams(search);
  params.set('seed', seed);
  return `?${params.toString()}`;
}
