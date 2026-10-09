// Minimal 8-bit greyscale PNG writer and header reader: enough for depth maps,
// with text chunks that say which model made the map.
import { crc32, deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/**
 * @param {Uint8Array} pixels row-major greyscale, `width * height` bytes
 * @param {number} width
 * @param {number} height
 * @param {Record<string, string>} [text] Latin-1 keyword → value (tEXt chunks)
 * @returns {Buffer}
 */
export function encodeGreyPng(pixels, width, height, text = {}) {
  if (pixels.length !== width * height) {
    throw new Error(`Expected ${width * height} pixels for ${width}x${height}, got ${pixels.length}`);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // colour type: greyscale
  // Filter type 0 (none) on every row: depth maps are smooth, deflate copes.
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  const texts = Object.entries(text).map(([key, value]) =>
    chunk('tEXt', Buffer.concat([Buffer.from(key, 'latin1'), Buffer.from([0]), Buffer.from(value, 'latin1')])),
  );
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    ...texts,
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number, bitDepth: number, colourType: number } | null} null when not a PNG
 */
export function readPngHeader(bytes) {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.length < 26 || !buffer.subarray(0, 8).equals(SIGNATURE)) return null;
  if (buffer.toString('latin1', 12, 16) !== 'IHDR') return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colourType: buffer[25],
  };
}
