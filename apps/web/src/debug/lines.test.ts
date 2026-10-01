import { createInitialState, generateDream, normalizeSeed } from '@dream/core';
import { describe, expect, it } from 'vitest';
import { debugFromQuery, debugLines } from './lines';

describe('debugFromQuery', () => {
  it('turns on with ?debug and off with ?debug=0 or without it', () => {
    expect(debugFromQuery('?debug')).toBe(true);
    expect(debugFromQuery('?seed=DREAM-8F72-A19C-37B2&debug=1')).toBe(true);
    expect(debugFromQuery('?debug=0')).toBe(false);
    expect(debugFromQuery('')).toBe(false);
    expect(debugFromQuery('?sandbox=fever')).toBe(false);
  });
});

describe('debugLines', () => {
  it('shows the temperature to hundredths with the fever level', () => {
    expect(debugLines({ temperature: 38.5 })).toEqual(['t 38.50 °C · fever 0.60']);
  });

  it('shows the scene, its time and the tick for a simulation state', () => {
    const dream = generateDream(normalizeSeed('DREAM-8F72-A19C-37B2'));
    const state = { ...createInitialState(dream), tick: 1234, sceneIndex: 1, sceneTick: 90 };
    expect(debugLines(state, 'yard')).toEqual(['t 37.20 °C · fever 0.08', 'scene 1 yard · 1.5 s', 'tick 1234']);
  });

  it('shows why the hero woke up', () => {
    expect(debugLines({ temperature: 36.99, wakeReason: 'malingerer' })).toContain('wake malingerer');
    expect(debugLines({ temperature: 36.9, wakeReason: 'tea_brought', finished: true })).toContain(
      'wake tea_brought · finished',
    );
  });
});
