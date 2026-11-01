import { DEFAULT_SOUND_LAYER, SOUNDS, type SoundEvent, type SoundId } from '../events';
import {
  DEFAULT_LAYER_VOLUMES,
  LAYERS,
  mixLayers,
  type LayerGains,
  type LayerName,
  type LayerVolumes,
} from '../layers';
import { clamp01 } from '../math';
import { MUFFLE, muffleCutoff } from '../muffle';
import { soundProfileFromSeed, type SoundProfile } from '../profile';
import type { AudioSeed } from '../rng';
import { DEFAULT_SAMPLE_LAYER, samplePlayShape, type SampleId } from '../samples';
import { NoiseBank } from './noise-bank';
import { MIN_FADE, glideParam, rampParam, releaseInstance } from './params';
import { EMPTY_SAMPLE_BANK, type SampleBank } from './sample-bank';
import {
  createBreathVoice,
  CreakVoice,
  HumVoice,
  KitchenVoice,
  MonitorVoice,
  StingerVoice,
  VacuumVoice,
  VentilatorVoice,
  type Voice,
  type VoiceEnv,
} from './voices';

export interface AudioEngineOptions {
  /** Dream seed: noise buffers and sound character derive from it. */
  seed: AudioSeed;
  /** How far ahead periodic sounds are scheduled, seconds. */
  lookahead?: number;
  /** Recordings `sample.play` can play (D-032); without a bank every recording is skipped. */
  samples?: SampleBank;
}

export interface AudioEngine {
  readonly context: BaseAudioContext;
  readonly seed: AudioSeed;
  readonly profile: SoundProfile;
  /** Applies a sound event coming from the simulation. */
  handle(event: SoundEvent): void;
  isPlaying(sound: SoundId): boolean;
  /** True once the recording is loaded and decoded, so `sample.play` will be heard. */
  hasSample(sample: SampleId): boolean;
  /** Layer the sound is playing in, or null when it is off. */
  layerOf(sound: SoundId): LayerName | null;
  /** Current effective layer gains after compatibility rules and master volume. */
  layerGains(): LayerGains;
  /** Fades everything out and detaches from the context. The context itself stays open. */
  dispose(fade?: number): void;
}

/** One play of a recording: its source and the gain that shapes its fades. */
interface SamplePlay {
  out: GainNode;
  source: AudioBufferSourceNode;
}

/** Ramp time for layer gain changes (ducking, volume sliders). */
const LAYER_RAMP = 0.4;
const TICK_MS = 25;

/**
 * Creates the sound engine on an existing context. The context is created and
 * unlocked by a user gesture elsewhere (see `unlockAudio`, D-010); the engine
 * never creates or closes it.
 */
export function createAudioEngine(context: BaseAudioContext, options: AudioEngineOptions): AudioEngine {
  return new WebAudioEngine(context, options);
}

class WebAudioEngine implements AudioEngine {
  readonly profile: SoundProfile;
  readonly seed: AudioSeed;
  private readonly lookahead: number;
  private readonly limiter: DynamicsCompressorNode;
  /** Low-pass in front of the limiter; open (transparent) unless a scene muffles the dream. */
  private readonly muffle: BiquadFilterNode;
  private readonly layers: Record<LayerName, GainNode>;
  private readonly volumes: LayerVolumes = { ...DEFAULT_LAYER_VOLUMES };
  private master = 1;
  private readonly voices: {
    monitor: MonitorVoice;
    ventilator: VentilatorVoice;
    vacuum: VacuumVoice;
    hum: HumVoice;
    breath: VentilatorVoice;
    kitchen: KitchenVoice;
  };
  /** One-shot creaks of the swing; not a looping sound, so not in `SOUNDS`. */
  private readonly creak: CreakVoice;
  /** The scare's stinger, on a bus of its own past the layers and the master volume. */
  private readonly stinger: StingerVoice;
  private readonly stingerBus: GainNode;
  private readonly voiceLayer = new Map<SoundId, LayerName>();
  private readonly samples: SampleBank;
  /** Plays of recordings still sounding, to stop them on `sample.stop` and `dispose`. */
  private readonly samplePlays = new Map<SampleId, Set<SamplePlay>>();
  private timer: ReturnType<typeof setInterval> | null;
  private disposed = false;

  constructor(
    readonly context: BaseAudioContext,
    options: AudioEngineOptions,
  ) {
    this.seed = options.seed;
    this.lookahead = options.lookahead ?? 0.15;
    this.samples = options.samples ?? EMPTY_SAMPLE_BANK;
    this.profile = soundProfileFromSeed(options.seed);

    // Safety limiter: several loud sounds at once must not distort.
    this.limiter = context.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;
    this.limiter.connect(context.destination);

    this.muffle = context.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = muffleCutoff(0);
    this.muffle.Q.value = MUFFLE.q;
    this.muffle.connect(this.limiter);

    const gains = this.mix();
    const layers = {} as Record<LayerName, GainNode>;
    for (const layer of LAYERS) {
      const node = context.createGain();
      node.gain.value = gains[layer];
      node.connect(this.muffle);
      layers[layer] = node;
    }
    this.layers = layers;

    const env: VoiceEnv = {
      ctx: context,
      seed: options.seed,
      profile: this.profile,
      noise: new NoiseBank(context, options.seed),
    };
    this.voices = {
      monitor: new MonitorVoice(env),
      ventilator: new VentilatorVoice(env),
      vacuum: new VacuumVoice(env),
      hum: new HumVoice(env),
      breath: createBreathVoice(env),
      kitchen: new KitchenVoice(env),
    };
    this.creak = new CreakVoice(env);
    this.stinger = new StingerVoice(env);
    this.stingerBus = context.createGain();
    this.stingerBus.connect(this.muffle);

    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  handle(event: SoundEvent): void {
    if (this.disposed) return;
    switch (event.type) {
      case 'sound.start':
        this.start(event.sound, event.layer ?? DEFAULT_SOUND_LAYER[event.sound], event.fade);
        break;
      case 'sound.stop':
        this.stop(event.sound, event.fade);
        break;
      case 'monitor.intensity':
        this.voices.monitor.setIntensity(event.value);
        break;
      case 'monitor.silence':
        this.voices.monitor.silence();
        break;
      case 'monitor.beep':
        this.voices.monitor.beepOnce(this.layers[this.voiceLayer.get('monitor') ?? DEFAULT_SOUND_LAYER.monitor]);
        break;
      case 'ventilator.rate':
        this.voices.ventilator.setRate(event.breathsPerMinute);
        break;
      case 'breath.rate':
        this.voices.breath.setRate(event.breathsPerMinute);
        break;
      case 'vacuum.turbine':
        this.voices.vacuum.setTurbine(event.value);
        break;
      case 'vacuum.volume':
        this.voices.vacuum.setVolume(event.value);
        break;
      case 'swing.creak':
        this.creak.play(event.strength, event.pitch ?? 1, this.layers.location);
        break;
      case 'stinger.hit':
        this.stinger.play(event.strength ?? 1, event.soft ?? false, this.stingerBus);
        break;
      case 'layer.volume':
        this.volumes[event.layer] = clamp01(event.value);
        this.applyMix();
        break;
      case 'master.volume':
        this.master = clamp01(event.value);
        this.applyMix();
        break;
      case 'master.muffle':
        glideParam(this.muffle.frequency, muffleCutoff(event.value), this.context.currentTime, MUFFLE.glide);
        break;
      case 'sample.play':
        this.playSample(event);
        break;
      case 'sample.stop':
        this.stopSample(event.sample, event.fade ?? 0.3);
        break;
    }
    this.tick();
  }

  isPlaying(sound: SoundId): boolean {
    return this.voices[sound].playing;
  }

  hasSample(sample: SampleId): boolean {
    return this.samples.get(sample) !== null;
  }

  layerOf(sound: SoundId): LayerName | null {
    return this.voices[sound].playing ? (this.voiceLayer.get(sound) ?? null) : null;
  }

  layerGains(): LayerGains {
    return this.mix();
  }

  dispose(fade = 0.3): void {
    if (this.disposed) return;
    for (const sound of SOUNDS) this.stop(sound, fade);
    for (const sample of [...this.samplePlays.keys()]) this.stopSample(sample, fade);
    this.disposed = true;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const length = Math.max(fade, MIN_FADE);
    for (const layer of LAYERS) rampParam(this.layers[layer].gain, 0, this.context.currentTime, length);
    rampParam(this.stingerBus.gain, 0, this.context.currentTime, length);
    setTimeout(() => {
      this.muffle.disconnect();
      this.limiter.disconnect();
    }, (length + 0.5) * 1000);
  }

  private start(sound: SoundId, layer: LayerName, fade: number | undefined): void {
    const voice: Voice = this.voices[sound];
    if (voice.playing && this.voiceLayer.get(sound) === layer) {
      voice.resume();
      return;
    }
    // Moving to another layer: the old instance fades out while the new one fades in.
    if (voice.playing) voice.stop(fade ?? voice.defaultFadeOut);
    voice.start(this.layers[layer], fade ?? voice.defaultFadeIn);
    this.voiceLayer.set(sound, layer);
    this.applyMix();
  }

  private stop(sound: SoundId, fade: number | undefined): void {
    const voice: Voice = this.voices[sound];
    if (!voice.playing) return;
    voice.stop(fade ?? voice.defaultFadeOut);
    this.voiceLayer.delete(sound);
    this.applyMix();
  }

  private playSample(event: Extract<SoundEvent, { type: 'sample.play' }>): void {
    const buffer = this.samples.get(event.sample);
    if (!buffer) return;
    const shape = samplePlayShape(buffer.duration, event);
    if (shape.duration <= 0) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const level = clamp01(event.gain ?? 1);

    const out = ctx.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(level, now + Math.max(shape.fadeIn, MIN_FADE));
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = event.loop ?? false;
    source.connect(out);
    out.connect(this.layers[event.layer ?? DEFAULT_SAMPLE_LAYER[event.sample]]);
    source.start(now, shape.offset);
    if (Number.isFinite(shape.duration)) {
      const end = now + shape.duration;
      const fadeOut = Math.max(shape.fadeOut, MIN_FADE);
      out.gain.setValueAtTime(level, Math.max(now + Math.max(shape.fadeIn, MIN_FADE), end - fadeOut));
      out.gain.linearRampToValueAtTime(0, end);
      source.stop(end + 0.05);
    }

    const play: SamplePlay = { out, source };
    const plays = this.samplePlays.get(event.sample) ?? new Set<SamplePlay>();
    plays.add(play);
    this.samplePlays.set(event.sample, plays);
    source.addEventListener('ended', () => {
      plays.delete(play);
      setTimeout(() => out.disconnect(), 250);
    });
  }

  private stopSample(sample: SampleId, fade: number): void {
    const plays = this.samplePlays.get(sample);
    if (!plays) return;
    for (const play of plays) releaseInstance(this.context, play.out, [play.source], fade);
    plays.clear();
  }

  private mix(): LayerGains {
    const active = new Set<LayerName>();
    for (const sound of SOUNDS) {
      const layer = this.voiceLayer.get(sound);
      if (layer && this.voices[sound].playing) active.add(layer);
    }
    return mixLayers(this.volumes, active, this.master);
  }

  private applyMix(): void {
    const gains = this.mix();
    const now = this.context.currentTime;
    for (const layer of LAYERS) rampParam(this.layers[layer].gain, gains[layer], now, LAYER_RAMP);
  }

  private tick(): void {
    const now = this.context.currentTime;
    for (const sound of SOUNDS) this.voices[sound].schedule(now, now + this.lookahead);
  }
}
