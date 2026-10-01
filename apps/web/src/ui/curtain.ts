import './ui.css';

/**
 * Full-screen button over the game: the "Нажмите, чтобы уснуть" screen
 * (D-010) and the pause screen. The whole screen is the button, so a click,
 * a tap, Enter or Space activates it — each of them a user gesture that may
 * unlock audio and take the pointer lock.
 */
export interface CurtainOptions {
  /** Large line, e.g. the temperature. */
  title?: string;
  /** What to do, e.g. "Нажмите, чтобы уснуть". */
  action: string;
  /** Dream seed, shown small. */
  seed?: string;
  /** Lets the game show through (pause). */
  dim?: boolean;
  /** Called from the gesture's event handler. */
  onActivate: (gesture: CurtainGesture) => void;
}

export interface CurtainGesture {
  /** Pointer that activated it: 'mouse', 'touch', 'pen', or '' for the keyboard. */
  pointerType: string;
}

export interface Curtain {
  readonly element: HTMLButtonElement;
  show(): void;
  hide(): void;
  readonly visible: boolean;
  dispose(): void;
}

function line(className: string, text: string): HTMLElement {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  return element;
}

export function createCurtain(
  { title, action, seed, dim = false, onActivate }: CurtainOptions,
  root: HTMLElement = document.body,
): Curtain {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = dim ? 'curtain curtain--dim' : 'curtain';
  if (title) element.append(line('curtain__title', title));
  element.append(line('curtain__action', action));
  if (seed) element.append(line('curtain__seed', seed));
  element.hidden = true;
  root.append(element);

  // `click` does not say reliably which pointer caused it (Safari: MouseEvent).
  let pointerType = '';
  element.addEventListener('pointerdown', (event) => {
    pointerType = event.pointerType;
  });
  element.addEventListener('keydown', () => {
    pointerType = '';
  });
  element.addEventListener('click', (event) => {
    event.preventDefault();
    if (element.hidden) return;
    onActivate({ pointerType });
  });

  return {
    element,
    show() {
      element.hidden = false;
      element.focus({ preventScroll: true });
    },
    hide() {
      element.hidden = true;
      element.blur();
    },
    get visible() {
      return !element.hidden;
    },
    dispose() {
      element.remove();
    },
  };
}
