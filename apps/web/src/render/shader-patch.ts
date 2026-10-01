/**
 * Pure string patches that turn three.js built-in material shaders into
 * PS1-style ones. Kept free of three.js imports so they are unit-testable.
 */

export interface MaterialPatchOptions {
  /** Snap clip-space vertices to the internal pixel grid. */
  readonly vertexSnap: boolean;
  /** Interpolate `map` UVs affinely (no perspective correction). */
  readonly affineTextures: boolean;
}

export interface ShaderSources {
  readonly vertexShader: string;
  readonly fragmentShader: string;
}

/** Uniform shared by every patched material: internal resolution / 2 / snap step. */
export const SNAP_GRID_UNIFORM = 'ps1SnapGrid';

const PROJECT_VERTEX = '#include <project_vertex>';
// Sprites compute gl_Position inline; they still include this right after it.
const LOGDEPTH_VERTEX = '#include <logdepthbuf_vertex>';
const UV_VERTEX = '#include <uv_vertex>';
const MAP_FRAGMENT = '#include <map_fragment>';

const SNAP_DECLARATIONS = /* glsl */ `
uniform vec2 ${SNAP_GRID_UNIFORM};
`;

// Runs right after gl_Position is known; w <= 0 is behind the camera.
const SNAP_BODY = /* glsl */ `
if ( gl_Position.w > 0.0 ) {
	vec2 ps1Ndc = gl_Position.xy / gl_Position.w;
	ps1Ndc = floor( ps1Ndc * ${SNAP_GRID_UNIFORM} + 0.5 ) / ${SNAP_GRID_UNIFORM};
	gl_Position.xy = ps1Ndc * gl_Position.w;
}
`;

const AFFINE_DECLARATIONS = /* glsl */ `
#ifdef USE_MAP
varying float vPs1AffineW;
#endif
`;

// Pre-multiplying by w and dividing per fragment cancels the GPU's
// perspective correction, giving the PS1's warping textures.
const AFFINE_BODY = /* glsl */ `
#ifdef USE_MAP
vMapUv *= gl_Position.w;
vPs1AffineW = gl_Position.w;
#endif
`;

/**
 * Adds vertex snapping and affine texture mapping to a pair of three.js
 * shader bodies (as seen in `material.onBeforeCompile`). Each effect is only
 * applied where the shaders have the chunks it hooks into; otherwise the
 * sources come back unchanged.
 *
 * @param mapFragmentChunk three's `ShaderChunk.map_fragment`
 */
export function patchShaders(
  shaders: ShaderSources,
  mapFragmentChunk: string,
  options: MaterialPatchOptions,
): ShaderSources {
  let { vertexShader, fragmentShader } = shaders;

  const hook = vertexShader.includes(PROJECT_VERTEX)
    ? { marker: PROJECT_VERTEX, after: true }
    : vertexShader.includes(LOGDEPTH_VERTEX)
      ? { marker: LOGDEPTH_VERTEX, after: false }
      : null;
  if (!hook) return shaders;

  const snap = options.vertexSnap;
  const affine =
    options.affineTextures &&
    vertexShader.includes(UV_VERTEX) &&
    fragmentShader.includes(MAP_FRAGMENT);
  if (!snap && !affine) return shaders;

  const body = (snap ? SNAP_BODY : '') + (affine ? AFFINE_BODY : '');
  vertexShader = vertexShader.replace(
    hook.marker,
    hook.after ? `${hook.marker}\n${body}` : `${body}\n${hook.marker}`,
  );
  vertexShader =
    (snap ? SNAP_DECLARATIONS : '') + (affine ? AFFINE_DECLARATIONS : '') + vertexShader;

  if (affine) {
    const affineMap = mapFragmentChunk.replaceAll('vMapUv', '( vMapUv / vPs1AffineW )');
    fragmentShader = AFFINE_DECLARATIONS + fragmentShader.replace(MAP_FRAGMENT, affineMap);
  }

  return { vertexShader, fragmentShader };
}
