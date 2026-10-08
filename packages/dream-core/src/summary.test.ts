import { describe, expect, it } from 'vitest';
import { findScene, generateDream } from './dream';
import { IDLE_INPUT } from './input';
import { DREAM_TEMPERATURE } from './profile';
import { normalizeSeed } from './seed';
import { heardMotifs } from './intrusions';
import { SCENE_RULES, createInitialState, step, type SceneRulesMap, type SimState } from './simulation';
import { summarizeDream, visitedScenes, type DreamRun, type StrangeObject } from './summary';
import { applyHeat } from './temperature';
import { testSeeds } from './test-utils';
import { ENGINE_VERSION } from './version';

const seed = normalizeSeed('DREAM-8F72-A19C-37B2');
const dream = generateDream(seed);
const indexOf = (id: string) => dream.scenes.findIndex((scene) => scene.id === id);
const [apartment, yard, fall, jam, awakening] = ['apartment', 'yard', 'fall', 'jam', 'awakening'].map(indexOf) as [
  number,
  number,
  number,
  number,
  number,
];

/**
 * Only the awakening's rules (D-020: the reason, the fever breaking): every
 * other scene lasts its duration and the dream runs its course.
 */
const timed: SceneRulesMap = { awakening: SCENE_RULES.awakening };

/** Runs the dream with idle input until `until` holds. */
function runUntil(rules: SceneRulesMap, until: (state: SimState) => boolean, startScene = 0): SimState {
  let state = createInitialState(dream, rules, { startScene });
  while (!until(state)) state = step(dream, state, IDLE_INPUT, rules);
  return state;
}

const finished = runUntil(timed, (state) => state.finished);
const fullRun: DreamRun = { state: finished };

describe('visitedScenes', () => {
  it('goes through every scene when the dream runs its course', () => {
    expect(visitedScenes(dream, fullRun)).toEqual([apartment, yard, fall, jam, awakening]);
  });

  it('starts at the start scene', () => {
    expect(visitedScenes(dream, { ...fullRun, startScene: fall })).toEqual([fall, jam, awakening]);
  });

  it('stops where the temperature cut the dream short, as the intrusions tell', () => {
    const rules: SceneRulesMap = { ...timed, fall: { update: (state) => applyHeat(state, 1.5 / 60) } };
    const woken = runUntil(rules, (state) => state.wakeReason !== undefined);
    expect(woken).toMatchObject({ sceneIndex: awakening, wakeReason: 'overheated' });
    expect(visitedScenes(dream, { state: woken })).toEqual([apartment, yard, fall, awakening]);
  });

  it('lists the scenes so far while the hero is still asleep', () => {
    const inFall = runUntil(timed, (state) => state.sceneIndex === fall);
    expect(visitedScenes(dream, { state: inFall })).toEqual([apartment, yard, fall]);
  });
});

describe('summarizeDream', () => {
  const summary = summarizeDream(dream, fullRun);

  it('states the seed, the engine and the reason of a dream that ran its course', () => {
    expect(summary.seed).toBe(seed);
    expect(summary.engineVersion).toBe(ENGINE_VERSION);
    expect(summary.wakeReason).toBe(findScene(dream, 'awakening')!.params.reason);
  });

  it('falls asleep at 37,2 and wakes up with the fever broken', () => {
    const scene = findScene(dream, 'awakening')!;
    expect(summary.temperature).toEqual({ asleep: DREAM_TEMPERATURE, awake: scene.params.temperature });
  });

  it('measures the run in seconds of simulation', () => {
    expect(summary.duration).toBeCloseTo(finished.tick / 60, 1);
  });

  it('lists the dream locations, not the flat', () => {
    expect(summary.locations).toEqual(['yard', 'fall', 'jam']);
  });

  it('counts the events of the scenes he went through', () => {
    const yardScene = findScene(dream, 'yard')!;
    const fallScene = findScene(dream, 'fall')!;
    expect(summary.events).toEqual([
      { id: 'thermometer', count: 1 },
      { id: 'vacuum', count: yardScene.params.vacuumPasses },
      { id: 'fall', count: 1 },
      { id: 'will_page', count: fallScene.params.willPages.length },
      { id: 'jam_jar', count: 1 },
    ]);
  });

  it('reveals the intrusions heard in the run, with their sources (D-020)', () => {
    expect(summary.heard).toEqual(heardMotifs(finished.intrusions));
    expect(summary.heard.find((heard) => heard.motif === 'vacuum')).toMatchObject({ source: 'cleaning', count: 3 });
    expect(summary.heard.find((heard) => heard.motif === 'ventilator')).toMatchObject({ source: 'snoring' });
  });

  it('is pure', () => {
    expect(summarizeDream(generateDream(seed), fullRun)).toEqual(summary);
  });

  it('refuses a run of another dream', () => {
    const other = generateDream(normalizeSeed('DREAM-0000-0000-0000'));
    expect(() => summarizeDream(other, fullRun)).toThrow(RangeError);
  });

  it('keeps the temperature that woke the hero up early', () => {
    const rules: SceneRulesMap = { ...timed, yard: { update: (state) => applyHeat(state, -0.5 / 60) } };
    const woken = runUntil(rules, (state) => state.wakeReason !== undefined);
    const early = summarizeDream(dream, { state: woken });
    expect(early.wakeReason).toBe('malingerer');
    expect(early.temperature.awake).toBe(Math.round(woken.temperature * 10) / 10);
    expect(early.locations).toEqual(['yard']);
    expect(early.events.map((event) => event.id)).toEqual(['thermometer', 'vacuum']);
    expect(early.heard.map((heard) => heard.motif)).not.toContain('monitor');
  });

  it('states an unknown reason for a run that has none', () => {
    const inJam = runUntil(timed, (state) => state.sceneIndex === jam);
    expect(summarizeDream(dream, { state: inJam }).wakeReason).toBe('unknown');
  });
});

describe('the strangest object', () => {
  const objectsOf = (s: (typeof dreams)[number]) => {
    const run: DreamRun = { state: { ...fullRun.state, seed: s.seed } };
    return summarizeDream(s, run).strangestObject;
  };
  const dreams = testSeeds(300, 'summary/strangest').map(generateDream);

  it('is something the dream had in it', () => {
    for (const d of dreams) {
      const object = objectsOf(d) as StrangeObject;
      const scene = (id: string) => d.scenes.find((s) => s.id === id)!;
      switch (object.kind) {
        case 'nightstand':
          expect(findScene(d, 'apartment')!.params.nightstand).toContain(object.item);
          break;
        case 'swing':
          expect(scene('yard')).toBeDefined();
          break;
        case 'will_clause':
          expect(findScene(d, 'fall')!.params.willPages).toContain(object.clause);
          break;
        case 'jam_jar':
          expect(findScene(d, 'jam')!.params.flavor).toBe(object.flavor);
          break;
      }
    }
  });

  it('varies from seed to seed over every kind', () => {
    const kinds = new Set(dreams.map((d) => objectsOf(d)?.kind));
    expect([...kinds].sort()).toEqual(['jam_jar', 'nightstand', 'swing', 'will_clause']);
  });

  it('comes only from the scenes he went through', () => {
    const inYard = runUntil(timed, (state) => state.sceneIndex === yard, yard);
    expect(summarizeDream(dream, { state: inYard, startScene: yard }).strangestObject).toEqual({
      kind: 'swing',
    });
  });

  it('is absent when he went through nothing', () => {
    const atAwakening = createInitialState(dream, timed, { startScene: awakening });
    expect(summarizeDream(dream, { state: atAwakening, startScene: awakening }).strangestObject).toBe(
      null,
    );
  });
});
