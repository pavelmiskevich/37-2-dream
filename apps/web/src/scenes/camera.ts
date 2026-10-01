import type * as THREE from 'three';
import type { PlayerState } from '@dream/core';

/**
 * Puts a first-person camera at the player's eyes. The core's yaw 0 looks
 * along −Z and positive yaw turns left, which matches three.js rotation.y;
 * pitch is applied after yaw.
 */
export function applyPlayerCamera(camera: THREE.Camera, player: PlayerState): void {
  camera.position.set(player.position[0], player.position[1], player.position[2]);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(player.pitch, player.yaw, 0);
}
