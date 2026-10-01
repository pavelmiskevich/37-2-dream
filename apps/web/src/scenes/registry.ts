import type { SceneId } from '@dream/core';
import type { SceneViewFactory } from './types';

type SceneViewLoaders = { readonly [Id in SceneId]?: () => Promise<SceneViewFactory<Id>> };

/**
 * Lazy loaders of scene views by scene id. Each scene task adds one line,
 * e.g. `fall: () => import('./fall').then((m) => m.createFallView)`.
 * A scene without a view is drawn by the runtime's placeholder.
 */
export const SCENE_VIEWS: SceneViewLoaders = {
  fall: () => import('./fall').then((m) => m.createFallView),
};
