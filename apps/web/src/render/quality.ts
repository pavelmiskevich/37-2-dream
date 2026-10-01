export type QualityLevel = 'high' | 'low';

/** Knobs of the PS1 look that trade quality for speed. */
export interface QualityPreset {
  readonly level: QualityLevel;
  /** Target internal resolution of the short screen side. */
  readonly shortSide: number;
  /** Upper bound for the drawing-buffer pixel ratio of the final upscale. */
  readonly maxPixelRatio: number;
  /** Bits per colour channel after quantisation (PS1: 5). */
  readonly colorBits: number;
  /** Ordered dithering before quantisation. */
  readonly dither: boolean;
  /** Snap vertices to the internal pixel grid (PS1 "wobble"). */
  readonly vertexSnap: boolean;
  /** Affine (non perspective-correct) texture mapping. */
  readonly affineTextures: boolean;
  /** Keep the internal image in half-float to avoid banding in dark scenes. */
  readonly highPrecisionTarget: boolean;
}

export const QUALITY_PRESETS: Readonly<Record<QualityLevel, QualityPreset>> = {
  high: {
    level: 'high',
    shortSide: 240,
    maxPixelRatio: 3,
    colorBits: 5,
    dither: true,
    vertexSnap: true,
    affineTextures: true,
    highPrecisionTarget: true,
  },
  // Weak phones: fewer internal pixels, a 1× final pass (the browser does the
  // rest with `image-rendering: pixelated`), 8-bit internal target.
  low: {
    level: 'low',
    shortSide: 200,
    maxPixelRatio: 1,
    colorBits: 5,
    dither: true,
    vertexSnap: true,
    affineTextures: true,
    highPrecisionTarget: false,
  },
};

/** What the browser tells us about the device; every field is optional. */
export interface DeviceHints {
  /** Value of the `?quality=` URL parameter, if any. */
  readonly param?: string | null;
  /** `navigator.deviceMemory` (GiB, Chromium only). */
  readonly deviceMemory?: number;
  /** `navigator.hardwareConcurrency`. */
  readonly hardwareConcurrency?: number;
  /** `matchMedia('(pointer: coarse)')` — a touch-first device. */
  readonly coarsePointer?: boolean;
}

export function isQualityLevel(value: unknown): value is QualityLevel {
  return value === 'high' || value === 'low';
}

/**
 * Chooses a preset: an explicit `?quality=` wins; otherwise touch devices with
 * little memory or few cores get `low`, everything else `high`.
 */
export function detectQuality(hints: DeviceHints): QualityLevel {
  if (isQualityLevel(hints.param)) return hints.param;
  if (!hints.coarsePointer) return 'high';
  const lowMemory = hints.deviceMemory !== undefined && hints.deviceMemory <= 3;
  const fewCores = hints.hardwareConcurrency !== undefined && hints.hardwareConcurrency <= 4;
  return lowMemory || fewCores ? 'low' : 'high';
}

/** Reads the device hints from the current browser. */
export function browserDeviceHints(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    param: new URLSearchParams(window.location.search).get('quality'),
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
  };
}
