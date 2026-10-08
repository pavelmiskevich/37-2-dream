import type { SoundCue } from '@dream/core';
import { SOUNDS, type SoundEvent, type SoundId } from '../audio';
import { clamp01, lerp } from './math';
import type { PlayerSettings } from './timeline';

/**
 * The film's sound cues (`SoundCue`) mapped onto the audio engine
 * (`SoundEvent`, D-011). The engine applies events "now", so the player fires
 * each cue on the frame its time is reached on the player clock.
 *
 * Parameters (each 0…1) as `generateFilm` writes them (D-023, header of
 * `packages/dream-core/src/film/sound.ts`): `tempo` — monitor urgency;
 * `rate` — ventilator and breathing; `turbine` and `volume` — the vacuum;
 * `muffle` — the whole mix, on any cue; `strength` and `pitch` (0.5 nominal)
 * — the swing creak; `volume` — the stinger; `depth` — how deep `silence`
 * ducks the mix. The engine has no per-sound volume, so `volume` of the other
 * beds is not applied (only the vacuum and the stinger have one).
 */

/** Breathing rates `rate` 0…1 spans, breaths a minute. */
export const VENTILATOR_RATE = { min: 8, max: 28 } as const;
export const BREATH_RATE = { min: 8, max: 24 } as const;
/** Time between creaks of a swinging swing (a pass of the seat through the bottom). */
export const CREAK_PERIOD = 1.55;
/** A one-shot sound reached this late (a hidden tab, a seek) is skipped, not played. */
export const STALE_HIT = 0.25;

const isSoundId = (sound: string): sound is SoundId => (SOUNDS as readonly string[]).includes(sound);

function paramEvents(sound: SoundId, params: Readonly<Record<string, number>>): SoundEvent[] {
  const events: SoundEvent[] = [];
  const { tempo, rate } = params;
  if (sound === 'monitor' && tempo !== undefined) events.push({ type: 'monitor.intensity', value: clamp01(tempo) });
  if (sound === 'ventilator' && rate !== undefined)
    events.push({ type: 'ventilator.rate', breathsPerMinute: lerp(VENTILATOR_RATE.min, VENTILATOR_RATE.max, clamp01(rate)) });
  if (sound === 'breath' && rate !== undefined)
    events.push({ type: 'breath.rate', breathsPerMinute: lerp(BREATH_RATE.min, BREATH_RATE.max, clamp01(rate)) });
  if (sound === 'vacuum') {
    if (params.turbine !== undefined) events.push({ type: 'vacuum.turbine', value: clamp01(params.turbine) });
    if (params.volume !== undefined) events.push({ type: 'vacuum.volume', value: clamp01(params.volume) });
  }
  return events;
}

/** Engine events for one cue. */
export function cueEvents(cue: SoundCue, settings: PlayerSettings): SoundEvent[] {
  const params = cue.params ?? {};
  const events: SoundEvent[] = [];
  const { sound, action } = cue;

  if (isSoundId(sound)) {
    // Parameters first, so a sound starts already in its new state.
    if (action !== 'stop') events.push(...paramEvents(sound, params));
    if (action === 'start') events.push({ type: 'sound.start', sound });
    else if (action === 'stop') events.push({ type: 'sound.stop', sound });
    else if (action === 'hit' && sound === 'monitor') events.push({ type: 'monitor.beep' });
  } else if (sound === 'swing_creak') {
    if (action === 'hit')
      events.push({
        type: 'swing.creak',
        strength: clamp01(params.strength ?? params.volume ?? 0.7),
        // 0.5 is the nominal pitch; the ends are half an octave down and up.
        pitch: 2 ** (clamp01(params.pitch ?? 0.5) - 0.5),
      });
  } else if (sound === 'stinger') {
    if (action === 'hit' || action === 'start')
      events.push({ type: 'stinger.hit', strength: clamp01(params.strength ?? params.volume ?? 1), soft: settings.noFlash });
  } else if (sound === 'silence') {
    // Silence is the mix falling away (a dread before the scare); stopping it brings the mix back.
    events.push({ type: 'master.volume', value: action === 'stop' ? 1 : 1 - clamp01(params.depth ?? 1) });
  }

  if (params.muffle !== undefined) events.push({ type: 'master.muffle', value: clamp01(params.muffle) });
  return events;
}

/** True for cues that only make sense at their moment (played late they would be wrong). */
export function isHit(cue: SoundCue): boolean {
  return cue.action === 'hit' || (cue.sound === 'stinger' && cue.action === 'start');
}

/**
 * Cues sorted by time with the swing's creaking expanded: `swing_creak`
 * start…stop becomes a hit every `CREAK_PERIOD`, `set` changes its strength.
 * A swing never stopped creaks to the end of the film.
 */
export function expandCues(cues: readonly SoundCue[], duration: number): SoundCue[] {
  const sorted = cues
    .map((cue, order) => ({ cue, order }))
    .sort((a, b) => a.cue.at - b.cue.at || a.order - b.order)
    .map(({ cue }) => cue);
  const out: SoundCue[] = [];
  let swing: { from: number; count: number; params: Readonly<Record<string, number>> } | null = null;
  const creakUntil = (until: number) => {
    if (!swing) return;
    for (let at = swing.from + swing.count * CREAK_PERIOD; at < until - 1e-9; at = swing.from + swing.count * CREAK_PERIOD) {
      out.push({ at, sound: 'swing_creak', action: 'hit', params: swing.params });
      swing.count++;
    }
  };

  for (const cue of sorted) {
    if (cue.sound === 'swing_creak' && cue.action !== 'hit') {
      creakUntil(cue.at);
      if (cue.action === 'start') swing ??= { from: cue.at, count: 0, params: cue.params ?? {} };
      else if (cue.action === 'set' && swing) swing.params = { ...swing.params, ...cue.params };
      else if (cue.action === 'stop') swing = null;
      continue;
    }
    out.push(cue);
  }
  creakUntil(duration);
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Cues to fire when the clock moves from `from` to `to` (`[from, to)`, cues
 * sorted by time). Hits reached more than `STALE_HIT` late are dropped; state
 * cues (start, stop, set) always apply, so after a stall or a seek the mix is
 * what the film expects.
 */
export function dueCues(cues: readonly SoundCue[], from: number, to: number): SoundCue[] {
  const due: SoundCue[] = [];
  for (const cue of cues) {
    if (cue.at >= to) break;
    if (cue.at < from) continue;
    if (isHit(cue) && to - cue.at > STALE_HIT) continue;
    due.push(cue);
  }
  return due;
}
