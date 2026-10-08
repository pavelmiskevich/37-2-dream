import type { Shot } from '@dream/core';
import { describe, expect, it } from 'vitest';
import { assetUrl, assetWindow, clipPlayback, clipTime } from './preload';

const shots = ['a', 'b', 'a', 'c', 'd', 'e'].map((assetId, index) => ({ assetId, index }) as Shot);

describe('assetWindow', () => {
  it('lists the current shot, the next ones and the one just left, most urgent first, without repeats', () => {
    expect(assetWindow(shots, 0)).toEqual(['a', 'b', 'c']);
    expect(assetWindow(shots, 2)).toEqual(['a', 'c', 'd', 'e', 'b']);
  });

  it('stops at the end of the film', () => {
    expect(assetWindow(shots, 5)).toEqual(['e', 'd']);
  });
});

describe('assetUrl', () => {
  it('resolves files against the library root', () => {
    expect(assetUrl('/library/', 'stills/x.webp')).toBe('/library/stills/x.webp');
    expect(assetUrl('/library', 'depth/x.png')).toBe('/library/depth/x.png');
  });
});

describe('clipPlayback', () => {
  it('plays a long enough clip as is', () => {
    expect(clipPlayback(3, 5)).toEqual({ rate: 1, loop: false });
  });

  it('slows a short clip down, no slower than half speed, then loops it', () => {
    expect(clipPlayback(6, 4)).toEqual({ rate: 4 / 6, loop: false });
    expect(clipPlayback(12, 4)).toEqual({ rate: 0.5, loop: true });
  });

  it('maps shot time to clip time', () => {
    expect(clipTime(3, 4, { rate: 0.5, loop: true })).toBe(1.5);
    expect(clipTime(10, 4, { rate: 0.5, loop: true })).toBe(1);
    expect(clipTime(10, 4, { rate: 1, loop: false })).toBe(4);
  });
});
