import { describe, expect, it } from 'vitest';
import { LOAD_RETRY_MS, RetryingLoads } from './loads';

/** A load that fails `failures` times per id before it succeeds. */
function flaky(failures: number) {
  const calls = new Map<string, number>();
  const load = (id: string) => {
    const n = (calls.get(id) ?? 0) + 1;
    calls.set(id, n);
    return n <= failures ? Promise.reject(new Error(`${id} #${n}`)) : Promise.resolve(`${id} ok`);
  };
  return { load, calls: (id: string) => calls.get(id) ?? 0 };
}

describe('RetryingLoads', () => {
  it('shares one load between requests', async () => {
    const source = flaky(0);
    const loads = new RetryingLoads(source.load);
    const [a, b] = await Promise.all([loads.request('x'), loads.request('x')]);
    expect(a).toBe('x ok');
    expect(b).toBe('x ok');
    expect(await loads.request('x')).toBe('x ok');
    expect(source.calls('x')).toBe(1);
    expect(loads.has('x')).toBe(true);
  });

  it('answers null for a failed load and tries again once the pause is over (#81)', async () => {
    const source = flaky(1);
    let now = 0;
    const errors: string[] = [];
    const loads = new RetryingLoads(source.load, { now: () => now, onError: (id) => errors.push(id) });

    expect(await loads.request('x')).toBeNull();
    expect(errors).toEqual(['x']);
    expect(loads.has('x')).toBe(false);
    // Asked again on the next frames: no new fetch while the pause lasts.
    now = LOAD_RETRY_MS - 1;
    expect(await loads.request('x')).toBeNull();
    expect(source.calls('x')).toBe(1);

    now = LOAD_RETRY_MS;
    expect(await loads.request('x')).toBe('x ok');
    expect(source.calls('x')).toBe(2);
  });

  it('keeps retrying a file that stays missing, at most once a pause', async () => {
    const source = flaky(Infinity);
    let now = 0;
    const loads = new RetryingLoads(source.load, { now: () => now });
    for (let frame = 0; frame < 600; frame++) {
      now = frame * (1000 / 60);
      await loads.request('x');
    }
    // Ten seconds of frames, a try every two seconds.
    expect(source.calls('x')).toBe(5);
  });

  it('lists the loads in flight and done, not the failed or forgotten ones', async () => {
    const source = flaky(1);
    const loads = new RetryingLoads((id) => (id === 'bad' ? source.load(id) : new Promise<string>(() => {})), { now: () => 0 });
    void loads.request('a');
    void loads.request('b');
    await loads.request('bad');
    expect(loads.ids()).toEqual(['a', 'b']);
    loads.forget('a');
    expect(loads.ids()).toEqual(['b']);
  });

  it('loads a forgotten asset anew, even right after a failure', async () => {
    const source = flaky(1);
    const loads = new RetryingLoads(source.load, { now: () => 0 });
    expect(await loads.request('x')).toBeNull();
    loads.forget('x');
    expect(await loads.request('x')).toBe('x ok');
  });

  it('does not mark a load forgotten while in flight as failed', async () => {
    let reject: (error: Error) => void = () => {};
    let calls = 0;
    const loads = new RetryingLoads(
      (id) => {
        calls++;
        return calls === 1 ? new Promise<string>((_, no) => (reject = no)) : Promise.resolve(`${id} ok`);
      },
      { now: () => 0 },
    );
    const first = loads.request('x');
    loads.forget('x');
    const second = loads.request('x');
    reject(new Error('released'));
    expect(await first).toBeNull();
    expect(await second).toBe('x ok');
    expect(await loads.request('x')).toBe('x ok');
    expect(calls).toBe(2);
  });
});
