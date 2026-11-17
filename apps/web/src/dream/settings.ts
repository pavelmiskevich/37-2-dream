/**
 * What the device remembers between dreams: only the "без вспышек" switch
 * (D-009) — a safety setting should not have to be found again every time.
 * Storage is optional: every access is wrapped. Until the viewer has chosen,
 * the switch follows the system's `prefers-reduced-motion: reduce`; a choice
 * once made, either way, wins over it.
 */
export const SETTINGS_STORAGE_KEY = '37.2-dream/settings/v1';

export interface DreamSettings {
  noFlash: boolean;
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The system asks for less motion (and, by the same token, fewer flashes). */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function readSettings(
  storage: () => Storage | null = browserStorage,
  reducedMotion: () => boolean = prefersReducedMotion,
): DreamSettings {
  let stored: unknown;
  try {
    const parsed: unknown = JSON.parse(storage()?.getItem(SETTINGS_STORAGE_KEY) ?? 'null');
    stored = typeof parsed === 'object' && parsed !== null ? (parsed as { noFlash?: unknown }).noFlash : undefined;
  } catch {
    stored = undefined;
  }
  return { noFlash: typeof stored === 'boolean' ? stored : reducedMotion() };
}

export function writeSettings(settings: DreamSettings, storage: () => Storage | null = browserStorage): void {
  try {
    storage()?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ noFlash: settings.noFlash }));
  } catch {
    // Full, disabled or gone: the switch is not remembered, the dream goes on.
  }
}
