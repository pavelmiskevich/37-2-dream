import { ENGINE_VERSION } from '@dream/core';
import { startDream } from './runtime';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#dream');
if (!canvas) throw new Error('Canvas #dream not found');

document.documentElement.dataset.engine = String(ENGINE_VERSION);

// Dev test benches: `?sandbox=<name>` opens one instead of the game.
const sandboxes = new Map<string, (canvas: HTMLCanvasElement) => Promise<void>>([
  ['ps1', async (c) => (await import('./sandbox/ps1')).startPs1Sandbox(c)],
  ['fever', async (c) => (await import('./sandbox/fever')).startFeverSandbox(c)],
  ['yard', async (c) => (await import('./sandbox/yard')).startYardSandbox(c)],
  ['fall', async (c) => (await import('./sandbox/fall')).startFallSandbox(c)],
  ['journal', async () => (await import('./sandbox/journal')).startJournalSandbox()],
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

if (sandbox) void sandbox(canvas);
else {
  // After the awakening the dream journal (#13) records the dream and shows its card.
  startDream(canvas, window.location.search, {
    onDreamEnd: (ending) =>
      void import('./journal')
        .then(({ showDreamJournal }) => showDreamJournal(ending))
        .catch((error: unknown) => console.error('The dream journal failed', error)),
  });
}
