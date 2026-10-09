// Run with `node --test` in tools/depth: no model, no network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { depthPath, depthSize, setDepthInText } from './manifest.mjs';
import { encodeGreyPng, readPngHeader } from './png.mjs';
import { waitUntilCool } from './thermal.mjs';

const asset = (id, extra = {}) => ({ id, kind: 'still', file: `stills/${id}.webp`, width: 1280, height: 720, tags: { motifs: [] }, ...extra });
const text = `${JSON.stringify({ version: 1, assets: [asset('a'), asset('b')] }, null, 2)}\n`;

test('depth maps are half the frame and live in depth/', () => {
  assert.deepEqual(depthSize({ width: 1280, height: 720 }), { width: 640, height: 360 });
  assert.deepEqual(depthSize({ width: 1281, height: 721 }), { width: 641, height: 361 });
  assert.equal(depthPath({ file: 'stills/yard-night.webp' }), 'depth/yard-night.png');
});

test('setDepthInText adds one line and nothing else', () => {
  const result = setDepthInText(text, 'stills/b.webp', 'depth/b.png');
  const added = result.split('\n').filter((line) => !text.split('\n').includes(line));
  assert.deepEqual(added, ['      "depth": "depth/b.png",']);
  assert.equal(result.split('\n').length, text.split('\n').length + 1);
  const parsed = JSON.parse(result);
  assert.equal(parsed.assets[1].depth, 'depth/b.png');
  assert.equal(parsed.assets[0].depth, undefined);
  assert.deepEqual(Object.keys(parsed.assets[1]).slice(0, 4), ['id', 'kind', 'file', 'depth']);
});

test('setDepthInText replaces an existing depth and keeps CRLF', () => {
  const once = setDepthInText(text, 'stills/a.webp', 'depth/old.png');
  const twice = setDepthInText(once, 'stills/a.webp', 'depth/a.png');
  assert.equal(twice.split('\n').length, once.split('\n').length);
  assert.equal(JSON.parse(twice).assets[0].depth, 'depth/a.png');
  const crlf = setDepthInText(text.replaceAll('\n', '\r\n'), 'stills/a.webp', 'depth/a.png');
  assert.ok(!/[^\r]\n/.test(crlf));
});

test('setDepthInText refuses an unknown or ambiguous file', () => {
  assert.throws(() => setDepthInText(text, 'stills/missing.webp', 'depth/x.png'));
  const twin = `${JSON.stringify({ version: 1, assets: [asset('a'), asset('a')] }, null, 2)}\n`;
  assert.throws(() => setDepthInText(twin, 'stills/a.webp', 'depth/a.png'));
});

test('encodeGreyPng writes a readable 8-bit greyscale PNG with its text', () => {
  const pixels = Uint8Array.from({ length: 12 }, (_, i) => i * 20);
  const png = encodeGreyPng(pixels, 4, 3, { Model: 'some/model' });
  assert.deepEqual(readPngHeader(png), { width: 4, height: 3, bitDepth: 8, colourType: 0 });
  assert.ok(png.includes(Buffer.from('Model\0some/model', 'latin1')));
  const idat = png.indexOf('IDAT');
  const raw = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)));
  assert.deepEqual([...raw.subarray(1, 5)], [0, 20, 40, 60]);
  assert.equal(readPngHeader(Buffer.from('not a png at all, just some text')), null);
  assert.throws(() => encodeGreyPng(pixels, 5, 3));
});

test('waitUntilCool waits from the pause threshold down to the resume threshold', async () => {
  const readings = [84, 78, 71, 69];
  let waits = 0;
  const options = { pauseAt: 80, resumeAt: 70, read: async () => readings.shift() ?? null, wait: async () => void (waits += 1), log: () => {} };
  assert.equal(await waitUntilCool(options), 69);
  assert.equal(waits, 3);
  assert.equal(await waitUntilCool({ ...options, read: async () => 75 }), 75);
  await assert.rejects(waitUntilCool({ ...options, read: async () => null }));
});
