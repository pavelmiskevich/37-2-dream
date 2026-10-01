import type { StickView } from '../input';
import './ui.css';

/** Draws the virtual stick where the finger touched down; hidden without one. */
export interface StickOverlay {
  update(view: StickView | null): void;
  dispose(): void;
}

const KNOB_RATIO = 0.45;

export function createStickOverlay(root: HTMLElement = document.body): StickOverlay {
  const base = document.createElement('div');
  base.className = 'stick stick--base';
  const knob = document.createElement('div');
  knob.className = 'stick stick--knob';
  base.hidden = true;
  knob.hidden = true;
  root.append(base, knob);
  let last = '';

  const place = (element: HTMLElement, x: number, y: number, radius: number) => {
    element.style.width = element.style.height = `${radius * 2}px`;
    element.style.transform = `translate(${x - radius}px, ${y - radius}px)`;
  };

  return {
    update(view) {
      const key = view ? `${view.originX},${view.originY},${view.knobX},${view.knobY},${view.radius}` : '';
      if (key === last) return;
      last = key;
      base.hidden = knob.hidden = view === null;
      if (!view) return;
      place(base, view.originX, view.originY, view.radius);
      place(knob, view.knobX, view.knobY, view.radius * KNOB_RATIO);
    },
    dispose() {
      base.remove();
      knob.remove();
    },
  };
}
