import { ENGINE_VERSION } from '@dream/core';
import { startDreamFilm } from './dream';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#dream');
if (!canvas) throw new Error('Canvas #dream not found');

document.documentElement.dataset.engine = String(ENGINE_VERSION);

// Dev test benches: `?sandbox=<name>` opens one instead of the dream.
const sandboxes = new Map<string, (canvas: HTMLCanvasElement) => Promise<void>>([
  ['film', async (c) => (await import('./sandbox/film')).startFilmSandbox(c)],
]);
const sandbox = sandboxes.get(new URLSearchParams(window.location.search).get('sandbox') ?? '');

// The page is the dream film (D-022, D-027): falling asleep, the film, the
// awakening, the journal.
if (sandbox) void sandbox(canvas);
else startDreamFilm(canvas, window.location.search);
