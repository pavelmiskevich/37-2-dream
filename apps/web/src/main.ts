import * as THREE from 'three';
import { ENGINE_VERSION } from '@dream/core';
import { verticalFovFor } from './viewport';
import './style.css';

// Dev benches: ?sandbox=audio overlays the sound test panel (#7).
if (new URLSearchParams(location.search).get('sandbox') === 'audio') {
  void import('./sandbox/audio').then(({ mountAudioSandbox }) => mountAudioSandbox());
}

const canvas = document.querySelector<HTMLCanvasElement>('#dream');
if (!canvas) throw new Error('Canvas #dream not found');

document.documentElement.dataset.engine = String(ENGINE_VERSION);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
camera.position.set(0, 0, 3);

// Placeholder so aspect-ratio distortion is visible until real scenes arrive (#4).
const placeholder = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }),
);
scene.add(placeholder);

function resize() {
  const { clientWidth: width, clientHeight: height } = canvas!;
  if (width === 0 || height === 0) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.fov = verticalFovFor(camera.aspect);
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(canvas);
resize();

renderer.setAnimationLoop((timeMs) => {
  placeholder.rotation.set(timeMs * 0.0003, timeMs * 0.0005, 0);
  renderer.render(scene, camera);
});
