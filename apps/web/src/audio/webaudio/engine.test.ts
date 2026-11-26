import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { muffleCutoff } from '../muffle';
import { createAudioEngine, type AudioEngine } from './engine';

/**
 * A stand-in for the Web Audio graph: nodes only remember what they are and
 * where they are connected, params remember their last target. Enough to
 * check the engine's routing without a browser.
 */
class FakeParam {
  value: number;
  constructor(value = 0) {
    this.value = value;
  }
  setValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  exponentialRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  setTargetAtTime(value: number): this {
    this.value = value;
    return this;
  }
  setValueCurveAtTime(): this {
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
  cancelAndHoldAtTime(): this {
    return this;
  }
}

class FakeNode {
  /** Nodes this one feeds; connections into a param (LFOs) are not followed. */
  readonly outputs = new Set<FakeNode>();
  readonly gain = new FakeParam(1);
  readonly frequency = new FakeParam(350);
  readonly detune = new FakeParam();
  readonly Q = new FakeParam(1);
  readonly threshold = new FakeParam();
  readonly knee = new FakeParam();
  readonly ratio = new FakeParam();
  readonly attack = new FakeParam();
  readonly release = new FakeParam();
  readonly playbackRate = new FakeParam(1);
  type = '';
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  constructor(readonly kind: string) {}
  connect<T extends FakeNode | FakeParam>(destination: T): T {
    if (destination instanceof FakeNode) this.outputs.add(destination);
    return destination;
  }
  disconnect(): void {
    this.outputs.clear();
  }
  start(): void {}
  stop(): void {}
  setPeriodicWave(): void {}
  addEventListener(): void {}
}

class FakeContext {
  readonly currentTime = 0;
  readonly sampleRate = 8000;
  readonly destination = new FakeNode('destination');
  readonly nodes: FakeNode[] = [];
  private make(kind: string): FakeNode {
    const node = new FakeNode(kind);
    this.nodes.push(node);
    return node;
  }
  createGain(): FakeNode {
    return this.make('gain');
  }
  createBiquadFilter(): FakeNode {
    return this.make('biquad');
  }
  createDynamicsCompressor(): FakeNode {
    return this.make('compressor');
  }
  createOscillator(): FakeNode {
    return this.make('oscillator');
  }
  createBufferSource(): FakeNode {
    return this.make('buffer-source');
  }
  createBuffer(_channels: number, length: number) {
    return { duration: length / this.sampleRate, copyToChannel: () => undefined };
  }
  createPeriodicWave() {
    return {};
  }
}

/** Every node a signal from `from` passes through on its way to the speakers. */
function downstream(from: FakeNode): Set<FakeNode> {
  const seen = new Set<FakeNode>();
  const queue = [from];
  while (queue.length > 0) {
    const node = queue.pop()!;
    for (const next of node.outputs) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

describe('audio engine routing', () => {
  let ctx: FakeContext;
  let engine: AudioEngine;
  let limiter: FakeNode;
  let muffle: FakeNode;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = new FakeContext();
    engine = createAudioEngine(ctx as unknown as BaseAudioContext, { seed: 'DREAM-8F72-A19C-37B2' });
    limiter = ctx.nodes.find((node) => node.kind === 'compressor')!;
    // The muffle is the one filter wired straight into the limiter.
    muffle = ctx.nodes.find((node) => node.kind === 'biquad' && node.outputs.has(limiter))!;
  });

  afterEach(() => {
    engine.dispose(0);
    vi.useRealTimers();
  });

  /** Oscillators the stinger created for one `stinger.hit`. */
  function hit(soft: boolean): FakeNode[] {
    const before = ctx.nodes.length;
    engine.handle({ type: 'stinger.hit', strength: 1, soft });
    return ctx.nodes.slice(before).filter((node) => node.kind === 'oscillator');
  }

  it('plays the gasp of waking from a fall on the stinger bus, past the muffle (#134)', () => {
    const before = ctx.nodes.length;
    engine.handle({ type: 'gasp' });
    const sources = ctx.nodes.slice(before).filter((node) => node.kind === 'buffer-source');
    expect(sources).toHaveLength(1);
    const path = downstream(sources[0]!);
    expect(path.has(ctx.destination)).toBe(true);
    expect(path.has(muffle)).toBe(false);
    const silent = ctx.nodes.length;
    engine.handle({ type: 'gasp', strength: 0 });
    expect(ctx.nodes.length).toBe(silent);
  });

  it('blows the wind of a fall on the stinger bus, once, and cuts it on stop (#137)', () => {
    const before = ctx.nodes.length;
    engine.handle({ type: 'wind.start' });
    const sources = ctx.nodes.slice(before).filter((node) => node.kind === 'buffer-source');
    expect(sources).toHaveLength(2);
    for (const source of sources) {
      const path = downstream(source);
      expect(path.has(ctx.destination)).toBe(true);
      expect(path.has(muffle)).toBe(false);
    }
    const again = ctx.nodes.length;
    engine.handle({ type: 'wind.start' });
    expect(ctx.nodes.length).toBe(again);
    engine.handle({ type: 'wind.stop' });
    engine.handle({ type: 'wind.stop' });
    const restart = ctx.nodes.length;
    engine.handle({ type: 'wind.start' });
    expect(ctx.nodes.length).toBeGreaterThan(restart);
  });

  it('sends the mix through the muffle into the limiter', () => {
    expect(limiter.outputs.has(ctx.destination)).toBe(true);
    expect(muffle).toBeDefined();
    const before = ctx.nodes.length;
    engine.handle({ type: 'sound.start', sound: 'hum' });
    // Sources heard on the output (an LFO that only moves a param is not).
    const heard = ctx.nodes
      .slice(before)
      .filter((node) => node.kind === 'oscillator' || node.kind === 'buffer-source')
      .map(downstream)
      .filter((path) => path.has(ctx.destination));
    expect(heard.length).toBeGreaterThan(0);
    for (const path of heard) expect(path.has(muffle)).toBe(true);
  });

  /** Gains on the way of the sound's audible sources started by `start`. */
  function gainsOf(start: () => void): FakeNode[][] {
    const before = ctx.nodes.length;
    start();
    return ctx.nodes
      .slice(before)
      .filter((node) => node.kind === 'oscillator' || node.kind === 'buffer-source')
      .map(downstream)
      .filter((path) => path.has(ctx.destination))
      .map((path) => [...path].filter((node) => node.kind === 'gain'));
  }

  it('plays each sound at its own volume and glides it while it plays (#80)', () => {
    expect(engine.soundVolumeOf('hum')).toBe(1);
    engine.handle({ type: 'sound.volume', sound: 'hum', value: 0.37 });
    const paths = gainsOf(() => engine.handle({ type: 'sound.start', sound: 'hum' }));
    expect(paths.length).toBeGreaterThan(0);
    const buses = new Set(paths.map((gains) => gains.find((node) => node.gain.value === 0.37)));
    expect(buses.size).toBe(1);
    const [bus] = [...buses];
    expect(bus).toBeDefined();

    engine.handle({ type: 'sound.volume', sound: 'hum', value: 2 });
    expect(engine.soundVolumeOf('hum')).toBe(1);
    expect(bus!.gain.value).toBe(1);
    // Another sound's volume leaves the hum alone.
    engine.handle({ type: 'sound.volume', sound: 'kitchen', value: 0.3 });
    expect(bus!.gain.value).toBe(1);
  });

  it('keeps a sound\'s volume across a stop and a move to another layer', () => {
    engine.handle({ type: 'sound.volume', sound: 'breath', value: 0.4 });
    engine.handle({ type: 'sound.start', sound: 'breath' });
    engine.handle({ type: 'sound.stop', sound: 'breath' });
    expect(engine.soundVolumeOf('breath')).toBe(0.4);
    const paths = gainsOf(() => engine.handle({ type: 'sound.start', sound: 'breath', layer: 'ambient' }));
    expect(paths.length).toBeGreaterThan(0);
    for (const gains of paths) expect(gains.some((node) => node.gain.value === 0.4)).toBe(true);
  });

  it('lets the stinger past the muffle, however muffled the mix is', () => {
    engine.handle({ type: 'master.muffle', value: 0.6 });
    expect(muffle.frequency.value).toBeCloseTo(muffleCutoff(0.6), 6);

    const tones = hit(false);
    expect(tones.length).toBeGreaterThan(0);
    for (const tone of tones) {
      const path = downstream(tone);
      expect(path.has(limiter)).toBe(true);
      expect(path.has(ctx.destination)).toBe(true);
      expect(path.has(muffle)).toBe(false);
      // Only the stinger's own low-pass, wide open for the hit.
      const filters = [...path].filter((node) => node.kind === 'biquad');
      expect(filters.map((node) => node.frequency.value)).toEqual([9000]);
    }
  });

  it('keeps the softened stinger dull with its own low-pass', () => {
    engine.handle({ type: 'master.muffle', value: 0 });
    for (const tone of hit(true)) {
      const path = downstream(tone);
      expect(path.has(muffle)).toBe(false);
      const filters = [...path].filter((node) => node.kind === 'biquad');
      expect(filters.map((node) => node.frequency.value)).toEqual([1500]);
    }
  });
});
