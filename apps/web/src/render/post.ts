import * as THREE from 'three';
import { ditherMatrixGlsl } from './dither';

/**
 * Final pass: nearest-neighbour upscale of the internal image by an integer
 * factor, linear → sRGB, PS1 ordered dither and colour-depth reduction.
 * Dither and quantisation run on the internal pixel grid, so the pattern
 * scales together with the big pixels.
 */
export class Ps1PostPass {
  readonly material: THREE.ShaderMaterial;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new THREE.BufferGeometry();

  constructor() {
    // One triangle covering the whole screen.
    this.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tSource: { value: null },
        uScale: { value: 1 },
        uOffset: { value: new THREE.Vector2() },
        uLevels: { value: 31 },
        uDither: { value: 1 },
      },
      vertexShader: /* glsl */ `
        void main() {
          gl_Position = vec4( position.xy, 0.0, 1.0 );
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSource;
        uniform float uScale;
        uniform vec2 uOffset;
        uniform float uLevels;
        uniform float uDither;

        const float DITHER[16] = ${ditherMatrixGlsl()};

        vec3 linearToSrgb( vec3 c ) {
          return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) );
        }

        void main() {
          ivec2 size = textureSize( tSource, 0 );
          ivec2 texel = clamp( ivec2( floor( ( gl_FragCoord.xy + uOffset ) / uScale ) ), ivec2( 0 ), size - 1 );
          vec3 color = linearToSrgb( clamp( texelFetch( tSource, texel, 0 ).rgb, 0.0, 1.0 ) );

          // 8-bit value + dither table, truncated to the reduced bit depth.
          float stepSize = 256.0 / ( uLevels + 1.0 );
          float dither = DITHER[ ( texel.y % 4 ) * 4 + ( texel.x % 4 ) ] * uDither * ( stepSize / 8.0 );
          vec3 quantized = clamp( floor( ( color * 255.0 + dither ) / stepSize ), 0.0, uLevels ) / uLevels;

          gl_FragColor = vec4( quantized, 1.0 );
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    const triangle = new THREE.Mesh(this.geometry, this.material);
    triangle.frustumCulled = false;
    this.scene.add(triangle);
  }

  render(
    renderer: THREE.WebGLRenderer,
    source: THREE.Texture,
    scale: number,
    offsetX: number,
    offsetY: number,
  ): void {
    const uniforms = this.material.uniforms;
    uniforms.tSource!.value = source;
    uniforms.uScale!.value = scale;
    (uniforms.uOffset!.value as THREE.Vector2).set(offsetX, offsetY);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  configure(colorBits: number, dither: boolean): void {
    this.material.uniforms.uLevels!.value = 2 ** colorBits - 1;
    this.material.uniforms.uDither!.value = dither ? 1 : 0;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
