import { TICK_DT, type SimState } from '@dream/core';
import { feverLevel } from '../fever';

/**
 * What the debug overlay can show. A `SimState` fits as is; a test bench
 * without a simulation passes just the temperature.
 */
export type DebugState = Pick<SimState, 'temperature'> &
  Partial<Pick<SimState, 'tick' | 'sceneIndex' | 'sceneTick' | 'finished' | 'wakeReason'>>;

/** True when the address asks for the debug overlay: `?debug` (any value but `0`). */
export function debugFromQuery(search: string): boolean {
  const value = new URLSearchParams(search).get('debug');
  return value !== null && value !== '0';
}

/** Lines of the debug overlay, top to bottom. Developer text, not game text. */
export function debugLines(state: DebugState, sceneId?: string): string[] {
  const lines = [`t ${state.temperature.toFixed(2)} °C · fever ${feverLevel(state.temperature).toFixed(2)}`];
  if (state.sceneIndex !== undefined) {
    const name = sceneId === undefined ? `${state.sceneIndex}` : `${state.sceneIndex} ${sceneId}`;
    const time = state.sceneTick === undefined ? '' : ` · ${(state.sceneTick * TICK_DT).toFixed(1)} s`;
    lines.push(`scene ${name}${time}`);
  }
  if (state.tick !== undefined) lines.push(`tick ${state.tick}`);
  if (state.wakeReason !== undefined) lines.push(`wake ${state.wakeReason}${state.finished ? ' · finished' : ''}`);
  else if (state.finished) lines.push('finished');
  return lines;
}
