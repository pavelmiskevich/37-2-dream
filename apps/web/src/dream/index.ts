import {
  DREAM_TEMPERATURE,
  RECENT_DREAMS,
  SEED_ENTROPY_BYTES,
  generateFilm,
  seedFromEntropy,
  summarizeFilm,
  type DreamFilm,
  type DreamLength,
  type FilmSummary,
  type LibraryManifest,
} from '@dream/core';
import { createAudioEngine, unlockAudio, type AudioEngine } from '../audio';
import { FilmPlayer, fetchLibrary } from '../film';
import { assetUrl } from '../film/preload';
import { cardFileName } from '../journal/blocks';
import { mountJournalCard } from '../journal/card';
import { filmJournalCard } from '../journal/film-card';
import { freshSeed } from '../journal/fresh';
import { saveCardPng } from '../journal/png';
import { createDreamJournal } from '../journal/storage';
import { createAwakening, type Awakening } from './awakening';
import { SLEEP_UNAVAILABLE } from './lines';
import { createPauseScreen } from './pause-screen';
import { DEFAULT_LENGTH, dreamUrl, parseDreamQuery, queryWithDream } from './query';
import { readSettings, writeSettings } from './settings';
import { createSleepScreen, type SleepChoice } from './sleep-screen';
import { wakingFrame } from './waking';

/**
 * Phase of the page, mirrored to `<html data-phase>` for playtests:
 * `awake` — the falling-asleep screen; `dreaming` — the film; `waking` — the
 * awakening; `journal` — the card. `<html data-paused>` is set while paused.
 */
export type DreamPhase = 'awake' | 'dreaming' | 'waking' | 'journal';

const LIBRARY_ROOT = `${import.meta.env.BASE_URL}library/`;

/** The journal's sounds of the flat fade out over this long, seconds. */
const JOURNAL_FADE = 2;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The whole dream (D-027): the falling-asleep screen with the choice of
 * length (D-010), the film of the seed and length (`generateFilm` played by
 * `FilmPlayer`), the awakening (D-020) and the journal card (D-021).
 *
 * Address: `?seed=…&length=short|long` plays that dream; without a seed a
 * fresh one is drawn, and the address is rewritten to name the dream on
 * screen. `&noflash=1` ticks "без вспышек".
 *
 * There are no controls after the click: Esc (or the page going to the
 * background) only pauses, and the pause only goes on or leaves.
 */
export function startDreamFilm(canvas: HTMLCanvasElement, search: string = window.location.search): void {
  const root = document.documentElement;
  const query = parseDreamQuery(search);
  const seed = query.seed ?? seedFromEntropy(crypto.getRandomValues(new Uint8Array(SEED_ENTROPY_BYTES)));
  root.dataset.seed = seed;

  const nameDream = (length: DreamLength) => {
    window.history.replaceState(
      window.history.state,
      '',
      `${queryWithDream(window.location.search, seed, length)}${window.location.hash}`,
    );
    root.dataset.length = length;
  };
  nameDream(query.length ?? DEFAULT_LENGTH);

  let phase: DreamPhase = 'awake';
  const setPhase = (next: DreamPhase) => {
    phase = next;
    root.dataset.phase = next;
  };
  setPhase('awake');

  let player: FilmPlayer | null = null;
  let context: AudioContext | null = null;
  let audio: AudioEngine | null = null;
  let awakening: Awakening | null = null;
  let paused = false;

  // A phone would dim and lock its screen during a dream nobody touches.
  let wakeLock: WakeLockSentinel | null = null;
  const keepAwake = () => {
    if (!('wakeLock' in navigator)) return;
    void navigator.wakeLock
      .request('screen')
      .then((lock) => {
        if (phase === 'dreaming' || phase === 'waking') wakeLock = lock;
        else void lock.release().catch(() => {});
      })
      .catch(() => {});
  };
  const letSleep = () => {
    void wakeLock?.release().catch(() => {});
    wakeLock = null;
  };

  const pause = () => {
    if (paused || (phase !== 'dreaming' && phase !== 'waking')) return;
    paused = true;
    root.dataset.paused = '';
    player?.pause();
    awakening?.pause();
    void context?.suspend().catch(() => {});
    pauseScreen.show();
  };
  const resume = () => {
    if (!paused) return;
    paused = false;
    delete root.dataset.paused;
    pauseScreen.hide();
    const go = () => {
      if (paused) return;
      player?.resume();
      awakening?.resume();
    };
    // The film runs on the audio clock: it goes on once the sound does.
    if (context) void context.resume().catch(() => {}).then(go);
    else go();
    // The lock is dropped whenever the page is hidden.
    keepAwake();
  };
  const pauseScreen = createPauseScreen({
    onResume: resume,
    // Waking up early: back to the falling-asleep screen of the same dream.
    onExit: () => window.location.reload(),
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.repeat) return;
    if (paused) resume();
    else pause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });

  const settings = readSettings();
  const library = fetchLibrary(LIBRARY_ROOT);

  const showJournal = (film: DreamFilm, manifest: LibraryManifest) => {
    const journal = createDreamJournal<FilmSummary>();
    const entry = journal.record(summarizeFilm(film, manifest), new Date());
    const blocks = filmJournalCard(entry);
    const link = dreamUrl(seed, film.length, window.location);
    root.dataset.journal = String(entry.number);
    mountJournalCard(blocks, {
      link,
      onSave: () => saveCardPng(blocks, cardFileName(entry)),
      onCopyLink: () => copyText(link),
      // A new dream of the same length, unlike the last ones (D-021); its screen asks for the click again (D-010).
      onSleepAgain: () =>
        window.location.assign(dreamUrl(freshSeed(journal.recentSeeds(RECENT_DREAMS)), film.length, window.location)),
    });
  };

  async function dream(choice: SleepChoice, unlocked: Promise<AudioContext | null>): Promise<void> {
    const manifest = await library;
    const film = generateFilm(seed, choice.length, manifest);
    player = new FilmPlayer({ canvas, library: manifest, root: LIBRARY_ROOT, settings: { noFlash: choice.noFlash } });
    await player.load(film);
    context = await unlocked;
    audio = context ? createAudioEngine(context, { seed }) : null;

    // Created now, so the bedroom frame loads while he is still asleep.
    const frame = wakingFrame(manifest);
    awakening = createAwakening({
      reason: film.awakening.reason,
      temperature: film.awakening.temperature,
      frameUrl: frame ? assetUrl(LIBRARY_ROOT, frame.file) : null,
      audio,
    });

    screen.dispose();
    setPhase('dreaming');
    keepAwake();
    await player.play({ audio });

    setPhase('waking');
    await awakening.run();

    setPhase('journal');
    letSleep();
    audio?.dispose(JOURNAL_FADE);
    showJournal(film, manifest);
    awakening.dispose();
    player.dispose();
  }

  const screen = createSleepScreen({
    seed,
    temperature: DREAM_TEMPERATURE,
    length: query.length ?? DEFAULT_LENGTH,
    noFlash: query.noFlash || settings.noFlash,
    onLength: nameDream,
    onNoFlash: (noFlash) => writeSettings({ noFlash }),
    onSleep: (choice) => {
      screen.setBusy(true);
      // Unlocked right inside the click: browsers start audio only from a gesture (D-010).
      const unlocked = unlockAudio().catch((error: unknown): null => {
        console.warn('Sound is unavailable; dreaming without it.', error);
        return null;
      });
      dream(choice, unlocked).catch((error: unknown) => {
        console.error('The dream did not start', error);
        if (phase === 'awake') screen.fail(SLEEP_UNAVAILABLE);
      });
    },
  });
  library.catch(() => screen.fail(SLEEP_UNAVAILABLE));
}
