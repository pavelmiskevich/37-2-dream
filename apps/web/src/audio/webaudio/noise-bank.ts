import { generateNoise, type NoiseColor } from '../noise';
import { deriveRng, type AudioSeed } from '../rng';

/** Loop length of noise buffers; long enough that the repetition is not heard. */
const NOISE_SECONDS = 4;

/** Lazily built, seeded, loopable noise buffers shared by all voices of an engine. */
export class NoiseBank {
  private readonly buffers = new Map<NoiseColor, AudioBuffer>();

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly seed: AudioSeed,
  ) {}

  buffer(color: NoiseColor): AudioBuffer {
    let buffer = this.buffers.get(color);
    if (!buffer) {
      const length = Math.round(NOISE_SECONDS * this.ctx.sampleRate);
      const data = generateNoise(color, length, deriveRng(this.seed, `noise:${color}`));
      buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      buffer.copyToChannel(data, 0);
      this.buffers.set(color, buffer);
    }
    return buffer;
  }

  /**
   * Looping noise source. `offset` (0…1 of the loop) lets voices that share a
   * buffer start at different points so they do not correlate.
   */
  source(color: NoiseColor, offset: number): AudioBufferSourceNode {
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer(color);
    source.loop = true;
    source.start(this.ctx.currentTime, offset * NOISE_SECONDS);
    return source;
  }
}
