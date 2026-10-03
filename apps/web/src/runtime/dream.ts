import { findScene, generateDream, type Dream, type InputLog, type SimState } from '@dream/core';
import { createAudioEngine, feverSoundEvents, feverSoundMix, unlockAudio, type AudioEngine, type FeverSoundMix } from '../audio';
import { createDebugOverlay, debugFromQuery } from '../debug';
import { feverLevel } from '../fever';
import { createInputController } from '../input';
import { createDreamSession, seedFromQuery, type DreamSession, type FrameView } from '../loop';
import { createPs1Renderer } from '../render';
import { createCurtain, type CurtainGesture } from '../ui/curtain';
import { createStickOverlay } from '../ui/stick';
import { queryWithSeed, sceneFromQuery } from './query';
import { createSceneRuntime, type SceneRuntime } from './scene-runtime';

/**
 * Phase of the page, mirrored to `<html data-phase>` for playtests. `ended`:
 * the dream is over (the awakening has stated its reason); the last frame
 * stays on screen until the dream journal (#13) takes over.
 */
export type DreamPhase = 'awake' | 'dreaming' | 'paused' | 'ended';

/** How a played dream ended: everything the dream journal (#13) needs. */
export interface DreamEnding {
  dream: Dream;
  /**
   * Final state: `wakeReason`, `temperature` on waking up and `intrusions`
   * (what was heard; `heardMotifs` turns them into reveals).
   */
  state: SimState;
  /** Scene the run started in (`?scene=`); with the log it replays the run. */
  startScene: number;
  inputLog: InputLog;
}

/** Name of the `CustomEvent<DreamEnding>` dispatched on `window` when the dream ends. */
export const DREAM_END_EVENT = 'dream:end';

export interface StartDreamOptions {
  /** Called once when the dream is over; also dispatched as `DREAM_END_EVENT`. */
  onDreamEnd?: (ending: DreamEnding) => void;
}

const NBSP = String.fromCharCode(0xa0);

/** "37,2 °C": decimal comma, no-break space before the unit. */
const formatTemperature = (celsius: number) => `${celsius.toFixed(1).replace('.', ',')}${NBSP}°C`;

/**
 * The game page: "Нажмите, чтобы уснуть" (D-010), then the dream from the
 * first person (D-003) with the scene runtime drawing whatever scene the
 * simulation is in.
 *
 * Address: `?seed=…` plays that dream (a new seed otherwise, written back
 * into the address); `?scene=<id>` starts right in that scene for playtests;
 * `?debug` (implied by `?scene=`) shows the debug overlay.
 */
export function startDream(
  canvas: HTMLCanvasElement,
  search: string = window.location.search,
  { onDreamEnd }: StartDreamOptions = {},
): void {
  const root = document.documentElement;
  const seed = seedFromQuery(search);
  const dream = generateDream(seed);
  const startId = sceneFromQuery(search);
  const startScene = startId ? (findScene(dream, startId)?.index ?? 0) : 0;

  window.history.replaceState(window.history.state, '', `${queryWithSeed(search, seed)}${window.location.hash}`);
  root.dataset.seed = seed;

  const setPhase = (next: DreamPhase) => {
    phase = next;
    root.dataset.phase = next;
  };
  let phase: DreamPhase = 'awake';
  setPhase('awake');

  const ps1 = createPs1Renderer(canvas);
  const stick = createStickOverlay();
  const debug = startId || debugFromQuery(search) ? createDebugOverlay() : null;

  let audioContext: AudioContext | null = null;
  let session: DreamSession | null = null;
  let runtime: SceneRuntime | null = null;
  let frame: FrameView | null = null;
  let sentMix: FeverSoundMix | null = null;

  const pause = () => {
    if (phase !== 'dreaming') return;
    setPhase('paused');
    input.setEnabled(false);
    void audioContext?.suspend().catch(() => {});
    pauseScreen.show();
  };

  const input = createInputController({
    target: canvas,
    onLockLost: pause,
    onEscape: pause,
  });

  // Desktop takes the pointer lock in the same gesture; touch has none.
  const lockFor = (gesture: CurtainGesture) => {
    if (gesture.pointerType !== 'touch' && gesture.pointerType !== 'pen' && !input.touch) input.requestLock();
  };

  const sleepScreen = createCurtain({
    title: formatTemperature(dream.profile.temperature),
    action: 'Нажмите, чтобы уснуть',
    seed,
    onActivate: (gesture) => {
      sleepScreen.hide();
      lockFor(gesture);
      // unlockAudio must start inside the gesture handler; the engine follows.
      const audio = unlockAudio()
        .then((context): AudioEngine => {
          audioContext = context;
          return createAudioEngine(context, { seed });
        })
        .catch((error: unknown): undefined => {
          console.warn('Sound is unavailable; dreaming without it.', error);
          return undefined;
        });
      void audio.then(fallAsleep);
    },
  });

  const pauseScreen = createCurtain({
    title: 'Пауза',
    action: 'Нажмите, чтобы продолжить',
    seed,
    dim: true,
    onActivate: (gesture) => {
      if (phase !== 'paused') return;
      pauseScreen.hide();
      lockFor(gesture);
      void audioContext?.resume().catch(() => {});
      // Paused time is not simulated.
      session?.resetClock();
      input.setEnabled(true);
      setPhase('dreaming');
    },
  });

  function fallAsleep(audio: AudioEngine | undefined) {
    session = createDreamSession({ seed, startScene, readInput: input.readInput });
    runtime = createSceneRuntime({
      dream: session.dream,
      draw: ps1.render,
      ...(audio ? { audio } : {}),
      onDreamEnd: (state) => endDream(state),
    });
    input.setEnabled(true);
    setPhase('dreaming');

    ps1.renderer.setAnimationLoop((timeMs) => {
      if (!session || !runtime) return;
      if (phase === 'dreaming' || frame === null) frame = session.frame(timeMs);

      // Fever shows in the picture and the mix (D-014); views add the camera sway.
      const fever = feverLevel(frame.state.temperature);
      ps1.setFever(fever);
      runtime.render(frame);

      const mix = feverSoundMix(fever);
      if (audio && (sentMix === null || mix.master !== sentMix.master || mix.tension !== sentMix.tension)) {
        for (const event of feverSoundEvents(mix)) audio.handle(event);
        sentMix = mix;
      }

      stick.update(phase === 'dreaming' ? input.state.stick() : null);
      const sceneId = runtime.status?.sceneId;
      if (sceneId) root.dataset.scene = sceneId;
      debug?.update(frame.state, sceneId);
    });
  }

  /** The dream is over: no more input, the pointer is free, the journal (#13) may take over. */
  function endDream(state: SimState) {
    if (!session) return;
    setPhase('ended');
    input.setEnabled(false);
    if (document.pointerLockElement) document.exitPointerLock();
    const ending: DreamEnding = { dream: session.dream, state, startScene: session.startScene, inputLog: session.inputLog() };
    onDreamEnd?.(ending);
    window.dispatchEvent(new CustomEvent<DreamEnding>(DREAM_END_EVENT, { detail: ending }));
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });

  sleepScreen.show();
}
