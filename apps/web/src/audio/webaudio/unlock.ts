/**
 * Creates (or reuses) an AudioContext and unlocks it. Must be called
 * synchronously from a user gesture handler (click, tap, key): browsers only
 * allow audio to start from one. The "Нажмите, чтобы уснуть" screen (D-010)
 * is that gesture.
 */
export async function unlockAudio(existing?: AudioContext): Promise<AudioContext> {
  const ctx = existing ?? new AudioContext({ latencyHint: 'interactive' });
  // iOS Safari unlocks only once something has actually been played in the gesture.
  const silent = ctx.createBufferSource();
  silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  silent.connect(ctx.destination);
  silent.start();
  if (ctx.state !== 'running') await ctx.resume();
  return ctx;
}
