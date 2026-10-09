// Pure helpers over the library manifest (`LibraryManifest`, dream-core film/library.ts).
// The manifest is edited as text: only a `depth` line is added or replaced, so
// the file keeps its formatting and parallel edits (new frames) merge cleanly.

/** Depth maps are half the frame in each dimension (D-028). */
export const DEPTH_SCALE = 0.5;

/**
 * @param {{ width: number, height: number }} asset
 * @returns {{ width: number, height: number }}
 */
export function depthSize(asset) {
  return {
    width: Math.max(1, Math.round(asset.width * DEPTH_SCALE)),
    height: Math.max(1, Math.round(asset.height * DEPTH_SCALE)),
  };
}

/**
 * Path of the depth map relative to the library root: `stills/a.webp` → `depth/a.png`.
 * @param {{ file: string }} asset
 */
export function depthPath(asset) {
  const name = asset.file.split('/').pop().replace(/\.[^.]+$/, '');
  return `depth/${name}.png`;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns the manifest text with `"depth": depth` set on the asset whose
 * `file` is `file`. Nothing else in the text changes.
 * @param {string} text
 * @param {string} file
 * @param {string} depth
 */
export function setDepthInText(text, file, depth) {
  const fileLine = new RegExp(`^([ \\t]*)"file":[ \\t]*${escapeRegExp(JSON.stringify(file))},[ \\t]*(\\r?\\n)`, 'gm');
  const matches = [...text.matchAll(fileLine)];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one "file": ${JSON.stringify(file)} line in the manifest, found ${matches.length}`);
  }
  const match = matches[0];
  const [line, indent, newline] = match;
  const after = match.index + line.length;
  const depthLine = `${indent}"depth": ${JSON.stringify(depth)},${newline}`;
  // An existing depth line right after the file line is replaced.
  const existing = /^[ \t]*"depth":[ \t]*"(?:[^"\\]|\\.)*",[ \t]*\r?\n/.exec(text.slice(after));
  const result = text.slice(0, after) + depthLine + text.slice(after + (existing ? existing[0].length : 0));

  // The edit must be exactly "this asset got this depth".
  const before = JSON.parse(text);
  const expected = {
    ...before,
    assets: before.assets.map((asset) => (asset.file === file ? { ...asset, depth } : asset)),
  };
  const sortKeys = (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : value;
  if (JSON.stringify(JSON.parse(result), sortKeys) !== JSON.stringify(expected, sortKeys)) {
    throw new Error(`Could not set depth of ${JSON.stringify(file)} without touching the rest of the manifest`);
  }
  return result;
}
