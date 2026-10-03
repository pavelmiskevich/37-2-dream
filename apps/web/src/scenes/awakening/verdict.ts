import './awakening.css';

/**
 * The verdict over the canvas: the reason of the awakening and the
 * temperature, as dry as a form. HTML, so that it stays sharp at any PS1
 * resolution. Below the pause screen (z-index 10), above the subtitle.
 */
export interface VerdictCard {
  readonly element: HTMLElement;
  /** Cheap to call every frame: the DOM changes only when something does. */
  show(lines: readonly string[], opacity: number): void;
  dispose(): void;
}

export function createVerdictCard(parent: HTMLElement = document.body): VerdictCard {
  const element = document.createElement('div');
  element.className = 'verdict';
  element.setAttribute('role', 'status');
  element.hidden = true;
  parent.append(element);

  let text = '';
  let shown = -1;
  return {
    element,
    show(lines, opacity) {
      const visible = lines.length > 0 && opacity > 0;
      element.hidden = !visible;
      if (!visible) return;
      const joined = lines.join('\n');
      if (joined !== text) {
        text = joined;
        element.replaceChildren(
          ...lines.map((line) => {
            const p = document.createElement('p');
            p.className = 'verdict__line';
            p.textContent = line;
            return p;
          }),
        );
      }
      const rounded = Math.round(opacity * 50) / 50;
      if (rounded !== shown) {
        shown = rounded;
        element.style.opacity = String(rounded);
      }
    },
    dispose() {
      element.remove();
    },
  };
}
