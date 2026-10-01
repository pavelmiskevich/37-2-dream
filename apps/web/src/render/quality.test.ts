import { describe, expect, it } from 'vitest';
import { detectQuality, QUALITY_PRESETS } from './quality';

describe('detectQuality', () => {
  it('honours an explicit ?quality= parameter', () => {
    expect(detectQuality({ param: 'low' })).toBe('low');
    expect(detectQuality({ param: 'high', coarsePointer: true, deviceMemory: 1 })).toBe('high');
  });

  it('ignores unknown parameter values', () => {
    expect(detectQuality({ param: 'ultra' })).toBe('high');
  });

  it('keeps desktops on high', () => {
    expect(detectQuality({ coarsePointer: false, deviceMemory: 2, hardwareConcurrency: 2 })).toBe('high');
  });

  it('drops weak touch devices to low', () => {
    expect(detectQuality({ coarsePointer: true, deviceMemory: 2, hardwareConcurrency: 8 })).toBe('low');
    expect(detectQuality({ coarsePointer: true, deviceMemory: 8, hardwareConcurrency: 4 })).toBe('low');
  });

  it('keeps mid-range phones on high', () => {
    expect(detectQuality({ coarsePointer: true, deviceMemory: 4, hardwareConcurrency: 8 })).toBe('high');
    expect(detectQuality({ coarsePointer: true })).toBe('high');
  });
});

describe('QUALITY_PRESETS', () => {
  it('makes the low preset no more expensive than high', () => {
    const { high, low } = QUALITY_PRESETS;
    expect(low.shortSide).toBeLessThanOrEqual(high.shortSide);
    expect(low.maxPixelRatio).toBeLessThanOrEqual(high.maxPixelRatio);
  });

  it('uses PS1 15-bit colour in both presets', () => {
    expect(QUALITY_PRESETS.high.colorBits).toBe(5);
    expect(QUALITY_PRESETS.low.colorBits).toBe(5);
  });
});
