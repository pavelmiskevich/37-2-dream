/**
 * What the device remembers between dreams: only the "без вспышек" switch
 * (D-009) — a safety setting should not have to be found again every time.
 * Storage is optional: every access is wrapped, and without it the switch
 * simply starts off.
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

export function readSettings(storage: () => Storage | null = browserStorage): DreamSettings {
  try {
    const parsed: unknown = JSON.parse(storage()?.getItem(SETTINGS_STORAGE_KEY) ?? 'null');
    return { noFlash: typeof parsed === 'object' && parsed !== null && (parsed as { noFlash?: unknown }).noFlash === true };
  } catch {
    return { noFlash: false };
  }
}

export function writeSettings(settings: DreamSettings, storage: () => Storage | null = browserStorage): void {
  try {
    storage()?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ noFlash: settings.noFlash }));
  } catch {
    // Full, disabled or gone: the switch is not remembered, the dream goes on.
  }
}
