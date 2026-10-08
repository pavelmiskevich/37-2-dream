import * as THREE from 'three';
import type { FrameState } from './frame';

/**
 * The film on WebGL: one full-screen pass draws the shot's image (still or
 * clip) through the camera crop, the depth parallax, soft focus and motion
 * blur, fever, flicker, vignette, the cut overlays and grain. Only one shot is
 * ever on screen: every transition passes through black, white or shut lids.
 * Colour is processed in display (sRGB) values, as a grader would; nothing is
 * pixelated or quantised.
 */

/** The drawing buffer is never bigger than this many pixels: beyond it a 1280×720 frame gains nothing. */
const MAX_PIXELS = 2_100_000;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4( position.xy, 0.0, 1.0 );
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tImage;
  uniform sampler2D tDepth;
  uniform float uHasImage;
  uniform float uHasDepth;
  uniform vec2 uResolution;
  uniform vec2 uCenter;
  uniform vec2 uSize;
  uniform float uRoll;
  uniform vec2 uShift;
  uniform float uDolly;
  uniform float uFocus;
  uniform vec2 uMotion;
  uniform float uZoomBlur;
  uniform float uBlur;
  uniform float uGrain;
  uniform float uExposure;
  uniform float uVignette;
  uniform float uAberration;
  uniform float uWarp;
  uniform float uBreath;
  uniform float uFeverTint;
  uniform float uTime;
  uniform float uFrame;
  uniform vec2 uJitter;
  uniform float uBlack;
  uniform float uWhite;
  uniform float uLids;
  uniform float uPunch;
  varying vec2 vUv;

  float hash( vec2 p ) {
    p = fract( p * vec2( 443.897, 441.423 ) );
    p += dot( p, p.yx + 19.19 );
    return fract( ( p.x + p.y ) * p.x );
  }

  float luma( vec3 c ) {
    return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  }

  void main() {
    float aspect = uResolution.x / uResolution.y;

    // Screen point, -0.5…0.5, bent by the fever haze, the breathing, the gate weave and the scare shake.
    vec2 s = vUv - 0.5;
    s.x += sin( vUv.y * 19.0 + uTime * 1.9 ) * uWarp / aspect;
    s.y += sin( vUv.x * 13.0 + uTime * 1.3 ) * uWarp * 0.6;
    s *= 1.0 - uBreath * sin( uTime * 0.9 );
    s += vec2( uJitter.x / aspect, uJitter.y );
    vec2 q = vec2( s.x * aspect, s.y );
    float c = cos( uRoll );
    float n = sin( uRoll );
    q = vec2( c * q.x - n * q.y, n * q.x + c * q.y );
    s = vec2( q.x / aspect, q.y );

    // Image point through the camera crop.
    vec2 uv = uCenter + s * uSize;

    // Depth parallax: near layers (bright) travel and grow more than far ones.
    if ( uHasDepth > 0.5 ) {
      vec2 p = uv;
      for ( int i = 0; i < 3; i++ ) {
        float d = texture2D( tDepth, p ).r - uFocus;
        p = uv + d * uShift - ( uv - uCenter ) * d * uDolly;
      }
      uv = p;
    }

    vec3 color = vec3( 0.0 );
    if ( uHasImage > 0.5 ) {
      // Soft focus (a small disc) and motion blur (along the travel and the zoom) in one set of taps.
      if ( uBlur + length( uMotion ) + uZoomBlur < 0.0004 ) {
        color = texture2D( tImage, uv ).rgb;
      } else {
        vec2 radius = vec2( uBlur / aspect, uBlur ) * uSize;
        for ( int i = 0; i < 8; i++ ) {
          float fi = float( i );
          float r = sqrt( ( fi + 0.5 ) / 8.0 );
          float a = fi * 2.39996;
          float k = fi / 7.0 - 0.5;
          vec2 offset = vec2( cos( a ), sin( a ) ) * r * radius + uMotion * k + ( uv - uCenter ) * uZoomBlur * k;
          color += texture2D( tImage, uv + offset ).rgb;
        }
        color /= 8.0;
      }

      // Fever fringes: red and blue part towards the edges.
      if ( uAberration > 0.0 ) {
        vec2 split = s * uSize * 2.0 * uAberration;
        color.r = mix( color.r, texture2D( tImage, uv + split ).r, 0.85 );
        color.b = mix( color.b, texture2D( tImage, uv - split ).b, 0.85 );
      }
    }

    // A whisper of film: lifted blacks, slightly muted colour.
    color = color * 0.97 + 0.012;
    color = mix( vec3( luma( color ) ), color, 0.92 );

    // Fever: a warm, sickly cast.
    color = mix( color, color * vec3( 1.07, 0.98, 0.84 ), uFeverTint * 0.6 );

    // Scare: harder contrast, brighter, colder.
    if ( uPunch > 0.0 ) {
      color = ( color - 0.45 ) * ( 1.0 + 0.7 * uPunch ) + 0.45 + 0.08 * uPunch;
      color = mix( color, vec3( luma( color ) ) * vec3( 0.92, 1.0, 1.06 ), 0.35 * uPunch );
    }

    color *= uExposure;

    // Vignette.
    vec2 v = vec2( ( vUv.x - 0.5 ) * aspect, vUv.y - 0.5 );
    float r = length( v ) / length( vec2( 0.5 * aspect, 0.5 ) );
    color *= 1.0 - uVignette * 0.85 * smoothstep( 0.3, 1.05, r );

    // Blink: curved lids close from above and below; shut, they glow a dim red.
    if ( uLids > 0.0 ) {
      vec2 e = ( vUv - 0.5 ) * 2.0;
      float edge = ( 1.0 - uLids ) * 1.35 * ( 1.0 - 0.45 * e.x * e.x );
      float soft = 0.04 + 0.22 * uLids;
      float open = 1.0 - smoothstep( edge - soft, edge + soft * 0.3, abs( e.y ) );
      vec3 lid = vec3( 0.05, 0.011, 0.007 ) * ( 1.0 - 0.6 * uLids );
      color = mix( lid, color * ( 1.0 - 0.35 * uLids ), open );
    }

    color *= 1.0 - uBlack;
    color = mix( color * ( 1.0 + 2.5 * uWhite ), vec3( 1.0 ), uWhite * uWhite );

    // Grain: fresh every film frame, about one CSS pixel big, strongest in the mid-tones.
    float cell = max( 1.0, uResolution.y / 900.0 );
    vec2 g = floor( gl_FragCoord.xy / cell ) + fract( uFrame * vec2( 0.6180339, 0.4142135 ) ) * 517.0;
    float grain = ( hash( g ) + hash( g + 71.3 ) - 1.0 );
    float weight = clamp( 1.0 - abs( luma( color ) - 0.45 ) * 1.2, 0.3, 1.0 );
    color += grain * uGrain * weight;

    gl_FragColor = vec4( clamp( color, 0.0, 1.0 ), 1.0 );
  }
`;

export class FilmRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly material: THREE.ShaderMaterial;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly blank: THREE.DataTexture;
  private width = 0;
  private height = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    // The shader writes display values itself.
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.blank.needsUpdate = true;

    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tImage: { value: this.blank },
        tDepth: { value: this.blank },
        uHasImage: { value: 0 },
        uHasDepth: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uSize: { value: new THREE.Vector2(1, 1) },
        uRoll: { value: 0 },
        uShift: { value: new THREE.Vector2() },
        uDolly: { value: 0 },
        uFocus: { value: 0.4 },
        uMotion: { value: new THREE.Vector2() },
        uZoomBlur: { value: 0 },
        uBlur: { value: 0 },
        uGrain: { value: 0 },
        uExposure: { value: 1 },
        uVignette: { value: 0 },
        uAberration: { value: 0 },
        uWarp: { value: 0 },
        uBreath: { value: 0 },
        uFeverTint: { value: 0 },
        uTime: { value: 0 },
        uFrame: { value: 0 },
        uJitter: { value: new THREE.Vector2() },
        uBlack: { value: 0 },
        uWhite: { value: 0 },
        uLids: { value: 0 },
        uPunch: { value: 0 },
      },
    });
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  /** Width / height of the screen. */
  get aspect(): number {
    return this.width > 0 && this.height > 0 ? this.width / this.height : 16 / 9;
  }

  /** Uploads a texture now, so the cut that first shows it does not stall. */
  prepare(texture: THREE.Texture): void {
    this.renderer.initTexture(texture);
  }

  /** Follows the canvas size; call once a frame. */
  resize(): void {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    const ratio = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / Math.max(1, width * height)));
    this.renderer.setPixelRatio(Math.max(0.5, ratio));
    this.renderer.setSize(width, height, false);
  }

  /** Draws one frame; `image` null (not loaded yet) is a black, grainy frame. */
  render(frame: FrameState | null, image: THREE.Texture | null, depth: THREE.Texture | null): void {
    this.resize();
    const u = this.material.uniforms as Record<string, THREE.IUniform>;
    this.renderer.getDrawingBufferSize(u.uResolution!.value as THREE.Vector2);
    u.tImage!.value = image ?? this.blank;
    u.uHasImage!.value = image ? 1 : 0;
    u.tDepth!.value = depth ?? this.blank;
    const flat = !frame || (frame.parallax.shiftX === 0 && frame.parallax.shiftY === 0 && frame.parallax.dolly === 0);
    u.uHasDepth!.value = depth && !flat ? 1 : 0;

    if (frame) {
      const { view, parallax, look, overlay, scare } = frame;
      // The pure side works in image coordinates with y down; textures have y up.
      (u.uCenter!.value as THREE.Vector2).set(view.centerX, 1 - view.centerY);
      (u.uSize!.value as THREE.Vector2).set(view.width, view.height);
      u.uRoll!.value = frame.roll;
      (u.uShift!.value as THREE.Vector2).set(parallax.shiftX, -parallax.shiftY);
      u.uDolly!.value = parallax.dolly;
      (u.uMotion!.value as THREE.Vector2).set(frame.motionX, -frame.motionY);
      u.uZoomBlur!.value = frame.zoomBlur;
      u.uBlur!.value = look.blur;
      u.uGrain!.value = look.grain;
      u.uExposure!.value = look.exposure;
      u.uVignette!.value = look.vignette;
      u.uAberration!.value = look.aberration;
      u.uWarp!.value = look.warp;
      u.uBreath!.value = look.breath;
      u.uFeverTint!.value = look.feverTint;
      u.uTime!.value = frame.time;
      u.uFrame!.value = look.frame;
      (u.uJitter!.value as THREE.Vector2).set(look.weaveX + frame.shakeX, look.weaveY + frame.shakeY);
      u.uBlack!.value = overlay.black;
      u.uWhite!.value = Math.max(overlay.white, scare.flash);
      u.uLids!.value = overlay.lids;
      u.uPunch!.value = scare.punch;
    } else {
      u.uBlack!.value = 1;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.geometry.dispose();
    this.material.dispose();
    this.blank.dispose();
    this.renderer.dispose();
  }
}
