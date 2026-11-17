import {
  LOCATION_TAGS,
  MOOD_TAGS,
  MOTIF_TAGS,
  PEOPLE_TAGS,
  TIME_TAGS,
  createSeededRng,
  generateFilm,
  isWakingFrame,
  normalizeSeed,
  seedFromEntropy,
  type LibraryManifest,
} from '@dream/core';
import { describe, expect, it } from 'vitest';
import catalogJson from '../../../../tools/generation/prompts.json?raw';
import manifestJson from '../../public/library/library.json?raw';
import { wakingFrame } from '../dream/waking';

/**
 * The project library (#35): the manifest is valid, every frame has its file,
 * tags of the vocabulary and a licence that allows publishing (AGENTS.md).
 * Reads only files of the repository.
 */
const manifest = JSON.parse(manifestJson) as LibraryManifest;

const LIBRARY = '../../public/library/';
const files = new Set(
  Object.keys(import.meta.glob('../../public/library/{stills,clips}/*', { query: '?url', import: 'default' })).map((path) =>
    path.slice(LIBRARY.length),
  ),
);

/** The prompt catalog of tools/generation (#91): every still is generated from one of its scenes. */
interface CatalogScene {
  id: string;
  scene: string;
  seed?: number;
  style?: string;
}
const catalog = JSON.parse(catalogJson) as { style: string; scenes: CatalogScene[] };

/** `Scene.prompt` of generate.py: the scene without a trailing '.'/' ', then its style. */
function catalogPrompt(scene: CatalogScene): string {
  return `${scene.scene.replace(/[. ]+$/, '')}. ${scene.style ?? catalog.style}`;
}

/** `Scene.generation_seed` of generate.py: explicit seed, or 31 bits of sha256(id). */
async function catalogSeed(scene: CatalogScene): Promise<number> {
  if (scene.seed !== undefined) return scene.seed;
  const digest = new DataView(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(scene.id)));
  return digest.getUint32(0) & 0x7fffffff;
}

/** Licences that allow commercial use; the models of the project are all Apache-2.0. */
const LICENSES = ['Apache-2.0'];

describe('library manifest', () => {
  it('is a version 1 manifest with unique ids and files', () => {
    expect(manifest.version).toBe(1);
    expect(manifest.assets.length).toBeGreaterThan(0);
    expect(new Set(manifest.assets.map((asset) => asset.id)).size).toBe(manifest.assets.length);
    expect(new Set(manifest.assets.map((asset) => asset.file)).size).toBe(manifest.assets.length);
  });

  it.each(manifest.assets.map((asset) => [asset.id, asset] as const))('%s is complete', (id, asset) => {
    expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(['still', 'clip']).toContain(asset.kind);
    expect(files, `${asset.file} is not in the repository`).toContain(asset.file);
    // 16:9, the format of the dream.
    expect(asset.width).toBeGreaterThan(0);
    expect(asset.width * 9).toBe(asset.height * 16);
    if (asset.kind === 'clip') expect(asset.duration).toBeGreaterThan(0);

    expect(LOCATION_TAGS).toContain(asset.tags.location);
    expect(PEOPLE_TAGS).toContain(asset.tags.people);
    expect(MOOD_TAGS).toContain(asset.tags.mood);
    expect(TIME_TAGS).toContain(asset.tags.time);
    for (const motif of asset.tags.motifs) expect(MOTIF_TAGS).toContain(motif);
    expect(new Set(asset.tags.motifs).size).toBe(asset.tags.motifs.length);

    expect(asset.generation.model).not.toBe('');
    expect(LICENSES).toContain(asset.generation.license);
    expect(asset.generation.prompt.trim()).not.toBe('');
    expect(Number.isInteger(asset.generation.seed)).toBe(true);
    expect(asset.generation.source).not.toBe('');
  });

  it('takes the prompt and seed of every still from the catalog (#91)', async () => {
    const scenes = new Map(catalog.scenes.map((scene) => [scene.id, scene]));
    for (const asset of manifest.assets.filter((a) => a.kind === 'still')) {
      const scene = scenes.get(asset.id);
      expect(scene, `${asset.id} is not in tools/generation/prompts.json`).toBeDefined();
      expect(asset.generation.prompt, asset.id).toBe(catalogPrompt(scene!));
      expect(asset.generation.seed, asset.id).toBe(await catalogSeed(scene!));
    }
  });

  it('has no frame file without an asset', () => {
    const used = new Set(manifest.assets.map((asset) => asset.file));
    expect([...files].filter((file) => !used.has(file))).toEqual([]);
  });

  it('is enough to cut both lengths of a dream', () => {
    for (const length of ['short', 'long'] as const) {
      const film = generateFilm(normalizeSeed('DREAM-8F72-A19C-37B2'), length, manifest);
      expect(film.shots.length).toBeGreaterThan(0);
    }
  });

  it('has a frame to wake up in, and the dream never shows it (D-030)', () => {
    const waking = wakingFrame(manifest);
    expect(waking).not.toBeNull();
    const rng = createSeededRng('test/library-waking-seeds');
    const seeds = [
      normalizeSeed('DREAM-8F72-A19C-37B2'),
      normalizeSeed('DREAM-0000-0000-0000'),
      normalizeSeed('DREAM-C0DE-BEEF-0451'),
      ...Array.from({ length: 200 }, () => seedFromEntropy(Array.from({ length: 6 }, () => rng.int(0, 255)))),
    ];
    const byId = new Map(manifest.assets.map((asset) => [asset.id, asset]));
    for (const seed of seeds) {
      for (const length of ['short', 'long'] as const) {
        const shown = generateFilm(seed, length, manifest).shots.map((shot) => byId.get(shot.assetId)!);
        expect(shown.filter(isWakingFrame).map((asset) => asset.id), `${seed} ${length}`).toEqual([]);
      }
    }
  });
});
