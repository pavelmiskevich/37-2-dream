import * as THREE from 'three';
import { createPs1Renderer } from '../render';

/**
 * `?sandbox=ps1` — a yard of plain boxes to judge the PS1 look: big pixels,
 * dithered 15-bit colour, wobbling vertices, warping textures and fog.
 * `&quality=low|high` forces a preset.
 */

type Rgb = readonly [number, number, number];

/** Small procedural texture; the PS1 renderer makes it nearest-filtered. */
function paintTexture(size: number, paint: (x: number, y: number) => Rgb, repeat = 1): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = paint(x, y);
      data.set([r, g, b, 255], (y * size + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.needsUpdate = true;
  return texture;
}

// Deterministic per-texel noise so the textures look the same on every load.
const noise = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
const shade = (rgb: Rgb, k: number): Rgb => [rgb[0] * k, rgb[1] * k, rgb[2] * k];

const asphalt = paintTexture(16, (x, y) => {
  const tile = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
  return shade(tile ? [92, 96, 90] : [74, 78, 74], 0.85 + noise(x, y) * 0.3);
}, 12);

// A Soviet panel block: concrete with a grid of windows, a few of them lit.
const panelBlock = paintTexture(16, (x, y) => {
  const isWindow = x % 8 >= 2 && x % 8 <= 5 && y % 8 >= 2 && y % 8 <= 5;
  if (isWindow) {
    const lit = noise(Math.floor(x / 8) + 3, Math.floor(y / 8) + 7) > 0.7;
    return lit ? [222, 196, 110] : [36, 44, 58];
  }
  return shade([168, 160, 146], 0.9 + noise(x, y) * 0.15);
});

const crate = paintTexture(8, (x, y) => {
  const edge = x === 0 || y === 0 || x === 7 || y === 7 || x === y;
  return shade(edge ? [96, 60, 30] : [150, 104, 56], 0.9 + noise(x, y) * 0.2);
});

const brick = paintTexture(16, (x, y) => {
  const row = Math.floor(y / 4);
  const mortar = y % 4 === 0 || (x + (row % 2) * 4) % 8 === 0;
  return mortar ? [150, 146, 136] : shade([142, 58, 44], 0.85 + noise(x, y) * 0.3);
});

export function startPs1Sandbox(canvas: HTMLCanvasElement): void {
  const ps1 = createPs1Renderer(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2b3140);

  scene.add(new THREE.HemisphereLight(0xb8c4d8, 0x3a3428, 1.4));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
  sun.position.set(-4, 8, 3);
  scene.add(sun);

  // Floor: subdivided so affine texture warping stays in the PS1 range.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 48, 24, 24).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ map: asphalt }),
  );
  scene.add(floor);

  const box = (w: number, h: number, d: number, material: THREE.Material, x: number, z: number, rotY = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, h / 2, z);
    mesh.rotation.y = rotY;
    scene.add(mesh);
    return mesh;
  };

  const blockTexture = panelBlock.clone();
  blockTexture.repeat.set(3, 4);
  box(9, 10, 3, new THREE.MeshLambertMaterial({ map: blockTexture, flatShading: true }), -3, -12);
  box(1.4, 1.4, 1.4, new THREE.MeshLambertMaterial({ map: crate, flatShading: true }), 2.2, -2, 0.4);
  box(1, 1, 1, new THREE.MeshLambertMaterial({ map: crate, flatShading: true }), 2.9, -0.8, -0.3);
  box(4, 2.2, 0.5, new THREE.MeshLambertMaterial({ map: brick, flatShading: true }), -3.5, -4, 0.2);

  // Untextured boxes receding into the fog show the dither on gradients.
  const colors = [0xc8b48a, 0x7f9a6a, 0x9a6a6a, 0x6a7f9a];
  for (let i = 0; i < 8; i++) {
    const material = new THREE.MeshLambertMaterial({ color: colors[i % colors.length] });
    box(1.2, 1.5 + (i % 3) * 0.6, 1.2, material, 5 + (i % 2) * 1.5, 1 - i * 3.2, i * 0.5);
  }

  const spinner = box(0.8, 0.8, 0.8, new THREE.MeshLambertMaterial({ map: crate }), 0, -1.5);
  spinner.position.y = 1.4;

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 60);
  const stats = createStatsOverlay();

  let frames = 0;
  let since = performance.now();
  ps1.renderer.setAnimationLoop((timeMs) => {
    const t = timeMs * 0.001;
    // Slow sway: vertex snapping and affine warping show up in motion.
    camera.position.set(Math.sin(t * 0.25) * 2.5, 1.6, 4 + Math.cos(t * 0.2) * 0.8);
    camera.lookAt(0, 1.2, -4);
    spinner.rotation.set(t * 0.7, t * 0.9, 0);

    ps1.render(scene, camera);

    frames++;
    const now = performance.now();
    if (now - since >= 500) {
      const fps = (frames * 1000) / (now - since);
      const { width, height, scale } = ps1.grid;
      stats.textContent = `${fps.toFixed(0)} fps · ${width}×${height} ×${scale} · ${ps1.quality.level}`;
      frames = 0;
      since = now;
    }
  });
}

function createStatsOverlay(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'ps1-stats';
  Object.assign(el.style, {
    position: 'fixed',
    top: 'calc(var(--safe-top) + 8px)',
    left: 'calc(var(--safe-left) + 8px)',
    font: '12px monospace',
    color: '#d8d8c8',
    background: 'rgba(0, 0, 0, 0.5)',
    padding: '2px 6px',
    pointerEvents: 'none',
  });
  document.body.append(el);
  return el;
}
