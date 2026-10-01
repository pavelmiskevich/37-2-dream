import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyPlayerCamera } from './camera';

function forward(camera: THREE.Camera): THREE.Vector3 {
  camera.updateMatrixWorld();
  return camera.getWorldDirection(new THREE.Vector3());
}

describe('applyPlayerCamera', () => {
  it('looks along -Z at yaw 0 and places the camera at the eyes', () => {
    const camera = new THREE.PerspectiveCamera();
    applyPlayerCamera(camera, { position: [1, 1.6, 2], yaw: 0, pitch: 0 });
    expect(camera.position.toArray()).toEqual([1, 1.6, 2]);
    const dir = forward(camera);
    expect(dir.z).toBeCloseTo(-1);
  });

  it('turns left for positive yaw and looks up for positive pitch', () => {
    const camera = new THREE.PerspectiveCamera();
    applyPlayerCamera(camera, { position: [0, 0, 0], yaw: Math.PI / 2, pitch: 0 });
    expect(forward(camera).x).toBeCloseTo(-1);
    applyPlayerCamera(camera, { position: [0, 0, 0], yaw: 0, pitch: 0.5 });
    expect(forward(camera).y).toBeGreaterThan(0);
  });
});
