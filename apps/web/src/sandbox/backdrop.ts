import * as THREE from 'three';
import { createPs1Renderer } from '../render';

/**
 * Plain PS1 scene behind a test bench's panel (`?sandbox=audio`): a slowly
 * turning wireframe cube, so the canvas and the renderer are visibly alive.
 */
export function startBackdrop(canvas: HTMLCanvasElement): void {
  const ps1 = createPs1Renderer(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
  camera.position.set(0, 0, 3);

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }),
  );
  scene.add(cube);

  ps1.renderer.setAnimationLoop((timeMs) => {
    const time = timeMs / 1000;
    cube.rotation.set(time * 0.3, time * 0.5, 0);
    ps1.render(scene, camera);
  });
}
