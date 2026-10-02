import {
  createAudioEngine,
  DEFAULT_LAYER_VOLUMES,
  DEFAULT_SOUND_LAYER,
  LAYERS,
  SOUNDS,
  unlockAudio,
  type AudioEngine,
  type LayerName,
  type SoundEvent,
  type SoundId,
} from '../audio';
import './audio.css';

/**
 * Audio test bench, opened with `?sandbox=audio`: lets the owner listen to
 * every synthesised sound in isolation. In the game these events come from
 * the simulation; here they come from buttons and sliders.
 */

const DEFAULT_SEED = 'DREAM-8F72-A19C-37B2';

const SOUND_TITLES: Record<SoundId, string> = {
  monitor: 'Реанимационный монитор',
  ventilator: 'ИВЛ',
  vacuum: 'Пылесос → турбина',
  hum: 'Электрический гул',
  breath: 'Дыхание героя',
  kitchen: 'Кухня за дверью',
};

const LAYER_TITLES: Record<LayerName, string> = {
  ambient: 'ambient',
  location: 'location',
  recurring: 'recurring',
  tension: 'tension',
  transition: 'transition',
};

type Props = Partial<Record<string, string | boolean>>;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === true) node.setAttribute(key, '');
    else if (typeof value === 'string') node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

interface Slider {
  element: HTMLElement;
  input: HTMLInputElement;
  value: () => number;
  set: (value: number) => void;
}

function slider(
  label: string,
  range: { min: number; max: number; step: number; value: number },
  format: (value: number) => string,
  onInput: (value: number) => void,
): Slider {
  const input = el('input', {
    type: 'range',
    min: String(range.min),
    max: String(range.max),
    step: String(range.step),
  });
  input.value = String(range.value);
  const output = el('output', {}, [format(range.value)]);
  const set = (value: number) => {
    input.value = String(value);
    output.textContent = format(value);
  };
  input.addEventListener('input', () => {
    output.textContent = format(input.valueAsNumber);
    onInput(input.valueAsNumber);
  });
  return {
    element: el('label', { class: 'slider' }, [label, input, output]),
    input,
    value: () => input.valueAsNumber,
    set,
  };
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', { type: 'button' }, [label]);
  node.addEventListener('click', onClick);
  return node;
}

/** Runs a timed script (ramps, pauses); starting a new one or touching the controls cancels it. */
class Script {
  private timers: ReturnType<typeof setTimeout>[] = [];

  cancel(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  at(seconds: number, action: () => void): void {
    this.timers.push(setTimeout(action, seconds * 1000));
  }

  /** Calls `step` with t = 0…1 over `seconds`, ~20 times a second. */
  ramp(from: number, seconds: number, step: (t: number) => void): void {
    const steps = Math.max(1, Math.round(seconds * 20));
    for (let i = 0; i <= steps; i++) this.at(from + (i / steps) * seconds, () => step(i / steps));
  }
}

export function mountAudioSandbox(root: HTMLElement = document.body): void {
  const params = new URLSearchParams(location.search);
  let context: AudioContext | null = null;
  let engine: AudioEngine | null = null;

  const on: Record<SoundId, boolean> = {
    monitor: false,
    ventilator: false,
    vacuum: false,
    hum: false,
    breath: false,
    kitchen: false,
  };
  const layerOf: Record<SoundId, LayerName> = { ...DEFAULT_SOUND_LAYER };
  const scripts: Record<'monitor' | 'vacuum', Script> = { monitor: new Script(), vacuum: new Script() };

  const send = (event: SoundEvent) => engine?.handle(event);

  // --- Header: seed and unlock -------------------------------------------
  const seedInput = el('input', { type: 'text', 'aria-label': 'seed', size: '24' });
  seedInput.value = params.get('seed') ?? DEFAULT_SEED;
  const profileHint = el('p', { class: 'hint' });
  const unlockButton = button('Включить звук', () => void enable());
  const controls: HTMLFieldSetElement[] = [];

  // --- Per-sound sections --------------------------------------------------
  const toggles = {} as Record<SoundId, HTMLButtonElement>;

  function setOn(sound: SoundId, value: boolean): void {
    on[sound] = value;
    toggles[sound].setAttribute('aria-pressed', String(value));
    toggles[sound].textContent = value ? 'Стоп' : 'Старт';
    send(value ? { type: 'sound.start', sound, layer: layerOf[sound] } : { type: 'sound.stop', sound });
  }

  function section(sound: SoundId, children: (Node | string)[]): HTMLFieldSetElement {
    toggles[sound] = button('Старт', () => {
      if (sound === 'monitor' || sound === 'vacuum') scripts[sound].cancel();
      setOn(sound, !on[sound]);
    });
    toggles[sound].setAttribute('aria-pressed', 'false');
    const layerSelect = el(
      'select',
      { 'aria-label': 'слой' },
      LAYERS.map((layer) => el('option', { value: layer }, [LAYER_TITLES[layer]])),
    );
    layerSelect.value = layerOf[sound];
    layerSelect.addEventListener('change', () => {
      layerOf[sound] = layerSelect.value as LayerName;
      if (on[sound]) send({ type: 'sound.start', sound, layer: layerOf[sound] });
    });
    const fieldset = el('fieldset', { disabled: true }, [
      el('legend', {}, [SOUND_TITLES[sound]]),
      el('div', { class: 'row' }, [toggles[sound], 'слой', layerSelect]),
      ...children,
    ]);
    controls.push(fieldset);
    return fieldset;
  }

  const monitorTempo = slider('Темп', { min: 0, max: 1, step: 0.01, value: 0 }, (v) => v.toFixed(2), (v) => {
    scripts.monitor.cancel();
    send({ type: 'monitor.intensity', value: v });
  });
  const setMonitorTempo = (v: number) => {
    monitorTempo.set(v);
    send({ type: 'monitor.intensity', value: v });
  };
  const monitor = section('monitor', [
    monitorTempo.element,
    el('div', { class: 'row' }, [
      button('пип.', () => send({ type: 'monitor.beep' })),
      button('Тишина', () => {
        scripts.monitor.cancel();
        send({ type: 'monitor.silence' });
      }),
      button('Критический переход', () => {
        const script = scripts.monitor;
        script.cancel();
        if (!on.monitor) setOn('monitor', true);
        else send({ type: 'sound.start', sound: 'monitor', layer: layerOf.monitor });
        const from = monitorTempo.value();
        script.ramp(0, 6, (t) => setMonitorTempo(from + (1 - from) * t));
        script.at(7.5, () => send({ type: 'monitor.silence' }));
        script.at(9.5, () => send({ type: 'monitor.beep' }));
        script.at(11.5, () => {
          setMonitorTempo(0);
          send({ type: 'sound.start', sound: 'monitor', layer: layerOf.monitor });
        });
      }),
    ]),
    el('p', { class: 'hint' }, [
      'Критический переход: темп до «ПИППИППИП» за 6 с, тишина, одиночный «пип.», затем снова спокойный ритм.',
    ]),
  ]);

  const ventilatorRate = slider('Дыханий в мин', { min: 6, max: 30, step: 0.5, value: 14 }, (v) => v.toFixed(1), (v) =>
    send({ type: 'ventilator.rate', breathsPerMinute: v }),
  );
  const ventilator = section('ventilator', [ventilatorRate.element]);

  const turbine = slider('Пылесос→турбина', { min: 0, max: 1, step: 0.001, value: 0 }, (v) => v.toFixed(2), (v) => {
    scripts.vacuum.cancel();
    send({ type: 'vacuum.turbine', value: v });
  });
  const setTurbine = (v: number) => {
    turbine.set(v);
    send({ type: 'vacuum.turbine', value: v });
  };
  const glideTurbine = (to: number, seconds: number) => {
    const script = scripts.vacuum;
    script.cancel();
    if (!on.vacuum) setOn('vacuum', true);
    const from = turbine.value();
    script.ramp(0, seconds, (t) => setTurbine(from + (to - from) * t));
  };
  const vacuum = section('vacuum', [
    turbine.element,
    el('div', { class: 'row' }, [
      button('В турбину за 20 с', () => glideTurbine(1, 20)),
      button('Обратно за 5 с', () => glideTurbine(0, 5)),
    ]),
  ]);

  const hum = section('hum', [
    el('p', { class: 'hint' }, ['50 Гц и гармоники. На ноутбучных динамиках слышны в основном 150–300 Гц.']),
  ]);

  const breathRate = slider('Дыханий в мин', { min: 6, max: 30, step: 0.5, value: 17 }, (v) => v.toFixed(1), (v) =>
    send({ type: 'breath.rate', breathsPerMinute: v }),
  );
  const breath = section('breath', [
    breathRate.element,
    el('p', { class: 'hint' }, ['Квартира: ниже и мягче ИВЛ. При засыпании замедляется и уступает место ИВЛ.']),
  ]);

  const kitchen = section('kitchen', [
    el('p', { class: 'hint' }, ['Ложка в стакане, чашка, дверца шкафа, кран — редко и глухо, через закрытую дверь.']),
  ]);

  // --- Layers --------------------------------------------------------------
  const layerSliders = {} as Record<LayerName, Slider>;
  const layerRows = LAYERS.map((layer) => {
    layerSliders[layer] = slider(
      LAYER_TITLES[layer],
      { min: 0, max: 1, step: 0.01, value: DEFAULT_LAYER_VOLUMES[layer] },
      (v) => v.toFixed(2),
      (v) => send({ type: 'layer.volume', layer, value: v }),
    );
    return layerSliders[layer].element;
  });
  const master = slider('master', { min: 0, max: 1, step: 0.01, value: 0.8 }, (v) => v.toFixed(2), (v) =>
    send({ type: 'master.volume', value: v }),
  );
  const mixReadout = el('p', { class: 'hint' }, ['']);
  const layers = el('fieldset', { disabled: true }, [
    el('legend', {}, ['Слои']),
    ...layerRows,
    master.element,
    mixReadout,
    el('p', { class: 'hint' }, [
      'Совместимость: tension приглушает ambient и location; transition глушит ambient и location целиком. ' +
        'Переведите звук в слой transition — гул (ambient) уйдёт.',
    ]),
  ]);
  controls.push(layers);

  setInterval(() => {
    if (!engine) return;
    const gains = engine.layerGains();
    mixReadout.textContent =
      'Итоговая громкость: ' + LAYERS.map((layer) => `${layer} ${gains[layer].toFixed(2)}`).join(' · ');
  }, 250);

  // --- Engine lifecycle ----------------------------------------------------
  function buildEngine(): void {
    if (!context) return;
    engine?.dispose();
    for (const script of Object.values(scripts)) script.cancel();
    engine = createAudioEngine(context, { seed: seedInput.value.trim() || DEFAULT_SEED });
    const p = engine.profile;
    ventilatorRate.set(Math.round(p.ventilator.breathsPerMinute * 2) / 2);
    profileHint.textContent =
      `Голос сна: монитор ${p.monitor.pitchHz.toFixed(0)} Гц, ` +
      `ИВЛ ${p.ventilator.breathsPerMinute.toFixed(1)} вдохов/мин, ` +
      `пылесос ${p.vacuum.motorHz.toFixed(0)}/${p.vacuum.whineHz.toFixed(0)} Гц, ` +
      `сеть ${p.hum.mainsHz.toFixed(2)} Гц.`;

    for (const layer of LAYERS) send({ type: 'layer.volume', layer, value: layerSliders[layer].value() });
    send({ type: 'master.volume', value: master.value() });
    send({ type: 'monitor.intensity', value: monitorTempo.value() });
    send({ type: 'ventilator.rate', breathsPerMinute: ventilatorRate.value() });
    breathRate.set(Math.round(p.breath.breathsPerMinute * 2) / 2);
    send({ type: 'breath.rate', breathsPerMinute: breathRate.value() });
    send({ type: 'vacuum.turbine', value: turbine.value() });
    for (const sound of SOUNDS) if (on[sound]) send({ type: 'sound.start', sound, layer: layerOf[sound] });
  }

  async function enable(): Promise<void> {
    if (context) {
      buildEngine();
      return;
    }
    // Called straight from the click handler: the gesture unlocks audio (D-010).
    context = await unlockAudio();
    buildEngine();
    unlockButton.textContent = 'Применить seed';
    for (const fieldset of controls) fieldset.disabled = false;
  }

  root.append(
    el('div', { class: 'audio-sandbox' }, [
      el('h1', {}, ['Звуковой стенд']),
      el('div', { class: 'row' }, ['seed', seedInput, unlockButton]),
      profileHint,
      el('p', { class: 'hint' }, ['Наушники или нормальные колонки: гул и турбина живут на низких частотах.']),
      monitor,
      ventilator,
      vacuum,
      hum,
      breath,
      kitchen,
      layers,
    ]),
  );
}
