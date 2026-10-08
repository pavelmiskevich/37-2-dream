import { generateFilm, normalizeSeed, type LibraryManifest } from '@dream/core';
import { describe, expect, it } from 'vitest';
import { TEST_LIBRARY } from '../../../../packages/dream-core/src/film/test-library';
import framesJson from '../../public/film-fixture/library.json?raw';
import { devLibrary } from './dev-library';

const frames = JSON.parse(framesJson) as LibraryManifest;

describe('devLibrary', () => {
  const library = devLibrary(TEST_LIBRARY, frames);

  it('keeps every template id and tag, pointing at files that exist', () => {
    expect(library.assets.map((asset) => asset.id)).toEqual(TEST_LIBRARY.assets.map((asset) => asset.id));
    const files = new Set(frames.assets.map((asset) => asset.file));
    for (const [i, asset] of library.assets.entries()) {
      expect(asset.tags).toEqual(TEST_LIBRARY.assets[i]!.tags);
      expect(files.has(asset.file)).toBe(true);
    }
  });

  it('matches kind and location where it can', () => {
    const clip = library.assets.find((asset) => asset.id === 'clip-swing-sways')!;
    expect(clip.kind).toBe('clip');
    expect(clip.file).toBe('clips/yard-night-drift.mp4');
    const yard = library.assets.find((asset) => asset.id === 'yard-night-swing')!;
    expect(yard.depth).toBe('depth/yard-night.png');
  });

  it('is enough for generateFilm to cut a full film', () => {
    const film = generateFilm(normalizeSeed('DREAM-8F72-A19C-37B2'), 'short', library);
    expect(film.duration).toBeCloseTo(37, 6);
    const ids = new Set(library.assets.map((asset) => asset.id));
    for (const shot of film.shots) expect(ids.has(shot.assetId)).toBe(true);
  });
});
