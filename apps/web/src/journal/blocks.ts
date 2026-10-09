/**
 * What the journal card says, as plain data: the page and the PNG are both
 * drawn from it, so they never disagree. Order follows spec §34, with the
 * sources of the sounds (vision, "Реальность → сон") before the reason.
 */
export type CardBlock =
  /** Small line above the title. */
  | { kind: 'kicker'; text: string }
  /** "СОН №1847". */
  | { kind: 'title'; text: string }
  /** Label — value lines. */
  | { kind: 'rows'; rows: readonly (readonly [string, string])[] }
  /** A heading over lines of text. */
  | { kind: 'section'; heading: string; lines: readonly string[] }
  /** "ПРИЧИНА: …". */
  | { kind: 'reason'; text: string }
  /** Seed, engine, date: small print at the bottom. */
  | { kind: 'meta'; rows: readonly (readonly [string, string])[] };

export const CARD_KICKER = 'Журнал сновидений';

/** "СОН №1847". */
export function cardTitle(number: number): string {
  return `СОН №${number}`;
}

/** File name of the saved card: "son-1847-DREAM-8F72-A19C-37B2.png". */
export function cardFileName(entry: { number: number; seed: string }): string {
  return `son-${entry.number}-${entry.seed}.png`;
}
