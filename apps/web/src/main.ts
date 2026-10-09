import { ENGINE_VERSION } from '@dream/core';
import { startDreamFilm } from './dream';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#dream');
if (!canvas) throw new Error('Canvas #dream not found');

document.documentElement.dataset.engine = String(ENGINE_VERSION);

// Dev test benches: `?sandbox=<name>` opens one instead of the dream.
const sandboxes = new Map<string, (canvas: HTMLCanvasElement) => Promise<void>>([
  ['ps1', async (c) => (await import('./sandbox/ps1')).startPs1Sandbox(c)],
  ['fever', async (c) => (await import('./sandbox/fever')).startFeverSandbox(c)],
  ['yard', async (c) => (await import('./sandbox/yard')).startYardSandbox(c)],
  ['fall', async (c) => (await import('./sandbox/fall')).startFallSandbox(c)],
  ['journal', async () => (await import('./sandbox/journal')).startJournalSandbox()],
  ['film', async (c) => (await import('./sandbox/film')).startFilmSandbox(c)],
  // The sound panel overlays a plain PS1 backdrop.
  [
    'audio',
    async (c) => {
      (await import('./sandbox/backdrop')).startBackdrop(c);
      (await import('./sandbox/audio')).mountAudioSandbox();
    },
  ],
]);
const sandbox = sandboxes.get(new URLSearchParams(window.location.search).get('sandbox') ?? '');

// By default the page is the dream film (D-022, D-027): falling asleep, the
// film, the awakening, the journal. The v1.2 game runtime is no longer started.
if (sandbox) void sandbox(canvas);
else startDreamFilm(canvas, window.location.search);
