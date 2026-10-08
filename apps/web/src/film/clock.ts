/**
 * Player clocks. The film runs on time, not on frames: a slow device drops
 * frames but never slows the dream down. With sound the clock is the audio
 * hardware's, so picture and sound cannot drift apart.
 */
export interface PlayerClock {
  /** Seconds, monotonic. */
  now(): number;
  /**
   * How long after an event is handed to the audio engine it is heard,
   * seconds; the player fires sound cues this much early.
   */
  latency(): number;
}

export function performanceClock(): PlayerClock {
  return { now: () => performance.now() / 1000, latency: () => 0 };
}

/**
 * The audio clock as heard (`getOutputTimestamp`), interpolated between its
 * updates with `performance.now`, so frames get smooth times. Falls back to
 * `currentTime` where output timestamps are missing.
 */
export function audioClock(context: AudioContext): PlayerClock {
  let last = 0;
  const heard = (): number | null => {
    const stamp = typeof context.getOutputTimestamp === 'function' ? context.getOutputTimestamp() : null;
    if (!stamp || stamp.contextTime === undefined || !stamp.performanceTime) return null;
    if (context.state !== 'running') return stamp.contextTime;
    return stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000;
  };
  return {
    now: () => {
      last = Math.max(last, heard() ?? context.currentTime);
      return last;
    },
    latency: () => {
      const output = heard();
      return output === null ? 0 : Math.max(0, Math.min(0.5, context.currentTime - output));
    },
  };
}
