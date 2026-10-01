/**
 * Dream seeds: `DREAM-XXXX-XXXX-XXXX`, where every X is an uppercase hex digit
 * (48 bits in total). Only the canonical form is ever hashed, so
 * `dream-8f72a19c37b2` and `DREAM-8F72-A19C-37B2` produce the same dream.
 */

/** A seed in canonical form. Obtain one via `parseSeed`, `normalizeSeed` or `seedFromEntropy`. */
export type DreamSeed = string & { readonly __brand: 'DreamSeed' };

/** Number of entropy bytes `seedFromEntropy` consumes. */
export const SEED_ENTROPY_BYTES = 6;

const CANONICAL = /^DREAM-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;
const LENIENT = /^(?:DREAM-?)?([0-9A-F]{4})-?([0-9A-F]{4})-?([0-9A-F]{4})$/;

/** True only for a seed already in canonical form. */
export function isDreamSeed(value: string): value is DreamSeed {
  return CANONICAL.test(value);
}

/**
 * Parses user input (address bar, text field) into a canonical seed.
 * Accepts any letter case, surrounding whitespace, a missing `DREAM` prefix and
 * missing dashes between groups. Returns `undefined` for anything else.
 */
export function parseSeed(input: string): DreamSeed | undefined {
  const match = LENIENT.exec(input.trim().toUpperCase());
  if (!match) return undefined;
  return `DREAM-${match[1]}-${match[2]}-${match[3]}` as DreamSeed;
}

/** Like `parseSeed`, but throws `RangeError` on invalid input. */
export function normalizeSeed(input: string): DreamSeed {
  const seed = parseSeed(input);
  if (seed === undefined) {
    throw new RangeError(`Invalid dream seed: "${input}". Expected DREAM-XXXX-XXXX-XXXX (hex).`);
  }
  return seed;
}

/**
 * Builds a new seed from caller-supplied entropy: the first
 * `SEED_ENTROPY_BYTES` bytes are used. The core has no entropy source of its
 * own (D-005); the app passes e.g. `crypto.getRandomValues(new Uint8Array(6))`.
 */
export function seedFromEntropy(bytes: ArrayLike<number>): DreamSeed {
  if (bytes.length < SEED_ENTROPY_BYTES) {
    throw new RangeError(`seedFromEntropy needs ${SEED_ENTROPY_BYTES} bytes, got ${bytes.length}.`);
  }
  let hex = '';
  for (let i = 0; i < SEED_ENTROPY_BYTES; i++) {
    const byte = bytes[i];
    if (byte === undefined || !Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new RangeError(`seedFromEntropy: byte ${i} is not an integer in 0..255.`);
    }
    hex += byte.toString(16).padStart(2, '0');
  }
  hex = hex.toUpperCase();
  return `DREAM-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}` as DreamSeed;
}
