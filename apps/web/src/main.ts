import * as THREE from 'three';
import { ENGINE_VERSION } from '@dream/core';
import { createDreamSession, seedFromQuery } from './loop';
import { createPs1Renderer } from './render';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#dream');
if (!canvas) throw new Error('Canvas #dream not found');

document.documentElement.dataset.engine = String(ENGINE_VERSION);

// Dev test benches: `?sandbox=<name>` opens one instead of the game.
const sandboxes = new Map<string, (canvas: HTMLCanvasElement) => Promise<void>>([
  ['ps1', async (c) => (await import('./sandbox/ps1')).startPs1Sandbox(c)],
  ['fever', async (c) => (await import('./sandbox/fever')).startFeverSandbox(c)],
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

  // Fixed-step dream simulation; the input layer will pass `readInput` (#4).
  const session = createDreamSession({ seed: seedFromQuery(window.location.search) });
  document.documentElement.dataset.seed = session.dream.seed;

  ps1.renderer.setAnimationLoop((timeMs) => {
    const view = session.frame(timeMs);
    placeholder.rotation.set(view.time * 0.3, view.time * 0.5, 0);
    ps1.render(scene, camera);
  });
}
