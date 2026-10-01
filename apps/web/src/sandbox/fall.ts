import { IDLE_INPUT, findScene, generateDream, type SceneOf, type SimInput } from '@dream/core';
import { createAudioEngine, unlockAudio, type AudioEngine } from '../audio';
import { createDreamSession, seedFromQuery, type DreamSession } from '../loop';
import { createPs1Renderer } from '../render';
import { SCENE_VIEWS, type SceneView, type SceneViewFactory } from '../scenes';

/**
 * `?sandbox=fall` — the fall scene on its own, looping, with a few extras for
 * checking it: start at any second, freeze, restart after the landing. The
 * game itself opens the scene with `?scene=fall` through the scene runtime.
 *
 * - `&seed=DREAM-…` — the dream; without it a random one.
 * - `&at=20` — start that many seconds into the fall.
 * - `&pause` — freeze there (for screenshots).
 *
 * WASD drift in the air, arrow keys look around, P pauses (to read a page).
 * After the landing the fall starts over.
 */

/** Look speed of the arrow keys, radians per tick. */
const LOOK_YAW = 0.03;
const LOOK_PITCH = 0.02;
/** How long the landing stays on screen before the fall starts over, seconds. */
const LANDED_HOLD = 1.5;

const MOVE_KEYS: Readonly<Record<string, readonly [number, number]>> = {
  KeyW: [0, 1],
  KeyS: [0, -1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};
const LOOK_KEYS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [LOOK_YAW, 0],
  ArrowRight: [-LOOK_YAW, 0],
  ArrowUp: [0, LOOK_PITCH],
  ArrowDown: [0, -LOOK_PITCH],
};

export async function startFallSandbox(canvas: HTMLCanvasElement): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const seed = seedFromQuery(window.location.search);
  const startAt = Math.max(0, Number(params.get('at') ?? 0) || 0);
  let paused = params.has('pause');
  document.documentElement.dataset.seed = seed;

  const loadView = SCENE_VIEWS.fall;
  if (!loadView) throw new Error('The fall scene has no view.');
  const createView: SceneViewFactory<'fall'> = await loadView();

  const held = new Set<string>();
  window.addEventListener('keydown', (event) => {
    if (event.code in MOVE_KEYS || event.code in LOOK_KEYS) event.preventDefault();
    if (event.code === 'KeyP' && !event.repeat) {
      paused = !paused;
      // No time passes while paused.
      session.resetClock();
    }
    held.add(event.code);
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => held.clear());

  const readInput = (): SimInput => {
    let right = 0;
    let forward = 0;
    let yaw = 0;
    let pitch = 0;
    for (const code of held) {
      const move = MOVE_KEYS[code];
      if (move) {
        right += move[0];
        forward += move[1];
      }
      const look = LOOK_KEYS[code];
      if (look) {
        yaw += look[0];
        pitch += look[1];
      }
    }
    return right === 0 && forward === 0 && yaw === 0 && pitch === 0
      ? IDLE_INPUT
      : { move: [right, forward], look: [yaw, pitch], buttons: 0 };
  };

  const ps1 = createPs1Renderer(canvas);
  let audio: AudioEngine | undefined;
  let session: DreamSession;
  let view: SceneView;
  let landedAt: number | null = null;

  const found = findScene(generateDream(seed), 'fall');
  if (!found) throw new Error('The dream has no fall.');
  const fall: SceneOf<'fall'> = found;

  const begin = (skipSeconds: number) => {
    view?.dispose();
    session = createDreamSession({ seed, readInput, startScene: fall.index });
    // On to the requested moment of the fall.
    let left = skipSeconds;
    while (left > 0 && session.state.sceneIndex <= fall.index) {
      const chunk = Math.min(0.2, left);
      session.advance(chunk);
      left -= chunk;
    }
    view = createView({ dream: session.dream, scene: fall, audio });
    view.update(session.advance(0));
    landedAt = null;
  };
  begin(startAt);

  const panel = mountPanel(seed, async () => {
    const context = await unlockAudio();
    audio ??= createAudioEngine(context, { seed });
    begin(0);
  });

  ps1.renderer.setAnimationLoop((timeMs) => {
    const frame = paused ? session.advance(0) : session.frame(timeMs);
    if (frame.state.sceneIndex > fall.index) {
      landedAt ??= timeMs;
      if (timeMs - landedAt > LANDED_HOLD * 1000) {
        begin(0);
        return;
      }
    }
    view.update(frame);
    ps1.render(view.scene, view.camera);
    const progress = Math.min(1, frame.sceneTime / fall.duration);
    panel.status.textContent = `${seed} · ${(progress * 100).toFixed(0)}% · ${fall.params.height} м`;
  });
}

function mountPanel(seed: string, onSound: () => Promise<void>) {
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed',
    top: 'calc(var(--safe-top) + 8px)',
    left: 'calc(var(--safe-left) + 8px)',
    font: '12px monospace',
    color: '#d8d8c8',
    background: 'rgba(0, 0, 0, 0.55)',
    padding: '6px 8px',
    display: 'grid',
    gap: '4px',
    maxWidth: 'calc(100vw - 32px)',
  });
  const status = document.createElement('div');
  status.textContent = seed;
  const hint = document.createElement('div');
  hint.textContent = 'WASD — смещение, стрелки — взгляд, P — пауза';
  const sound = document.createElement('button');
  sound.type = 'button';
  sound.textContent = 'Включить звук';
  sound.addEventListener('click', () => {
    sound.disabled = true;
    onSound().then(
      () => (sound.textContent = 'Звук включён'),
      () => {
        sound.disabled = false;
        sound.textContent = 'Звук не включился';
      },
    );
  });
  panel.append(status, hint, sound);
  document.body.append(panel);
  return { status };
}
