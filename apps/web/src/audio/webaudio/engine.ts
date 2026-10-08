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
import { NoiseBank } from './noise-bank';
import { MIN_FADE, glideParam, rampParam } from './params';
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
}

export interface AudioEngine {
  readonly context: BaseAudioContext;
  readonly seed: AudioSeed;
  readonly profile: SoundProfile;
  /** Applies a sound event coming from the simulation. */
  handle(event: SoundEvent): void;
  isPlaying(sound: SoundId): boolean;
  /** Layer the sound is playing in, or null when it is off. */
  layerOf(sound: SoundId): LayerName | null;
  /** Current effective layer gains after compatibility rules and master volume. */
  layerGains(): LayerGains;
  /** Fades everything out and detaches from the context. The context itself stays open. */
  dispose(fade?: number): void;
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
  private timer: ReturnType<typeof setInterval> | null;
  private disposed = false;

  constructor(
    readonly context: BaseAudioContext,
    options: AudioEngineOptions,
  ) {
    this.seed = options.seed;
    this.lookahead = options.lookahead ?? 0.15;
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
    }
    this.tick();
  }

  isPlaying(sound: SoundId): boolean {
    return this.voices[sound].playing;
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
