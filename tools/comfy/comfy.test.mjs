import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ComfyClient, ComfyError, entryState, outputFiles } from './api.mjs';
import { clipJobs, parseTarget, readJson, stillJobs, stillPrompt, withVariants } from './jobs.mjs';
import { clipAsset, crop169, setCatalogSeed, stillAsset, upsertAsset } from './library.mjs';
import { buildClip, buildStill, modelFiles, only, readWorkflow } from './workflows.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const still = readWorkflow(join(HERE, 'workflows/still.json'));
const clip = readWorkflow(join(HERE, 'workflows/clip.json'));
const catalog = readJson(join(REPO, 'tools/generation/prompts.json'));
const clips = readJson(join(HERE, 'clips.json'));
const library = readJson(join(REPO, 'apps/web/public/library/library.json'));
const libraryIds = new Set(library.assets.map((asset) => asset.id));

describe('graphs', () => {
  it('fills a still: prompt, seed, 1280×720, file name; the template stays as it was', () => {
    const before = JSON.stringify(still);
    const graph = buildStill(still, { prompt: 'a yard', seed: 42, prefix: 'dream/yard_42' });
    assert.equal(JSON.stringify(still), before);
    assert.equal(only(graph, 'CLIPTextEncode').inputs.text, 'a yard');
    assert.equal(only(graph, 'KSampler').inputs.seed, 42);
    assert.deepEqual(only(graph, 'EmptySD3LatentImage').inputs, { width: 1280, height: 720, batch_size: 1 });
    assert.equal(only(graph, 'SaveImage').inputs.filename_prefix, 'dream/yard_42');
    // The template's own settings stay: 8 steps, cfg 1, as on Hugging Face.
    assert.equal(only(graph, 'KSampler').inputs.steps, 8);
    assert.equal(only(graph, 'KSampler').inputs.cfg, 1);
  });

  it('fills a clip: the positive prompt only, the uploaded still, 121 frames', () => {
    const graph = buildClip(clip, { prompt: 'the swing moves', seed: 391001, prefix: 'dream/clip_391001', image: 'dream/yard.webp' });
    const texts = Object.values(graph).filter((n) => n.class_type === 'CLIPTextEncode').map((n) => n.inputs.text);
    assert.ok(texts.includes('the swing moves'));
    // The negative prompt is the template's.
    assert.ok(texts.some((t) => t.startsWith('色调艳丽')));
    assert.equal(only(graph, 'LoadImage').inputs.image, 'dream/yard.webp');
    assert.equal(only(graph, 'KSampler').inputs.seed, 391001);
    assert.equal(only(graph, 'Wan22ImageToVideoLatent').inputs.length, 121);
    assert.equal(only(graph, 'Wan22ImageToVideoLatent').inputs.height, 704);
    assert.equal(only(graph, 'SaveVideo').inputs.filename_prefix, 'dream/clip_391001');
  });

  it('rejects a bad seed', () => {
    assert.throws(() => buildStill(still, { prompt: 'x', seed: -1, prefix: 'p' }));
    assert.throws(() => buildStill(still, { prompt: 'x', seed: 1.5, prefix: 'p' }));
  });

  it('lists the model files each graph loads', () => {
    assert.deepEqual(modelFiles(still).map((m) => m.file).sort(), ['ae.safetensors', 'qwen_3_4b.safetensors', 'z_image_turbo_bf16.safetensors']);
    assert.deepEqual(modelFiles(clip).map((m) => m.file).sort(), [
      'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
      'wan2.2_ti2v_5B_fp16.safetensors',
      'wan2.2_vae.safetensors',
    ]);
  });
});

describe('jobs', () => {
  it('builds the same still prompts as generate.py did for the library', () => {
    let compared = 0;
    for (const asset of library.assets) {
      const scene = catalog.scenes.find((s) => s.id === asset.id);
      if (asset.kind !== 'still' || !scene) continue;
      assert.equal(stillPrompt(scene, catalog.style), asset.generation.prompt, asset.id);
      compared++;
    }
    assert.ok(compared > 50);
  });

  it('queues every still the library lacks, with its catalog seed', () => {
    const jobs = stillJobs(catalog, [], libraryIds);
    assert.ok(jobs.length > 0);
    for (const job of jobs) {
      assert.ok(!libraryIds.has(job.id));
      assert.ok(Number.isSafeInteger(job.seed), job.id);
      assert.equal(job.model, 'Tongyi-MAI/Z-Image-Turbo');
    }
    assert.equal(stillJobs(catalog, [parseTarget('yard-day-dandelions@7')], libraryIds)[0].seed, 7);
    assert.throws(() => stillJobs(catalog, [parseTarget('no-such-still')], libraryIds));
  });

  it('has a clip catalog made from stills of the library', () => {
    const ids = new Set(clips.clips.map((c) => c.id));
    assert.equal(ids.size, clips.clips.length);
    assert.equal(new Set(clips.clips.map((c) => c.seed)).size, clips.clips.length);
    for (const c of clips.clips) {
      assert.match(c.id, /^clip-[a-z0-9-]+$/);
      assert.equal(library.assets.find((a) => a.id === c.from)?.kind, 'still', `${c.id} from ${c.from}`);
      assert.ok(c.prompt.length > 100, c.id);
    }
    const jobs = clipJobs(clips, [], libraryIds);
    assert.equal(jobs[0].id, 'clip-fall-roof-plunge');
    assert.equal(jobs[0].from, 'fall-roof-edge-yard');
    assert.equal(jobs[0].model, 'Wan-AI/Wan2.2-TI2V-5B');
  });

  it('keeps the clip catalog in step with docs/desktop.md (the manual way)', () => {
    const text = readFileSync(join(REPO, 'docs/desktop.md'), 'utf8');
    const section = text.slice(text.indexOf('## 6.'), text.indexOf('## 7.'));
    const pattern = /\*\*\d+\. `(clip-[a-z0-9-]+)`\*\* — [^\n]+\n\n- Кадр: `([a-z0-9-]+)`[\s\S]*?- Seed: `(\d+)`[\s\S]*?```text\n {2}([^\n]+)\n/g;
    const documented = [...section.matchAll(pattern)].map((m) => ({ id: m[1], from: m[2], seed: Number(m[3]), prompt: m[4] }));
    assert.deepEqual(
      clips.clips.map(({ id, from, seed, prompt }) => ({ id, from, seed, prompt })),
      documented,
    );
  });

  it('spreads variants: +1 for stills, +10 for clips', () => {
    const [s] = stillJobs(catalog, [parseTarget('yard-day-dandelions@100')], libraryIds);
    assert.deepEqual(withVariants([s], 3).map((j) => j.seed), [100, 101, 102]);
    const [c] = clipJobs(clips, [parseTarget('clip-fall-roof-plunge')], libraryIds);
    assert.deepEqual(withVariants([c], 3).map((j) => j.seed), [391001, 391011, 391021]);
  });

  it('parses id and id@seed', () => {
    assert.deepEqual(parseTarget('a-b'), { id: 'a-b', seed: undefined });
    assert.deepEqual(parseTarget('a-b@12'), { id: 'a-b', seed: 12 });
    assert.throws(() => parseTarget('A B'));
  });
});

describe('server answers', () => {
  it('finds the files of SaveImage and SaveVideo, not the temporary previews', () => {
    const entry = {
      outputs: {
        9: { images: [{ filename: 'yard_42_00001_.png', subfolder: 'dream', type: 'output' }] },
        58: { images: [{ filename: 'clip_00001_.mp4', subfolder: 'dream', type: 'output' }], animated: [true] },
        70: { images: [{ filename: 'preview.png', subfolder: '', type: 'temp' }] },
      },
      status: { status_str: 'success', completed: true, messages: [] },
    };
    assert.deepEqual(outputFiles(entry).map((f) => f.filename), ['yard_42_00001_.png', 'clip_00001_.mp4']);
    assert.deepEqual(entryState(entry), { state: 'done' });
    assert.deepEqual(entryState(null), { state: 'pending' });
  });

  it('reports an execution error', () => {
    const entry = {
      outputs: {},
      status: {
        status_str: 'error',
        completed: false,
        messages: [['execution_error', { node_type: 'KSampler', exception_message: 'CUDA out of memory' }]],
      },
    };
    assert.deepEqual(entryState(entry), { state: 'error', message: 'KSampler: CUDA out of memory' });
  });

  it('queues a graph and explains a rejected one', async () => {
    const calls = [];
    const client = new ComfyClient('http://pc:8000/', {
      fetch: async (url, init) => {
        calls.push({ url, body: init.body });
        if (calls.length === 1) return new Response(JSON.stringify({ prompt_id: 'abc', number: 1 }));
        return new Response(
          JSON.stringify({
            error: { message: 'Prompt outputs failed validation' },
            node_errors: { 57: { class_type: 'UNETLoader', errors: [{ message: 'Value not in list', details: 'unet_name' }] } },
          }),
          { status: 400 },
        );
      },
    });
    assert.equal(await client.submit({ 1: {} }, 'me'), 'abc');
    assert.equal(calls[0].url, 'http://pc:8000/prompt');
    assert.deepEqual(JSON.parse(calls[0].body), { prompt: { 1: {} }, client_id: 'me' });
    await assert.rejects(client.submit({}, 'me'), /UNETLoader\): Value not in list unet_name/);
  });

  it('says plainly when the PC does not answer', async () => {
    const client = new ComfyClient('http://pc:8000', {
      fetch: async () => {
        throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
      },
    });
    await assert.rejects(client.systemStats(), (error) => error instanceof ComfyError && /ECONNREFUSED/.test(error.message));
  });
});

describe('into the library', () => {
  it('crops Wan frames to 16:9 from the centre (D-036)', () => {
    assert.deepEqual(crop169(1280, 704), { width: 1252, height: 704 });
    assert.deepEqual(crop169(1280, 720), { width: 1280, height: 720 });
    assert.deepEqual(crop169(1024, 1024), { width: 1024, height: 576 });
  });

  it('writes clip entries like the first batch', () => {
    const job = clipJobs(clips, [parseTarget('clip-fall-roof-plunge@391011')], libraryIds)[0];
    const from = library.assets.find((a) => a.id === job.from);
    const asset = clipAsset(job, from, { width: 1280, height: 720, duration: 5.041667 });
    assert.equal(asset.duration, 5.042);
    assert.equal(asset.file, 'clips/clip-fall-roof-plunge.mp4');
    assert.deepEqual(asset.tags, from.tags);
    assert.equal(asset.generation.seed, 391011);
    assert.equal(asset.generation.source, 'local-desktop, from still fall-roof-edge-yard');
    const swing = library.assets.find((a) => a.id === 'clip-yard-swing-alone');
    assert.deepEqual(Object.keys(asset), Object.keys(swing));
    assert.deepEqual(Object.keys(asset.generation), Object.keys(swing.generation));
  });

  it('gives a drop clip its own tags over those of the still (#151)', () => {
    const job = clipJobs(clips, [parseTarget('clip-drop-bed-gives-way')], libraryIds)[0];
    const from = library.assets.find((a) => a.id === job.from);
    const asset = clipAsset(job, from, { width: 1280, height: 720, duration: 5 });
    assert.deepEqual(asset.tags, { ...from.tags, motifs: ['fall'], mood: 'dread' });
    assert.deepEqual(from.tags.motifs, []);
  });

  it('uses only tags of the dictionary in clip overrides', () => {
    const dictionary = readFileSync(join(REPO, 'packages/dream-core/src/film/library.ts'), 'utf8');
    const list = (name) => new Set([...dictionary.match(new RegExp(`${name} = \\[([^\\]]*)\\]`))[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
    const allowed = { location: list('LOCATION_TAGS'), people: list('PEOPLE_TAGS'), mood: list('MOOD_TAGS'), time: list('TIME_TAGS') };
    const motifs = list('MOTIF_TAGS');
    for (const clip of clips.clips.filter((c) => c.tags)) {
      for (const [key, value] of Object.entries(clip.tags)) {
        if (key === 'motifs') for (const motif of value) assert.ok(motifs.has(motif), `${clip.id}: ${motif}`);
        else assert.ok(allowed[key]?.has(value), `${clip.id}: ${key}=${value}`);
      }
    }
  });

  it('writes still entries like generate.py', () => {
    const job = stillJobs(catalog, [parseTarget('yard-day-dandelions@1320105')], libraryIds)[0];
    const scene = catalog.scenes.find((s) => s.id === job.id);
    const asset = stillAsset(job, scene, { width: 1280, height: 720 });
    const known = library.assets.find((a) => a.kind === 'still' && a.generation.source === 'local-desktop');
    assert.deepEqual(Object.keys(asset).sort(), Object.keys(known).filter((k) => k !== 'depth').sort());
    assert.equal(asset.generation.seed, 1320105);
    const manifest = upsertAsset({ version: 1, assets: [{ id: 'a' }, { id: job.id, old: true }] }, asset);
    assert.deepEqual(manifest.assets.map((a) => a.id), ['a', job.id]);
    assert.equal(manifest.assets[1], asset);
  });

  it('changes the seed of one scene in the catalog text and nothing else', () => {
    const text = readFileSync(join(REPO, 'tools/generation/prompts.json'), 'utf8');
    const changed = setCatalogSeed(text, 'yard-day-dandelions', 1320199);
    const before = readJson(join(REPO, 'tools/generation/prompts.json'));
    const after = JSON.parse(changed);
    assert.equal(after.scenes.find((s) => s.id === 'yard-day-dandelions').seed, 1320199);
    const others = (data) => data.scenes.filter((s) => s.id !== 'yard-day-dandelions');
    assert.deepEqual(others(after), others(before));
    assert.equal(changed.replace('1320199', '1320104'), text);
  });
});
