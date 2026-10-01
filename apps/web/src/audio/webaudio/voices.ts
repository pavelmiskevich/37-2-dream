import { PeriodicClock } from '../clock';
import { humHarmonics } from '../hum';
import { creakShape } from '../creak';
import { clamp, clamp01 } from '../math';
import { BEEP_HARMONICS, beepShape, monitorPeriod, type BeepShape } from '../monitor';
import type { SoundProfile } from '../profile';
import { VACUUM_SPIN_FACTOR, vacuumParams, type VacuumParams } from '../vacuum';
import { breathCycle, breathPeriod, MAX_BREATHS_PER_MINUTE, MIN_BREATHS_PER_MINUTE } from '../ventilator';
import type { NoiseBank } from './noise-bank';
import { createFadeIn, createHarmonicWave, glideParam, releaseInstance } from './params';

export interface VoiceEnv {
  ctx: BaseAudioContext;
  profile: SoundProfile;
  noise: NoiseBank;
}

/**
 * A synthesised sound. Every `start` builds a fresh node graph that fades in;
 * `stop` fades that graph out and forgets it, so a quick stop → start
 * crossfades two instances instead of cutting one.
 */
export interface Voice {
  readonly playing: boolean;
  readonly defaultFadeIn: number;
  readonly defaultFadeOut: number;
  start(destination: AudioNode, fade: number): void;
  stop(fade: number): void;
  /** Called on a playing voice by a repeated start event. */
  resume(): void;
  /** Look-ahead scheduling of periodic events in [now, until). */
  schedule(now: number, until: number): void;
}

/** Overall level of each voice before layers; keeps the four sounds roughly balanced. */
const MONITOR_LEVEL = 0.45;
const VENTILATOR_LEVEL = 0.55;
const VACUUM_LEVEL = 0.45;
const HUM_LEVEL = 0.2;

export class MonitorVoice implements Voice {
  readonly defaultFadeIn = 0.05;
  readonly defaultFadeOut = 0.15;
  private out: GainNode | null = null;
  private readonly clock = new PeriodicClock();
  private intensity = 0;
  private wave: PeriodicWave | null = null;
  /** Beeps scheduled ahead, so silence can cancel the ones not yet heard. */
  private pending: { at: number; env: GainNode }[] = [];

  constructor(private readonly env: VoiceEnv) {}

  get playing(): boolean {
    return this.out !== null;
  }

  start(destination: AudioNode, fade: number): void {
    const { ctx } = this.env;
    this.out = createFadeIn(ctx, destination, fade, MONITOR_LEVEL);
    this.clock.start(ctx.currentTime + 0.03);
  }

  stop(fade: number): void {
    if (!this.out) return;
    releaseInstance(this.env.ctx, this.out, [], fade);
    this.out = null;
    this.clock.stop();
    this.pending = [];
  }

  resume(): void {
    if (this.out && !this.clock.running) this.clock.start(this.env.ctx.currentTime + 0.03);
  }

  setIntensity(value: number): void {
    this.intensity = clamp01(value);
    this.clock.retime(this.env.ctx.currentTime, monitorPeriod(this.intensity));
  }

  /** Stops beeping and drops beeps that were scheduled but have not started yet. */
  silence(): void {
    this.clock.stop();
    const now = this.env.ctx.currentTime;
    for (const beep of this.pending) {
      if (beep.at > now + 0.005) beep.env.disconnect();
    }
    this.pending = [];
  }

  /** A single calm "пип." into the voice, or straight into `fallback` when the voice is off. */
  beepOnce(fallback: AudioNode): void {
    const { ctx } = this.env;
    const target = this.out ?? fallback;
    const level = this.out ? 1 : MONITOR_LEVEL;
    this.playBeep(ctx.currentTime + 0.01, beepShape(0, this.env.profile.monitor.pitchHz), target, level);
  }

  schedule(now: number, until: number): void {
    if (!this.out) return;
    this.pending = this.pending.filter((beep) => beep.at > now - 0.5);
    for (const at of this.clock.take(now, until, () => monitorPeriod(this.intensity))) {
      const env = this.playBeep(at, beepShape(this.intensity, this.env.profile.monitor.pitchHz), this.out, 1);
      this.pending.push({ at, env });
    }
  }

  private playBeep(at: number, shape: BeepShape, target: AudioNode, level: number): GainNode {
    const { ctx } = this.env;
    this.wave ??= createHarmonicWave(ctx, BEEP_HARMONICS);
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.wave);
    osc.frequency.value = shape.frequency;
    const env = ctx.createGain();
    const peak = shape.gain * level;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + shape.attack);
    env.gain.setValueAtTime(peak, at + shape.duration - shape.release);
    env.gain.linearRampToValueAtTime(0, at + shape.duration);
    osc.connect(env).connect(target);
    osc.start(at);
    osc.stop(at + shape.duration + 0.02);
    osc.onended = () => env.disconnect();
    return env;
  }
}

export class VentilatorVoice implements Voice {
  readonly defaultFadeIn = 0.4;
  readonly defaultFadeOut = 0.8;
  private instance: {
    out: GainNode;
    envelope: GainNode;
    band: BiquadFilterNode;
    sources: AudioScheduledSourceNode[];
  } | null = null;
  private readonly clock = new PeriodicClock();
  private breathsPerMinute: number;

  constructor(private readonly env: VoiceEnv) {
    this.breathsPerMinute = env.profile.ventilator.breathsPerMinute;
  }

  get playing(): boolean {
    return this.instance !== null;
  }

  start(destination: AudioNode, fade: number): void {
    const { ctx, noise } = this.env;
    const out = createFadeIn(ctx, destination, fade, VENTILATOR_LEVEL);
    const envelope = ctx.createGain();
    envelope.gain.value = 0;
    envelope.connect(out);

    // Air: white noise through a band that moves between "ф" and "ш".
    const air = noise.source('white', 0.1);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = this.env.profile.ventilator.inhaleHz;
    air.connect(band).connect(envelope);

    // Body: a little low noise so the breath has weight, not just hiss.
    const body = noise.source('brown', 0.6);
    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.value = 350;
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.35;
    body.connect(bodyFilter).connect(bodyGain).connect(envelope);

    this.instance = { out, envelope, band, sources: [air, body] };
    this.clock.start(ctx.currentTime + 0.05);
  }

  stop(fade: number): void {
    if (!this.instance) return;
    releaseInstance(this.env.ctx, this.instance.out, this.instance.sources, fade);
    this.instance = null;
    this.clock.stop();
  }

  resume(): void {}

  /** Takes effect from the next breath; the current one is never cut. */
  setRate(breathsPerMinute: number): void {
    this.breathsPerMinute = clamp(breathsPerMinute, MIN_BREATHS_PER_MINUTE, MAX_BREATHS_PER_MINUTE);
  }

  schedule(now: number, until: number): void {
    const instance = this.instance;
    if (!instance) return;
    const period = () => breathPeriod(this.breathsPerMinute);
    for (const start of this.clock.take(now, until, period)) {
      const points = breathCycle(start, period(), this.env.profile.ventilator);
      points.forEach((point, i) => {
        if (i === 0) {
          instance.envelope.gain.setValueAtTime(point.gain, point.time);
          instance.band.frequency.setValueAtTime(point.frequency, point.time);
          instance.band.Q.setValueAtTime(point.q, point.time);
        } else {
          instance.envelope.gain.linearRampToValueAtTime(point.gain, point.time);
          instance.band.frequency.linearRampToValueAtTime(point.frequency, point.time);
          instance.band.Q.linearRampToValueAtTime(point.q, point.time);
        }
      });
    }
  }
}

/** Time constant for vacuum parameter changes: a slider jump becomes a glide. */
const VACUUM_GLIDE = 0.35;
/** Time constant of the motor spinning up on start. */
const VACUUM_SPIN_UP = 0.45;

export class VacuumVoice implements Voice {
  readonly defaultFadeIn = 0.8;
  readonly defaultFadeOut = 1.5;
  private instance: {
    out: GainNode;
    sources: AudioScheduledSourceNode[];
    params: (p: VacuumParams) => [AudioParam, number][];
    motorHz: AudioParam;
    whineHz: AudioParam;
  } | null = null;
  private turbine = 0;

  constructor(private readonly env: VoiceEnv) {}

  get playing(): boolean {
    return this.instance !== null;
  }

  start(destination: AudioNode, fade: number): void {
    const { ctx, noise, profile } = this.env;
    const out = createFadeIn(ctx, destination, fade, VACUUM_LEVEL);

    const level = ctx.createGain();
    const wall = ctx.createBiquadFilter();
    wall.type = 'lowpass';
    wall.Q.value = 0.5;
    wall.connect(level).connect(out);

    // Back-and-forth brush movement: gain = (1 - d/2) + d/2 · sin.
    const wobble = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = profile.vacuum.wobbleHz;
    const lfoDepth = ctx.createGain();
    lfo.connect(lfoDepth).connect(wobble.gain);
    lfo.start();
    wobble.connect(wall);

    const motor = ctx.createOscillator();
    motor.type = 'sawtooth';
    const motorFilter = ctx.createBiquadFilter();
    motorFilter.type = 'lowpass';
    const motorGain = ctx.createGain();
    motor.connect(motorFilter).connect(motorGain).connect(wobble);
    motor.start();

    const whine = ctx.createOscillator();
    const whineGain = ctx.createGain();
    whine.connect(whineGain).connect(wobble);
    whine.start();

    const air = noise.source('pink', 0.35);
    const airBand = ctx.createBiquadFilter();
    airBand.type = 'bandpass';
    const airGain = ctx.createGain();
    air.connect(airBand).connect(airGain).connect(wobble);

    // The rumble bypasses the wobble: a turbine does not move around.
    const rumble = noise.source('brown', 0.8);
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 140;
    const rumbleGain = ctx.createGain();
    rumble.connect(rumbleFilter).connect(rumbleGain).connect(wall);

    const params = (p: VacuumParams): [AudioParam, number][] => [
      [motorFilter.frequency, p.motorFilterHz],
      [motorGain.gain, p.motorGain],
      [whineGain.gain, p.whineGain],
      [airBand.frequency, p.airHz],
      [airBand.Q, p.airQ],
      [airGain.gain, p.airGain],
      [rumbleGain.gain, p.rumbleGain],
      [wall.frequency, p.wallHz],
      [wobble.gain, 1 - p.wobbleDepth / 2],
      [lfoDepth.gain, p.wobbleDepth / 2],
      [level.gain, p.level],
    ];
    const now = ctx.currentTime;
    const target = vacuumParams(this.turbine, profile.vacuum);
    for (const [param, value] of params(target)) param.setValueAtTime(value, now);
    // "вжж…": the motor starts slow and spins up.
    for (const [param, value] of [
      [motor.frequency, target.motorHz],
      [whine.frequency, target.whineHz],
    ] as const) {
      param.setValueAtTime(value * VACUUM_SPIN_FACTOR, now);
      param.setTargetAtTime(value, now, VACUUM_SPIN_UP);
    }

    this.instance = {
      out,
      sources: [lfo, motor, whine, air, rumble],
      params,
      motorHz: motor.frequency,
      whineHz: whine.frequency,
    };
  }

  stop(fade: number): void {
    const instance = this.instance;
    if (!instance) return;
    const { ctx, profile } = this.env;
    const now = ctx.currentTime;
    // Spin down while fading out.
    const target = vacuumParams(this.turbine, profile.vacuum);
    glideParam(instance.motorHz, target.motorHz * VACUUM_SPIN_FACTOR, now, fade / 3);
    glideParam(instance.whineHz, target.whineHz * VACUUM_SPIN_FACTOR, now, fade / 3);
    releaseInstance(ctx, instance.out, instance.sources, fade);
    this.instance = null;
  }

  resume(): void {}

  setTurbine(value: number): void {
    this.turbine = clamp01(value);
    const instance = this.instance;
    if (!instance) return;
    const now = this.env.ctx.currentTime;
    const target = vacuumParams(this.turbine, this.env.profile.vacuum);
    for (const [param, v] of instance.params(target)) glideParam(param, v, now, VACUUM_GLIDE);
    glideParam(instance.motorHz, target.motorHz, now, VACUUM_GLIDE);
    glideParam(instance.whineHz, target.whineHz, now, VACUUM_GLIDE);
  }

  schedule(): void {}
}

export class HumVoice implements Voice {
  readonly defaultFadeIn = 1.2;
  readonly defaultFadeOut = 1.2;
  private instance: { out: GainNode; sources: AudioScheduledSourceNode[] } | null = null;

  constructor(private readonly env: VoiceEnv) {}

  get playing(): boolean {
    return this.instance !== null;
  }

  start(destination: AudioNode, fade: number): void {
    const { ctx, profile } = this.env;
    const out = createFadeIn(ctx, destination, fade, HUM_LEVEL);

    const osc = ctx.createOscillator();
    osc.setPeriodicWave(createHarmonicWave(ctx, humHarmonics(profile.hum.brightness)));
    osc.frequency.value = profile.hum.mainsHz;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;

    // Slow, shallow swell, like a transformer under a changing load.
    const swell = ctx.createGain();
    swell.gain.value = 0.92;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.08;
    lfo.connect(lfoDepth).connect(swell.gain);

    osc.connect(filter).connect(swell).connect(out);
    osc.start();
    lfo.start();
    this.instance = { out, sources: [osc, lfo] };
  }

  stop(fade: number): void {
    if (!this.instance) return;
    releaseInstance(this.env.ctx, this.instance.out, this.instance.sources, fade);
    this.instance = null;
  }

  resume(): void {}

  schedule(): void {}
}

/** Overall level of the swing creak before layers. */
const CREAK_LEVEL = 0.5;

/**
 * The swing's creak: one-shot, so not a `Voice`. Each call builds a small
 * graph — a gliding sawtooth through narrow resonances, plus a breath of
 * grit — that frees itself when the creak is over.
 */
export class CreakVoice {
  constructor(private readonly env: VoiceEnv) {}

  play(strength: number, pitch: number, destination: AudioNode): void {
    const shape = creakShape(strength, pitch, this.env.profile.swing);
    if (!shape) return;
    const { ctx, noise } = this.env;
    const at = ctx.currentTime + 0.01;
    const peakAt = at + shape.duration * shape.attack;
    const end = at + shape.duration;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(shape.gain * CREAK_LEVEL, peakAt);
    envelope.gain.exponentialRampToValueAtTime(0.001, end);
    envelope.connect(destination);

    const rub = ctx.createOscillator();
    rub.type = 'sawtooth';
    rub.frequency.setValueAtTime(shape.rubStartHz, at);
    rub.frequency.linearRampToValueAtTime(shape.rubPeakHz, peakAt);
    rub.frequency.linearRampToValueAtTime(shape.rubEndHz, end);

    for (const band of shape.bands) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = band.hz;
      filter.Q.value = band.q;
      const gain = ctx.createGain();
      // Narrow bands pass little energy; lift them back to a usable level.
      gain.gain.value = band.gain * band.q * 0.35;
      rub.connect(filter).connect(gain).connect(envelope);
    }

    // Rust: a little noise in the lowest resonance.
    const grit = noise.source('white', (at * 0.37) % 1);
    const gritBand = ctx.createBiquadFilter();
    gritBand.type = 'bandpass';
    gritBand.frequency.value = shape.bands[0]?.hz ?? 900;
    gritBand.Q.value = 3;
    const gritGain = ctx.createGain();
    gritGain.gain.value = 0.25;
    grit.connect(gritBand).connect(gritGain).connect(envelope);

    rub.start(at);
    rub.stop(end + 0.05);
    grit.stop(end + 0.05);
    rub.onended = () => envelope.disconnect();
  }
}
