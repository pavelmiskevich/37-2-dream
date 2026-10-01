import * as THREE from 'three';
import { TEMPERATURE_MODEL } from '@dream/core';
import {
  createAudioEngine,
  feverSoundEvents,
  feverSoundMix,
  unlockAudio,
  type AudioEngine,
  type FeverSoundMix,
} from '../audio';
import { createDebugOverlay } from '../debug';
import { feverLevel } from '../fever';
import { createPs1Renderer } from '../render';
import { applyCameraSway, applyPlayerCamera, feverSway } from '../scenes';
import { createYardScene } from './ps1';

/**
 * `?sandbox=fever` — the PS1 bench yard seen through the hero's fever. A
 * slider sets the temperature from 36.0 to 42.0; the picture (aberration,
 * haze, sway) and, after "звук", the sound mix follow it. `&t=38.5` opens at
 * that temperature, `&quality=low|high` forces a preset.
 */

const RANGE = { min: 36, max: 42, step: 0.1 };

function initialTemperature(search: string): number {
  const value = Number(new URLSearchParams(search).get('t'));
  if (!Number.isFinite(value) || value === 0) return TEMPERATURE_MODEL.setpoint;
  return Math.min(RANGE.max, Math.max(RANGE.min, value));
}

export function startFeverSandbox(canvas: HTMLCanvasElement): void {
  const ps1 = createPs1Renderer(canvas);
  const { scene, spinner } = createYardScene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 60);
  const debug = createDebugOverlay();

  let temperature = initialTemperature(window.location.search);
  let audio: AudioEngine | null = null;
  let sentMix: FeverSoundMix | null = null;

  const panel = createPanel(temperature, (value) => (temperature = value), async (button) => {
    button.disabled = true;
    const context = await unlockAudio();
    audio = createAudioEngine(context, { seed: 'DREAM-8F72-A19C-37B2' });
    audio.handle({ type: 'sound.start', sound: 'hum' });
    audio.handle({ type: 'sound.start', sound: 'monitor' });
    // The tension layer gets a sound of its own, so its fever volume is audible.
    audio.handle({ type: 'sound.start', sound: 'ventilator', layer: 'tension' });
    button.textContent = 'звук включён';
  });

  ps1.renderer.setAnimationLoop((timeMs) => {
    const t = timeMs * 0.001;
    const fever = feverLevel(temperature);

    // A still hero looking at the yard: all motion on screen is the fever's.
    applyPlayerCamera(camera, { position: [0, 1.6, 4], yaw: 0, pitch: -0.08 });
    applyCameraSway(camera, feverSway(fever, t));
    spinner.rotation.set(t * 0.7, t * 0.9, 0);

    ps1.setFever(fever);
    ps1.render(scene, camera);

    const mix = feverSoundMix(fever);
    if (audio && (sentMix === null || !sameMix(mix, sentMix))) {
      for (const event of feverSoundEvents(mix)) audio.handle(event);
      audio.handle({ type: 'monitor.intensity', value: mix.monitorIntensity });
      sentMix = mix;
    }
    debug.update({ temperature });
    panel.show(fever, mix);
  });
}

function sameMix(a: FeverSoundMix, b: FeverSoundMix): boolean {
  return a.master === b.master && a.tension === b.tension && a.monitorIntensity === b.monitorIntensity;
}

interface Panel {
  show(fever: number, mix: FeverSoundMix): void;
}

function createPanel(
  initial: number,
  onTemperature: (value: number) => void,
  onSound: (button: HTMLButtonElement) => void,
): Panel {
  const root = document.createElement('div');
  root.id = 'fever-panel';
  Object.assign(root.style, {
    position: 'fixed',
    left: 'calc(var(--safe-left) + 8px)',
    right: 'calc(var(--safe-right) + 8px)',
    bottom: 'calc(var(--safe-bottom) + 8px)',
    maxWidth: '480px',
    font: '12px/1.4 monospace',
    color: '#d8d8c8',
    background: 'rgba(0, 0, 0, 0.6)',
    padding: '6px 8px',
    display: 'grid',
    gap: '4px',
  });

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(RANGE.min);
  input.max = String(RANGE.max);
  input.step = String(RANGE.step);
  input.value = initial.toFixed(1);
  input.setAttribute('aria-label', 'Температура');
  input.style.width = '100%';
  input.addEventListener('input', () => onTemperature(input.valueAsNumber));

  const scale = document.createElement('div');
  scale.textContent =
    `36.0 … 42.0 °C · просыпается ниже ${TEMPERATURE_MODEL.wakeBelow.toFixed(1)} ` +
    `и выше ${TEMPERATURE_MODEL.wakeAbove.toFixed(1)}`;

  const readout = document.createElement('div');

  const sound = document.createElement('button');
  sound.type = 'button';
  sound.textContent = 'звук';
  sound.style.justifySelf = 'start';
  sound.addEventListener('click', () => onSound(sound));

  root.append(input, scale, readout, sound);
  document.body.append(root);

  let text = '';
  return {
    show(fever, mix) {
      const next =
        `жар ${fever.toFixed(2)} · громкость ${mix.master.toFixed(2)} · ` +
        `tension ${mix.tension.toFixed(2)} · монитор ${mix.monitorIntensity.toFixed(2)}`;
      if (next !== text) readout.textContent = text = next;
    },
  };
}
