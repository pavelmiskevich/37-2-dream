import type { AwakeningReason } from '@dream/core';
import type { AudioEngine } from '../audio';
import { KITCHEN_CALL, NOTHING_SERIOUS, reasonLine, temperatureText } from './lines';
import { dueWakingCues, wakingCues, wakingView } from './waking';
import './dream.css';

/**
 * The awakening on screen (D-020, D-027): the bedroom by day comes out of the
 * dark, the thermometer reads 36,9, somebody in the kitchen asks about tea,
 * and the reason of the awakening is stated. HTML over the stopped film: the
 * dream's film look ends with the dream, reality is plain.
 *
 * Without a bedroom frame in the library the same plays over a dark screen.
 */
export interface AwakeningOptions {
  reason: AwakeningReason;
  /** Temperature on waking up, °C. */
  temperature: number;
  /** URL of the bedroom frame, or null while the library has none. */
  frameUrl: string | null;
  audio?: AudioEngine | null;
}

export interface Awakening {
  readonly element: HTMLElement;
  /** Plays the awakening; resolves when it is over. The element stays until `dispose`. */
  run(): Promise<void>;
  pause(): void;
  resume(): void;
  dispose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

const opacity = (value: number): string => String(Math.round(value * 100) / 100);

export function createAwakening(options: AwakeningOptions, root: HTMLElement = document.body): Awakening {
  const element = el('div', 'awakening');
  element.hidden = true;

  const room = el('div', 'awakening__room');
  if (options.frameUrl) {
    const image = new Image();
    image.className = 'awakening__frame';
    image.alt = '';
    image.decoding = 'async';
    // A frame that fails to load leaves the dark room: the ending still plays.
    image.addEventListener('load', () => element.classList.add('awakening--framed'));
    image.addEventListener('error', () => image.remove());
    image.src = options.frameUrl;
    room.append(image);
  }

  const thermometer = el('p', 'awakening__thermometer', temperatureText(options.temperature));
  const verdict = el('div', 'awakening__verdict');
  verdict.append(el('p', 'awakening__reason', reasonLine(options.reason)), el('p', 'awakening__after', NOTHING_SERIOUS));
  const center = el('div', 'awakening__center');
  center.append(thermometer, verdict);
  const call = el('p', 'awakening__call', KITCHEN_CALL);
  element.append(room, center, call);
  root.append(element);

  const cues = wakingCues();
  let time = 0;
  /** Sound cues have been fired up to here; starts before 0 so the cues of the very start fire. */
  let cueTime = -1;
  let lastMs: number | null = null;
  let raf = 0;
  let paused = false;
  let finish: (() => void) | null = null;

  const draw = () => {
    const view = wakingView(time);
    room.style.opacity = opacity(view.eyes);
    thermometer.style.opacity = opacity(view.thermometer);
    call.style.opacity = opacity(view.call);
    verdict.style.opacity = opacity(view.verdict);
    return view;
  };

  const frame = (nowMs: number) => {
    // A long gap is a stalled tab, not time awake.
    const dt = lastMs === null ? 0 : Math.min(0.25, Math.max(0, (nowMs - lastMs) / 1000));
    lastMs = nowMs;
    time += dt;
    if (options.audio) for (const cue of dueWakingCues(cues, cueTime, time)) options.audio.handle(cue.event);
    cueTime = time;
    if (draw().over) {
      finish?.();
      finish = null;
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  return {
    element,
    run() {
      element.hidden = false;
      draw();
      return new Promise<void>((resolve) => {
        finish = resolve;
        if (!paused) raf = requestAnimationFrame(frame);
      });
    },
    pause() {
      paused = true;
      cancelAnimationFrame(raf);
      lastMs = null;
    },
    resume() {
      if (!paused) return;
      paused = false;
      if (finish) raf = requestAnimationFrame(frame);
    },
    dispose() {
      cancelAnimationFrame(raf);
      finish?.();
      finish = null;
      element.remove();
    },
  };
}
