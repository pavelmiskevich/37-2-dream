import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { EXIT, main } from './comfy.mjs';
import { parseOrder } from './jobs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIBRARY = resolve(HERE, '../../apps/web/public/library');

/** A ComfyUI stand-in: jobs finish at once unless held or failed. */
function fakeComfy() {
  const fake = { events: [], prompts: new Map(), fail: new Map(), hold: false, url: '' };
  const files = ['z_image_turbo_bf16.safetensors', 'qwen_3_4b.safetensors', 'ae.safetensors', 'wan2.2_ti2v_5B_fp16.safetensors', 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', 'wan2.2_vae.safetensors'];
  const prefixOf = (workflow) => Object.values(workflow).find((n) => n.class_type === 'SaveImage' || n.class_type === 'SaveVideo').inputs.filename_prefix;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const json = (data) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(data));
    };
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/system_stats') return json({ system: { comfyui_version: 'fake' }, devices: [] });
    if (url.pathname.startsWith('/models/')) return json(files);
    if (url.pathname === '/queue') {
      const held = [...fake.prompts.keys()].filter(() => fake.hold).map((id, i) => [i, id, {}, {}, []]);
      return json({ queue_running: [], queue_pending: held });
    }
    if (url.pathname === '/free') {
      fake.events.push('free');
      return json({});
    }
    if (url.pathname === '/upload/image') {
      fake.events.push('upload');
      return json({ name: 'still.webp', subfolder: 'dream', type: 'input' });
    }
    if (url.pathname === '/prompt') {
      const { prompt } = JSON.parse(body.toString());
      const id = `p${fake.prompts.size + 1}`;
      const prefix = prefixOf(prompt);
      fake.prompts.set(id, { prompt, prefix });
      fake.events.push(`queue ${basename(prefix)}`);
      return json({ prompt_id: id, number: fake.prompts.size });
    }
    if (url.pathname.startsWith('/history/')) {
      const id = url.pathname.slice('/history/'.length);
      const job = fake.prompts.get(id);
      if (!job || fake.hold) return json({});
      const name = basename(job.prefix);
      const left = fake.fail.get(name) ?? 0;
      if (left > 0 && !job.failed && !job.done) {
        fake.fail.set(name, left - 1);
        job.failed = true;
      }
      if (job.failed) {
        return json({ [id]: { outputs: {}, status: { status_str: 'error', completed: false, messages: [['execution_error', { node_type: 'KSampler', exception_message: 'out of memory' }]] } } });
      }
      job.done = true;
      const video = Object.values(job.prompt).some((n) => n.class_type === 'SaveVideo');
      const file = { filename: `${name}_00001_.${video ? 'mp4' : 'png'}`, subfolder: 'dream', type: 'output' };
      return json({ [id]: { outputs: { 9: { images: [file], ...(video ? { animated: [true] } : {}) } }, status: { status_str: 'success', completed: true, messages: [] } } });
    }
    if (url.pathname === '/view') return res.end(`bytes of ${url.searchParams.get('filename')}`);
    res.statusCode = 404;
    res.end('not found');
  });
  return { fake, server };
}

describe('run: a whole order through a stand-in ComfyUI', () => {
  let fake;
  let server;
  let dir;
  const quiet = console.log;

  before(async () => {
    ({ fake, server } = fakeComfy());
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    fake.url = `http://127.0.0.1:${server.address().port}`;
    console.log = () => {};
  });
  after(() => {
    console.log = quiet;
    server.close();
  });
  beforeEach(() => {
    fake.events.length = 0;
    fake.prompts.clear();
    fake.fail.clear();
    fake.hold = false;
    dir = mkdtempSync(join(tmpdir(), 'comfy-run-'));
  });

  const order = (data) => {
    const path = join(dir, 'order.json');
    writeFileSync(path, JSON.stringify({ url: fake.url, ...data }));
    return path;
  };
  const run = (path, ...more) => main(['run', path, '--out', join(dir, 'out'), '--library', LIBRARY, ...more]);
  const queued = () => JSON.parse(readFileSync(join(dir, 'out', 'queue.json'), 'utf8')).jobs;

  it('makes the stills, unloads the model, then makes the clips, and writes a report', async () => {
    const path = order({ name: 'try', stills: ['yard-day-dandelions'], clips: ['clip-fall-roof-plunge'], variants: { clips: 2 } });
    assert.equal(await run(path), EXIT.done);
    assert.deepEqual(fake.events, [
      'queue yard-day-dandelions_1320104',
      'free',
      'upload',
      'queue clip-fall-roof-plunge_391001',
      'queue clip-fall-roof-plunge_391011',
    ]);
    for (const file of ['yard-day-dandelions_1320104.png', 'clip-fall-roof-plunge_391001.mp4', 'clip-fall-roof-plunge_391011.mp4']) {
      assert.ok(existsSync(join(dir, 'out', file)), file);
    }
    const sidecar = JSON.parse(readFileSync(join(dir, 'out', 'clip-fall-roof-plunge_391011.json'), 'utf8'));
    assert.equal(sidecar.from, 'fall-roof-edge-yard');
    assert.equal(sidecar.seed, 391011);
    const report = readFileSync(join(dir, 'out', 'report.md'), 'utf8');
    assert.match(report, /готово — 3/);
    // Again: nothing new is queued.
    fake.events.length = 0;
    assert.equal(await run(path), EXIT.done);
    assert.deepEqual(fake.events, []);
    rmSync(dir, { recursive: true, force: true });
  });

  it('gives a failed job one more try on the next run, then gives up', async () => {
    const path = order({ name: 'retry', stills: ['yard-day-dandelions', 'kitchen-day-tea-glass'] });
    fake.fail.set('yard-day-dandelions_1320104', 1);
    assert.equal(await run(path), EXIT.again);
    assert.equal(queued().find((j) => j.id === 'yard-day-dandelions').state, 'error');
    assert.equal(await run(path), EXIT.done);
    assert.deepEqual(queued().map((j) => [j.id, j.state, j.attempt]).sort(), [
      ['kitchen-day-tea-glass', 'fetched', 1],
      ['yard-day-dandelions', 'fetched', 2],
    ]);

    const stubborn = order({ name: 'stubborn', stills: ['kitchen-day-tea-glass'] });
    rmSync(join(dir, 'out'), { recursive: true, force: true });
    fake.fail.set('kitchen-day-tea-glass_1320105', 5);
    assert.equal(await run(stubborn), EXIT.again);
    assert.equal(await run(stubborn), EXIT.failed);
    assert.equal(await run(stubborn), EXIT.failed);
    assert.equal(queued()[0].attempt, 2);
    assert.match(readFileSync(join(dir, 'out', 'report.md'), 'utf8'), /out of memory/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('hands back while the PC is still busy, and goes on when run again', async () => {
    const path = order({ name: 'slow', stills: ['yard-day-dandelions'], clips: ['clip-yard-snow-falling'] });
    fake.hold = true;
    assert.equal(await run(path, '--max-minutes', '0.001'), EXIT.again);
    assert.match(readFileSync(join(dir, 'out', 'report.md'), 'utf8'), /ещё на компьютере/);
    // The clips wait for the stills.
    assert.deepEqual(fake.events, ['queue yard-day-dandelions_1320104']);
    fake.hold = false;
    assert.equal(await run(path), EXIT.done);
    assert.deepEqual(fake.events, ['queue yard-day-dandelions_1320104', 'free', 'upload', 'queue clip-yard-snow-falling_391007']);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('orders', () => {
  it('accepts lists, "missing" and variants', () => {
    const order = parseOrder({ name: 'batch2-falls', stills: 'missing', clips: ['clip-fall-roof-plunge@391021'], variants: { clips: 3 } });
    assert.deepEqual(order.variants, { stills: 1, clips: 3 });
  });

  it('reads the example order', () => {
    const order = parseOrder(JSON.parse(readFileSync(join(HERE, 'orders/example.json'), 'utf8')));
    assert.equal(order.name, 'example');
  });

  it('rejects what a typo would make of it', () => {
    assert.throws(() => parseOrder({ name: 'Batch 2', stills: 'missing' }), /name/);
    assert.throws(() => parseOrder({ name: 'b' }), /nothing to do/);
    assert.throws(() => parseOrder({ name: 'b', stills: [] }), /stills/);
    assert.throws(() => parseOrder({ name: 'b', stills: ['Bad Id'] }), /Bad job/);
    assert.throws(() => parseOrder({ name: 'b', clips: 'missing', variants: { clips: 20 } }), /variants/);
    assert.throws(() => parseOrder({ name: 'b', clips: 'missing', url: 'https://evil.example/x' }), /url/);
  });
});
