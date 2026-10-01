import { describe, expect, it } from 'vitest';
import { FEVER_SOUND, feverSoundEvents, feverSoundMix } from './fever';

describe('feverSoundMix', () => {
  it('muffles the dream without fever and opens it up at full fever', () => {
    expect(feverSoundMix(0)).toEqual({
      master: FEVER_SOUND.master[0],
      tension: FEVER_SOUND.tension[0],
      monitorIntensity: FEVER_SOUND.monitorIntensity[0],
    });
    expect(feverSoundMix(1)).toEqual({
      master: FEVER_SOUND.master[1],
      tension: FEVER_SOUND.tension[1],
      monitorIntensity: FEVER_SOUND.monitorIntensity[1],
    });
  });

  it('gets louder as the fever rises', () => {
    let previous = feverSoundMix(0);
    for (let level = 0.05; level <= 1; level += 0.05) {
      const mix = feverSoundMix(level);
      expect(mix.master).toBeGreaterThanOrEqual(previous.master);
      expect(mix.tension).toBeGreaterThanOrEqual(previous.tension);
      expect(mix.monitorIntensity).toBeGreaterThanOrEqual(previous.monitorIntensity);
      previous = mix;
    }
    expect(feverSoundMix(0.6).master - feverSoundMix(0).master).toBeGreaterThan(0.15);
  });

  it('clamps the level and rounds the values, so equal mixes compare equal', () => {
    expect(feverSoundMix(7)).toEqual(feverSoundMix(1));
    expect(feverSoundMix(-1)).toEqual(feverSoundMix(0));
    expect(feverSoundMix(Number.NaN)).toEqual(feverSoundMix(0));
    expect(feverSoundMix(0.5)).toEqual(feverSoundMix(0.5001));
  });
});

describe('feverSoundEvents', () => {
  it('sets the master volume (scaled by the player volume) and the tension layer', () => {
    const mix = feverSoundMix(0.5);
    expect(feverSoundEvents(mix)).toEqual([
      { type: 'master.volume', value: mix.master },
      { type: 'layer.volume', layer: 'tension', value: mix.tension },
    ]);
    expect(feverSoundEvents(mix, 0.5)[0]).toEqual({ type: 'master.volume', value: mix.master * 0.5 });
    expect(feverSoundEvents(mix, 0)[0]).toEqual({ type: 'master.volume', value: 0 });
  });
});
