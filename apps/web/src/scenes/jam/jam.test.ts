import { describe, expect, it } from 'vitest';
import { JAM_JAR, findScene, generateDream, normalizeSeed, type Echo } from '@dream/core';
import { JAM_ECHO, JAM_MUFFLE, cuesBetween, jamEchoCues, jamMuffle } from './cues';
import { LEMONS, START, jamLayout, type Vec3 } from './layout';

const jamOf = (seed: string) => findScene(generateDream(normalizeSeed(seed)), 'jam')!;
const SEEDS = ['DREAM-8F72-A19C-37B2', 'DREAM-0000-0000-0000', 'DREAM-C0DE-BEEF-0451', 'DREAM-FFFF-FFFF-FFFF'];

const insideJar = ([x, y, z]: Vec3, clear: number) =>
  Math.hypot(x, z) <= JAM_JAR.radius - clear + 1e-9 && y >= clear - 1e-9 && y <= JAM_JAR.height - clear + 1e-9;

describe('jamLayout', () => {
  it('is the same for the same scene and differs between dreams', () => {
    const a = jamLayout(jamOf(SEEDS[0]!));
    expect(jamLayout(jamOf(SEEDS[0]!))).toEqual(a);
    expect(jamLayout(jamOf(SEEDS[1]!)).labelAngle).not.toBe(a.labelAngle);
  });

  it.each(SEEDS)('keeps everything inside the jar for %s', (seed) => {
    const layout = jamLayout(jamOf(seed));
    for (const lemon of layout.lemons) expect(insideJar(lemon.position, lemon.length / 2)).toBe(true);
    for (const item of [...layout.pips, ...layout.fruit]) expect(insideJar(item.position, item.size)).toBe(true);
  });

  it.each(SEEDS)('hangs meteorite-sized lemons apart and away from the hero for %s', (seed) => {
    const { lemons } = jamLayout(jamOf(seed));
    expect(lemons.length).toBeGreaterThanOrEqual(LEMONS.min);
    expect(lemons.length).toBeLessThanOrEqual(LEMONS.max);
    const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    lemons.forEach((lemon, i) => {
      expect(lemon.length).toBeGreaterThanOrEqual(LEMONS.length[0]);
      expect(dist(lemon.position, START)).toBeGreaterThan(lemon.length / 2 + 1);
      lemons.slice(i + 1).forEach((other) => {
        expect(dist(lemon.position, other.position)).toBeGreaterThan((lemon.length + other.length) / 2);
      });
    });
  });
});

describe('jam sound', () => {
  it('muffles the dream more the deeper the hero is', () => {
    expect(jamMuffle(JAM_JAR.height)).toBeCloseTo(JAM_MUFFLE.top, 9);
    expect(jamMuffle(0)).toBeCloseTo(JAM_MUFFLE.bottom, 9);
    expect(jamMuffle(3)).toBeGreaterThan(jamMuffle(9));
    expect(jamMuffle(-5)).toBeCloseTo(JAM_MUFFLE.bottom, 9);
  });

  it('turns a ventilator echo into a close breath and back', () => {
    const cues = jamEchoCues([{ motif: 'ventilator', at: 0.5 }], 40);
    expect(cues).toEqual([
      { at: 20, event: { type: 'sound.start', sound: 'ventilator', layer: 'tension', fade: 1.5 } },
      { at: 20 + JAM_ECHO.breathHold, event: { type: 'sound.start', sound: 'ventilator', layer: 'recurring', fade: 2.5 } },
    ]);
  });

  it('turns a monitor echo into a few lone beeps, all cues in time order', () => {
    const echoes: Echo[] = [
      { motif: 'monitor', at: 0.25 },
      { motif: 'ventilator', at: 0.2 },
    ];
    const cues = jamEchoCues(echoes, 40);
    expect(cues.filter((cue) => cue.event.type === 'monitor.beep')).toHaveLength(JAM_ECHO.beeps);
    expect(cues.map((cue) => cue.at)).toEqual([...cues.map((cue) => cue.at)].sort((a, b) => a - b));
  });

  it('plays each cue once, however the frames fall', () => {
    const cues = jamEchoCues([{ motif: 'monitor', at: 0.5 }], 20);
    let played = 0;
    let last = -Infinity;
    for (let t = 0; t <= 20; t += 0.0173) {
      played += cuesBetween(cues, last, t).length;
      last = t;
    }
    expect(played).toBe(JAM_ECHO.beeps);
  });
});
