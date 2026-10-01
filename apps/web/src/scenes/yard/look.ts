import type { TimeOfDay, YardParams } from '@dream/core';

/**
 * Light and weather of the yard: a pure function of the scene's time of day
 * and fog, so it can be tested and tuned without a GPU. Colours are sRGB hex.
 */
export interface YardLook {
  sky: number;
  /** Fog colour; close to the sky so the blocks dissolve into it. */
  fog: number;
  /** Fog range, metres: nothing is visible past `fogFar`. */
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sun: number;
  sunIntensity: number;
  /** Direction the sunlight comes from (not normalised). */
  sunFrom: readonly [number, number, number];
  /** Street lamps burn (dusk, night, dawn). */
  lampsOn: boolean;
  /** Share of windows lit yellow. */
  litWindows: number;
  /** Asphalt colour: darker when wet. */
  asphalt: number;
  /** Puddles reflect this. */
  puddle: number;
  /** Drizzle density 0…1 (0: dry). */
  drizzle: number;
}

interface Base {
  sky: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sun: number;
  sunIntensity: number;
  sunFrom: readonly [number, number, number];
  lampsOn: boolean;
  litWindows: number;
  puddle: number;
}

const BASE: Readonly<Record<TimeOfDay, Base>> = {
  dawn: {
    sky: 0x8a8aa0,
    hemiSky: 0xb0b0c8,
    hemiGround: 0x3c3836,
    hemiIntensity: 1.1,
    sun: 0xffc8a0,
    sunIntensity: 0.9,
    sunFrom: [8, 4, -6],
    lampsOn: true,
    litWindows: 0.12,
    puddle: 0x9a98b0,
  },
  noon: {
    sky: 0xa8b0b8,
    hemiSky: 0xd0d8e0,
    hemiGround: 0x4a4840,
    hemiIntensity: 1.5,
    sun: 0xfff4e0,
    sunIntensity: 1.6,
    sunFrom: [-4, 10, 3],
    lampsOn: false,
    litWindows: 0.03,
    puddle: 0x8c949c,
  },
  dusk: {
    sky: 0x4a3c58,
    hemiSky: 0x7a6a90,
    hemiGround: 0x2a2228,
    hemiIntensity: 0.9,
    sun: 0xff9a60,
    sunIntensity: 0.6,
    sunFrom: [-9, 2.5, 4],
    lampsOn: true,
    litWindows: 0.3,
    puddle: 0x6a5470,
  },
  night: {
    sky: 0x0c0e18,
    hemiSky: 0x2a3048,
    hemiGround: 0x101010,
    hemiIntensity: 0.9,
    sun: 0x8090c0,
    sunIntensity: 0.15,
    sunFrom: [3, 8, 5],
    lampsOn: true,
    litWindows: 0.38,
    puddle: 0x2a2c3a,
  },
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Mixes two hex colours. */
export function mixColor(a: number, b: number, t: number): number {
  const channel = (shift: number) => Math.round(lerp((a >> shift) & 0xff, (b >> shift) & 0xff, t));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Below this fog the yard is dry; above it, drizzle grows with the fog. */
export const DRIZZLE_FROM_FOG = 0.4;

export function yardLook({ timeOfDay, fog }: Pick<YardParams, 'timeOfDay' | 'fog'>): YardLook {
  const base = BASE[timeOfDay];
  const f = Math.min(1, Math.max(0, fog));
  const drizzle = f <= DRIZZLE_FROM_FOG ? 0 : (f - DRIZZLE_FROM_FOG) / (1 - DRIZZLE_FROM_FOG);
  // Fog greys the sky out towards a damp, milky colour.
  const milk = timeOfDay === 'night' ? 0x1c1e26 : 0x8c9094;
  const sky = mixColor(base.sky, milk, f * 0.6);
  return {
    sky,
    fog: sky,
    fogNear: lerp(14, 3, f),
    fogFar: lerp(80, 26, f),
    hemiSky: base.hemiSky,
    hemiGround: base.hemiGround,
    hemiIntensity: base.hemiIntensity,
    sun: base.sun,
    sunIntensity: base.sunIntensity * lerp(1, 0.45, f),
    sunFrom: base.sunFrom,
    lampsOn: base.lampsOn,
    litWindows: base.litWindows,
    // The asphalt is always a little wet (it has rained); drizzle darkens it more.
    asphalt: mixColor(0x74766f, 0x4a4c4a, 0.35 + 0.65 * drizzle),
    puddle: base.puddle,
    drizzle,
  };
}
