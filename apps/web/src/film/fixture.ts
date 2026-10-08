import {
  createSeededRng,
  DREAM_TEMPERATURE,
  ENGINE_VERSION,
  generateProfile,
  profileRng,
  streamKey,
  type CameraMove,
  type CutKind,
  type DreamFilm,
  type DreamLength,
  type DreamSeed,
  type FilmLook,
  type LibraryAsset,
  type LibraryManifest,
  type Shot,
  type SoundCue,
} from '@dream/core';

/**
 * A hand-cut test film for the player bench (`?sandbox=film`) until the real
 * edit list (`generateFilm`, #37) lands. It is not a dream generator: the
 * 37-second template below has every kind of cut, one scare with its
 * build-up, camera moves and sound cues; the seed only jitters framing and
 * look. The long film is the template four times, scaring twice.
 */

type Role = 'wide' | 'clip' | 'woman' | 'swing' | 'scare';

interface TemplateShot {
  role: Role;
  duration: number;
  camera: CameraMove;
  parallax: number;
  look: FilmLook;
  cutOut: CutKind;
  cutDuration: number;
}

const move = (
  kind: CameraMove['kind'],
  zoom: [number, number],
  panFrom: [number, number],
  panTo: [number, number],
  sway: number,
): CameraMove => ({ kind, zoomFrom: zoom[0], zoomTo: zoom[1], panFrom, panTo, sway });

const look = (grain: number, flicker: number, blur: number, vignette: number, fever: number): FilmLook => ({
  grain,
  flicker,
  blur,
  vignette,
  fever,
});

/** 37 seconds. Framings are tuned to the dev frame (docs/concept/yard-night): the woman right, the swing left. */
const TEMPLATE: readonly TemplateShot[] = [
  { role: 'wide', duration: 6.5, camera: move('push', [1, 1.14], [0, 0], [0.06, 0.03], 0.15), parallax: 0.9, look: look(0.45, 0.35, 0.1, 0.55, 0.1), cutOut: 'fade', cutDuration: 1.2 },
  { role: 'clip', duration: 6, camera: move('drift', [1.04, 1.08], [-0.08, 0], [0.08, 0], 0.2), parallax: 0, look: look(0.5, 0.5, 0.15, 0.6, 0.2), cutOut: 'blink', cutDuration: 0.9 },
  { role: 'woman', duration: 6.5, camera: move('drift', [1.9, 2.05], [0.33, 0.2], [0.31, 0.12], 0.35), parallax: 0.8, look: look(0.55, 0.4, 0.2, 0.65, 0.35), cutOut: 'flash', cutDuration: 0.5 },
  { role: 'swing', duration: 7.8, camera: move('sway', [1.55, 1.6], [-0.42, 0.06], [-0.38, 0.06], 0.5), parallax: 1, look: look(0.6, 0.45, 0.2, 0.7, 0.5), cutOut: 'fade', cutDuration: 0.8 },
  { role: 'scare', duration: 0.25, camera: move('push', [3, 3.3], [0.34, -0.06], [0.34, -0.06], 0), parallax: 0.3, look: look(0.8, 1, 0.1, 0.8, 0.9), cutOut: 'hard', cutDuration: 0 },
  { role: 'wide', duration: 9.95, camera: move('pull', [1.35, 1], [0.12, 0.06], [0, 0], 0.25), parallax: 0.9, look: look(0.55, 0.6, 0.15, 0.65, 0.7), cutOut: 'blink', cutDuration: 1.6 },
];

const TEMPLATE_LENGTH = TEMPLATE.reduce((sum, shot) => sum + shot.duration, 0);
/** Index of the scare in the template; outside scaring passes it is a false alarm. */
const SCARE_SHOT = TEMPLATE.findIndex((shot) => shot.role === 'scare');
const FALSE_ALARM_DURATION = 1.25;

/** Sound of one pass of the template; times from its start. */
const TEMPLATE_SOUNDS: readonly SoundCue[] = [
  { at: 0, sound: 'hum', action: 'start' },
  { at: 0, sound: 'breath', action: 'start', params: { rate: 0.45 } },
  { at: 1, sound: 'monitor', action: 'start', params: { tempo: 0.1 } },
  // The ventilator comes in before the picture changes: sound predicts the cut.
  { at: 5.5, sound: 'ventilator', action: 'start', params: { rate: 0.35 } },
  { at: 6.5, sound: 'breath', action: 'stop' },
  { at: 11, sound: 'vacuum', action: 'start', params: { turbine: 0.1, volume: 0.6 } },
  { at: 17, sound: 'vacuum', action: 'set', params: { turbine: 0.7, volume: 0.9 } },
  { at: 19, sound: 'swing_creak', action: 'start', params: { strength: 0.6 } },
  { at: 19, sound: 'vacuum', action: 'set', params: { turbine: 0.3, volume: 0.4 } },
  { at: 22, sound: 'monitor', action: 'set', params: { tempo: 0.55 } },
  { at: 25.2, sound: 'swing_creak', action: 'stop' },
  { at: 25.2, sound: 'silence', action: 'start', params: { depth: 0.92 } },
  { at: 26.8, sound: 'stinger', action: 'hit', params: { volume: 1 } },
  { at: 26.8, sound: 'silence', action: 'stop' },
  { at: 27.1, sound: 'monitor', action: 'set', params: { tempo: 0.9 } },
  { at: 27.1, sound: 'vacuum', action: 'set', params: { turbine: 1, volume: 1 } },
  { at: 31, sound: 'ventilator', action: 'set', params: { rate: 0.7 } },
  { at: 34, sound: 'hum', action: 'set', params: { muffle: 0.6 } },
  { at: 36.5, sound: 'vacuum', action: 'stop' },
];

interface Cast {
  wide: LibraryAsset[];
  clip: LibraryAsset | undefined;
  scare: LibraryAsset | undefined;
}

function castOf(manifest: LibraryManifest): Cast {
  const stills = manifest.assets.filter((asset) => asset.kind === 'still');
  const calm = stills.filter((asset) => asset.tags.mood !== 'scare');
  return {
    wide: calm.length > 0 ? calm : stills,
    clip: manifest.assets.find((asset) => asset.kind === 'clip'),
    scare: stills.find((asset) => asset.tags.mood === 'scare') ?? calm[0],
  };
}

const jitter = (value: number, amount: number, rng: { range(min: number, max: number): number }) =>
  value + rng.range(-amount, amount);

/** The test film for `seed` and `length` over `manifest` (needs at least one still). */
export function fixtureFilm(seed: DreamSeed, length: DreamLength, manifest: LibraryManifest): DreamFilm {
  const cast = castOf(manifest);
  if (cast.wide.length === 0) throw new Error('The library has no stills to cut a film from');
  const rng = createSeededRng(streamKey(seed, 'film-fixture'));
  const passes = length === 'short' ? 1 : 4;
  const shots: Shot[] = [];
  const sounds: SoundCue[] = [];
  let start = 0;
  let still = rng.int(0, cast.wide.length - 1);

  for (let pass = 0; pass < passes; pass++) {
    const passStart = start;
    // Short film: the one scare. Long: passes 2 and 4 scare, 1 and 3 are false alarms.
    const scares = length === 'short' || pass % 2 === 1;
    TEMPLATE.forEach((template, i) => {
      const falseAlarm = i === SCARE_SHOT && !scares;
      let asset: LibraryAsset;
      if (template.role === 'clip' && cast.clip) asset = cast.clip;
      else if (template.role === 'scare' && scares && cast.scare) asset = cast.scare;
      else if (template.role === 'woman' || template.role === 'swing' || template.role === 'scare') asset = cast.wide[still]!;
      else asset = cast.wide[(still = (still + 1) % cast.wide.length)]!;
      const duration = falseAlarm ? FALSE_ALARM_DURATION : template.duration;
      const camera = template.camera;
      const pan = (p: readonly [number, number]): [number, number] => [jitter(p[0], 0.03, rng), jitter(p[1], 0.03, rng)];
      shots.push({
        index: shots.length,
        assetId: asset.id,
        start,
        duration,
        camera: { ...camera, panFrom: pan(camera.panFrom), panTo: pan(camera.panTo) },
        parallax: template.parallax,
        look: { ...template.look, fever: Math.min(1, template.look.fever + pass * 0.08) },
        cutOut: template.cutOut,
        cutDuration: template.cutDuration,
        scare: template.role === 'scare' && scares,
      });
      start += duration;
    });
    const stretch = (start - passStart) / TEMPLATE_LENGTH;
    for (const cue of TEMPLATE_SOUNDS) {
      if (cue.sound === 'stinger' && !scares) continue;
      sounds.push({ ...cue, at: passStart + cue.at * stretch });
    }
  }

  return {
    engineVersion: ENGINE_VERSION,
    seed,
    length,
    duration: start,
    profile: generateProfile(profileRng(seed)),
    shots,
    sounds,
    intrusions: [{ motif: 'vacuum', at: 11 }],
    awakening: { reason: 'unknown', temperature: DREAM_TEMPERATURE },
  };
}
