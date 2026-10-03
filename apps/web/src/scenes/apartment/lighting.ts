import * as THREE from 'three';
import type { RoomLight } from '@dream/core';
import { LIGHT_SPOTS, type Room } from './room';

/**
 * Light of the bedroom: shared by the prologue (the scene's `roomLight`) and
 * the awakening (always daylight).
 */
export interface Lighting {
  background: number;
  ambient: [color: number, intensity: number];
  /** Night outside (lit windows across the yard) or an overcast day. */
  day: boolean;
}

export const LIGHTING: Readonly<Record<RoomLight, Lighting>> = {
  lamp: { background: 0x050608, ambient: [0x5a4a3a, 0.7], day: false },
  tv_glow: { background: 0x040508, ambient: [0x30384a, 0.55], day: false },
  daylight: { background: 0x6a6e74, ambient: [0xa8acb4, 2.6], day: true },
};

/** TV light flicker, 0.7..1: two slow unrelated waves, never repeating visibly. */
export const flicker = (time: number) => 0.85 + 0.09 * Math.sin(time * 5.3) + 0.06 * Math.sin(time * 13.1 + 1.7);

export interface RoomLights {
  /** The TV's light when it is on; its intensity follows `flicker`. */
  tv: THREE.PointLight | null;
}

/** Puts the lights of `light` into `scene` and lights up the room's lamp or TV. */
export function lightRoom(scene: THREE.Scene, room: Room, light: RoomLight): RoomLights {
  const lighting = LIGHTING[light];
  scene.background = new THREE.Color(lighting.background);
  scene.fog = new THREE.Fog(lighting.background, 6, 30);
  scene.add(new THREE.AmbientLight(...lighting.ambient));

  // Every room keeps a little light from the window and from under the door.
  const doorSpill = new THREE.PointLight(0xffc070, 0.3, 1.6, 1.5);
  doorSpill.position.set(2.52, 0.08, -2.38);
  scene.add(doorSpill);

  let tv: THREE.PointLight | null = null;
  switch (light) {
    case 'lamp': {
      const lamp = new THREE.PointLight(0xffc078, 3.2, 0, 1.3);
      lamp.position.copy(LIGHT_SPOTS.lamp);
      scene.add(lamp);
      room.lampShade.color.set(0xffd8a0);
      break;
    }
    case 'tv_glow': {
      tv = new THREE.PointLight(0x8ab0ff, 2.6, 0, 1.2);
      tv.position.copy(LIGHT_SPOTS.tv);
      scene.add(tv);
      room.tvScreen.color.set(0x9ab8e8);
      break;
    }
    case 'daylight': {
      const sky = new THREE.DirectionalLight(0xd8e0ea, 2.2);
      sky.position.set(1.2, 2.5, -6);
      sky.target.position.set(0.6, 0.4, -1);
      scene.add(sky, sky.target);
      break;
    }
  }
  if (!lighting.day) {
    // Night: the dim blue of the yard through the window.
    const night = new THREE.PointLight(0x4a5a8a, 0.8, 0, 1.2);
    night.position.set(1.05, 1.6, -3.2);
    scene.add(night);
  }
  return { tv };
}
