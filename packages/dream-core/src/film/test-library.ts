/**
 * A made-up library manifest for the film tests, shaped like the first slice's
 * library (vision, "Первый срез v2"): ~30 stills over every location, a few
 * clips and scare frames. Not part of the public API; the real manifest lives
 * in the web app.
 */
import type { AssetTags, LibraryAsset, LibraryManifest, LocationTag, MoodTag, MotifTag, PeopleTag, TimeTag } from './library';

type Row = [id: string, location: LocationTag, motifs: MotifTag[], people: PeopleTag, mood: MoodTag, time: TimeTag];

const STILLS: readonly Row[] = [
  ['yard-night-swing', 'yard', ['swing'], 'none', 'uneasy', 'night'],
  ['yard-dusk-empty', 'yard', [], 'none', 'calm', 'dusk'],
  ['yard-day-pigeons', 'yard', ['pigeons'], 'distant', 'calm', 'day'],
  ['yard-night-vacuum', 'yard', ['vacuum_woman'], 'distant', 'dread', 'night'],
  ['stairwell-dark', 'stairwell', [], 'none', 'uneasy', 'night'],
  ['stairwell-vacuum', 'stairwell', ['vacuum_woman'], 'distant', 'dread', 'interior'],
  ['stairwell-mailboxes', 'stairwell', [], 'none', 'calm', 'interior'],
  ['stairs-endless', 'stairs', [], 'none', 'dread', 'interior'],
  ['stairs-down', 'stairs', [], 'distant', 'uneasy', 'interior'],
  ['hospital-corridor-empty', 'hospital_corridor', [], 'none', 'uneasy', 'interior'],
  ['hospital-corridor-ventilator', 'hospital_corridor', ['ventilator'], 'none', 'dread', 'interior'],
  ['hospital-monitor', 'hospital_corridor', ['monitor'], 'none', 'uneasy', 'night'],
  ['hospital-corridor-figure', 'hospital_corridor', [], 'distant', 'dread', 'night'],
  ['thermometer-corridor', 'thermometer_corridor', ['thermometer'], 'none', 'uneasy', 'interior'],
  ['thermometer-corridor-far', 'thermometer_corridor', ['thermometer'], 'distant', 'dread', 'interior'],
  ['jam-jar-inside', 'jam_jar', [], 'none', 'uneasy', 'interior'],
  ['jam-jar-shelf', 'jam_jar', [], 'none', 'calm', 'day'],
  ['bedroom-bed', 'bedroom', [], 'none', 'calm', 'night'],
  ['bedroom-will', 'bedroom', ['will_papers'], 'none', 'uneasy', 'night'],
  ['bedroom-monitor', 'bedroom', ['monitor', 'ventilator'], 'none', 'dread', 'night'],
  ['kitchen-kettle', 'kitchen', [], 'none', 'calm', 'day'],
  ['kitchen-night', 'kitchen', [], 'distant', 'uneasy', 'night'],
  ['elevator-open', 'elevator', [], 'none', 'uneasy', 'interior'],
  ['elevator-face', 'elevator', [], 'face', 'dread', 'interior'],
  ['yard-face-window', 'yard', [], 'face', 'dread', 'night'],
];

const CLIPS: readonly (readonly [...Row, number])[] = [
  ['clip-swing-sways', 'yard', ['swing'], 'none', 'dread', 'night', 4],
  ['clip-corridor-lights', 'hospital_corridor', ['monitor'], 'none', 'uneasy', 'interior', 3],
];

const SCARES: readonly Row[] = [
  ['scare-face', 'stairwell', [], 'face', 'scare', 'night'],
  ['scare-vacuum-woman', 'yard', ['vacuum_woman'], 'face', 'scare', 'night'],
  ['scare-monitor', 'hospital_corridor', ['monitor'], 'none', 'scare', 'interior'],
];

function asset([id, location, motifs, people, mood, time]: Row, index: number, clipSeconds?: number): LibraryAsset {
  const tags: AssetTags = { location, motifs, people, mood, time };
  return {
    id,
    kind: clipSeconds === undefined ? 'still' : 'clip',
    file: `${clipSeconds === undefined ? 'stills' : 'clips'}/${id}.${clipSeconds === undefined ? 'webp' : 'mp4'}`,
    // Every other asset has a depth map, so both cases are covered.
    ...(index % 2 === 0 ? { depth: `depth/${id}.png` } : {}),
    width: 1344,
    height: 768,
    ...(clipSeconds === undefined ? {} : { duration: clipSeconds }),
    tags,
    generation: {
      model: 'Tongyi-MAI/Z-Image-Turbo',
      license: 'Apache-2.0',
      prompt: `test frame ${id}`,
      seed: 1000 + index,
      source: 'test',
    },
  };
}

export const TEST_LIBRARY: LibraryManifest = {
  version: 1,
  assets: [
    ...STILLS.map((row, i) => asset(row, i)),
    ...CLIPS.map(([...row], i) => asset(row.slice(0, 6) as Row, STILLS.length + i, row[6] as number)),
    ...SCARES.map((row, i) => asset(row, STILLS.length + CLIPS.length + i)),
  ],
};

/** The same library without scare frames. */
export const TEST_LIBRARY_NO_SCARES: LibraryManifest = {
  version: 1,
  assets: TEST_LIBRARY.assets.filter((a) => a.tags.mood !== 'scare'),
};
