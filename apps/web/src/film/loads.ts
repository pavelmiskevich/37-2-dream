/**
 * Deduplicated loads that may be retried: a load in flight or done is shared
 * by every request; a failed one resolves to null and is forgotten, so the
 * next request after `retryMs` tries again (#81). Within `retryMs` of a
 * failure a request answers null at once: the player asks for the shot on
 * screen on every frame, and a missing file must not be fetched sixty times
 * a second.
 */

/** Pause after a failed load before the asset is tried again, ms. */
export const LOAD_RETRY_MS = 2000;

export interface LoadsOptions {
  /** Clock in ms (default `performance.now`). */
  now?: () => number;
  retryMs?: number;
  /** Called on every failed load. */
  onError?: (id: string, error: unknown) => void;
}

export class RetryingLoads<T> {
  private readonly loads = new Map<string, Promise<T | null>>();
  private readonly failedAt = new Map<string, number>();
  private readonly now: () => number;
  private readonly retryMs: number;

  constructor(
    private readonly load: (id: string) => Promise<T>,
    private readonly options: LoadsOptions = {},
  ) {
    this.now = options.now ?? (() => performance.now());
    this.retryMs = options.retryMs ?? LOAD_RETRY_MS;
  }

  /** The shared load of `id`; null when it failed (now or within `retryMs`). */
  request(id: string): Promise<T | null> {
    const shared = this.loads.get(id);
    if (shared) return shared;
    const failed = this.failedAt.get(id);
    if (failed !== undefined && this.now() - failed < this.retryMs) return Promise.resolve(null);
    this.failedAt.delete(id);
    const promise: Promise<T | null> = this.load(id).catch((error: unknown) => {
      // Only the load still on record is forgotten: `forget` may have dropped it already.
      if (this.loads.get(id) === promise) {
        this.loads.delete(id);
        this.failedAt.set(id, this.now());
      }
      this.options.onError?.(id, error);
      return null;
    });
    this.loads.set(id, promise);
    return promise;
  }

  /** True while `id` is loading or loaded (not forgotten, not failed). */
  has(id: string): boolean {
    return this.loads.has(id);
  }

  /** Drops `id`: the next request loads it anew, without waiting out a failure. */
  forget(id: string): void {
    this.loads.delete(id);
    this.failedAt.delete(id);
  }

  clear(): void {
    this.loads.clear();
    this.failedAt.clear();
  }
}
