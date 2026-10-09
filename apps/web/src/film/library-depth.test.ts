import type { LibraryManifest } from '@dream/core';
import { describe, expect, it } from 'vitest';
import manifestJson from '../../public/library/library.json?raw';

/**
 * Every still of the project library has a depth map (#36, D-028): an 8-bit
 * greyscale PNG, half the frame in each dimension. Reads only files of the
 * repository — the model that makes the maps (`tools/depth`) is not needed.
 */
const manifest = JSON.parse(manifestJson) as LibraryManifest;

// Depth maps as data URLs, keyed by their path relative to the library root.
const LIBRARY = '../../public/library/';
const files = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../../public/library/depth/*.png', { query: '?inline', import: 'default', eager: true }),
  ).map(([path, url]) => [path.slice(LIBRARY.length), url]),
);

function bytesOf(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The IHDR chunk: it always comes first, right after the signature. */
function pngHeader(bytes: Uint8Array) {
  expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  expect(String.fromCharCode(...bytes.subarray(12, 16))).toBe('IHDR');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20), bitDepth: view.getUint8(24), colourType: view.getUint8(25) };
}

describe('depth maps of the library', () => {
  const stills = manifest.assets.filter((asset) => asset.kind === 'still');

  it('has stills to check', () => {
    expect(stills.length).toBeGreaterThan(0);
  });

  it.each(stills.map((asset) => [asset.id, asset] as const))('%s has a half-size greyscale depth map', (_id, asset) => {
    expect(asset.depth, 'no depth in the manifest: run tools/depth').toBeDefined();
    const name = asset.file.split('/').pop()!.replace(/\.[^.]+$/, '');
    expect(asset.depth).toBe(`depth/${name}.png`);
    const url = files[asset.depth!];
    expect(url, `${asset.depth} is not in the repository`).toBeDefined();
    expect(pngHeader(bytesOf(url!))).toEqual({
      width: Math.round(asset.width / 2),
      height: Math.round(asset.height / 2),
      bitDepth: 8,
      colourType: 0,
    });
  });

  it('has no depth map without a frame', () => {
    const used = new Set(manifest.assets.map((asset) => asset.depth));
    expect(Object.keys(files).filter((file) => !used.has(file))).toEqual([]);
  });

  it('leaves clips flat', () => {
    for (const asset of manifest.assets) if (asset.kind === 'clip') expect(asset.depth).toBeUndefined();
  });
});
