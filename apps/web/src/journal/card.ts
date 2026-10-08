import type { CardBlock } from './card-model';
import './journal.css';

/**
 * The journal card on the page: a full-screen sheet over the last frame of
 * the dream, the card itself and three actions under it. Typography of the
 * "Нажмите, чтобы уснуть" screen; nothing moves, nothing winks.
 */
export interface JournalCardActions {
  /** "Сохранить PNG". */
  onSave(): Promise<void>;
  /** "Скопировать ссылку"; resolves to false when the clipboard refused. */
  onCopyLink(): Promise<boolean>;
  /** The link itself, shown when it could not be copied. */
  link: string;
  /** "Уснуть снова". */
  onSleepAgain(): void;
}

export interface JournalCard {
  readonly element: HTMLElement;
  dispose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function rows(rowsOf: readonly (readonly [string, string])[], modifier: string): HTMLElement {
  const list = el('dl', `journal__rows journal__rows--${modifier}`);
  for (const [label, value] of rowsOf) {
    const row = el('div', 'journal__row');
    row.append(el('dt', 'journal__label', label), el('dd', 'journal__value', value));
    list.append(row);
  }
  return list;
}

function renderBlock(block: CardBlock): HTMLElement {
  switch (block.kind) {
    case 'kicker':
      return el('p', 'journal__kicker', block.text);
    case 'title':
      return el('h1', 'journal__title', block.text);
    case 'rows':
      return rows(block.rows, 'vitals');
    case 'section': {
      const section = el('section', 'journal__section');
      const list = el('ul', 'journal__lines');
      for (const line of block.lines) list.append(el('li', 'journal__line', line));
      section.append(el('h2', 'journal__heading', block.heading), list);
      return section;
    }
    case 'reason':
      return el('p', 'journal__reason', block.text);
    case 'meta':
      return rows(block.rows, 'meta');
  }
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = el('button', 'journal__button', text);
  element.type = 'button';
  element.addEventListener('click', onClick);
  return element;
}

/** Shows the card of `blocks` over the page. */
export function mountJournalCard(
  blocks: readonly CardBlock[],
  actions: JournalCardActions,
  root: HTMLElement = document.body,
): JournalCard {
  const element = el('div', 'journal');
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  const title = blocks.find((block) => block.kind === 'title');
  if (title) element.setAttribute('aria-label', title.text);

  const sheet = el('article', 'journal__sheet');
  sheet.append(...blocks.map(renderBlock));

  const status = el('p', 'journal__status');
  status.setAttribute('aria-live', 'polite');
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  const say = (text: string, hold = true) => {
    clearTimeout(statusTimer);
    status.textContent = text;
    if (!hold) statusTimer = setTimeout(() => (status.textContent = ''), 4000);
  };

  const save = button('Сохранить PNG', () => {
    save.disabled = true;
    void actions
      .onSave()
      .then(
        () => say('Карточка сохранена', false),
        () => say('Карточку не удалось сохранить', false),
      )
      .finally(() => (save.disabled = false));
  });
  const copy = button('Скопировать ссылку', () => {
    void actions.onCopyLink().then((copied) => {
      if (copied) say('Ссылка скопирована', false);
      else say(actions.link);
    });
  });
  const again = button('Уснуть снова', () => actions.onSleepAgain());
  again.classList.add('journal__button--primary');

  const bar = el('div', 'journal__actions');
  bar.append(save, copy, again);
  element.append(sheet, bar, status);
  root.append(element);
  again.focus({ preventScroll: true });

  return {
    element,
    dispose() {
      clearTimeout(statusTimer);
      element.remove();
    },
  };
}
