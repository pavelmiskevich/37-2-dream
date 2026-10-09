#!/usr/bin/env node
// Depth maps for the stills of the dream library (#36, D-028).
//
//   node depth.mjs [--library <dir>] [--force] [--only <id>] [--threads 2]
//                  [--rest 15] [--pause-at 80] [--resume-at 70] [--no-thermal-guard]
//
// For every still of `library.json` without a valid depth map: runs Depth
// Anything V2 Small on the CPU, writes `depth/<name>.png` (8-bit greyscale,
// half the frame, bright = near) and adds `"depth"` to the asset.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { depthPath, depthSize, setDepthInText } from './manifest.mjs';
import { encodeGreyPng, readPngHeader } from './png.mjs';
import { readTemperature, waitUntilCool } from './thermal.mjs';

/** ONNX weights of depth-anything/Depth-Anything-V2-Small for transformers.js. */
export const MODEL_ID = 'onnx-community/depth-anything-v2-small';
export const MODEL_REVISION = 'main';
export const MODEL_LICENSE = 'Apache-2.0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LIBRARY = path.resolve(HERE, '../../apps/web/public/library');
const MANIFEST_NAME = 'library.json';

function parseCli() {
  const { values } = parseArgs({
    options: {
      library: { type: 'string', default: DEFAULT_LIBRARY },
      force: { type: 'boolean', default: false },
      only: { type: 'string', multiple: true, default: [] },
      threads: { type: 'string', default: '2' },
      rest: { type: 'string', default: '15' },
      'pause-at': { type: 'string', default: '80' },
      'resume-at': { type: 'string', default: '70' },
      'no-thermal-guard': { type: 'boolean', default: false },
      revision: { type: 'string', default: MODEL_REVISION },
    },
  });
  const number = (name, min) => {
    const value = Number(values[name]);
    if (!Number.isFinite(value) || value < min) throw new Error(`--${name} must be a number ≥ ${min}`);
    return value;
  };
  const options = {
    library: path.resolve(values.library),
    force: values.force,
    only: new Set(values.only),
    threads: Math.floor(number('threads', 1)),
    rest: number('rest', 0),
    pauseAt: number('pause-at', 1),
    resumeAt: number('resume-at', 1),
    thermalGuard: !values['no-thermal-guard'],
    revision: values.revision,
  };
  if (options.resumeAt >= options.pauseAt) throw new Error('--resume-at must be below --pause-at');
  return options;
}

/** A depth map that is already there and has the right shape. */
function hasValidDepth(library, asset) {
  if (!asset.depth) return false;
  const file = path.join(library, asset.depth);
  if (!existsSync(file)) return false;
  const header = readPngHeader(readFileSync(file));
  const size = depthSize(asset);
  return header !== null && header.width === size.width && header.height === size.height;
}

function writeAtomic(file, data) {
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, data);
  renameSync(temporary, file);
}

async function main() {
  const options = parseCli();
  const manifestPath = path.join(options.library, MANIFEST_NAME);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const stills = manifest.assets.filter((asset) => asset.kind === 'still');
  const todo = stills.filter(
    (asset) => (options.only.size === 0 || options.only.has(asset.id)) && (options.force || !hasValidDepth(options.library, asset)),
  );
  console.log(`${stills.length} stills in ${manifestPath}, ${todo.length} need a depth map`);
  if (todo.length === 0) return;

  // Be a quiet neighbour: other work runs on the same laptop.
  try {
    os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {
    // Not fatal: the thread limit still holds.
  }
  const guard = async () => {
    if (!options.thermalGuard) return (await readTemperature()) ?? Number.NaN;
    return waitUntilCool({ pauseAt: options.pauseAt, resumeAt: options.resumeAt });
  };
  await guard();

  // Loaded only now, so `--help`-like failures and no-op runs never touch the model.
  const { env, pipeline, RawImage } = await import('@huggingface/transformers');
  env.cacheDir = path.join(HERE, '.cache');
  const estimator = await pipeline('depth-estimation', MODEL_ID, {
    revision: options.revision,
    device: 'cpu',
    dtype: 'fp32',
    session_options: { intraOpNumThreads: options.threads, interOpNumThreads: 1 },
  });
  console.log(`Model ${MODEL_ID}@${options.revision} (${MODEL_LICENSE}), CPU, ${options.threads} threads`);

  mkdirSync(path.join(options.library, 'depth'), { recursive: true });
  let peak = Number.NEGATIVE_INFINITY;
  const started = performance.now();
  for (const [index, asset] of todo.entries()) {
    if (index > 0 && options.rest > 0) await sleep(options.rest * 1000);
    const before = await guard();
    const frameStarted = performance.now();

    const image = await RawImage.read(path.join(options.library, asset.file));
    if (image.width !== asset.width || image.height !== asset.height) {
      throw new Error(`${asset.id}: the file is ${image.width}x${image.height}, the manifest says ${asset.width}x${asset.height}`);
    }
    // `depth` is the prediction resized to the frame and normalised to 0…255.
    const { depth } = await estimator(image);
    const size = depthSize(asset);
    const small = await depth.resize(size.width, size.height);
    if (small.channels !== 1) throw new Error(`${asset.id}: expected a one-channel depth map, got ${small.channels}`);
    const relative = depthPath(asset);
    writeAtomic(
      path.join(options.library, relative),
      encodeGreyPng(small.data, size.width, size.height, {
        Software: '37.2 Dream tools/depth',
        Source: asset.file,
        Model: `${MODEL_ID}@${options.revision}`,
        License: MODEL_LICENSE,
      }),
    );
    // Re-read: the manifest may have changed while the model was running.
    writeAtomic(manifestPath, setDepthInText(readFileSync(manifestPath, 'utf8'), asset.file, relative));

    const after = (await readTemperature()) ?? Number.NaN;
    peak = Math.max(peak, before, after);
    const seconds = (performance.now() - frameStarted) / 1000;
    console.log(
      `[${index + 1}/${todo.length}] ${asset.id} → ${relative} ${size.width}x${size.height}, ${seconds.toFixed(1)} s, ${before.toFixed(1)} → ${after.toFixed(1)} °C`,
    );
  }
  const total = (performance.now() - started) / 1000;
  console.log(`Done: ${todo.length} depth maps in ${total.toFixed(0)} s, peak ${Number.isFinite(peak) ? `${peak.toFixed(1)} °C` : 'unknown'}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
