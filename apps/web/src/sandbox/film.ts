import { generateFilm, parseSeed, type DreamFilm, type DreamLength, type DreamSeed, type LibraryManifest } from '@dream/core';
// The core's made-up test library: real ids and tags, so the bench cuts a real edit before #35 lands.
import { TEST_LIBRARY } from '../../../../packages/dream-core/src/film/test-library';
import { createAudioEngine, unlockAudio, type AudioEngine } from '../audio';
import { fetchLibrary, FilmPlayer, type FrameState } from '../film';
import { devLibrary } from '../film/dev-library';
import { fixtureFilm } from '../film/fixture';
import './film.css';

/**
 * `?sandbox=film&seed=…&length=short|long` — the dream-film player on its
 * own, without the falling-asleep screen. «Уснуть» unlocks sound (D-010) and
 * plays the film cut by `generateFilm` (#37) over the library: the project
 * one (`/library/library.json`, #35) when it exists, otherwise the core's
 * test library pointed at the dev frames in `/film-fixture/`.
 *
 * Bench parameters: `&t=12.5` starts there; `&hold=1` freezes that moment
 * silently (screenshots); `&autoplay=1` plays at once without sound;
 * `&noflash=1` ticks «без вспышек»; `&hud=1` shows time, shot and FPS;
 * `&library=fixture` ignores `/library/`; `&film=fixture` plays the hand-cut
 * test film (`film/fixture.ts`: every kind of cut, a scare at 26.8 s).
 */

const DEFAULT_SEED = 'DREAM-8F72-A19C-37B2';
const LIBRARY_ROOT = `${import.meta.env.BASE_URL}library/`;
const FIXTURE_ROOT = `${import.meta.env.BASE_URL}film-fixture/`;

interface BenchParams {
  seed: DreamSeed;
  length: DreamLength;
  from: number;
  hold: boolean;
  autoplay: boolean;
  noFlash: boolean;
  hud: boolean;
  fixtureLibrary: boolean;
  fixtureFilm: boolean;
}

function benchParams(search: string): BenchParams {
  const params = new URLSearchParams(search);
  const flag = (name: string) => ['1', 'true', 'yes'].includes(params.get(name) ?? '');
  const from = Number(params.get('t'));
  return {
    seed: parseSeed(params.get('seed') ?? '') ?? (DEFAULT_SEED as DreamSeed),
    length: params.get('length') === 'long' ? 'long' : 'short',
    from: Number.isFinite(from) && from > 0 ? from : 0,
    hold: flag('hold'),
    autoplay: flag('autoplay'),
    noFlash: flag('noflash'),
    hud: flag('hud'),
    fixtureLibrary: params.get('library') === 'fixture',
    fixtureFilm: params.get('film') === 'fixture',
  };
}

/** The project library when it exists; otherwise the dev frames, as is or behind the core's test library. */
async function openLibrary(bench: BenchParams): Promise<{ manifest: LibraryManifest; root: string }> {
  if (!bench.fixtureLibrary) {
    try {
      return { manifest: await fetchLibrary(LIBRARY_ROOT), root: LIBRARY_ROOT };
    } catch {
      // No library yet (#35): fall through to the dev frames.
    }
  }
  const frames = await fetchLibrary(FIXTURE_ROOT);
  return { manifest: bench.fixtureFilm ? frames : devLibrary(TEST_LIBRARY, frames), root: FIXTURE_ROOT };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function hudLine(film: DreamFilm, frame: FrameState | null, player: FilmPlayer, root: string): string {
  if (!frame) return '';
  const { shot } = frame;
  return [
    `${frame.time.toFixed(2)} / ${film.duration.toFixed(1)} с`,
    `шот ${shot.index + 1}/${film.shots.length} ${shot.assetId}`,
    `${shot.camera.kind}${shot.scare ? ' · СКРИМЕР' : ''} → ${shot.cutOut}`,
    `${player.stats.fps.toFixed(0)} fps · промахов ${player.stats.misses}`,
    root,
  ].join('\n');
}

export async function startFilmSandbox(canvas: HTMLCanvasElement): Promise<void> {
  const bench = benchParams(window.location.search);
  const { manifest, root } = await openLibrary(bench);
  const film = bench.fixtureFilm
    ? fixtureFilm(bench.seed, bench.length, manifest)
    : generateFilm(bench.seed, bench.length, manifest);
  const player = new FilmPlayer({ canvas, library: manifest, root, settings: { noFlash: bench.noFlash } });
  (window as unknown as { __film?: unknown }).__film = { player, film };

  if (bench.hud) {
    const hud = el('pre', 'film-hud');
    document.body.append(hud);
    player.onFrame = (frame) => (hud.textContent = hudLine(film, frame, player, root));
  }

  await player.load(film, bench.from);
  if (bench.hold) {
    player.hold(bench.from);
    return;
  }
  if (bench.autoplay) {
    void player.play({ from: bench.from });
    return;
  }

  // The gate: warning (D-009), «без вспышек», and the click that unlocks sound (D-010).
  const gate = el('div', 'film-gate');
  const title = el('h1', '', '37,2 °C');
  const warning = el(
    'p',
    'film-gate-warning',
    'Во сне бывают резкие вспышки и скримеры. Если вы чувствительны к мерцанию — включите «без вспышек».',
  );
  const noFlash = document.createElement('input');
  noFlash.type = 'checkbox';
  noFlash.checked = bench.noFlash;
  const noFlashLabel = el('label', 'film-gate-option');
  noFlashLabel.append(noFlash, ' без вспышек и резких скримеров');
  const sleep = el('button', 'film-gate-sleep', 'Уснуть');
  sleep.type = 'button';
  const meta = el('p', 'film-gate-meta', `${film.seed} · ${film.length === 'short' ? '37 с' : `${Math.round(film.duration)} с`}`);
  gate.append(title, warning, noFlashLabel, sleep, meta);
  document.body.append(gate);

  let audio: AudioEngine | null = null;
  let context: AudioContext | null = null;
  const watch = async () => {
    gate.hidden = true;
    player.settings = { noFlash: noFlash.checked };
    audio?.dispose();
    audio = context ? createAudioEngine(context, { seed: film.seed }) : null;
    await player.play({ audio, from: bench.from });
    // Awake: the bench offers the same dream again.
    sleep.textContent = 'Уснуть снова';
    title.textContent = 'Ничего страшного. Просто приснилось.';
    audio?.dispose(2);
    audio = null;
    gate.hidden = false;
  };
  sleep.addEventListener('click', () => {
    sleep.disabled = true;
    // Unlocked right inside the click: browsers start audio only from a gesture.
    void unlockAudio(context ?? undefined)
      .then((ctx) => (context = ctx))
      .catch((error: unknown) => console.warn('Sound is not available; the film plays silent', error))
      .finally(() => {
        sleep.disabled = false;
        void watch();
      });
  });
}
