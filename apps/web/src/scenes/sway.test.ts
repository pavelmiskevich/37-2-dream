import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyPlayerCamera } from './camera';
import { MAX_SWAY, NO_SWAY, applyCameraSway, feverSway, type CameraSway } from './sway';

const times = Array.from({ length: 400 }, (_, i) => i * 0.25);
const peak = (fever: number, pick: (sway: CameraSway) => number) =>
  Math.max(...times.map((t) => Math.abs(pick(feverSway(fever, t)))));

describe('feverSway', () => {
  it('keeps the camera still without fever', () => {
    for (const t of times) expect(feverSway(0, t)).toEqual(NO_SWAY);
    expect(feverSway(Number.NaN, 3)).toEqual(NO_SWAY);
  });

  it('never exceeds MAX_SWAY, even above full fever', () => {
    for (const t of times) {
      const sway = feverSway(5, t);
      expect(Math.abs(sway.position[0])).toBeLessThanOrEqual(MAX_SWAY.drift + 1e-12);
      expect(Math.abs(sway.position[1])).toBeLessThanOrEqual(MAX_SWAY.bob + 1e-12);
      expect(Math.abs(sway.yaw)).toBeLessThanOrEqual(MAX_SWAY.yaw + 1e-12);
      expect(Math.abs(sway.pitch)).toBeLessThanOrEqual(MAX_SWAY.pitch + 1e-12);
      expect(Math.abs(sway.roll)).toBeLessThanOrEqual(MAX_SWAY.roll + 1e-12);
    }
  });

  it('grows with the fever: barely at 37.2, clearly at 38.5', () => {
    const roll = (fever: number) => peak(fever, (s) => s.roll);
    expect(roll(0.08)).toBeLessThan(0.001);
    expect(roll(0.6)).toBeGreaterThan(0.015);
    expect(roll(0.3)).toBeLessThan(roll(0.6));
    expect(roll(0.6)).toBeLessThan(roll(1));
  });

  it('moves smoothly in time', () => {
    for (const t of times) {
      const a = feverSway(1, t);
      const b = feverSway(1, t + 1 / 60);
      expect(Math.abs(a.roll - b.roll)).toBeLessThan(0.002);
      expect(Math.abs(a.position[1] - b.position[1])).toBeLessThan(0.002);
    }
  });

  it('is a pure function of fever and time', () => {
    expect(feverSway(0.7, 12.34)).toEqual(feverSway(0.7, 12.34));
  });
});

describe('applyCameraSway', () => {
  it('offsets the pose placed by applyPlayerCamera', () => {
    const camera = new THREE.PerspectiveCamera();
    applyPlayerCamera(camera, { position: [1, 1.6, 2], yaw: 0.5, pitch: 0.1 });
    applyCameraSway(camera, { position: [0.01, 0.02, 0], yaw: 0.03, pitch: -0.02, roll: 0.05 });
    expect(camera.position.x).toBeCloseTo(1.01);
    expect(camera.position.y).toBeCloseTo(1.62);
    expect(camera.rotation.y).toBeCloseTo(0.53);
    expect(camera.rotation.x).toBeCloseTo(0.08);
    expect(camera.rotation.z).toBeCloseTo(0.05);
    expect(camera.rotation.order).toBe('YXZ');
  });
});
