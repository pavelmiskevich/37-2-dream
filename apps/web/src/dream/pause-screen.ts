import { PAUSE_EXIT, PAUSE_RESUME, PAUSE_TITLE } from './lines';
import './dream.css';

/**
 * The pause over a stopped dream (D-027): Esc, or the page going to the
 * background. It is not a control of the dream — it only holds it or leaves
 * it: go on, or wake up (back to the falling-asleep screen).
 */
export interface PauseScreenOptions {
  onResume: () => void;
  onExit: () => void;
}

export interface PauseScreen {
  readonly element: HTMLElement;
  readonly visible: boolean;
  show(): void;
  hide(): void;
  dispose(): void;
}

export function createPauseScreen({ onResume, onExit }: PauseScreenOptions, root: HTMLElement = document.body): PauseScreen {
  const element = document.createElement('div');
  element.className = 'pause';
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  element.setAttribute('aria-label', PAUSE_TITLE);
  element.hidden = true;

  const title = document.createElement('p');
  title.className = 'pause__title';
  title.textContent = PAUSE_TITLE;

  const button = (text: string, className: string, onClick: () => void): HTMLButtonElement => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = className;
    node.textContent = text;
    node.addEventListener('click', onClick);
    return node;
  };
  const resume = button(PAUSE_RESUME, 'pause__button pause__button--primary', onResume);
  const exit = button(PAUSE_EXIT, 'pause__button', onExit);
  const actions = document.createElement('div');
  actions.className = 'pause__actions';
  actions.append(resume, exit);

  element.append(title, actions);
  root.append(element);

  return {
    element,
    get visible() {
      return !element.hidden;
    },
    show() {
      element.hidden = false;
      resume.focus({ preventScroll: true });
    },
    hide() {
      element.hidden = true;
    },
    dispose() {
      element.remove();
    },
  };
}
