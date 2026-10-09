import { describe, expect, it } from 'vitest';
import { SETTINGS_STORAGE_KEY, readSettings, writeSettings } from './settings';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

describe('dream settings', () => {
  it('remembers "без вспышек"', () => {
    const storage = memoryStorage();
    expect(readSettings(() => storage)).toEqual({ noFlash: false });
    writeSettings({ noFlash: true }, () => storage);
    expect(readSettings(() => storage)).toEqual({ noFlash: true });
    writeSettings({ noFlash: false }, () => storage);
    expect(readSettings(() => storage)).toEqual({ noFlash: false });
  });

  it('starts off without storage, with garbage in it, or when it throws', () => {
    expect(readSettings(() => null)).toEqual({ noFlash: false });
    expect(readSettings(() => memoryStorage({ [SETTINGS_STORAGE_KEY]: '{oops' }))).toEqual({ noFlash: false });
    expect(readSettings(() => memoryStorage({ [SETTINGS_STORAGE_KEY]: '{"noFlash":"yes"}' }))).toEqual({ noFlash: false });
    const broken = () => {
      throw new Error('blocked');
    };
    expect(readSettings(broken)).toEqual({ noFlash: false });
    expect(() => writeSettings({ noFlash: true }, broken)).not.toThrow();
    expect(() => writeSettings({ noFlash: true }, () => null)).not.toThrow();
  });
});
