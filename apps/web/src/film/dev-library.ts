import type { LibraryAsset, LibraryManifest } from '@dream/core';

/**
 * A stand-in library for the bench while the real one (#35) is not in the
 * app: the ids and tags of a template manifest (the core's test library, so
 * `generateFilm` cuts a real edit with scares and clips), each pointed at the
 * files of the closest frame that does exist (same kind and location, else
 * same kind, else any still).
 */
export function devLibrary(template: LibraryManifest, frames: LibraryManifest): LibraryManifest {
  const stills = frames.assets.filter((asset) => asset.kind === 'still');
  if (stills.length === 0) throw new Error('The dev frames have no stills');
  const pick = (asset: LibraryAsset): LibraryAsset => {
    const sameKind = frames.assets.filter((frame) => frame.kind === asset.kind);
    const pool = sameKind.length > 0 ? sameKind : stills;
    const local = pool.filter((frame) => frame.tags.location === asset.tags.location);
    const choice = local.length > 0 ? local : pool;
    // Spread the template over the matching frames, stably by id.
    let hash = 0;
    for (const char of asset.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return choice[hash % choice.length]!;
  };
  return {
    version: 1,
    assets: template.assets.map((asset) => {
      const frame = pick(asset);
      return {
        id: asset.id,
        tags: asset.tags,
        generation: asset.generation,
        kind: frame.kind,
        file: frame.file,
        ...(frame.depth ? { depth: frame.depth } : {}),
        width: frame.width,
        height: frame.height,
        // The template's length, so the edit uses the clip where it planned to; the player loops it.
        ...(frame.kind === 'clip' ? { duration: asset.duration ?? frame.duration ?? 4 } : {}),
      };
    }),
  };
}
