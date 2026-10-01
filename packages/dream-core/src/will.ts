/**
 * Text of the will (spec §14, vision: "Завещание"). The hero is sure he is
 * dying of 37.2 °C, so he puts his affairs in order: the cat, the Wi-Fi, the
 * remote. Pages fly past him during the fall and the text slowly appears on
 * them.
 *
 * The tone is deliberately official and bureaucratic. The absurdity is in
 * what is being bequeathed, never in how it is said: no jokes, no winks, no
 * exclamation marks (vision, pillar 1).
 *
 * Unlike scene parameters, this is display text: it is still pure content of
 * the seed, so it is generated here, from its own stream
 * `seed/scene/N/will`, and never touches the simulation stream (D-015).
 */
import { DREAM_TEMPERATURE } from './profile';
import type { Rng } from './rng';
import type { SceneOf, WillClause } from './scenes';
import type { DreamSeed } from './seed';
import { sceneRng } from './streams';

/** Key of the scene channel the will text is drawn from. */
export const WILL_CHANNEL = 'will';

/** What a page is written on (spec §14). */
export const WILL_PAPERS = ['document', 'receipt', 'napkin', 'toilet_paper'] as const;

export type WillPaper = (typeof WILL_PAPERS)[number];

/** One page of the will. */
export interface WillPage {
  clause: WillClause;
  paper: WillPaper;
  /** Title line, upper case: "ЗАВЕЩАНИЕ", "ПУНКТ 3"… */
  heading: string;
  /** The bequest itself: opening formula, what goes to whom, conditions. */
  body: string;
  /** Signature line. */
  closing: string;
}

// ---------------------------------------------------------------------------
// Templates

/** Temperature as written by hand in a Russian document: "37,2". */
const TEMPERATURE = DREAM_TEMPERATURE.toFixed(1).replace('.', ',');

/** Openings of the first page. Each one is followed by a verb in the first person. */
const FIRST_OPENINGS: readonly string[] = [
  `Я, находясь в здравом уме и твёрдой памяти при температуре ${TEMPERATURE} °C,`,
  `Я, нижеподписавшийся, находясь в здравом уме при температуре ${TEMPERATURE} °C,`,
  `Настоящим я, будучи в ясном сознании при температуре тела ${TEMPERATURE} °C,`,
  `Я, в полном сознании, при температуре ${TEMPERATURE} °C, измеренной дважды,`,
  `Сознавая серьёзность своего положения (температура ${TEMPERATURE} °C), я`,
  `Я, действуя добровольно и без принуждения, при температуре ${TEMPERATURE} °C`,
];

/** Openings of the following pages: the first-page ones plus continuations. */
const NEXT_OPENINGS: readonly string[] = [
  ...FIRST_OPENINGS,
  'Кроме того, я',
  `Также я, при той же температуре ${TEMPERATURE} °C,`,
  'В дополнение к ранее изложенному я',
];

/** Verbs that take "what" in the accusative and "to whom" in the dative. */
const VERBS: readonly string[] = [
  'завещаю',
  'передаю',
  'оставляю',
  'безвозмездно передаю',
  'передаю в бессрочное пользование',
];

/** Heirs, in the dative case. */
const HEIRS: readonly string[] = [
  'соседке из сорок третьей квартиры',
  'брату Виктору',
  'старшему по подъезду',
  'управляющей компании',
  'двоюродному племяннику',
  'маме',
  'коллективу отдела',
  'первому, кто войдёт в квартиру',
  'участковому терапевту',
  'Валентине Петровне',
  'государству',
];

interface ClauseText {
  /** Verbs this clause allows; default `VERBS`. */
  verbs?: readonly string[];
  /**
   * What is bequeathed, in the accusative case. An object that ends with a
   * participial phrase ends with a comma too: the heir follows it.
   */
  objects: readonly string[];
  /** Conditions: whole sentences, one or two follow the bequest. */
  terms: readonly string[];
}

const CAT_NAMES: readonly string[] = ['Барсика', 'Мурзика', 'Ваську', 'Тимофея', 'Кузю', 'Персика'];
const NETWORKS: readonly string[] = ['TP-LINK_4F2A', 'Keenetic-3720', 'DIR-615', 'HomeNet_37'];
const PASSWORDS: readonly string[] = ['12345678', 'q1w2e3r4', '19840512', 'qwerty372'];

/**
 * Slots in templates: `{cat}`, `{network}` and `{password}` are filled per
 * page. They are listed here so `willVariantCount` can count them.
 */
const SLOTS: Readonly<Record<string, readonly string[]>> = {
  '{cat}': CAT_NAMES,
  '{network}': NETWORKS,
  '{password}': PASSWORDS,
};

const CLAUSES: Readonly<Record<WillClause, ClauseText>> = {
  cat: {
    objects: [
      'кота {cat}',
      'кота {cat} вместе с его миской и местом на подоконнике',
      'кота {cat} со всеми принадлежащими ему игрушками',
    ],
    terms: [
      'Кормить дважды в сутки, в 7:00 и в 19:00, без опозданий.',
      'Миску не переставлять.',
      'Коту о настоящем распоряжении сообщить в мягкой форме.',
      'Место на батарее сохранить за котом пожизненно.',
      'Перечень кормов, которые кот не ест, прилагается отдельно.',
      'Гладить только по направлению шерсти.',
    ],
  },
  wifi_password: {
    objects: [
      'пароль от домашней сети Wi-Fi',
      'доступ к сети Wi-Fi «{network}»',
      'пароль от Wi-Fi вместе с роутером и правом его перезагрузки',
    ],
    terms: [
      'Пароль записан на обратной стороне роутера.',
      'Пароль: {password}. Сообщать его третьим лицам запрещаю.',
      'Пароль передать лично, устно, без свидетелей.',
      'Роутер не перезагружать без крайней необходимости.',
      'Пароль не менять в течение сорока дней.',
    ],
  },
  tv_remote: {
    objects: [
      'пульт от телевизора',
      'телевизионный пульт вместе с батарейками',
      'исключительное право на пульт от телевизора',
    ],
    terms: [
      'Батарейки заменены в марте.',
      'Кнопку «Громкость +» нажимать с усилием.',
      'Пульт хранить на подлокотнике дивана, в правом углу.',
      'Первый канал оставить на первой кнопке.',
      'Защитную плёнку с пульта не снимать.',
    ],
  },
  slippers: {
    objects: ['тапочки (левый и правый)', 'домашние тапочки сорок третьего размера', 'тапочки, стоящие у кровати,'],
    terms: [
      'Тапочки передаются парой. Разделение не допускается.',
      'Носить только дома.',
      'Левый тапочек немного больше правого, это не является дефектом.',
      'Местоположение тапочек не менять.',
    ],
  },
  balcony_jars: {
    objects: [
      'одиннадцать банок варенья, хранящихся на балконе,',
      'варенье на балконе (малиновое, вишнёвое, абрикосовое) в полном объёме',
      'все банки с вареньем, включая пустые,',
    ],
    terms: [
      'Банки пересчитаны. Опись прилагается.',
      'Варенье прошлого года употребить в первую очередь.',
      'Крышки вернуть.',
      'Банку без подписи не открывать.',
      'Банки с балкона не выносить до наступления холодов.',
    ],
  },
  garage_key: {
    objects: [
      'ключ от гаража',
      'ключ от гаража № 117 вместе с брелоком',
      'запасной ключ от гаража, хранящийся в серванте,',
    ],
    terms: [
      'Ворота гаража открываются с усилием на себя.',
      'Содержимое гаража описи не подлежит.',
      'Ключ на брелоке с надписью «Сочи» — не от гаража. Его не трогать.',
      'В гараж заходить только в светлое время суток.',
    ],
  },
  soup_in_fridge: {
    objects: [
      'кастрюлю супа на второй полке холодильника',
      'суп, находящийся в холодильнике, в полном объёме',
      'холодильник «Саратов» вместе с его содержимым',
    ],
    terms: [
      'Суп сварен во вторник.',
      'Холодильник не размораживать.',
      'Кастрюлю вернуть вымытой.',
      'Дверцу холодильника закрывать до щелчка.',
      'Суп разогревать на малом огне, не доводя до кипения.',
    ],
  },
  neighbor_debt: {
    verbs: ['завещаю', 'передаю'],
    objects: [
      'свой долг перед соседом Геннадием в размере трёхсот рублей',
      'обязательство по возврату дрели, взятой у соседа,',
      'долг в размере пятисот рублей, взятых в 2019 году до зарплаты,',
    ],
    terms: ['Долг признаю полностью.', 'Расписка не составлялась.', 'Проценты не начислять.', 'Соседа известить письменно.'],
  },
  sofa_side: {
    objects: [
      'левую сторону дивана',
      'правую сторону дивана, у окна,',
      'место на диване, продавленное мной за годы пользования,',
    ],
    terms: [
      'Вторая сторона дивана остаётся в общем пользовании.',
      'Подушку не переворачивать.',
      'Плед прилагается.',
      'Пылесосить диван не чаще одного раза в месяц.',
    ],
  },
  phone_charger: {
    objects: [
      'зарядное устройство от телефона',
      'зарядку с длинным проводом',
      'зарядное устройство, находящееся в розетке у кровати,',
    ],
    terms: [
      'Провод перегибается у основания. Держать прямо.',
      'Из розетки не вынимать.',
      'Зарядка подходит не ко всем телефонам.',
      'Возврату не подлежит.',
    ],
  },
};

/** Standing orders a page may end with; they keep the household motifs present. */
const SPECIAL_ORDERS: readonly string[] = [
  'пылесос оставить в коридоре, где он стоит.',
  'пылесос в моё отсутствие не включать.',
  'холодильник не размораживать.',
  'варенье не открывать до особого распоряжения.',
  'форточку на кухне держать приоткрытой.',
  'на звонки в дверь не отвечать.',
  'температуру впредь измерять дважды.',
];
const SPECIAL_ORDER_CHANCE = 0.4;
const SECOND_TERM_CHANCE = 0.6;

const FIRST_HEADINGS: readonly string[] = ['ЗАВЕЩАНИЕ', 'ЗАВЕЩАТЕЛЬНОЕ РАСПОРЯЖЕНИЕ', 'РАСПОРЯЖЕНИЕ НА СЛУЧАЙ КОНЧИНЫ'];
const NEXT_HEADINGS: readonly ((page: number) => string)[] = [
  (n) => `ДОПОЛНЕНИЕ № ${n - 1} К ЗАВЕЩАНИЮ`,
  (n) => `ПУНКТ ${n}`,
  () => 'ЗАВЕЩАТЕЛЬНОЕ РАСПОРЯЖЕНИЕ',
  () => 'РАСПОРЯЖЕНИЕ НА СЛУЧАЙ КОНЧИНЫ',
];

const SIGNATURE = 'Подпись: ________';
const CLOSINGS: readonly string[] = [
  SIGNATURE,
  `Составлено собственноручно. ${SIGNATURE}`,
  `Оспариванию не подлежит. ${SIGNATURE}`,
  `Составлено в одном экземпляре. ${SIGNATURE}`,
  `Свидетелей нет. ${SIGNATURE}`,
  `Дата: ________ ${SIGNATURE}`,
];

/** Paper weights: official forms are the most common, toilet paper is not rare. */
const PAPER_WEIGHTS: Readonly<Record<WillPaper, number>> = {
  document: 3,
  receipt: 2,
  napkin: 2,
  toilet_paper: 2,
};

// ---------------------------------------------------------------------------
// Generation

function weightedPaper(rng: Rng): WillPaper {
  const total = WILL_PAPERS.reduce((sum, paper) => sum + PAPER_WEIGHTS[paper], 0);
  let roll = rng.next() * total;
  for (const paper of WILL_PAPERS) {
    roll -= PAPER_WEIGHTS[paper];
    if (roll < 0) return paper;
  }
  return WILL_PAPERS[WILL_PAPERS.length - 1] as WillPaper;
}

/** Picks from `items`, avoiding `used` while anything else is left; records the pick. */
function pickFresh<T>(items: readonly T[], used: Set<T>, rng: Rng): T {
  const fresh = items.filter((item) => !used.has(item));
  const item = rng.pick(fresh.length > 0 ? fresh : items);
  used.add(item);
  return item;
}

function fillSlots(text: string, rng: Rng): string {
  let filled = text;
  for (const [slot, values] of Object.entries(SLOTS)) {
    if (filled.includes(slot)) filled = filled.replaceAll(slot, rng.pick(values));
  }
  return filled;
}

/**
 * Generates the will pages for `clauses` (a fall scene's `willPages`), one
 * page per clause, in order. Pure: the same seed, scene and clauses always
 * give the same text. Draws only from the scene's `WILL_CHANNEL` stream.
 */
export function generateWill(seed: DreamSeed, sceneIndex: number, clauses: readonly WillClause[]): WillPage[] {
  const rng = sceneRng(seed, sceneIndex, WILL_CHANNEL);
  const usedHeirs = new Set<string>();
  const usedOpenings = new Set<string>();
  const usedOrders = new Set<string>();

  return clauses.map((clause, index): WillPage => {
    const text = CLAUSES[clause];
    const first = index === 0;
    const page = index + 1;

    // The order of draws below is part of the engine contract.
    const paper = weightedPaper(rng);
    const heading = first ? rng.pick(FIRST_HEADINGS) : rng.pick(NEXT_HEADINGS)(page);
    const opening = pickFresh(first ? FIRST_OPENINGS : NEXT_OPENINGS, usedOpenings, rng);
    const verb = rng.pick(text.verbs ?? VERBS);
    const object = fillSlots(rng.pick(text.objects), rng);
    const heir = pickFresh(HEIRS, usedHeirs, rng);
    const terms = [rng.pick(text.terms)];
    if (rng.chance(SECOND_TERM_CHANCE)) terms.push(rng.pick(text.terms.filter((term) => term !== terms[0])));
    // A standing order never repeats a condition already on the page.
    const orders = SPECIAL_ORDERS.filter((order) => !terms.some((term) => term.toLowerCase() === order.toLowerCase()));
    const order = rng.chance(SPECIAL_ORDER_CHANCE) ? pickFresh(orders, usedOrders, rng) : undefined;
    const closing = rng.pick(CLOSINGS);

    const sentences = [`${opening} ${verb} ${object} ${heir}.`, ...terms.map((term) => fillSlots(term, rng))];
    if (order !== undefined) sentences.push(`Особое указание: ${order}`);
    return { clause, paper, heading, body: sentences.join(' '), closing };
  });
}

/** The will of a fall scene: `generateWill` for its index and `willPages`. */
export function willOfScene(seed: DreamSeed, scene: SceneOf<'fall'>): WillPage[] {
  return generateWill(seed, scene.index, scene.params.willPages);
}

/** Whole page as plain text: heading, body and closing on separate lines. */
export function willPageText(page: WillPage): string {
  return `${page.heading}\n\n${page.body}\n\n${page.closing}`;
}

function slotVariants(text: string): number {
  return Object.entries(SLOTS).reduce((count, [slot, values]) => (text.includes(slot) ? count * values.length : count), 1);
}

/**
 * Number of distinct bequests ("verb + what + to whom") the templates can
 * write for `clause`, counting filled slots. Conditions, openings and special
 * orders multiply it further; this is the lower bound the tests pin.
 */
export function willVariantCount(clause: WillClause): number {
  const text = CLAUSES[clause];
  const objects = text.objects.reduce((sum, object) => sum + slotVariants(object), 0);
  return (text.verbs ?? VERBS).length * objects * HEIRS.length;
}
