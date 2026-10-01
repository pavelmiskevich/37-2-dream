/** Shortest allowed period, so a bad tempo can never flood the audio graph. */
export const MIN_PERIOD = 0.05;

/**
 * Pure event clock for look-ahead scheduling: yields the times of periodic
 * events (monitor beeps, breath cycles) whose period may change on the fly.
 * Times are in seconds on the AudioContext clock, but nothing here touches
 * Web Audio.
 */
export class PeriodicClock {
  private next: number | null = null;
  private last: number | null = null;

  get running(): boolean {
    return this.next !== null;
  }

  /** Starts ticking; the first event is at `at`. */
  start(at: number): void {
    this.next = at;
    this.last = null;
  }

  stop(): void {
    this.next = null;
    this.last = null;
  }

  /**
   * Applies a new period right away: when it is shorter, the pending event is
   * pulled closer instead of waiting out the old, longer period. Never moves
   * the event before `now`.
   */
  retime(now: number, period: number): void {
    if (this.next === null || this.last === null) return;
    const candidate = Math.max(now, this.last + Math.max(MIN_PERIOD, period));
    this.next = Math.min(this.next, candidate);
  }

  /**
   * Returns event times in [now, until) and advances the clock. `periodAt`
   * gives the period after each event. Events that fell behind `now` (e.g. a
   * throttled background tab) are skipped instead of played in a burst.
   */
  take(now: number, until: number, periodAt: () => number): number[] {
    const times: number[] = [];
    if (this.next === null) return times;
    if (this.next < now) this.next = now;
    while (this.next < until) {
      times.push(this.next);
      this.last = this.next;
      this.next += Math.max(MIN_PERIOD, periodAt());
    }
    return times;
  }
}
