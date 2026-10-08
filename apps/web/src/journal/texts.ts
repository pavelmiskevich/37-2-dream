import type {
  AwakeningReason,
  DreamEventId,
  DreamMotif,
  JamFlavor,
  NightstandItem,
  RealSource,
  SceneId,
  StrangeObject,
  WillClause,
} from '@dream/core';
import { REASONS } from '../scenes/awakening/lines';

/**
 * Words of the dream journal. The card is a medical document: dry, exact,
 * entirely serious (pillar 1). Nothing here jokes or winks; the absurdity is
 * in what is being recorded.
 */

const NBSP = String.fromCharCode(0xa0);

/** "ПРИЧИНА: СИМУЛЯНТ" — the same words the awakening states (vision, spec §35). */
export function reasonText(reason: AwakeningReason): string {
  return `ПРИЧИНА: ${REASONS[reason]}`;
}

/** The motif as the dream presented it, in the genitive: "Источник звука ИВЛ". */
export const MOTIF_TEXT: Readonly<Record<DreamMotif, string>> = {
  ventilator: 'ИВЛ',
  monitor: 'реанимационного монитора',
  vacuum: 'турбины',
  swing_creak: 'качелей',
  lift_voice: 'голоса из лифта',
};

/** What it really was (vision, "Реальность → сон"). */
export const SOURCE_TEXT: Readonly<Record<RealSource, string>> = {
  snoring: 'ваш храп',
  microwave: 'микроволновка на кухне',
  cleaning: 'уборка в соседней комнате',
  bed_creak: 'скрип кровати, когда вы ворочались',
  tea_offer: '«Ты чай будешь?» с кухни',
};

/** "Источник звука ИВЛ: ваш храп". */
export function sourceLine(motif: DreamMotif, source: RealSource): string {
  return `Источник звука ${MOTIF_TEXT[motif]}: ${SOURCE_TEXT[source]}`;
}

const FLAVOR_GENITIVE: Readonly<Record<JamFlavor, string>> = {
  raspberry: 'малинового варенья',
  cherry: 'вишнёвого варенья',
  apricot: 'абрикосового варенья',
  blackcurrant: 'варенья из чёрной смородины',
};

/** Dream locations. The jar is named by its jam. */
export function locationText(id: SceneId, flavor: JamFlavor = 'raspberry'): string {
  switch (id) {
    case 'apartment':
      return 'квартира';
    case 'yard':
      return 'советский двор';
    case 'fall':
      return 'воздушное пространство над двором';
    case 'jam':
      return `банка ${FLAVOR_GENITIVE[flavor]}`;
    case 'awakening':
      return 'квартира';
  }
}

/** Russian plural: forms for 1, 2–4 and 5+ ("падение", "падения", "падений"). */
export function plural(count: number, [one, few, many]: readonly [string, string, string]): string {
  const n = Math.abs(count) % 100;
  const last = n % 10;
  if (n >= 11 && n <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

const EVENT_FORMS: Readonly<Record<DreamEventId, readonly [string, string, string]>> = {
  thermometer: ['термометр', 'термометра', 'термометров'],
  vacuum: ['появление пылесоса', 'появления пылесоса', 'появлений пылесоса'],
  fall: ['падение', 'падения', 'падений'],
  will_page: ['лист завещания', 'листа завещания', 'листов завещания'],
  jam_jar: ['банка варенья', 'банки варенья', 'банок варенья'],
};

/** "3 появления пылесоса". */
export function eventText(id: DreamEventId, count: number): string {
  return `${count}${NBSP}${plural(count, EVENT_FORMS[id])}`;
}

const NIGHTSTAND_TEXT: Readonly<Record<NightstandItem, string>> = {
  water_glass: 'Стакан воды',
  pill_blister: 'Блистер таблеток',
  tea_mug: 'Кружка чая',
  jam_jar: 'Банка варенья на тумбочке',
  lemon_saucer: 'Блюдце с лимоном',
  tissues: 'Пачка бумажных салфеток',
  mustard_plasters: 'Горчичники',
  tv_remote: 'Пульт от телевизора',
  phone: 'Телефон',
};

/** The thing bequeathed on a page of the will. */
const CLAUSE_TEXT: Readonly<Record<WillClause, string>> = {
  cat: 'кот',
  wifi_password: 'пароль от Wi-Fi',
  tv_remote: 'пульт от телевизора',
  slippers: 'тапочки',
  balcony_jars: 'банки с балкона',
  garage_key: 'ключ от гаража',
  soup_in_fridge: 'суп в холодильнике',
  neighbor_debt: 'долг соседу',
  sofa_side: 'сторона дивана',
  phone_charger: 'зарядное устройство',
};

/** "Самый странный объект". */
export function strangeObjectText(object: StrangeObject | null): string {
  if (object === null) return 'Не установлен';
  switch (object.kind) {
    case 'nightstand':
      return NIGHTSTAND_TEXT[object.item];
    case 'swing':
      return 'Качели';
    case 'will_clause':
      return `Лист завещания (${CLAUSE_TEXT[object.clause]})`;
    case 'jam_jar':
      // The jar of the jam scene is 12 m tall (JAM_JAR, D-018).
      return `Банка ${FLAVOR_GENITIVE[object.flavor]} высотой 12${NBSP}м`;
  }
}

/** "37,2 °C": decimal comma, no-break space before the unit. */
export function temperatureText(celsius: number): string {
  return `${celsius.toFixed(1).replace('.', ',')}${NBSP}°C`;
}

/** "03:12"; an hour or more as "1:03:12". */
export function durationText(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "02.10.2026", local date. */
export function dateText(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${date.getFullYear()}`;
}
