import * as THREE from 'three';
import { JAM_JAR, type Rng } from '@dream/core';
import type { Kit } from './objects';

/**
 * Air bubbles in the jam. They appear in small clusters, `rate` clusters a
 * second (the scene's `bubbleRate`), and rise against gravity — whichever way
 * gravity pulls at the moment — slower in thicker jam, bigger ones faster,
 * until they reach the glass, the bottom or the lid and are gone. Purely
 * visual: the view's own stream, never the simulation's.
 */

/** Most bubbles alive at once. */
const MAX_BUBBLES = 140;
/** Bubble radius range, metres; a rare big one is up to `big`. */
const RADIUS = { min: 0.05, max: 0.32, big: 0.75 } as const;
/** Rise speed of the smallest and the biggest bubble in runny jam, m/s. */
const RISE = { small: 0.25, big: 0.9 } as const;

interface Bubble {
  mesh: THREE.Mesh;
  radius: number;
  speed: number;
  phase: number;
}

export class Bubbles {
  private readonly live: Bubble[] = [];
  private readonly spare: THREE.Mesh[] = [];
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.Material;
  private due = 0;
  private time = 0;

  constructor(
    kit: Kit,
    private readonly root: THREE.Object3D,
    private readonly rate: number,
    private readonly viscosity: number,
    private readonly rng: Rng,
    tint: number,
  ) {
    this.geometry = kit.geometry(new THREE.SphereGeometry(1, 8, 6));
    this.material = kit.own(
      new THREE.MeshLambertMaterial({
        color: new THREE.Color(tint).lerp(new THREE.Color(0xffffff), 0.6),
        emissive: new THREE.Color(tint).multiplyScalar(0.25),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
  }

  /** Advances the bubbles by `dt` seconds; `up` is the unit direction bubbles rise in. */
  update(dt: number, up: THREE.Vector3): void {
    this.time += dt;
    this.due += this.rate * dt;
    while (this.due >= 1) {
      this.due -= 1;
      this.spawnCluster(up);
    }
    const slow = 1 - 0.65 * this.viscosity;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const bubble = this.live[i]!;
      const p = bubble.mesh.position;
      p.addScaledVector(up, bubble.speed * slow * dt);
      // A slight wobble across the way up.
      const w = Math.sin(this.time * 2.1 + bubble.phase) * 0.12 * dt;
      p.x += w * (1 - Math.abs(up.x));
      p.z += w * (1 - Math.abs(up.z));
      if (!this.within(p, bubble.radius)) {
        this.root.remove(bubble.mesh);
        this.spare.push(bubble.mesh);
        this.live.splice(i, 1);
      }
    }
  }

  private within(p: THREE.Vector3, radius: number): boolean {
    return Math.hypot(p.x, p.z) < JAM_JAR.radius - radius && p.y > radius && p.y < JAM_JAR.height - radius;
  }

  private spawnCluster(up: THREE.Vector3): void {
    const { rng } = this;
    // Clusters start low with respect to where they will rise from.
    const r = Math.sqrt(rng.next()) * (JAM_JAR.radius - 1);
    const a = rng.range(0, Math.PI * 2);
    const centre = new THREE.Vector3(Math.sin(a) * r, rng.range(1, JAM_JAR.height - 1), -Math.cos(a) * r);
    centre.addScaledVector(up, -rng.range(0, 3));
    const count = rng.int(1, 4);
    for (let i = 0; i < count && this.live.length < MAX_BUBBLES; i++) {
      const radius = rng.chance(0.06) ? rng.range(RADIUS.max, RADIUS.big) : rng.range(RADIUS.min, RADIUS.max);
      const mesh = this.spare.pop() ?? new THREE.Mesh(this.geometry, this.material);
      mesh.scale.setScalar(radius);
      mesh.position.set(centre.x + rng.range(-0.4, 0.4), centre.y + rng.range(-0.4, 0.4), centre.z + rng.range(-0.4, 0.4));
      if (!this.within(mesh.position, radius)) {
        this.spare.push(mesh);
        continue;
      }
      const size = (radius - RADIUS.min) / (RADIUS.big - RADIUS.min);
      this.root.add(mesh);
      this.live.push({ mesh, radius, speed: RISE.small + (RISE.big - RISE.small) * size, phase: rng.range(0, 6.3) });
    }
  }
}
