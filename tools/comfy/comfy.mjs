#!/usr/bin/env node
/**
 * Stills and clips for the dream library on the PC with the RTX 5070 Ti, from
 * the laptop, through the ComfyUI server API over Tailscale (#147). Nothing
 * but ComfyUI runs on the PC; the laptop only sends jobs and downloads files.
 *
 *   node tools/comfy/comfy.mjs check                     server, GPU, model files
 *   node tools/comfy/comfy.mjs queue still [id[@seed]…]  stills (all missing ones without ids)
 *   node tools/comfy/comfy.mjs queue clip  [id[@seed]…]  clips  (all missing ones without ids)
 *   node tools/comfy/comfy.mjs status                    what is queued, running, done
 *   node tools/comfy/comfy.mjs fetch [--wait]            download finished results to --out
 *   node tools/comfy/comfy.mjs free                      unload models (between stills and clips)
 *   node tools/comfy/comfy.mjs import <id_seed>…         accepted results into the library
 *
 * Options: --url (or COMFY_URL), --out, --library, --variants N (seeds per job:
 * +1 for stills, +10 for clips), --force (queue again what is already queued).
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ComfyClient, entryState, outputFiles } from './api.mjs';
import { clipJobs, parseTarget, readJson, readQueue, resultName, stillJobs, withVariants, writeJsonAtomic } from './jobs.mjs';
import { clipAsset, convertClip, convertStill, setCatalogSeed, stillAsset, upsertAsset } from './library.mjs';
import { buildClip, buildStill, modelFiles, readWorkflow } from './workflows.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
/** The PC in the owner's Tailscale network; ComfyUI Desktop listens on 8000 by default. */
export const DEFAULT_URL = 'http://100.105.208.82:8000';
const STILL_CATALOG = join(REPO, 'tools/generation/prompts.json');
const CLIP_CATALOG = join(HERE, 'clips.json');
const WORKFLOWS = { still: join(HERE, 'workflows/still.json'), clip: join(HERE, 'workflows/clip.json') };
/** Subfolder of ComfyUI's `input` and `output` the jobs use. */
const SUBFOLDER = 'dream';
const POLL_MS = 15_000;

const USAGE = `Usage: node tools/comfy/comfy.mjs <check|queue still|queue clip|status|fetch|free|import> [ids…] [options]
  --url <http://host:port>  ComfyUI server (COMFY_URL, default ${DEFAULT_URL})
  --out <dir>               results and queue.json (default tools/comfy/out)
  --library <dir>           library root (default apps/web/public/library)
  --variants <n>            seeds per job (+1 for stills, +10 for clips)
  --force                   queue again jobs already queued
  --wait                    fetch: wait until the queue is done`;

function options(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      url: { type: 'string', default: process.env.COMFY_URL ?? DEFAULT_URL },
      out: { type: 'string', default: join(HERE, 'out') },
      library: { type: 'string', default: join(REPO, 'apps/web/public/library') },
      variants: { type: 'string', default: '1' },
      force: { type: 'boolean', default: false },
      wait: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const variants = Number(values.variants);
  if (!Number.isInteger(variants) || variants < 1 || variants > 10) throw new Error('--variants must be 1…10');
  return { ...values, variants, positionals };
}

function libraryIds(library) {
  return new Set(readJson(join(library, 'library.json')).assets.map((asset) => asset.id));
}

async function check(client) {
  const stats = await client.systemStats();
  console.log(`ComfyUI ${stats.system?.comfyui_version ?? '?'}, Python ${String(stats.system?.python_version ?? '?').split(' ')[0]}`);
  for (const device of stats.devices ?? []) {
    const gib = (bytes) => (bytes / 2 ** 30).toFixed(1);
    console.log(`GPU ${device.name}: ${gib(device.vram_free)} of ${gib(device.vram_total)} GiB free`);
  }
  let missing = 0;
  const listed = new Map();
  for (const [kind, path] of Object.entries(WORKFLOWS)) {
    for (const { folder, file } of modelFiles(readWorkflow(path))) {
      if (!listed.has(folder)) listed.set(folder, new Set(await client.models(folder)));
      const ok = listed.get(folder).has(file);
      if (!ok) missing++;
      console.log(`${ok ? 'ok     ' : 'MISSING'} ${kind}: models/${folder}/${file}`);
    }
  }
  const queue = await client.queue();
  console.log(`Queue: ${queue.queue_running?.length ?? 0} running, ${queue.queue_pending?.length ?? 0} pending`);
  if (missing > 0) throw new Error(`${missing} model file(s) missing on the PC (docs/desktop.md, sections 3.1 and 5.1)`);
}

async function queueJobs(client, kind, opts) {
  const targets = opts.positionals.map(parseTarget);
  const have = libraryIds(opts.library);
  const jobs = withVariants(
    kind === 'still' ? stillJobs(readJson(STILL_CATALOG), targets, have) : clipJobs(readJson(CLIP_CATALOG), targets, have),
    opts.variants,
  );
  const template = readWorkflow(WORKFLOWS[kind]);
  mkdirSync(opts.out, { recursive: true });
  const queuePath = join(opts.out, 'queue.json');
  const record = readQueue(queuePath);
  const clientId = randomUUID();
  const uploaded = new Map();
  let queued = 0;
  for (const job of jobs) {
    const name = resultName(job);
    if (!opts.force && record.jobs.some((r) => resultName(r) === name && r.kind === kind && r.state !== 'error' && r.state !== 'lost')) {
      console.log(`skip   ${name}: already queued (--force to queue again)`);
      continue;
    }
    const prefix = `${SUBFOLDER}/${name}`;
    let workflow;
    if (kind === 'still') workflow = buildStill(template, { prompt: job.prompt, seed: job.seed, prefix });
    else {
      if (!uploaded.has(job.from)) {
        const file = join(opts.library, 'stills', `${job.from}.webp`);
        if (!existsSync(file)) throw new Error(`Clip ${job.id}: no still ${file}`);
        uploaded.set(job.from, await client.upload(`${job.from}.webp`, readFileSync(file), SUBFOLDER));
      }
      workflow = buildClip(template, { prompt: job.prompt, seed: job.seed, prefix, image: uploaded.get(job.from) });
    }
    const promptId = await client.submit(workflow, clientId);
    record.jobs.push({ ...job, promptId, prefix, queuedAt: new Date().toISOString(), state: 'queued' });
    // Saved after every job: a failure halfway leaves an exact record of what is on the PC.
    writeJsonAtomic(queuePath, record);
    queued++;
    console.log(`queued ${name} (${promptId})`);
  }
  console.log(`${queued} ${kind}(s) queued; results: node tools/comfy/comfy.mjs fetch --wait`);
}

/** Checks every queued job once; downloads the finished ones. Returns how many are still waiting. */
async function fetchOnce(client, opts) {
  const queuePath = join(opts.out, 'queue.json');
  const record = readQueue(queuePath);
  const live = await client.queue();
  const onServer = new Set([...(live.queue_running ?? []), ...(live.queue_pending ?? [])].map((item) => item[1]));
  let waiting = 0;
  for (const job of record.jobs) {
    if (job.state !== 'queued') continue;
    const name = resultName(job);
    const entry = await client.history(job.promptId);
    const { state, message } = entryState(entry);
    if (state === 'pending') {
      if (entry || onServer.has(job.promptId)) waiting++;
      else {
        // Neither queued nor in the history: ComfyUI was restarted, the job is gone.
        job.state = 'lost';
        console.log(`lost   ${name}: not on the server any more (restarted?) — queue it again`);
      }
      continue;
    }
    if (state === 'error') {
      job.state = 'error';
      job.error = message;
      console.log(`error  ${name}: ${message}`);
      continue;
    }
    const files = outputFiles(entry);
    if (files.length === 0) {
      job.state = 'error';
      job.error = 'finished without an output file';
      console.log(`error  ${name}: finished without an output file`);
      continue;
    }
    job.files = [];
    for (const [i, file] of files.entries()) {
      const local = `${name}${files.length > 1 ? `-${i + 1}` : ''}${extname(file.filename)}`;
      writeFileSync(join(opts.out, local), await client.view(file));
      job.files.push(local);
    }
    // Next to the files: what they are, for the owner's review and for `import`.
    writeJsonAtomic(join(opts.out, `${name}.json`), {
      kind: job.kind,
      id: job.id,
      seed: job.seed,
      prompt: job.prompt,
      ...(job.from ? { from: job.from } : {}),
      model: job.model,
      license: job.license,
      promptId: job.promptId,
      files: job.files,
      server: files,
    });
    job.state = 'fetched';
    console.log(`fetched ${job.files.join(', ')}`);
  }
  writeJsonAtomic(queuePath, record);
  return waiting;
}

async function fetchResults(client, opts) {
  for (;;) {
    const waiting = await fetchOnce(client, opts);
    if (!opts.wait || waiting === 0) {
      console.log(waiting === 0 ? 'Nothing left to wait for.' : `${waiting} job(s) still on the PC.`);
      return;
    }
    console.log(`${waiting} job(s) still on the PC; next look in ${POLL_MS / 1000} s`);
    await new Promise((done) => setTimeout(done, POLL_MS));
  }
}

async function status(client, opts) {
  const record = readQueue(join(opts.out, 'queue.json'));
  const counts = {};
  for (const job of record.jobs) counts[job.state] = (counts[job.state] ?? 0) + 1;
  console.log(`Recorded: ${JSON.stringify(counts)}`);
  for (const job of record.jobs.filter((j) => j.state === 'error' || j.state === 'lost')) {
    console.log(`${job.state.padEnd(6)} ${resultName(job)} ${job.error ?? ''}`);
  }
  const queue = await client.queue();
  console.log(`Server: ${queue.queue_running?.length ?? 0} running, ${queue.queue_pending?.length ?? 0} pending`);
}

function importResults(opts) {
  if (opts.positionals.length === 0) throw new Error('import: name the accepted results, e.g. yard-day-dandelions_1320104');
  const manifestPath = join(opts.library, 'library.json');
  let manifest = readJson(manifestPath);
  const catalog = readJson(STILL_CATALOG);
  let catalogText = readFileSync(STILL_CATALOG, 'utf8');
  const stills = [];
  for (const target of opts.positionals) {
    const name = basename(target).replace(/(-\d+)?\.(png|mp4|webm|json)$/i, '');
    const sidecar = join(opts.out, `${name}.json`);
    if (!existsSync(sidecar)) throw new Error(`No ${sidecar}: fetch the result first`);
    const job = readJson(sidecar);
    const source = join(opts.out, job.files[0]);
    if (job.kind === 'still') {
      const scene = catalog.scenes.find((s) => s.id === job.id);
      if (!scene) throw new Error(`No still "${job.id}" in the catalog`);
      const size = convertStill(source, join(opts.library, 'stills', `${job.id}.webp`));
      manifest = upsertAsset(manifest, stillAsset(job, scene, size));
      if (scene.seed !== job.seed) catalogText = setCatalogSeed(catalogText, job.id, job.seed);
      stills.push(job.id);
    } else {
      const still = manifest.assets.find((a) => a.id === job.from);
      if (!still) throw new Error(`Clip ${job.id}: no still "${job.from}" in the library`);
      const size = convertClip(source, join(opts.library, 'clips', `${job.id}.mp4`));
      manifest = upsertAsset(manifest, clipAsset(job, still, size));
    }
    console.log(`imported ${job.kind} ${job.id} (seed ${job.seed})`);
  }
  writeJsonAtomic(manifestPath, manifest);
  if (catalogText !== readFileSync(STILL_CATALOG, 'utf8')) writeFileSync(STILL_CATALOG, catalogText);
  if (stills.length > 0) console.log('New stills need depth maps: cd tools/depth && node depth.mjs');
}

export async function main(argv = process.argv.slice(2)) {
  const opts = options(argv);
  const [command, sub] = opts.positionals;
  if (opts.help || !command) {
    console.log(USAGE);
    return;
  }
  const client = new ComfyClient(opts.url);
  switch (command) {
    case 'check':
      return check(client);
    case 'queue':
      if (sub !== 'still' && sub !== 'clip') throw new Error('queue still|clip');
      return queueJobs(client, sub, { ...opts, positionals: opts.positionals.slice(2) });
    case 'status':
      return status(client, opts);
    case 'fetch':
      return fetchResults(client, opts);
    case 'free':
      await client.free();
      console.log('Models unloaded.');
      return;
    case 'import':
      return importResults({ ...opts, positionals: opts.positionals.slice(1) });
    default:
      throw new Error(`Unknown command "${command}"\n${USAGE}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
