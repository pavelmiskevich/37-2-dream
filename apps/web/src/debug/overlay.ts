import { debugLines, type DebugState } from './lines';

/**
 * Debug overlay (`?debug`): the hero's temperature and where the dream is.
 * The game itself has no HUD (pillar "не объяснять"); this is the only place
 * the number is shown, besides the thermometers inside scenes.
 *
 * Usage in the runtime:
 *
 *   const debug = debugFromQuery(location.search) ? createDebugOverlay() : null;
 *   // every frame:
 *   debug?.update(frame.state, session.dream.scenes[frame.sceneIndex]?.id);
 */
export interface DebugOverlay {
  readonly element: HTMLElement;
  /** Shows `state`; cheap to call every frame (the DOM changes only when the text does). */
  update(state: DebugState, sceneId?: string): void;
  dispose(): void;
}

export function createDebugOverlay(parent: HTMLElement = document.body): DebugOverlay {
  const element = document.createElement('pre');
  element.id = 'debug-overlay';
  Object.assign(element.style, {
    position: 'fixed',
    top: 'calc(var(--safe-top) + 8px)',
    right: 'calc(var(--safe-right) + 8px)',
    margin: '0',
    font: '12px/1.35 monospace',
    color: '#d8d8c8',
    background: 'rgba(0, 0, 0, 0.55)',
    padding: '3px 6px',
    pointerEvents: 'none',
    zIndex: '10',
  });
  parent.append(element);

  let text = '';
  return {
    element,
    update(state, sceneId) {
      const next = debugLines(state, sceneId).join('\n');
      if (next === text) return;
      text = next;
      element.textContent = next;
    },
    dispose() {
      element.remove();
    },
  };
}
