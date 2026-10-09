import type { CardBlock } from './blocks';

/**
 * The journal card as a PNG, drawn with the 2D canvas from the same blocks
 * as the page — no libraries, no screenshots of the DOM. Same palette and
 * type as the page: black sheet, light grey sans, monospace small print.
 */

const WIDTH = 1080;
const PAD = 96;
const INNER = WIDTH - 2 * PAD;

const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";

const COLOR = {
  sheet: '#000000',
  title: '#ecebe6',
  text: '#d8d6d0',
  muted: '#7d7b76',
  faint: '#5b5a56',
  rule: '#2c2b29',
} as const;

interface Font {
  size: number;
  weight?: number;
  family?: string;
  /** Letter spacing, em. */
  spacing?: number;
  color: string;
}

const FONTS = {
  kicker: { size: 22, spacing: 0.32, color: COLOR.muted },
  title: { size: 104, weight: 200, spacing: 0.04, color: COLOR.title },
  label: { size: 26, color: COLOR.muted },
  value: { size: 30, color: COLOR.text },
  heading: { size: 20, spacing: 0.24, color: COLOR.muted },
  line: { size: 30, color: COLOR.text },
  reason: { size: 30, spacing: 0.14, color: COLOR.title },
  meta: { size: 20, family: MONO, spacing: 0.08, color: COLOR.faint },
} satisfies Record<string, Font>;

type Ctx = CanvasRenderingContext2D;

function setFont(ctx: Ctx, font: Font): void {
  ctx.font = `${font.weight ?? 400} ${font.size}px ${font.family ?? SANS}`;
  ctx.fillStyle = font.color;
  // Letter spacing is a recent canvas feature; without it the text is just tighter.
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(font.spacing ?? 0) * font.size}px`;
}

/** Splits `text` into lines no wider than `width` at the current font. */
function wrap(ctx: Ctx, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Lays the blocks out from the top and returns the height used. With
 * `draw = false` it only measures, so the canvas can be sized first.
 */
function layout(ctx: Ctx, blocks: readonly CardBlock[], draw: boolean): number {
  let y = PAD;
  const text = (value: string, x: number, font: Font, align: CanvasTextAlign = 'left') => {
    if (!draw) return;
    setFont(ctx, font);
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  };
  const rule = () => {
    if (draw) {
      ctx.fillStyle = COLOR.rule;
      ctx.fillRect(PAD, y, INNER, 2);
    }
  };
  const lines = (values: readonly string[], font: Font, gap: number) => {
    setFont(ctx, font);
    for (const value of values) {
      for (const line of wrap(ctx, value, INNER)) {
        y += font.size;
        text(line, PAD, font);
        y += gap;
      }
    }
  };
  const pairs = (rows: readonly (readonly [string, string])[], label: Font, value: Font, gap: number) => {
    for (const [name, data] of rows) {
      y += Math.max(label.size, value.size);
      text(name, PAD, label);
      text(data, WIDTH - PAD, value, 'right');
      y += gap;
    }
  };

  for (const block of blocks) {
    switch (block.kind) {
      case 'kicker':
        y += FONTS.kicker.size;
        text(block.text.toUpperCase(), PAD, FONTS.kicker);
        y += 36;
        break;
      case 'title':
        y += FONTS.title.size * 0.8;
        text(block.text, PAD - 4, FONTS.title);
        y += 56;
        rule();
        y += 28;
        break;
      case 'rows':
        pairs(block.rows, FONTS.label, FONTS.value, 18);
        y += 28;
        break;
      case 'section':
        y += 22;
        y += FONTS.heading.size;
        text(block.heading.toUpperCase(), PAD, FONTS.heading);
        y += 20;
        lines(block.lines, FONTS.line, 14);
        y += 14;
        break;
      case 'reason':
        y += 26;
        rule();
        y += 46;
        lines([block.text], FONTS.reason, 0);
        y += 42;
        rule();
        y += 34;
        break;
      case 'meta':
        pairs(block.rows, FONTS.meta, FONTS.meta, 14);
        break;
    }
  }
  return y + PAD - 14;
}

/** Draws the card on a new canvas. `scale` multiplies the 1080 px width. */
export function drawCard(blocks: readonly CardBlock[], scale = 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable.');
  canvas.width = WIDTH * scale;
  canvas.height = 10;
  const height = layout(ctx, blocks, false);
  canvas.height = Math.ceil(height * scale);
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLOR.sheet;
  ctx.fillRect(0, 0, WIDTH, height);
  layout(ctx, blocks, true);
  return canvas;
}

/** Saves the card as a PNG file named `fileName`. Resolves once the download has been handed to the browser. */
export async function saveCardPng(blocks: readonly CardBlock[], fileName: string): Promise<void> {
  const canvas = drawCard(blocks);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('The card could not be encoded.'))), 'image/png'),
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
