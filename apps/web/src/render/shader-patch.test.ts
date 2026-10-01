import { describe, expect, it } from 'vitest';
import { ShaderChunk, ShaderLib } from 'three';
import { patchShaders, SNAP_GRID_UNIFORM } from './shader-patch';

const both = { vertexSnap: true, affineTextures: true };
const lambert = { vertexShader: ShaderLib.lambert.vertexShader, fragmentShader: ShaderLib.lambert.fragmentShader };

describe('patchShaders', () => {
  it('snaps vertices right after projection in mesh shaders', () => {
    const { vertexShader } = patchShaders(lambert, ShaderChunk.map_fragment, both);
    expect(vertexShader).toContain(`uniform vec2 ${SNAP_GRID_UNIFORM};`);
    const project = vertexShader.indexOf('#include <project_vertex>');
    const snap = vertexShader.indexOf(`* ${SNAP_GRID_UNIFORM}`);
    expect(project).toBeGreaterThan(-1);
    expect(snap).toBeGreaterThan(project);
  });

  it('snaps sprites, which compute gl_Position inline', () => {
    const sprite = { vertexShader: ShaderLib.sprite.vertexShader, fragmentShader: ShaderLib.sprite.fragmentShader };
    const { vertexShader } = patchShaders(sprite, ShaderChunk.map_fragment, both);
    const snap = vertexShader.indexOf(`* ${SNAP_GRID_UNIFORM}`);
    expect(snap).toBeGreaterThan(vertexShader.indexOf('gl_Position = projectionMatrix'));
    expect(snap).toBeLessThan(vertexShader.indexOf('#include <logdepthbuf_vertex>'));
  });

  it('switches map sampling to affine UVs in both stages', () => {
    const patched = patchShaders(lambert, ShaderChunk.map_fragment, both);
    expect(patched.vertexShader).toContain('vMapUv *= gl_Position.w;');
    expect(patched.fragmentShader).toContain('texture2D( map, ( vMapUv / vPs1AffineW ) )');
    expect(patched.fragmentShader).not.toContain('#include <map_fragment>');
    expect(patched.fragmentShader).toContain('varying float vPs1AffineW;');
  });

  it('skips affine mapping where the shaders do not sample map via vMapUv', () => {
    const points = { vertexShader: ShaderLib.points.vertexShader, fragmentShader: ShaderLib.points.fragmentShader };
    const patched = patchShaders(points, ShaderChunk.map_fragment, both);
    expect(patched.vertexShader).toContain(SNAP_GRID_UNIFORM);
    expect(patched.vertexShader).not.toContain('vPs1AffineW');
    expect(patched.fragmentShader).toBe(points.fragmentShader);
  });

  it('applies only the enabled effects', () => {
    const snapOnly = patchShaders(lambert, ShaderChunk.map_fragment, { vertexSnap: true, affineTextures: false });
    expect(snapOnly.vertexShader).toContain(SNAP_GRID_UNIFORM);
    expect(snapOnly.fragmentShader).toBe(lambert.fragmentShader);

    const none = patchShaders(lambert, ShaderChunk.map_fragment, { vertexSnap: false, affineTextures: false });
    expect(none).toEqual(lambert);
  });

  it('leaves unknown shaders untouched', () => {
    const custom = { vertexShader: 'void main() { gl_Position = vec4(0.0); }', fragmentShader: 'void main() {}' };
    expect(patchShaders(custom, ShaderChunk.map_fragment, both)).toEqual(custom);
  });
});
