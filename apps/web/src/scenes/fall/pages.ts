import * as THREE from 'three';
import type { WillPage, WillPaper } from '@dream/core';
import { PAPER_SIZE } from './layout';
import { charCount, revealLines, wrapText } from './text';

/**
 * A sheet of the will: a thin double-sided quad whose front is a canvas the
 * text is written onto, a few characters at a time.
 */

/** Canvas pixels per metre of paper. */
const PIXELS_PER_METRE = 300;
/** Redraw only after this many new characters: uploads stay rare. */
const REVEAL_STEP = 3;

interface PaperStyle {
  background: string;
  ink: string;
  font: string;
  /** Characters per line at the largest type tried; it shrinks until the text fits. */
  lineChars: number;
  decorate(ctx: CanvasRenderingContext2D, width: number, height: number): void;
}

const TYPEWRITER = '"Courier New", Courier, monospace';
const HAND = 'Georgia, "Times New Roman", serif';

const dashedLine = (ctx: CanvasRenderingContext2D, y: number, width: number, dash: number) => {
  ctx.setLineDash([dash, dash]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
  ctx.setLineDash([]);
};

const STYLES: Readonly<Record<WillPaper, PaperStyle>> = {
  document: {
    background: '#efeadb',
    ink: '#1c1c1c',
    font: TYPEWRITER,
    lineChars: 12,
    decorate(ctx, width, height) {
      // A double rule under the margin, like an official form.
      ctx.strokeStyle = '#8a8270';
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, width - 20, height - 20);
    },
  },
  receipt: {
    background: '#f2efe6',
    ink: '#3a3448',
    font: TYPEWRITER,
    lineChars: 8,
    decorate(ctx, width, height) {
      ctx.strokeStyle = '#9a96a0';
      ctx.lineWidth = 2;
      dashedLine(ctx, 14, width, 6);
      dashedLine(ctx, height - 14, width, 6);
    },
  },
  napkin: {
    background: '#f7f4ec',
    ink: '#1d2c6e',
    font: `italic ${HAND}`,
    lineChars: 12,
    decorate(ctx, width, height) {
      // Embossed border of a paper napkin.
      ctx.strokeStyle = '#e2ddcf';
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, width - 16, height - 16);
    },
  },
  toilet_paper: {
    background: '#efede6',
    ink: '#1d2c6e',
    font: `italic ${HAND}`,
    lineChars: 8,
    decorate(ctx, width, height) {
      // Perforation between sheets.
      ctx.strokeStyle = '#cfcabd';
      ctx.lineWidth = 2;
      for (let i = 1; i < 4; i++) dashedLine(ctx, (height * i) / 4, width, 3);
    },
  },
};

interface Laid {
  heading: string[];
  body: string[];
  closing: string[];
  fontSize: number;
  lineHeight: number;
}

export class WillSheet {
  readonly object = new THREE.Group();
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly materials: THREE.Material[];
  private readonly geometry: THREE.PlaneGeometry;
  private readonly style: PaperStyle;
  private readonly laid: Laid;
  private readonly total: number;
  private shown = -1;

  constructor(readonly page: WillPage) {
    const [width, height] = PAPER_SIZE[page.paper];
    this.style = STYLES[page.paper];
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(width * PIXELS_PER_METRE);
    this.canvas.height = Math.round(height * PIXELS_PER_METRE);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available.');
    this.ctx = ctx;
    this.laid = this.layout();
    this.total = charCount(this.laid.heading) + charCount(this.laid.body) + charCount(this.laid.closing);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    // Text needs smooth minification: nearest sampling would eat the strokes
    // at the PS1 resolution. The sheet itself still wobbles like the rest.
    this.texture.userData.ps1 = false;
    this.texture.anisotropy = 4;

    // Subdivided so affine texture warping stays mild up close.
    this.geometry = new THREE.PlaneGeometry(width, height, 4, 6);
    const front = new THREE.MeshBasicMaterial({ map: this.texture });
    const back = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.style.background).multiplyScalar(0.8) });
    this.materials = [front, back];
    const frontMesh = new THREE.Mesh(this.geometry, front);
    const backMesh = new THREE.Mesh(this.geometry, back);
    backMesh.rotation.y = Math.PI;
    this.object.add(frontMesh, backMesh);
    this.draw(0);
  }

  /** Shows `share` (0..1) of the text; redraws only when enough has changed. */
  reveal(share: number): void {
    const count = Math.round(Math.min(1, Math.max(0, share)) * this.total);
    const stepped = count >= this.total ? this.total : Math.floor(count / REVEAL_STEP) * REVEAL_STEP;
    if (stepped !== this.shown) this.draw(stepped);
  }

  dispose(): void {
    this.texture.dispose();
    this.geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  private font(size: number, bold = false): string {
    return `${bold ? 'bold ' : ''}${size}px ${this.style.font}`;
  }

  private layout(): Laid {
    const { width, height } = this.canvas;
    const margin = width * 0.09;
    const textWidth = width - 2 * margin;
    // Start from the paper's line length, then shrink until it all fits: the
    // text fills the sheet with the biggest type it can, to stay legible at
    // the PS1 resolution.
    let fontSize = Math.floor(textWidth / (this.style.lineChars * 0.6));
    for (;;) {
      const lineHeight = Math.round(fontSize * 1.22);
      this.ctx.font = this.font(fontSize, true);
      const heading = wrapText(this.page.heading, textWidth, (t) => this.ctx.measureText(t).width);
      this.ctx.font = this.font(fontSize);
      const measure = (t: string) => this.ctx.measureText(t).width;
      const body = wrapText(this.page.body, textWidth, measure);
      const closing = wrapText(this.page.closing, textWidth, measure);
      const lines = heading.length + body.length + closing.length + 2;
      if (lines * lineHeight <= height - 2 * margin || fontSize <= 8) {
        return { heading, body, closing, fontSize, lineHeight };
      }
      fontSize -= 1;
    }
  }

  private draw(count: number): void {
    this.shown = count;
    const { ctx, laid, style } = this;
    const { width, height } = this.canvas;
    const margin = width * 0.09;
    ctx.fillStyle = style.background;
    ctx.fillRect(0, 0, width, height);
    style.decorate(ctx, width, height);

    ctx.fillStyle = style.ink;
    ctx.textBaseline = 'top';
    let left = count;
    let y = margin;

    ctx.font = this.font(laid.fontSize, true);
    ctx.textAlign = 'center';
    for (const line of revealLines(laid.heading, left)) {
      ctx.fillText(line, width / 2, y);
      y += laid.lineHeight;
    }
    left -= charCount(laid.heading);
    y = margin + (laid.heading.length + 1) * laid.lineHeight;

    ctx.font = this.font(laid.fontSize);
    ctx.textAlign = 'left';
    for (const line of revealLines(laid.body, left)) {
      ctx.fillText(line, margin, y);
      y += laid.lineHeight;
    }
    left -= charCount(laid.body);
    y = margin + (laid.heading.length + laid.body.length + 2) * laid.lineHeight;

    for (const line of revealLines(laid.closing, left)) {
      ctx.fillText(line, margin, y);
      y += laid.lineHeight;
    }
    this.texture.needsUpdate = true;
  }
}
