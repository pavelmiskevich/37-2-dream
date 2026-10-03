import {
  IDLE_INPUT,
  SWING,
  SWING_HINT,
  SWING_HINT_MAX,
  SWING_RELEASE,
  TICK_DT,
  YARD_VARS,
  buttonMask,
  findScene,
  generateDream,
  yardSwingAmplitude,
  type SceneOf,
  type SimInput,
  type SimState,
} from '@dream/core';
import { createAudioEngine, unlockAudio, type AudioEngine } from '../audio';
import { feverLevel } from '../fever';
import { createInputController } from '../input';
import { createDreamSession, seedFromQuery, type DreamSession } from '../loop';
import { createPs1Renderer } from '../render';
import { SCENE_VIEWS, type SceneView, type SceneViewFactory } from '../scenes';

/**
 * `?sandbox=yard` — the yard on its own, starting over after the swing lets
 * the hero go. The game opens the same scene with `?scene=yard` through the
 * scene runtime; this bench adds a readout of the swing and an autopilot.
 *
 * - `&seed=DREAM-…` — the dream; without it a random one.
 * - `&auto` — the hero walks to the swing, sits down and pumps it himself.
 * - `&at=20` — start that many seconds into the yard (with `&auto`: mid-swing;
 *   without it: standing still, so `&at=60` shows the swing calling at level 2
 *   and `&at=148` the way out of the yard).
 *
 * Controls are the game's: WASD/arrows, mouse after a click, E or a left
 * click — sit down / get off. On the swing: W when it swings forward, S when
 * it swings back.
 */

/** How long the hero's flight stays on screen after the yard ends, seconds. */
const AFTER_HOLD = 1.2;

const use = buttonMask('use');
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const vars = (state: SimState, key: keyof typeof YARD_VARS) => state.sceneVars[YARD_VARS[key]] ?? 0;

/** Autopilot: walk to the swing, sit down, pump in time. */
function autopilot(state: SimState): SimInput {
  if (vars(state, 'seated') !== 1) {
    const dx = vars(state, 'swingX') - state.player.position[0];
    const dz = vars(state, 'swingZ') - state.player.position[2];
    const turn = wrap(Math.atan2(-dx, -dz) - state.player.yaw);
    const near = Math.hypot(dx, dz) < SWING.reach * 0.8;
    return {
      move: [0, near || Math.abs(turn) > 0.6 ? 0 : 1],
      look: [Math.max(-0.05, Math.min(0.05, turn)), -state.player.pitch * 0.1],
      buttons: near && state.tick % 2 === 0 ? use : 0,
    };
  }
  const speed = vars(state, 'speed');
  return { ...IDLE_INPUT, move: [0, speed === 0 ? 1 : Math.sign(speed)] };
}

export async function startYardSandbox(canvas: HTMLCanvasElement): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const seed = seedFromQuery(window.location.search);
  const auto = params.has('auto');
  const startAt = Math.max(0, Number(params.get('at') ?? 0) || 0);
  document.documentElement.dataset.seed = seed;

  const loadView = SCENE_VIEWS.yard;
  if (!loadView) throw new Error('The yard scene has no view.');
  const createView: SceneViewFactory<'yard'> = await loadView();

  const found = findScene(generateDream(seed), 'yard');
  if (!found) throw new Error('The dream has no yard.');
  const yard: SceneOf<'yard'> = found;

  const input = createInputController({ target: canvas });
  input.setEnabled(true);

  const ps1 = createPs1Renderer(canvas);
  let audio: AudioEngine | undefined;
  let session: DreamSession;
  let view: SceneView | undefined;
  let leftAt: number | null = null;

  const readInput = (tick: number): SimInput => (auto ? autopilot(session.state) : input.readInput(tick));

  const begin = (skipSeconds = 0) => {
    view?.dispose();
    session = createDreamSession({ seed, readInput, startScene: yard.index });
    // On to the requested moment, still inside the yard.
    for (let left = skipSeconds; left > 0 && session.state.sceneIndex === yard.index; left -= 0.2) {
      session.advance(Math.min(0.2, left));
    }
    view = createView({ dream: session.dream, scene: yard, ...(audio ? { audio } : {}) });
    leftAt = null;
  };
  begin(startAt);

  const panel = mountPanel(seed, auto, async () => {
    const context = await unlockAudio();
    audio ??= createAudioEngine(context, { seed });
    begin();
  });

  const p = yard.params;
  const describe = `${p.timeOfDay} · ${p.buildingFloors} эт. (дом: ${p.homeFloor}) · туман ${p.fog} · пылесос ×${p.vacuumPasses}`;

  ps1.renderer.setAnimationLoop((timeMs) => {
    const frame = session.frame(timeMs);
    const { state } = frame;
    if (state.sceneIndex !== yard.index) {
      // The yard is over: the fall comes next in the game; here it starts over.
      leftAt ??= timeMs;
      if (timeMs - leftAt > AFTER_HOLD * 1000) begin();
      return;
    }
    if (!view) return;
    view.update(frame);
    ps1.setFever(feverLevel(state.temperature));
    ps1.render(view.scene, view.camera);

    const amplitude = yardSwingAmplitude(state);
    const seated = vars(state, 'seated') === 1;
    const released = vars(state, 'released') === 1;
    const left = Math.max(0, SWING_HINT.fallbackAfter - state.sceneTick * TICK_DT);
    panel.status.textContent =
      `${seed} · ${describe}\n` +
      `t ${state.temperature.toFixed(2)} °C · амплитуда ${amplitude.toFixed(2)} / ${SWING_RELEASE.amplitude} рад · ` +
      (released ? (vars(state, 'fallback') === 1 ? 'переход (сам)' : 'переход') : seated ? 'на качелях' : 'стоит') +
      `\nзов ${vars(state, 'hint')} / ${SWING_HINT_MAX} · без качелей ${(vars(state, 'idle') * TICK_DT).toFixed(0)} с · до выхода ${left.toFixed(0)} с`;
  });
}

function mountPanel(seed: string, auto: boolean, onSound: () => Promise<void>) {
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed',
    top: 'calc(var(--safe-top) + 8px)',
    left: 'calc(var(--safe-left) + 8px)',
    font: '12px/1.4 monospace',
    color: '#d8d8c8',
    background: 'rgba(0, 0, 0, 0.55)',
    padding: '6px 8px',
    display: 'grid',
    gap: '4px',
    maxWidth: 'calc(100vw - 32px)',
    whiteSpace: 'pre-wrap',
  });
  const status = document.createElement('div');
  status.textContent = seed;
  const hint = document.createElement('div');
  hint.textContent = auto
    ? 'автопилот: сам дойдёт, сядет и раскачается'
    : 'WASD — ходить, мышь — взгляд (щелчок), E — сесть/встать; на качелях W вперёд, S назад в такт';
  const sound = document.createElement('button');
  sound.type = 'button';
  sound.textContent = 'Включить звук';
  sound.style.justifySelf = 'start';
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
