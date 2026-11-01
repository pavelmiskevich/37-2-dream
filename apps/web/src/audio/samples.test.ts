import { describe, expect, it } from 'vitest';
import catalogJson from '../../../../assets/sounds/openverse.json?raw';
import credits from '../../../../assets/CREDITS.md?raw';
import { SAMPLES, SAMPLE_IDS, samplePlayShape, sampleUrl } from './samples';

/**
 * The recordings of the app (D-032): every file is in `public/sounds/`, comes
 * from the CC0 catalog of Openverse (D-031) and is credited in
 * `assets/CREDITS.md` with the catalog's attribution word for word.
 */
interface CatalogSound {
  foreign_landing_url: string;
  license: string;
  attribution: string;
}
const catalog = JSON.parse(catalogJson) as { sounds: unknown };

function catalogEntries(node: unknown): CatalogSound[] {
  if (Array.isArray(node)) return node.flatMap(catalogEntries);
  if (node && typeof node === 'object') {
    if ('foreign_landing_url' in node) return [node as CatalogSound];
    return Object.values(node).flatMap(catalogEntries);
  }
  return [];
}
const entries = catalogEntries(catalog.sounds);

const SOUNDS_DIR = '../../public/sounds/';
const files = new Set(
  Object.keys(import.meta.glob('../../public/sounds/*', { query: '?url', import: 'default' })).map((path) =>
    path.slice(SOUNDS_DIR.length),
  ),
);

describe('recordings', () => {
  it('have their files, and nothing else lies in public/sounds', () => {
    expect([...files].sort()).toEqual(SAMPLE_IDS.map((id) => SAMPLES[id].file).sort());
    expect(sampleUrl('/sounds/', 'snore')).toBe('/sounds/snore.mp3');
  });

  it.each(SAMPLE_IDS)('%s is a CC0 recording of the catalog, credited word for word', (id) => {
    const entry = entries.find((sound) => sound.foreign_landing_url === SAMPLES[id].source);
    expect(entry, `${SAMPLES[id].source} is in the catalog`).toBeDefined();
    expect(entry?.license).toBe('cc0');
    expect(credits).toContain(`apps/web/public/sounds/${SAMPLES[id].file}`);
    expect(credits).toContain(SAMPLES[id].source);
    expect(credits).toContain(entry?.attribution);
  });
});

describe('samplePlayShape', () => {
  it('plays the whole file by default', () => {
    expect(samplePlayShape(3, {})).toEqual({ offset: 0, duration: 3, fadeIn: 0, fadeOut: 0 });
  });

  it('plays a part of the file, never past its end', () => {
    expect(samplePlayShape(8.6, { offset: 0.8 })).toMatchObject({ offset: 0.8, duration: 7.8 });
    expect(samplePlayShape(3, { offset: 1, duration: 5 })).toMatchObject({ offset: 1, duration: 2 });
    expect(samplePlayShape(3, { offset: 9 })).toMatchObject({ offset: 3, duration: 0 });
    expect(samplePlayShape(3, { offset: -1, duration: -1 })).toMatchObject({ offset: 0, duration: 0 });
  });

  it('never lets the fades overlap', () => {
    const shape = samplePlayShape(1, { fadeIn: 1, fadeOut: 3 });
    expect(shape.fadeIn + shape.fadeOut).toBeCloseTo(1);
    expect(shape.fadeOut).toBeCloseTo(0.75);
  });

  it('loops the whole file until stopped, with no fade out of its own', () => {
    expect(samplePlayShape(19, { loop: true, offset: 4, duration: 2, fadeIn: 1.5, fadeOut: 2 })).toEqual({
      offset: 0,
      duration: Infinity,
      fadeIn: 1.5,
      fadeOut: 0,
    });
  });
});
