/**
 * What to generate: stills from the Z-Image-Turbo catalog
 * (`tools/generation/prompts.json`, the same prompts as `generate.py`) and
 * clips from the Wan 2.2 catalog (`tools/comfy/clips.json`); and the record
 * of what was queued (`<out>/queue.json`), so `fetch` can pick the results up
 * later — the queue lives on the PC, the laptop may sleep meanwhile.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

/** A retry of a still takes the next seed; of a clip, ten further (docs/desktop.md). */
export const SEED_STEP = { still: 1, clip: 10 };

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJsonAtomic(path, data) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, path);
}

/** `scene` plus the style, exactly as `Scene.prompt` in generate.py. */
export function stillPrompt(scene, style) {
  return `${scene.scene.replace(/[. ]+$/, '')}. ${scene.style ?? style}`;
}

/** `id` or `id@seed`. */
export function parseTarget(text) {
  const match = /^([a-z0-9][a-z0-9-]*)(?:@(\d+))?$/.exec(text);
  if (!match) throw new Error(`Bad job "${text}": expected an id or id@seed`);
  return { id: match[1], seed: match[2] === undefined ? undefined : Number(match[2]) };
}

/** `count` seeds from `seed`, `step` apart: the variants of one job. */
export function seedsFrom(seed, count, step) {
  return Array.from({ length: count }, (_, i) => seed + i * step);
}

/** Jobs for stills of the catalog; without ids — every scene the library does not have yet. */
export function stillJobs(catalog, targets, libraryIds) {
  const scenes = new Map(catalog.scenes.map((scene) => [scene.id, scene]));
  const picked = targets.length > 0 ? targets : catalog.scenes.filter((s) => !libraryIds.has(s.id)).map((s) => ({ id: s.id }));
  return picked.map(({ id, seed }) => {
    const scene = scenes.get(id);
    if (!scene) throw new Error(`No still "${id}" in tools/generation/prompts.json`);
    const catalogSeed = scene.seed;
    if (seed === undefined && catalogSeed === undefined) throw new Error(`Still "${id}" has no seed in the catalog: give one as ${id}@<seed>`);
    return {
      kind: 'still',
      id,
      seed: seed ?? catalogSeed,
      prompt: stillPrompt(scene, catalog.style),
      model: catalog.model,
      license: catalog.license,
    };
  });
}

/** Jobs for clips of the catalog; without ids — every clip the library does not have yet. */
export function clipJobs(catalog, targets, libraryIds) {
  const clips = new Map(catalog.clips.map((clip) => [clip.id, clip]));
  const picked = targets.length > 0 ? targets : catalog.clips.filter((c) => !libraryIds.has(c.id)).map((c) => ({ id: c.id }));
  return picked.map(({ id, seed }) => {
    const clip = clips.get(id);
    if (!clip) throw new Error(`No clip "${id}" in tools/comfy/clips.json`);
    return {
      kind: 'clip',
      id,
      seed: seed ?? clip.seed,
      prompt: clip.prompt,
      from: clip.from,
      // Tags over those of the still, e.g. `fall` for a drop out of an ordinary bedroom (#151).
      ...(clip.tags ? { tags: clip.tags } : {}),
      model: catalog.model,
      license: catalog.license,
    };
  });
}

/** Every job once per variant seed. */
export function withVariants(jobs, variants) {
  return jobs.flatMap((job) => seedsFrom(job.seed, variants, SEED_STEP[job.kind]).map((seed) => ({ ...job, seed })));
}

/** Base name of a result: `<id>_<seed>`, as in ComfyUI's `output/dream/`. */
export function resultName(job) {
  return `${job.id}_${job.seed}`;
}

export function readQueue(path) {
  return existsSync(path) ? readJson(path) : { jobs: [] };
}

/**
 * An order for `run` (tools/comfy/AGENT.md):
 *
 *   { "name": "batch2-falls",                       results go to tools/comfy/out/<name>/
 *     "note": "what it is for",                     optional, copied into the report
 *     "url": "http://100.105.208.82:8188",          optional
 *     "stills": "missing" | ["id", "id@seed", …],   optional
 *     "clips":  "missing" | ["id", "id@seed", …],   optional
 *     "variants": { "stills": 1, "clips": 2 } }     optional, seeds per job
 */
export function parseOrder(data) {
  const fail = (message) => {
    throw new Error(`Bad order: ${message}`);
  };
  if (!data || typeof data !== 'object') fail('not an object');
  if (typeof data.name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(data.name)) fail('"name" must be like batch2-falls');
  for (const key of ['stills', 'clips']) {
    const value = data[key];
    if (value === undefined || value === 'missing') continue;
    if (!Array.isArray(value) || value.length === 0) fail(`"${key}" must be "missing" or a non-empty list of ids`);
    value.forEach(parseTarget);
  }
  if (data.stills === undefined && data.clips === undefined) fail('nothing to do: no "stills" and no "clips"');
  if (data.url !== undefined && (typeof data.url !== 'string' || !/^http:\/\/[^/]+$/.test(data.url))) fail('"url" must be like http://host:port');
  const variants = { stills: data.variants?.stills ?? 1, clips: data.variants?.clips ?? 1 };
  for (const [key, n] of Object.entries(variants)) {
    if (!Number.isInteger(n) || n < 1 || n > 10) fail(`"variants.${key}" must be 1…10`);
  }
  return { name: data.name, note: data.note, url: data.url, stills: data.stills, clips: data.clips, variants };
}

const STATE_WORDS = { fetched: 'готово', queued: 'ещё на компьютере', error: 'ошибка', lost: 'пропало' };

/** The order's report for the owner and the reviewer, Markdown. */
export function orderReport(order, record, out) {
  const counts = {};
  for (const job of record.jobs) counts[job.state] = (counts[job.state] ?? 0) + 1;
  const lines = [
    `# Заказ ${order.name}`,
    '',
    ...(order.note ? [order.note, ''] : []),
    `Папка: \`${out}\``,
    '',
    `Всего ${record.jobs.length}: ${Object.entries(counts).map(([state, n]) => `${STATE_WORDS[state] ?? state} — ${n}`).join(', ')}.`,
    '',
    '| Что | id | seed | Состояние | Файл | Ошибка |',
    '|---|---|---|---|---|---|',
  ];
  for (const job of record.jobs) {
    const kind = job.kind === 'clip' ? `клип из \`${job.from}\`` : 'кадр';
    const files = (job.files ?? []).map((f) => `\`${f}\``).join(', ');
    const error = (job.error ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ');
    lines.push(`| ${kind} | \`${job.id}\` | ${job.seed} | ${STATE_WORDS[job.state] ?? job.state} | ${files} | ${error} |`);
  }
  lines.push('', 'Результаты не в библиотеке: их смотрит и переносит Claude Code (`import`) после проверки.', '');
  return lines.join('\n');
}
