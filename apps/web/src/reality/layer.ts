import { awakeningPhase, type Dream } from '@dream/core';
import type { AudioEngine, SoundEvent } from '../audio';
import type { FrameView } from '../loop';
import { vacuumSighting, type VacuumSighting } from './sightings';
import { VACUUM_LAYER, VACUUM_OFF, vacuumMixAt, type VacuumMix } from './vacuum';

/** Smallest change of the turbine or the volume worth an event; the voice glides between them. */
export const VACUUM_STEP = 0.01;

/**
 * Events that take the vacuum from `sent` (what the engine was last told;
 * null before the first frame) to `next`, and what the engine knows after
 * them. Small changes are held back until they add up to `VACUUM_STEP`.
 * Parameters go before a start, so the voice starts where it should be.
 */
export function vacuumEvents(sent: VacuumMix | null, next: VacuumMix): { events: SoundEvent[]; sent: VacuumMix } {
  const was = sent ?? VACUUM_OFF;
  if (!next.on) {
    const events: SoundEvent[] = was.on ? [{ type: 'sound.stop', sound: 'vacuum', fade: VACUUM_LAYER.fadeOut }] : [];
    return { events, sent: { ...was, on: false } };
  }
  const events: SoundEvent[] = [];
  const turbine = !was.on || Math.abs(next.turbine - was.turbine) >= VACUUM_STEP;
  const volume = !was.on || Math.abs(next.volume - was.volume) >= VACUUM_STEP;
  if (turbine) events.push({ type: 'vacuum.turbine', value: next.turbine });
  if (volume) events.push({ type: 'vacuum.volume', value: next.volume });
  if (!was.on) events.push({ type: 'sound.start', sound: 'vacuum', fade: VACUUM_LAYER.fadeIn });
  return {
    events,
    sent: { on: true, turbine: turbine ? next.turbine : was.turbine, volume: volume ? next.volume : was.volume },
  };
}

/** The vacuum layer of the scene runtime: one per dream, across every scene. */
export interface VacuumLayer {
  update(frame: FrameView): void;
  /** Stops the vacuum. */
  dispose(): void;
}

/**
 * Plays the vacuum through the whole dream (D-020). The runtime calls it every
 * frame; it follows the scene, the time in it and the sightings of the
 * source, and sends the engine only what changed.
 */
export function createVacuumLayer(dream: Dream, audio: AudioEngine): VacuumLayer {
  let sent: VacuumMix | null = null;
  let sightingScene = -1;
  let sighting: VacuumSighting | null = null;

  return {
    update(frame) {
      const scene = dream.scenes[frame.sceneIndex];
      if (frame.sceneIndex !== sightingScene) {
        sightingScene = frame.sceneIndex;
        sighting = scene ? vacuumSighting(dream, scene) : null;
      }
      const phase = scene?.id === 'awakening' ? awakeningPhase(frame.state) : null;
      const next = vacuumMixAt(dream, frame.sceneIndex, frame.sceneTime, phase, sighting?.(frame.sceneTime) ?? 0);
      const result = vacuumEvents(sent, next);
      for (const event of result.events) audio.handle(event);
      sent = result.sent;
    },
    dispose() {
      if (sent?.on) audio.handle({ type: 'sound.stop', sound: 'vacuum', fade: VACUUM_LAYER.fadeOut });
      sent = null;
    },
  };
}
