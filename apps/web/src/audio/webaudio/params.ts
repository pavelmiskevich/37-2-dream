/**
 * Click-free AudioParam helpers. Every gain change goes through a ramp: an
 * instant jump of a non-zero signal is what produces a click.
 */

/** Shortest fade ever used; ~1 ms is already click-free, 20 ms is safe margin. */
export const MIN_FADE = 0.02;

/** Freezes the param at its current value at `at`, dropping later automation. */
export function holdAt(param: AudioParam, at: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(at);
  } else {
    // Firefox: no cancelAndHoldAtTime; `value` reports the current computed value.
    param.cancelScheduledValues(at);
    param.setValueAtTime(param.value, at);
  }
}

/** Linear ramp from wherever the param is now to `value` over `duration`. */
export function rampParam(param: AudioParam, value: number, at: number, duration: number): void {
  holdAt(param, at);
  param.linearRampToValueAtTime(value, at + Math.max(duration, MIN_FADE));
}

/**
 * Exponential glide towards `value` with time constant `tau`: the param keeps
 * moving smoothly however often it is retargeted (e.g. a slider being dragged).
 */
export function glideParam(param: AudioParam, value: number, at: number, tau: number): void {
  holdAt(param, at);
  param.setTargetAtTime(value, at, Math.max(tau, 0.005));
}

/** Gain node that fades in from silence; the entry point of every voice instance. */
export function createFadeIn(
  ctx: BaseAudioContext,
  destination: AudioNode,
  fade: number,
  level = 1,
): GainNode {
  const out = ctx.createGain();
  const now = ctx.currentTime;
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(level, now + Math.max(fade, MIN_FADE));
  out.connect(destination);
  return out;
}

/**
 * Fades a voice instance out, stops its sources after the fade and
 * disconnects its nodes once nothing can be heard any more.
 */
export function releaseInstance(
  ctx: BaseAudioContext,
  out: GainNode,
  sources: readonly AudioScheduledSourceNode[],
  fade: number,
): void {
  const now = ctx.currentTime;
  const length = Math.max(fade, MIN_FADE);
  rampParam(out.gain, 0, now, length);
  for (const source of sources) source.stop(now + length + 0.05);
  setTimeout(() => out.disconnect(), (length + 0.25) * 1000);
}

/** PeriodicWave from sine harmonic amplitudes (index 0 = fundamental). */
export function createHarmonicWave(ctx: BaseAudioContext, harmonics: readonly number[]): PeriodicWave {
  const real = new Float32Array(harmonics.length + 1);
  const imag = new Float32Array(harmonics.length + 1);
  harmonics.forEach((amp, i) => {
    imag[i + 1] = amp;
  });
  return ctx.createPeriodicWave(real, imag);
}
