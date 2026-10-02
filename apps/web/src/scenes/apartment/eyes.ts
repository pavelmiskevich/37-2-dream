/**
 * Falling asleep, seen from inside: the eyelids grow heavy, close twice and
 * open again a little less each time, then stay shut while the picture goes
 * dark. A function of the prologue's `sleep` (0..1) only.
 */
export interface Eyes {
  /** 0 open … 1 shut: how far each lid has come over the eye. */
  lids: number;
  /** 0..1 darkness over the whole picture. */
  dark: number;
}

const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Heavy blinks: the moment (share of sleep) and how long each one lasts. */
export const BLINKS: readonly { at: number; width: number }[] = [
  { at: 0.16, width: 0.07 },
  { at: 0.42, width: 0.1 },
];

export function eyesAt(sleep: number): Eyes {
  const s = Math.min(1, Math.max(0, Number.isFinite(sleep) ? sleep : 0));
  // The lids sink steadily; past two thirds they stay shut.
  let lids = 0.85 * smooth(0, 0.66, s) + 0.15 * smooth(0.55, 0.7, s);
  for (const blink of BLINKS) {
    const d = (s - blink.at) / blink.width;
    lids = Math.max(lids, Math.exp(-d * d * 4));
  }
  // The tails of the blinks are invisible; wide awake means exactly open.
  return { lids: lids < 0.001 ? 0 : Math.min(1, lids), dark: smooth(0.35, 0.9, s) };
}
