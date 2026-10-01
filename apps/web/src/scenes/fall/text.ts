/**
 * Line layout for will pages, independent of the canvas: the caller passes a
 * width-measuring function, so this is testable without a DOM.
 */

export type Measure = (text: string) => number;

/** Greedy word wrap. A word longer than the line is put on a line of its own. */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ').filter((w) => w.length > 0)) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (line !== '' && measure(candidate) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * The first `count` characters of `lines`, still split into the same lines:
 * the text appears in reading order, as if being written.
 */
export function revealLines(lines: readonly string[], count: number): string[] {
  const shown: string[] = [];
  let left = Math.max(0, Math.floor(count));
  for (const line of lines) {
    if (left <= 0) break;
    shown.push(line.slice(0, left));
    left -= line.length;
  }
  return shown;
}

/** Number of characters in `lines`. */
export function charCount(lines: readonly string[]): number {
  return lines.reduce((sum, line) => sum + line.length, 0);
}
