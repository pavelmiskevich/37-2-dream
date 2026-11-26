#!/usr/bin/env node
/**
 * Stills and clips for the dream library on the PC with the RTX 5070 Ti, from
 * the laptop, through the ComfyUI server API over Tailscale (#147). Nothing
 * but ComfyUI runs on the PC; the laptop only sends jobs and downloads files.
 *
 *   node tools/comfy/comfy.mjs check                     server, GPU, model files
 *   node tools/comfy/comfy.mjs run <order.json>          a whole order, resumable (see AGENT.md)
 *   node tools/comfy/comfy.mjs queue still [id[@seed]…]  stills (all missing ones without ids)
 *   node tools/comfy/comfy.mjs queue clip  [id[@seed]…]  clips  (all missing ones without ids)
 *   node tools/comfy/comfy.mjs status                    what is queued, running, done
 *   node tools/comfy/comfy.mjs fetch [--wait]            download finished results to --out
 *   node tools/comfy/comfy.mjs free                      unload models (between stills and clips)
 *   node tools/comfy/comfy.mjs import <id_seed>…         accepted results into the library
 *
 * Options: --url (or COMFY_URL), --out, --library, --variants N (seeds per job:
 * +1 for stills, +10 for clips), --force (queue again what is already queued),
 * --wait, --max-minutes (run: hand back after this long, default 9).
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ComfyClient, entryState, outputFiles } from './api.mjs';
import {
  clipJobs,
  orderReport,
  parseOrder,
  parseTarget,
  readJson,
  readQueue,
  resultName,
  stillJobs,
  withVariants,
  writeJsonAtomic,
} from './jobs.mjs';
import { clipAsset, convertClip, convertStill, setCatalogSeed, stillAsset, upsertAsset } from './library.mjs';
import { buildClip, buildStill, modelFiles, readWorkflow } from './workflows.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
/** The PC in the owner's Tailscale network (ComfyUI on its default port 8188). */
export const DEFAULT_URL = 'http://100.105.208.82:8188';
const STILL_CATALOG = join(REPO, 'tools/generation/prompts.json');
const CLIP_CATALOG = join(HERE, 'clips.json');
const WORKFLOWS = { still: join(HERE, 'workflows/still.json'), clip: join(HERE, 'workflows/clip.json') };
/** Subfolder of ComfyUI's `input` and `output` the jobs use. */
const SUBFOLDER = 'dream';
const POLL_MS = 15_000;

/** Exit codes of `run`: done, done with failures, not finished yet (run it again). */
export const EXIT = { done: 0, failed: 1, again: 2 };

const USAGE = `Usage: node tools/comfy/comfy.mjs <check|run|queue still|queue clip|status|fetch|free|import> [args] [options]
  --url <http://host:port>  ComfyUI server (COMFY_URL, default ${DEFAULT_URL})
  --out <dir>               results and queue.json (default tools/comfy/out, run: tools/comfy/out/<order name>)
  --library <dir>           library root (default apps/web/public/library)
  --variants <n>            seeds per job (+1 for stills, +10 for clips)
  --force                   queue again jobs already queued
  --wait                    fetch: wait until the queue is done
  --max-minutes <n>         run: hand back after this long (default 9), run it again to go on`;

function options(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      url: { type: 'string' },
      out: { type: 'string' },
      library: { type: 'string', default: join(REPO, 'apps/web/public/library') },
      variants: { type: 'string', default: '1' },
      force: { type: 'boolean', default: false },
      wait: { type: 'boolean', default: false },
      'max-minutes': { type: 'string', default: '9' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const variants = Number(values.variants);
  if (!Number.isInteger(variants) || variants < 1 || variants > 10) throw new Error('--variants must be 1…10');
  const maxMinutes = Number(values['max-minutes']);
  if (!(maxMinutes > 0)) throw new Error('--max-minutes must be positive');
  return {
    ...values,
    url: values.url ?? process.env.COMFY_URL,
    out: values.out ?? join(HERE, 'out'),
    outGiven: values.out !== undefined,
    variants,
    maxMinutes,
    positionals,
  };
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

/** Jobs of `kind` for `targets` (all missing ones when empty), `variants` seeds each. */
function plannedJobs(kind, targets, variants, library) {
  const have = libraryIds(library);
  const jobs = kind === 'still' ? stillJobs(readJson(STILL_CATALOG), targets, have) : clipJobs(readJson(CLIP_CATALOG), targets, have);
  return withVariants(jobs, variants);
}

/** Tries per job before a failure is final (a rerun queues a failed job once more). */
export const MAX_ATTEMPTS = 2;

/** The jobs not on record yet; a failed or lost one counts as not queued until its last attempt. */
function notQueued(jobs, record, force) {
  if (force) return jobs;
  const settled = new Set(
    record.jobs
      .filter((r) => (r.state !== 'error' && r.state !== 'lost') || (r.attempt ?? 1) >= MAX_ATTEMPTS)
      .map((r) => `${r.kind}:${resultName(r)}`),
  );
  return jobs.filter((job) => !settled.has(`${job.kind}:${resultName(job)}`));
}

/** Sends `jobs` to the server, recording each in `<out>/queue.json` as it goes. */
async function submitJobs(client, kind, jobs, opts) {
  const template = readWorkflow(WORKFLOWS[kind]);
  mkdirSync(opts.out, { recursive: true });
  const queuePath = join(opts.out, 'queue.json');
  const record = readQueue(queuePath);
  const clientId = randomUUID();
  const uploaded = new Map();
  for (const job of jobs) {
    const name = resultName(job);
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
    // Failed and lost attempts of the same name give way to the new one.
    const previous = record.jobs.find((r) => r.kind === kind && resultName(r) === name);
    record.jobs = record.jobs.filter((r) => r !== previous);
    const attempt = (previous?.attempt ?? (previous ? 1 : 0)) + 1;
    record.jobs.push({ ...job, promptId, prefix, attempt, queuedAt: new Date().toISOString(), state: 'queued' });
    // Saved after every job: a failure halfway leaves an exact record of what is on the PC.
    writeJsonAtomic(queuePath, record);
    console.log(`queued ${name} (${promptId})`);
  }
}

async function queueJobs(client, kind, opts) {
  const jobs = plannedJobs(kind, opts.positionals.map(parseTarget), opts.variants, opts.library);
  const fresh = notQueued(jobs, readQueue(join(opts.out, 'queue.json')), opts.force);
  for (const job of jobs) if (!fresh.includes(job)) console.log(`skip   ${resultName(job)}: already queued (--force to queue again)`);
  await submitJobs(client, kind, fresh, opts);
  console.log(`${fresh.length} ${kind}(s) queued; results: node tools/comfy/comfy.mjs fetch --wait`);
}

/** Checks every queued job once; downloads the finished ones. Returns how many are still waiting. */
async function fetchOnce(client, opts) {
  const queuePath = join(opts.out, 'queue.json');
  const record = readQueue(queuePath);
  if (!record.jobs.some((job) => job.state === 'queued')) return 0;
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
    delete job.error;
    console.log(`fetched ${job.files.join(', ')}`);
  }
  writeJsonAtomic(queuePath, record);
  return waiting;
}

/** Fetches until nothing waits (with `wait`), or once; stops waiting at `deadline` (ms). Returns how many still wait. */
async function fetchResults(client, opts, deadline = Infinity) {
  for (;;) {
    const waiting = await fetchOnce(client, opts);
    if (!opts.wait || waiting === 0 || Date.now() + POLL_MS > deadline) {
      console.log(waiting === 0 ? 'Nothing left to wait for.' : `${waiting} job(s) still on the PC.`);
      return waiting;
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

/**
 * A whole order (AGENT.md): stills first, then — once they are all back — the
 * models are unloaded and the clips go. Hands back after `--max-minutes` with
 * EXIT.again; running the same command again goes on where it stopped (what is
 * queued is on record, failed jobs are queued once more).
 */
async function runOrder(opts, path) {
  if (!path) throw new Error('run: name the order file, e.g. tools/comfy/orders/batch2.json');
  const order = parseOrder(readJson(path));
  const out = opts.outGiven ? opts.out : join(HERE, 'out', order.name);
  const o = { ...opts, out, wait: true };
  const client = new ComfyClient(opts.url ?? order.url ?? DEFAULT_URL);
  const deadline = Date.now() + opts.maxMinutes * 60_000;
  mkdirSync(out, { recursive: true });
  const queuePath = join(out, 'queue.json');
  const finish = (code) => {
    const report = join(out, 'report.md');
    writeFileSync(report, orderReport(order, readQueue(queuePath), out));
    console.log(`Report: ${report}`);
    return code;
  };

  await check(client);
  const stages = [];
  if (order.stills) stages.push(['still', order.stills, order.variants.stills]);
  if (order.clips) stages.push(['clip', order.clips, order.variants.clips]);
  for (const [kind, targets, variants] of stages) {
    const jobs = plannedJobs(kind, targets === 'missing' ? [] : targets.map(parseTarget), variants, opts.library);
    const fresh = notQueued(jobs, readQueue(queuePath), false);
    if (fresh.length > 0) {
      // Z-Image and Wan do not fit in 16 GB together: the stills' model goes before the clips come.
      if (kind === 'clip' && readQueue(queuePath).jobs.some((job) => job.kind === 'still')) {
        await client.free();
        console.log('Models unloaded before the clips.');
      }
      await submitJobs(client, kind, fresh, o);
    }
    const waiting = await fetchResults(client, o, deadline);
    if (waiting > 0) {
      console.log(`NOT FINISHED: ${waiting} job(s) still on the PC. Run the same command again.`);
      return finish(EXIT.again);
    }
  }
  const failed = readQueue(queuePath).jobs.filter((job) => job.state === 'error' || job.state === 'lost');
  if (failed.some((job) => (job.attempt ?? 1) < MAX_ATTEMPTS)) {
    console.log(`NOT FINISHED: ${failed.length} job(s) failed and get one more try. Run the same command again.`);
    return finish(EXIT.again);
  }
  if (failed.length > 0) {
    console.log(`DONE WITH FAILURES: ${failed.length} job(s) failed twice; see the report.`);
    return finish(EXIT.failed);
  }
  console.log('DONE: every job of the order is fetched.');
  return finish(EXIT.done);
}

function importResults(opts) {
  if (opts.positionals.length === 0) throw new Error('import: name the accepted results, e.g. yard-day-dandelions_1320104');
  const manifestPath = join(opts.library, 'library.json');
  let manifest = readJson(manifestPath);
  const catalog = readJson(STILL_CATALOG);
  const catalogBefore = readFileSync(STILL_CATALOG, 'utf8');
  let catalogText = catalogBefore;
  const stills = [];
  for (const target of opts.positionals) {
    const name = basename(target).replace(/(-\d+)?\.(png|mp4|webm|json)$/i, '');
    const sidecar = join(target.includes('/') || target.includes('\\') ? dirname(target) : opts.out, `${name}.json`);
    if (!existsSync(sidecar)) throw new Error(`No ${sidecar}: fetch the result first`);
    const job = readJson(sidecar);
    const source = join(dirname(sidecar), job.files[0]);
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
  if (catalogText !== catalogBefore) writeFileSync(STILL_CATALOG, catalogText);
  if (stills.length > 0) console.log('New stills need depth maps: cd tools/depth && node depth.mjs');
}

/** Runs one command; resolves to the process exit code. */
export async function main(argv = process.argv.slice(2)) {
  const opts = options(argv);
  const [command, sub] = opts.positionals;
  if (opts.help || !command) {
    console.log(USAGE);
    return EXIT.done;
  }
  const client = new ComfyClient(opts.url ?? DEFAULT_URL);
  switch (command) {
    case 'check':
      await check(client);
      return EXIT.done;
    case 'run':
      return runOrder(opts, sub);
    case 'queue':
      if (sub !== 'still' && sub !== 'clip') throw new Error('queue still|clip');
      await queueJobs(client, sub, { ...opts, positionals: opts.positionals.slice(2) });
      return EXIT.done;
    case 'status':
      await status(client, opts);
      return EXIT.done;
    case 'fetch':
      await fetchResults(client, opts);
      return EXIT.done;
    case 'free':
      await client.free();
      console.log('Models unloaded.');
      return EXIT.done;
    case 'import':
      importResults({ ...opts, positionals: opts.positionals.slice(1) });
      return EXIT.done;
    default:
      throw new Error(`Unknown command "${command}"\n${USAGE}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`STOPPED: ${error instanceof Error ? error.message : error}`);
      process.exitCode = 3;
    });
}
