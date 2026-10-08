import type { DreamFilm, LibraryManifest, SoundCue } from '@dream/core';
import type { AudioEngine } from '../audio';
import { AssetCache, type LoadedAsset } from './assets';
import { audioClock, performanceClock, type PlayerClock } from './clock';
import { frameAt, type FrameState } from './frame';
import { assetWindow, clipPlayback, clipTime } from './preload';
import { FilmRenderer } from './renderer';
import { cueEvents, dueCues, expandCues } from './sound';
import { planFilm, shotAt, type FilmPlan, type PlayerSettings } from './timeline';

/**
 * Plays a `DreamFilm` (D-022, D-024): pictures from the library through the
 * film look, cuts and scares on the canvas, sound cues into the audio engine,
 * all on one clock. It has no controls: load, play, and it ends by itself.
 *
 *   const player = new FilmPlayer({ canvas, library, root: '/library/' });
 *   await player.load(film);
 *   await player.play({ audio });   // resolves when the film is over
 *   player.dispose();
 */

export interface FilmPlayerOptions {
  canvas: HTMLCanvasElement;
  library: LibraryManifest;
  /** URL of the library directory (where `library.json` lives). */
  root: string;
  /** Defaults to flashes allowed. */
  settings?: PlayerSettings;
}

export interface PlayOptions {
  /**
   * The engine sound cues go to; its (already unlocked) context also becomes
   * the player clock. Without one the film plays silent on `performance.now`.
   */
  audio?: AudioEngine | null;
  /** Start this many seconds into the film (sound state is caught up, past one-shots are skipped). */
  from?: number;
}

export interface PlayerStats {
  /** Frames per second, smoothed. */
  fps: number;
  /** Shot on screen, or -1. */
  shot: number;
  /** Film time, seconds. */
  time: number;
  /** The shot's asset was not ready in time (a black frame was shown). */
  misses: number;
}

/** Shots preloaded before playback starts. */
const START_READY = 2;

export class FilmPlayer {
  readonly renderer: FilmRenderer;
  /** "Без вспышек" and friends; takes effect on the next `play` or `hold`. */
  settings: PlayerSettings;
  readonly stats: PlayerStats = { fps: 0, shot: -1, time: 0, misses: 0 };
  /** Called after every drawn frame (bench overlays). */
  onFrame: ((frame: FrameState | null) => void) | null = null;

  private readonly assets: AssetCache;
  private film: DreamFilm | null = null;
  private plan: FilmPlan = { cuts: [], scareFlash: [] };
  private cues: SoundCue[] = [];
  private audio: AudioEngine | null = null;
  private clock: PlayerClock = performanceClock();
  private origin = 0;
  /** Film time sound cues have been fired up to. */
  private cueTime = 0;
  private heldAt: number | null = null;
  private windowShot = -1;
  private activeVideo: HTMLVideoElement | null = null;
  private lastFrameMs = 0;
  private finish: (() => void) | null = null;

  constructor(options: FilmPlayerOptions) {
    this.settings = options.settings ?? { noFlash: false };
    this.renderer = new FilmRenderer(options.canvas);
    this.assets = new AssetCache(options.library, options.root, (texture) => this.renderer.prepare(texture));
  }

  get duration(): number {
    return this.film?.duration ?? 0;
  }

  /** Film time now, seconds. */
  get time(): number {
    if (this.heldAt !== null) return this.heldAt;
    return this.clock.now() - this.origin;
  }

  /** Sets the film and waits for the assets of its first shots (from `from`). */
  async load(film: DreamFilm, from = 0): Promise<void> {
    this.stop();
    this.film = film;
    this.cues = expandCues(film.sounds, film.duration);
    const first = shotAt(film.shots, from)?.index ?? 0;
    this.windowShot = first;
    const ids = assetWindow(film.shots, first);
    this.assets.keep(ids);
    await Promise.all(assetWindow(film.shots, first, START_READY - 1, 0).map((id) => this.assets.request(id)));
  }

  /** Plays the loaded film; resolves when it is over (or stopped). */
  play(options: PlayOptions = {}): Promise<void> {
    const film = this.film;
    if (!film) return Promise.reject(new Error('FilmPlayer.play: no film loaded'));
    this.stop();
    this.plan = planFilm(film.shots, this.settings);
    this.audio = options.audio ?? null;
    const context = this.audio?.context;
    this.clock = typeof AudioContext !== 'undefined' && context instanceof AudioContext ? audioClock(context) : performanceClock();
    const from = Math.max(0, Math.min(options.from ?? 0, film.duration));
    this.origin = this.clock.now() - from;
    this.heldAt = null;
    // Catch the sound up to `from`: state cues apply, stale one-shots are skipped.
    this.cueTime = from > 0 ? -Infinity : 0;
    const ended = new Promise<void>((resolve) => (this.finish = resolve));
    this.renderer.renderer.setAnimationLoop(() => this.tick());
    return ended;
  }

  /** Shows one moment of the film, frozen, without sound (benches, screenshots). */
  hold(time: number): void {
    if (!this.film) return;
    this.stop();
    this.plan = planFilm(this.film.shots, this.settings);
    this.heldAt = Math.max(0, Math.min(time, this.film.duration));
    this.renderer.renderer.setAnimationLoop(() => this.tick());
  }

  /** Stops the picture (the last frame stays) and resolves `play`. The audio engine is left as it is. */
  stop(): void {
    this.renderer.renderer.setAnimationLoop(null);
    this.activeVideo?.pause();
    this.activeVideo = null;
    this.finish?.();
    this.finish = null;
  }

  dispose(): void {
    this.stop();
    this.assets.dispose();
    this.renderer.dispose();
  }

  private tick(): void {
    const film = this.film;
    if (!film) return;
    const nowMs = performance.now();
    if (this.lastFrameMs > 0) {
      const dt = Math.max(1, nowMs - this.lastFrameMs);
      this.stats.fps = this.stats.fps === 0 ? 1000 / dt : this.stats.fps * 0.95 + (1000 / dt) * 0.05;
    }
    this.lastFrameMs = nowMs;

    const held = this.heldAt !== null;
    const time = Math.min(this.time, film.duration);
    if (!held) this.fireCues(time);

    const at = shotAt(film.shots, time);
    if (at && at.index !== this.windowShot) {
      this.windowShot = at.index;
      this.assets.keep(assetWindow(film.shots, at.index));
    }
    const loaded = at ? this.assets.get(at.shot.assetId) : undefined;
    if (at && !loaded && time < film.duration) this.stats.misses++;
    this.syncVideo(loaded, at?.local ?? 0, at?.shot.duration ?? 0, held);

    const frame = frameAt(
      film,
      this.plan,
      time,
      this.renderer.aspect,
      loaded ? { aspect: loaded.aspect, depth: loaded.depth !== null } : null,
      this.settings,
    );
    this.renderer.render(frame, loaded?.texture ?? null, loaded?.depth ?? null);
    this.stats.shot = at?.index ?? -1;
    this.stats.time = time;
    this.onFrame?.(frame);

    if (!held && time >= film.duration) this.stop();
  }

  private fireCues(time: number): void {
    const audio = this.audio;
    // Cues go out early by the output latency, so they are heard on their frame.
    const lead = this.clock.latency();
    const to = time + lead;
    if (audio) {
      for (const cue of dueCues(this.cues, this.cueTime, to)) {
        for (const event of cueEvents(cue, this.settings)) audio.handle(event);
      }
    }
    this.cueTime = Math.max(this.cueTime, to);
  }

  /** Plays the clip of the shot on screen in step with the film clock; pauses any other. */
  private syncVideo(loaded: LoadedAsset | undefined, local: number, shotDuration: number, held: boolean): void {
    const video = loaded?.video ?? null;
    if (video !== this.activeVideo) {
      this.activeVideo?.pause();
      this.activeVideo = video;
    }
    if (!video || !loaded) return;
    const clipDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : (loaded.asset.duration ?? 0);
    const playback = clipPlayback(shotDuration, clipDuration);
    const expected = clipTime(local, clipDuration, playback);
    video.loop = playback.loop;
    if (video.playbackRate !== playback.rate) video.playbackRate = playback.rate;
    if (held) {
      if (!video.paused) video.pause();
      if (Math.abs(video.currentTime - expected) > 0.05 && !video.seeking) video.currentTime = expected;
      return;
    }
    let drift = video.currentTime - expected;
    if (playback.loop && clipDuration > 0) drift = ((drift + clipDuration * 1.5) % clipDuration) - clipDuration / 2;
    if (Math.abs(drift) > 0.3 && !video.seeking) video.currentTime = expected;
    if (video.paused) void video.play().catch(() => {});
  }
}
