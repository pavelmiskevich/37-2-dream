import * as THREE from 'three';
import { verticalFovFor } from '../viewport';
import { gridAspect, pixelGridFor, type PixelGrid } from './pixel-grid';
import { Ps1PostPass } from './post';
import { browserDeviceHints, detectQuality, QUALITY_PRESETS, type QualityLevel, type QualityPreset } from './quality';
import { patchShaders, SNAP_GRID_UNIFORM } from './shader-patch';

export interface Ps1RendererOptions {
  /** Force a preset; by default it is picked from `?quality=` and the device. */
  readonly quality?: QualityLevel;
  /** Fog added to scenes that have none. `null` disables the default fog. */
  readonly defaultFog?: { readonly near: number; readonly far: number } | null;
  /**
   * Keep perspective cameras fitted to the screen (aspect + FOV widened in
   * portrait, see viewport.ts). Default: true.
   */
  readonly fitCamera?: boolean;
}

export interface Ps1Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly quality: QualityPreset;
  /** Current internal resolution and upscale factor. */
  readonly grid: PixelGrid;
  /** Renders a scene in the PS1 style; call once per frame. */
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  /**
   * Fever level 0..1 from `feverLevel(state.temperature)`: chromatic
   * aberration and heat-haze distortion in the final pass. Stays until
   * changed; 0 (the default) leaves the picture untouched.
   */
  setFever(fever: number): void;
  dispose(): void;
}

const DEFAULT_FOG = { near: 6, far: 24 };

/** Set `userData.ps1 = false` on a material or texture to leave it untouched. */
function optedOut(target: { userData: Record<string, unknown> }): boolean {
  return target.userData.ps1 === false;
}

const TEXTURE_SLOTS = ['map', 'alphaMap', 'emissiveMap', 'lightMap', 'aoMap', 'specularMap'] as const;

/**
 * Creates a renderer that draws any three.js scene in the PS1 look: low
 * internal resolution with integer nearest upscale, dithering and 15-bit
 * colour, vertex snapping, affine textures, nearest texture filtering and
 * fog. Materials and textures are patched automatically the first time a
 * scene containing them is rendered.
 */
export function createPs1Renderer(
  canvas: HTMLCanvasElement,
  options: Ps1RendererOptions = {},
): Ps1Renderer {
  const quality = QUALITY_PRESETS[options.quality ?? detectQuality(browserDeviceHints())];
  const defaultFog = options.defaultFog === undefined ? DEFAULT_FOG : options.defaultFog;
  const fitCamera = options.fitCamera ?? true;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  canvas.style.imageRendering = 'pixelated';

  const halfFloat =
    quality.highPrecisionTarget &&
    (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: true,
  });

  const post = new Ps1PostPass();
  post.configure(quality.colorBits, quality.dither);

  // Shared by every patched material, so a resize updates them all at once.
  const snapGrid = { value: new THREE.Vector2(1, 1) };
  const patchOptions = { vertexSnap: quality.vertexSnap, affineTextures: quality.affineTextures };
  const patchKey = `ps1:${Number(patchOptions.vertexSnap)}${Number(patchOptions.affineTextures)}`;
  const patchedMaterials = new WeakSet<THREE.Material>();
  const patchedTextures = new WeakSet<THREE.Texture>();
  const fogged = new WeakSet<THREE.Scene>();

  let grid = pixelGridFor(1, 1, quality.shortSide);
  let lastSize = '';
  let fever = 0;

  function resize(): void {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio);
    const key = `${width}x${height}@${pixelRatio}`;
    if (key === lastSize || width === 0 || height === 0) return;
    lastSize = key;

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    grid = pixelGridFor(buffer.x, buffer.y, quality.shortSide);
    target.setSize(grid.width, grid.height);
    snapGrid.value.set(grid.width / 2, grid.height / 2);
  }

  function patchTexture(texture: THREE.Texture): void {
    if (patchedTextures.has(texture) || optedOut(texture)) return;
    patchedTextures.add(texture);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
  }

  function patchMaterial(material: THREE.Material): void {
    if (patchedMaterials.has(material)) return;
    patchedMaterials.add(material);
    if (optedOut(material) || (material as THREE.RawShaderMaterial).isRawShaderMaterial) return;

    const record = material as unknown as Record<string, unknown>;
    for (const slot of TEXTURE_SLOTS) {
      const texture = record[slot];
      if (texture instanceof THREE.Texture) patchTexture(texture);
    }

    const baseKey = material.customProgramCacheKey();
    const previous = material.onBeforeCompile.bind(material);
    material.onBeforeCompile = (shader, webgl) => {
      previous(shader, webgl);
      const patched = patchShaders(shader, THREE.ShaderChunk.map_fragment, patchOptions);
      shader.vertexShader = patched.vertexShader;
      shader.fragmentShader = patched.fragmentShader;
      shader.uniforms[SNAP_GRID_UNIFORM] = snapGrid;
    };
    material.customProgramCacheKey = () => `${baseKey}|${patchKey}`;
    material.needsUpdate = true;
  }

  function prepare(scene: THREE.Scene): void {
    if (defaultFog && scene.fog === null && !fogged.has(scene)) {
      const color = scene.background instanceof THREE.Color ? scene.background : new THREE.Color(0x000000);
      scene.fog = new THREE.Fog(color, defaultFog.near, defaultFog.far);
    }
    fogged.add(scene);

    scene.traverse((object) => {
      const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach(patchMaterial);
      else if (material) patchMaterial(material);
    });
  }

  function fit(camera: THREE.Camera): void {
    if (!fitCamera || !(camera instanceof THREE.PerspectiveCamera)) return;
    const aspect = gridAspect(grid);
    if (camera.aspect === aspect) return;
    camera.aspect = aspect;
    camera.fov = verticalFovFor(aspect);
    camera.updateProjectionMatrix();
  }

  return {
    renderer,
    quality,
    get grid() {
      return grid;
    },
    render(scene, camera) {
      resize();
      prepare(scene);
      fit(camera);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      // The haze only animates; its clock never reaches the simulation.
      post.setFever(fever, performance.now() / 1000);
      post.render(renderer, target.texture, grid.scale, grid.offsetX, grid.offsetY);
    },
    setFever(level) {
      fever = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
    },
    dispose() {
      target.dispose();
      post.dispose();
      renderer.dispose();
    },
  };
}
