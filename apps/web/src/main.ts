import * as THREE from 'three';
import { ENGINE_VERSION } from '@dream/core';
import { createPs1Renderer } from './render';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#dream');
if (!canvas) throw new Error('Canvas #dream not found');

document.documentElement.dataset.engine = String(ENGINE_VERSION);

// Dev test benches: `?sandbox=<name>` opens one instead of the game.
const sandboxes = new Map<string, (canvas: HTMLCanvasElement) => Promise<void>>([
  ['ps1', async (c) => (await import('./sandbox/ps1')).startPs1Sandbox(c)],
  // The sound panel overlays the skeleton scene.
  [
    'audio',
    async (c) => {
      startSkeleton(c);
      (await import('./sandbox/audio')).mountAudioSandbox();
    },
  ],
]);
const sandbox = sandboxes.get(new URLSearchParams(window.location.search).get('sandbox') ?? '');

if (sandbox) void sandbox(canvas);
else startSkeleton(canvas);

function startSkeleton(canvas: HTMLCanvasElement) {
  const ps1 = createPs1Renderer(canvas);

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

  ps1.renderer.setAnimationLoop((timeMs) => {
    placeholder.rotation.set(timeMs * 0.0003, timeMs * 0.0005, 0);
    ps1.render(scene, camera);
  });
}
