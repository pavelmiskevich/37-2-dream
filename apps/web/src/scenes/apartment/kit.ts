import * as THREE from 'three';

type Vec3 = readonly [number, number, number];

/**
 * Shared geometry, materials and textures of the apartment view, freed
 * together. Everything is boxes and cylinders (D-006); sizes in metres.
 */
export class Kit {
  private readonly materials = new Map<string, THREE.Material>();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly textures = new Set<THREE.Texture>();

  /** Lambert material of a colour, shared by colour. */
  material(color: number): THREE.Material {
    const key = color.toString(16);
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshLambertMaterial({ color, flatShading: true });
      this.materials.set(key, material);
    }
    return material;
  }

  /** Takes a material made elsewhere, to be freed with the kit. */
  own<M extends THREE.Material>(material: M): M {
    this.materials.set(`own:${material.uuid}`, material);
    return material;
  }

  geometry<G extends THREE.BufferGeometry>(geometry: G): G {
    this.geometries.add(geometry);
    return geometry;
  }

  texture<T extends THREE.Texture>(texture: T): T {
    this.textures.add(texture);
    return texture;
  }

  /** Canvas texture drawn by `draw` on a `width×height` canvas. */
  canvas(width: number, height: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d');
    if (g) draw(g);
    const texture = this.texture(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    if (repeat) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(...repeat);
    }
    return texture;
  }

  /** Box of size `w×h×d` whose centre is at `at`. */
  box(parent: THREE.Object3D, size: Vec3, at: Vec3, material: number | THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(
      this.geometry(new THREE.BoxGeometry(...size)),
      typeof material === 'number' ? this.material(material) : material,
    );
    mesh.position.set(...at);
    parent.add(mesh);
    return mesh;
  }

  /** Box given by its corners: x0..x1, y0..y1, z0..z1. */
  span(parent: THREE.Object3D, from: Vec3, to: Vec3, material: number | THREE.Material): THREE.Mesh {
    const size: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const at: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
    return this.box(parent, size, at, material);
  }

  /** Upright cylinder whose base centre is at `at`. */
  cylinder(
    parent: THREE.Object3D,
    radius: number,
    height: number,
    at: Vec3,
    material: number | THREE.Material,
    segments = 8,
    topRadius = radius,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      this.geometry(new THREE.CylinderGeometry(topRadius, radius, height, segments)),
      typeof material === 'number' ? this.material(material) : material,
    );
    mesh.position.set(at[0], at[1] + height / 2, at[2]);
    parent.add(mesh);
    return mesh;
  }

  /** Flat rectangle `w×h` at `at`, facing +Z before `rotationY`. */
  plane(parent: THREE.Object3D, size: [number, number], at: Vec3, material: THREE.Material, rotationY = 0) {
    const mesh = new THREE.Mesh(this.geometry(new THREE.PlaneGeometry(...size)), material);
    mesh.position.set(...at);
    mesh.rotation.y = rotationY;
    parent.add(mesh);
    return mesh;
  }

  dispose(): void {
    for (const material of this.materials.values()) material.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const texture of this.textures) texture.dispose();
    this.materials.clear();
    this.geometries.clear();
    this.textures.clear();
  }
}
