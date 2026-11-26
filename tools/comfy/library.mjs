/**
 * Accepted results into the library: a still becomes `stills/<id>.webp`
 * (WebP, quality 82, as generate.py), a clip `clips/<id>.mp4` (D-036: H.264
 * CRF 25, faststart, no sound, 1280×720 from the centre of Wan's 1280×704),
 * each with its `library.json` entry. Depth maps of new stills are computed
 * afterwards by `tools/depth`.
 */

import { execFileSync } from 'node:child_process';

const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE ?? 'ffprobe';

/** Every library frame is 16:9 at this size (library-manifest.test.ts). */
export const LIBRARY_SIZE = { width: 1280, height: 720 };
const STILL_QUALITY = 82;
const CLIP_CRF = 25;

/** Width, height and duration (seconds; 0 for an image) of a picture or video. */
export function probe(file) {
  const out = execFileSync(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration',
    '-of', 'json', file,
  ], { encoding: 'utf8' });
  const info = JSON.parse(out);
  const stream = info.streams?.[0];
  if (!stream) throw new Error(`${file}: no picture in it`);
  const duration = Number(info.format?.duration);
  return { width: stream.width, height: stream.height, duration: Number.isFinite(duration) ? duration : 0 };
}

/** The largest centred 16:9 area of a `width`×`height` frame, even-sized (1280×704 → 1252×704). */
export function crop169(width, height) {
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  if (width * 9 >= height * 16) return { width: even((height * 16) / 9), height: even(height) };
  return { width: even(width), height: even((width * 9) / 16) };
}

function scaleFilter({ width, height }) {
  const area = crop169(width, height);
  return `crop=${area.width}:${area.height},scale=${LIBRARY_SIZE.width}:${LIBRARY_SIZE.height}:flags=lanczos`;
}

/** PNG from ComfyUI → library WebP, 1280×720. */
export function convertStill(src, dst) {
  const size = probe(src);
  execFileSync(FFMPEG, [
    '-v', 'error', '-y', '-i', src,
    ...(size.width === LIBRARY_SIZE.width && size.height === LIBRARY_SIZE.height ? [] : ['-vf', scaleFilter(size)]),
    '-map_metadata', '-1', '-c:v', 'libwebp', '-quality', String(STILL_QUALITY), '-compression_level', '6',
    dst,
  ]);
  return probe(dst);
}

/** MP4 from ComfyUI → library MP4 (D-036). */
export function convertClip(src, dst) {
  const size = probe(src);
  execFileSync(FFMPEG, [
    '-v', 'error', '-y', '-i', src,
    '-vf', scaleFilter(size),
    '-an', '-map_metadata', '-1', '-c:v', 'libx264', '-crf', String(CLIP_CRF), '-preset', 'slow',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    dst,
  ]);
  return probe(dst);
}

/** The library entry of an accepted still; tags from the catalog scene. */
export function stillAsset(job, scene, { width, height }) {
  return {
    id: job.id,
    kind: 'still',
    file: `stills/${job.id}.webp`,
    width,
    height,
    tags: {
      location: scene.tags.location,
      motifs: [...scene.tags.motifs],
      people: scene.tags.people,
      mood: scene.tags.mood,
      time: scene.tags.time,
    },
    generation: { model: job.model, license: job.license, prompt: job.prompt, seed: job.seed, source: 'local-desktop' },
  };
}

/**
 * The library entry of an accepted clip; tags from the still it was made from
 * (D-036), with the clip's own tags from the catalog over them (#151).
 */
export function clipAsset(job, still, { width, height, duration }) {
  return {
    id: job.id,
    kind: 'clip',
    file: `clips/${job.id}.mp4`,
    width,
    height,
    duration: Math.round(duration * 1000) / 1000,
    tags: { ...structuredClone(still.tags), ...structuredClone(job.tags ?? {}) },
    generation: {
      model: job.model,
      license: job.license,
      prompt: job.prompt,
      seed: job.seed,
      source: `local-desktop, from still ${job.from}`,
    },
  };
}

/** The manifest with `asset` in place of the entry of the same id, or added at the end. */
export function upsertAsset(manifest, asset) {
  const at = manifest.assets.findIndex((a) => a.id === asset.id);
  const assets = [...manifest.assets];
  if (at >= 0) assets[at] = asset;
  else assets.push(asset);
  return { ...manifest, assets };
}

/**
 * The catalog text with the scene's `"seed"` set to `seed`, everything else
 * untouched (the catalog is hand-formatted, not re-serialized).
 */
export function setCatalogSeed(text, id, seed) {
  const start = text.indexOf(`"id": "${id}"`);
  if (start < 0) throw new Error(`No scene "${id}" in the catalog`);
  const next = text.indexOf('"id": "', start + 1);
  const end = next < 0 ? text.length : next;
  const block = text.slice(start, end);
  const field = /"seed": \d+/;
  if (!field.test(block)) throw new Error(`Scene "${id}" has no "seed" field to update`);
  return text.slice(0, start) + block.replace(field, `"seed": ${seed}`) + text.slice(end);
}
