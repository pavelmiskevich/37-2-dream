import * as THREE from 'three';
import type { SceneId } from '@dream/core';
import { feverLevel } from '../fever';
import { applyCameraSway, applyPlayerCamera, feverSway, type SceneView, type SceneViewContext } from '../scenes';

/**
 * Stand-in for a scene that has no view yet: a floor and a ring of pillars in
 * the scene's own colour, seen from the hero's eyes. Enough to walk around,
 * look around and tell the scenes apart while they switch (#4).
 */

/** Sky / fog colour of each placeholder; the floor and pillars are tints of it. */
export const PLACEHOLDER_COLORS: Readonly<Record<SceneId, number>> = {
  apartment: 0x4a3626,
  yard: 0x3d5a3a,
  fall: 0x3a4f78,
  jam: 0x6a1426,
  awakening: 0xa8a290,
};

const FLOOR_SIZE = 60;
const PILLARS = 8;
const PILLAR_RING = 7;

function checkerTexture(dark: THREE.Color, light: THREE.Color): THREE.DataTexture {
  const size = 8;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0 ? dark : light;
      data.set([c.r * 255, c.g * 255, c.b * 255, 255], (y * size + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(FLOOR_SIZE / 2, FLOOR_SIZE / 2);
  texture.needsUpdate = true;
  return texture;
}

export function createPlaceholderView({ scene: dreamScene }: SceneViewContext): SceneView {
  const sky = new THREE.Color(PLACEHOLDER_COLORS[dreamScene.id]);
  const scene = new THREE.Scene();
  scene.name = `placeholder:${dreamScene.id}`;
  scene.background = sky;

  const white = new THREE.Color(0xffffff);
  const floorTexture = checkerTexture(sky.clone().lerp(white, 0.15), sky.clone().lerp(white, 0.3));
  const floorMaterial = new THREE.MeshBasicMaterial({ map: floorTexture });
  const floorGeometry = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE, 12, 12);
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const pillarGeometry = new THREE.BoxGeometry(0.6, 3, 0.6);
  const pillarMaterial = new THREE.MeshBasicMaterial({ color: sky.clone().lerp(white, 0.55) });
  for (let i = 0; i < PILLARS; i++) {
    const angle = (i / PILLARS) * Math.PI * 2;
    const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
    pillar.position.set(Math.sin(angle) * PILLAR_RING, 1.5, -Math.cos(angle) * PILLAR_RING);
    scene.add(pillar);
  }

  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 100);

  return {
    scene,
    camera,
    update(frame) {
      applyPlayerCamera(camera, frame.player);
      applyCameraSway(camera, feverSway(feverLevel(frame.state.temperature), frame.time));
    },
    dispose() {
      floorGeometry.dispose();
      floorMaterial.dispose();
      floorTexture.dispose();
      pillarGeometry.dispose();
      pillarMaterial.dispose();
    },
  };
}
