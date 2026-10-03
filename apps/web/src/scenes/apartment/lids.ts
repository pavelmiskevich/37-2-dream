import * as THREE from 'three';
import type { Eyes } from './eyes';
import type { Kit } from './kit';

/** Distance of the eyelids and the darkness from the eye, metres: just past the near plane. */
const LID_DISTANCE = 0.08;

/** Eyelids and darkness riding on the camera: the prologue closes them, the awakening opens them. */
export interface Lids {
  /** Places the lids for `eyes`; call after the camera's fov and aspect are set. */
  update(eyes: Eyes): void;
}

export function createLids(kit: Kit, camera: THREE.PerspectiveCamera): Lids {
  // In front of everything. Transparent, so that they are drawn after
  // everything else, the window glass included.
  const overlay = (color: number) => {
    const material = kit.own(
      new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false, fog: false }),
    );
    const mesh = new THREE.Mesh(kit.geometry(new THREE.PlaneGeometry(1, 1)), material);
    mesh.renderOrder = 1000;
    mesh.frustumCulled = false;
    mesh.visible = false;
    camera.add(mesh);
    return { mesh, material };
  };
  const upperLid = overlay(0x000000);
  const lowerLid = overlay(0x000000);
  const dark = overlay(0x000000);

  return {
    update(eyes) {
      // Planes as tall as the view, sliding in from above and below.
      const halfHeight = LID_DISTANCE * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
      const halfWidth = halfHeight * camera.aspect * 1.05;
      const lidOffset = halfHeight * (2 - eyes.lids);
      for (const [lid, sign] of [
        [upperLid, 1],
        [lowerLid, -1],
      ] as const) {
        lid.mesh.visible = eyes.lids > 0.001;
        lid.mesh.scale.set(halfWidth * 2, halfHeight * 2, 1);
        lid.mesh.position.set(0, sign * lidOffset, -LID_DISTANCE);
      }
      dark.mesh.visible = eyes.dark > 0.001;
      dark.mesh.scale.set(halfWidth * 2, halfHeight * 2, 1);
      dark.mesh.position.set(0, 0, -LID_DISTANCE * 1.01);
      dark.material.opacity = eyes.dark;
    },
  };
}
