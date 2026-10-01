import { describe, expect, it } from 'vitest';
import { normalizeSeed } from './seed';
import { eventRng, eventSeed, profileRng, profileSeed, sceneRng, sceneSeed, streamKey } from './streams';

const seed = normalizeSeed('DREAM-8F72-A19C-37B2');

describe('stream keys', () => {
  it('follow the seed → scene → event hierarchy', () => {
    expect(profileSeed(seed)).toBe('DREAM-8F72-A19C-37B2/profile');
    expect(sceneSeed(seed, 1)).toBe('DREAM-8F72-A19C-37B2/scene/1');
    expect(eventSeed(seed, 1, 3)).toBe('DREAM-8F72-A19C-37B2/scene/1/event/3');
    expect(streamKey('root')).toBe('root');
    expect(streamKey('root', 'a', 2)).toBe('root/a/2');
  });
});

describe('derived streams', () => {
  const first = (rng: { nextUint32(): number }): number => rng.nextUint32();

  it('are reproducible', () => {
    expect(first(sceneRng(seed, 2))).toBe(first(sceneRng(seed, 2)));
    expect(first(eventRng(seed, 2, 5))).toBe(first(eventRng(seed, 2, 5)));
  });

  it('are independent of each other', () => {
    const values = [
      first(profileRng(seed)),
      first(sceneRng(seed, 0)),
      first(sceneRng(seed, 1)),
      first(sceneRng(seed, 1, 'echoes')),
      first(eventRng(seed, 1, 0)),
      first(eventRng(seed, 1, 1)),
      first(sceneRng(normalizeSeed('DREAM-8F72-A19C-37B3'), 1)),
    ];
    expect(new Set(values).size).toBe(values.length);
  });
});
