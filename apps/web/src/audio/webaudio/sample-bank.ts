import { sampleUrl, type SampleId } from '../samples';

/** Decoded recordings the engine plays (D-032). */
export interface SampleBank {
  /** The decoded recording, or null while it loads or when it failed to. */
  get(id: SampleId): AudioBuffer | null;
  /** Resolves once every recording has loaded or failed; never rejects. */
  readonly ready: Promise<void>;
}

/** A bank with nothing in it: every recording is skipped. */
export const EMPTY_SAMPLE_BANK: SampleBank = { get: () => null, ready: Promise.resolve() };

/**
 * Starts fetching and decoding `ids` from `root` into `context` and returns
 * at once: nothing waits for the recordings. A file that is missing or does
 * not decode stays null, and whatever plays it is silently skipped — the
 * synthesiser keeps the sound going (D-011).
 */
export function loadSampleBank(context: BaseAudioContext, root: string, ids: readonly SampleId[]): SampleBank {
  const buffers = new Map<SampleId, AudioBuffer>();
  const load = async (id: SampleId): Promise<void> => {
    try {
      const response = await fetch(sampleUrl(root, id));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      buffers.set(id, await context.decodeAudioData(await response.arrayBuffer()));
    } catch (error) {
      console.warn(`Recording "${id}" is unavailable; the awakening goes without it.`, error);
    }
  };
  const ready = Promise.all([...new Set(ids)].map(load)).then(() => undefined);
  return { get: (id) => buffers.get(id) ?? null, ready };
}
