import { DREAM_BROKEN_EXIT, DREAM_BROKEN_TITLE } from './lines';
import './dream.css';

/**
 * A dream that broke after the click (#81): the reason, said dryly, over the
 * stopped film, and the only way on — back to the falling-asleep screen of
 * the same dream. Looks like the pause, but there is nothing to go on with.
 */
export function showBrokenScreen(message: string, onExit: () => void, root: HTMLElement = document.body): HTMLElement {
  const element = document.createElement('div');
  element.className = 'pause';
  element.setAttribute('role', 'alertdialog');
  element.setAttribute('aria-modal', 'true');
  element.setAttribute('aria-label', DREAM_BROKEN_TITLE);

  const title = document.createElement('p');
  title.className = 'pause__title';
  title.textContent = DREAM_BROKEN_TITLE;

  const text = document.createElement('p');
  text.className = 'pause__text';
  text.textContent = message;

  const exit = document.createElement('button');
  exit.type = 'button';
  exit.className = 'pause__button pause__button--primary';
  exit.textContent = DREAM_BROKEN_EXIT;
  exit.addEventListener('click', onExit);
  const actions = document.createElement('div');
  actions.className = 'pause__actions';
  actions.append(exit);

  element.append(title, text, actions);
  root.append(element);
  exit.focus({ preventScroll: true });
  return element;
}
