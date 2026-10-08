import type { LibraryAsset, LibraryManifest } from '@dream/core';
import * as THREE from 'three';
import { assetIndex, assetUrl } from './preload';

/**
 * Library assets on the GPU: stills with their depth maps and clips as video
 * textures. Loads are deduplicated; the player asks for a window of upcoming
 * shots (`assetWindow`) and releases the rest, so cuts never wait for a file.
 */

export interface LoadedAsset {
  asset: LibraryAsset;
  texture: THREE.Texture;
  depth: THREE.Texture | null;
  /** Clips only. */
  video: HTMLVideoElement | null;
  /** Width / height. */
  aspect: number;
}

/** A clip is usable once it can show its first frame; give up on it after this long. */
const CLIP_TIMEOUT_MS = 15_000;

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  image.crossOrigin = 'anonymous';
  image.src = url;
  await image.decode();
  return image;
}

function imageTexture(image: HTMLImageElement): THREE.Texture {
  const texture = new THREE.Texture(image);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

async function loadVideo(url: string): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Clip timed out: ${url}`)), CLIP_TIMEOUT_MS);
    const done = (error?: Error) => {
      clearTimeout(timer);
      video.removeEventListener('loadeddata', ok);
      video.removeEventListener('error', fail);
      if (error) reject(error);
      else resolve();
    };
    const ok = () => done();
    const fail = () => done(new Error(`Clip failed to load: ${url}`));
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) done();
    else {
      video.addEventListener('loadeddata', ok);
      video.addEventListener('error', fail);
      video.load();
    }
  });
  return video;
}

export class AssetCache {
  private readonly index: Map<string, LibraryAsset>;
  private readonly loading = new Map<string, Promise<LoadedAsset | null>>();
  private readonly ready = new Map<string, LoadedAsset>();
  private disposed = false;

  /**
   * `root` is the URL of the library directory; `prepare` uploads a fresh
   * texture to the GPU ahead of its cut.
   */
  constructor(
    manifest: LibraryManifest,
    private readonly root: string,
    private readonly prepare: (texture: THREE.Texture) => void = () => {},
  ) {
    this.index = assetIndex(manifest);
  }

  /** The asset if it is loaded; never waits. */
  get(id: string): LoadedAsset | undefined {
    return this.ready.get(id);
  }

  /** Loads an asset (once); resolves to null when it cannot be loaded. */
  request(id: string): Promise<LoadedAsset | null> {
    let promise = this.loading.get(id);
    if (!promise) {
      promise = this.load(id).catch((error: unknown) => {
        console.warn(`Film asset "${id}" is not available`, error);
        return null;
      });
      this.loading.set(id, promise);
    }
    return promise;
  }

  /** Keeps `ids` loaded (requesting the missing ones, in order) and releases everything else. */
  keep(ids: readonly string[]): void {
    for (const id of ids) void this.request(id);
    for (const [id, loaded] of this.ready) {
      if (ids.includes(id)) continue;
      this.release(loaded);
      this.ready.delete(id);
      this.loading.delete(id);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const loaded of this.ready.values()) this.release(loaded);
    this.ready.clear();
    this.loading.clear();
  }

  private async load(id: string): Promise<LoadedAsset> {
    const asset = this.index.get(id);
    if (!asset) throw new Error(`No asset "${id}" in the library`);
    let loaded: LoadedAsset;
    if (asset.kind === 'clip') {
      const video = await loadVideo(assetUrl(this.root, asset.file));
      const texture = new THREE.VideoTexture(video);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      const aspect = video.videoWidth > 0 ? video.videoWidth / video.videoHeight : asset.width / asset.height;
      // A moving picture has no single depth map: clips play flat.
      loaded = { asset, texture, depth: null, video, aspect };
    } else {
      const [image, depthImage] = await Promise.all([
        loadImage(assetUrl(this.root, asset.file)),
        asset.depth
          ? loadImage(assetUrl(this.root, asset.depth)).catch((error: unknown) => {
              console.warn(`Depth map of "${id}" is not available; the shot plays flat`, error);
              return null;
            })
          : Promise.resolve(null),
      ]);
      const texture = imageTexture(image);
      const depth = depthImage ? imageTexture(depthImage) : null;
      loaded = { asset, texture, depth, video: null, aspect: image.naturalWidth / image.naturalHeight };
    }
    if (this.disposed || this.loading.get(id) === undefined) {
      this.release(loaded);
      throw new Error(`Asset "${id}" was released while loading`);
    }
    this.prepare(loaded.texture);
    if (loaded.depth) this.prepare(loaded.depth);
    this.ready.set(id, loaded);
    return loaded;
  }

  private release(loaded: LoadedAsset): void {
    loaded.texture.dispose();
    loaded.depth?.dispose();
    if (loaded.video) {
      loaded.video.pause();
      loaded.video.removeAttribute('src');
      loaded.video.load();
    }
  }
}

/** Fetches `library.json` from a library root. */
export async function fetchLibrary(root: string): Promise<LibraryManifest> {
  const response = await fetch(assetUrl(root, 'library.json'));
  if (!response.ok) throw new Error(`No library at ${root} (${response.status})`);
  const manifest = (await response.json()) as LibraryManifest;
  if (manifest.version !== 1 || !Array.isArray(manifest.assets)) throw new Error(`Unknown library format at ${root}`);
  return manifest;
}
