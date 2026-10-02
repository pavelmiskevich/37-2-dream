import type { Subtitle } from './lines';
import './subtitle.css';

/**
 * Subtitle line over the canvas: HTML, not a texture, so that it stays sharp
 * at any PS1 resolution. Below the pause screen (z-index 10).
 */
export interface SubtitleLine {
  readonly element: HTMLElement;
  /** Cheap to call every frame: the DOM changes only when the line does. */
  show(subtitle: Subtitle): void;
  dispose(): void;
}

export function createSubtitleLine(parent: HTMLElement = document.body): SubtitleLine {
  const element = document.createElement('p');
  element.className = 'subtitle';
  element.setAttribute('role', 'status');
  element.hidden = true;
  parent.append(element);

  let text = '';
  let opacity = -1;
  return {
    element,
    show(subtitle) {
      const visible = subtitle.text !== '' && subtitle.opacity > 0;
      element.hidden = !visible;
      if (!visible) return;
      if (subtitle.text !== text) {
        text = subtitle.text;
        element.textContent = text;
      }
      // Steps of 1/50 are smooth enough and spare the style recalculation.
      const rounded = Math.round(subtitle.opacity * 50) / 50;
      if (rounded !== opacity) {
        opacity = rounded;
        element.style.opacity = String(rounded);
      }
    },
    dispose() {
      element.remove();
    },
  };
}
