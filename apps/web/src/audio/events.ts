import type { LayerName } from './layers';

export const SOUNDS = ['monitor', 'ventilator', 'vacuum', 'hum'] as const;
export type SoundId = (typeof SOUNDS)[number];

/** Layer a sound plays in unless its start event says otherwise. */
export const DEFAULT_SOUND_LAYER: Readonly<Record<SoundId, LayerName>> = {
  monitor: 'recurring',
  ventilator: 'recurring',
  vacuum: 'recurring',
  hum: 'ambient',
};

/**
 * Sound events. The simulation emits them (never the renderer); the engine
 * turns them into Web Audio. Times are "now": the engine applies an event as
 * soon as it receives it. Fades are in seconds; omitted fades use per-sound
 * defaults that are long enough to never click.
 */
export type SoundEvent =
  /** Starts a sound, or resumes it (monitor after silence). Moving a playing sound to another layer crossfades it. */
  | { type: 'sound.start'; sound: SoundId; layer?: LayerName; fade?: number }
  | { type: 'sound.stop'; sound: SoundId; fade?: number }
  /** Monitor tempo and urgency, 0 (calm "пип… пип…") … 1 ("ПИППИППИП"). */
  | { type: 'monitor.intensity'; value: number }
  /** Cuts the beeping after the critical moment; the next `sound.start` resumes it. */
  | { type: 'monitor.silence' }
  /** One lone "пип." — works whether the monitor is playing or not. */
  | { type: 'monitor.beep' }
  | { type: 'ventilator.rate'; breathsPerMinute: number }
  /**
   * One "скрип" of the yard swing, played at once in the location layer.
   * `strength` 0…1 follows the swing's amplitude; `pitch` is the scene's
   * `swingCreakPitch` (1 = nominal).
   */
  | { type: 'swing.creak'; strength: number; pitch?: number }
  /** Vacuum → turbine, 0…1. */
  | { type: 'vacuum.turbine'; value: number }
  | { type: 'layer.volume'; layer: LayerName; value: number }
  | { type: 'master.volume'; value: number };
