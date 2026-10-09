import type { DreamLength, DreamSeed } from '@dream/core';
import { FLASH_WARNING, LENGTH_LEGEND, LENGTH_TEXT, NO_FLASH_LABEL, SLEEP_ACTION, SLEEP_LOADING, temperatureText } from './lines';
import './dream.css';

/**
 * The falling-asleep screen (D-009, D-010, D-027): the only place the viewer
 * decides anything. The length of the dream, the warning about flashes with
 * its switch, and the button whose click is the gesture that unlocks sound
 * and starts the dream. After it there are no controls.
 */
export interface SleepChoice {
  length: DreamLength;
  noFlash: boolean;
}

export interface SleepScreenOptions {
  seed: DreamSeed;
  /** Temperature he falls asleep with, °C. */
  temperature: number;
  length: DreamLength;
  noFlash: boolean;
  /** The length was switched (the address follows it). */
  onLength?: (length: DreamLength) => void;
  onNoFlash?: (noFlash: boolean) => void;
  /** Called from the click handler of the button: a user gesture. */
  onSleep: (choice: SleepChoice) => void;
}

export interface SleepScreen {
  readonly element: HTMLElement;
  readonly choice: SleepChoice;
  /** The dream is loading: the controls are locked. */
  setBusy(busy: boolean): void;
  /** Replaces the button with a message (the dream cannot start). */
  fail(message: string): void;
  hide(): void;
  dispose(): void;
}

const LENGTHS: readonly DreamLength[] = ['short', 'long'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function createSleepScreen(options: SleepScreenOptions, root: HTMLElement = document.body): SleepScreen {
  const choice: SleepChoice = { length: options.length, noFlash: options.noFlash };

  const element = el('main', 'sleep');
  const panel = el('div', 'sleep__panel');

  const lengths = el('fieldset', 'sleep__lengths');
  lengths.append(el('legend', 'sleep__legend', LENGTH_LEGEND));
  const radios = LENGTHS.map((length) => {
    const label = el('label', 'sleep__length');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'length';
    input.value = length;
    input.checked = length === choice.length;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      choice.length = length;
      options.onLength?.(length);
    });
    label.append(input, el('span', 'sleep__length-text', LENGTH_TEXT[length]));
    lengths.append(label);
    return input;
  });

  const noFlash = document.createElement('input');
  noFlash.type = 'checkbox';
  noFlash.checked = choice.noFlash;
  noFlash.addEventListener('change', () => {
    choice.noFlash = noFlash.checked;
    options.onNoFlash?.(noFlash.checked);
  });
  const noFlashLabel = el('label', 'sleep__option');
  noFlashLabel.append(noFlash, el('span', '', NO_FLASH_LABEL));

  const button = el('button', 'sleep__button', SLEEP_ACTION);
  button.type = 'button';
  button.addEventListener('click', () => {
    if (button.disabled) return;
    options.onSleep({ ...choice });
  });

  const status = el('p', 'sleep__status');
  status.setAttribute('role', 'status');
  status.hidden = true;

  panel.append(
    el('h1', 'sleep__title', temperatureText(options.temperature)),
    lengths,
    el('p', 'sleep__warning', FLASH_WARNING),
    noFlashLabel,
    button,
    status,
    el('p', 'sleep__seed', options.seed),
  );
  element.append(panel);
  root.append(element);
  button.focus({ preventScroll: true });

  return {
    element,
    choice,
    setBusy(busy) {
      button.disabled = busy;
      noFlash.disabled = busy;
      for (const radio of radios) radio.disabled = busy;
      button.textContent = busy ? SLEEP_LOADING : SLEEP_ACTION;
      element.classList.toggle('sleep--busy', busy);
    },
    fail(message) {
      button.hidden = true;
      status.hidden = false;
      status.textContent = message;
    },
    hide() {
      element.hidden = true;
    },
    dispose() {
      element.remove();
    },
  };
}
