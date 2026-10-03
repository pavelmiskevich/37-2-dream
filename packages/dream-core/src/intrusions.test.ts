import { describe, expect, it } from 'vitest';
import { apartmentTimeline } from './apartment';
import { findScene, generateDream } from './dream';
import { IDLE_INPUT } from './input';
import { ECHOING_SCENES, SCENE_MOTIFS, heardMotifs, intrusionCues, type Intrusion } from './intrusions';
import { DREAM_MOTIFS, MOTIF_SOURCES, SCENE_IDS, type DreamMotif } from './scenes';
import { normalizeSeed } from './seed';
import { SCENE_RULES, TICK_DT, createInitialState, step, type SceneRulesMap, type SimState } from './simulation';
import { applyHeat } from './temperature';
import { testSeeds } from './test-utils';

const seed = normalizeSeed('DREAM-8F72-A19C-37B2');
const dream = generateDream(seed);

function runToEnd(rules: SceneRulesMap = SCENE_RULES, d = dream): SimState {
  let state = createInitialState(d, rules);
  while (!state.finished) state = step(d, state, IDLE_INPUT, rules);
  return state;
}

describe('registry of intrusions', () => {
  it('is the table of the vision: every dream motif has its everyday source', () => {
    expect(MOTIF_SOURCES).toEqual({
      ventilator: 'snoring',
      monitor: 'microwave',
      vacuum: 'cleaning',
      swing_creak: 'bed_creak',
      lift_voice: 'tea_offer',
    });
    expect(DREAM_MOTIFS).toHaveLength(5);
  });

  it('schedules only motifs it can reveal, and nothing in the awake scenes but the snore', () => {
    for (const id of SCENE_IDS) for (const motif of SCENE_MOTIFS[id]) expect(DREAM_MOTIFS).toContain(motif);
    expect(SCENE_MOTIFS.awakening).toEqual([]);
    expect(SCENE_MOTIFS.apartment).toEqual([]);
  });
});

describe('intrusionCues', () => {
  it('starts the vacuum with every dreaming scene', () => {
    for (const scene of dream.scenes) {
      if (scene.id === 'apartment' || scene.id === 'awakening') continue;
      expect(intrusionCues(scene, TICK_DT)).toContainEqual({ motif: 'vacuum', at: 0 });
    }
  });

  it('turns his breathing into the ventilator as he falls asleep', () => {
    const apartment = findScene(dream, 'apartment')!;
    expect(intrusionCues(apartment, TICK_DT)).toEqual([
      { motif: 'ventilator', at: apartmentTimeline(apartment, TICK_DT).sleepAt },
    ]);
  });

  it('schedules the echoes of the scenes that play them, at their moments', () => {
    const dreams = testSeeds(200, 'test/intrusion-seeds').map(generateDream);
    let echoes = 0;
    for (const d of dreams) {
      for (const scene of d.scenes) {
        const cues = intrusionCues(scene, TICK_DT);
        const late = cues.filter((cue) => cue.at > 0 && scene.id !== 'apartment');
        if (!ECHOING_SCENES.includes(scene.id)) {
          expect(late).toEqual([]);
          continue;
        }
        expect(late.map((cue) => cue.motif)).toEqual(scene.echoes.map((echo) => echo.motif));
        expect(late.map((cue) => cue.at)).toEqual(scene.echoes.map((echo) => Math.round((echo.at * scene.duration) / TICK_DT)));
        echoes += late.length;
      }
    }
    expect(echoes).toBeGreaterThan(0);
  });

  it('is sorted in time', () => {
    for (const scene of dream.scenes) {
      const at = intrusionCues(scene, TICK_DT).map((cue) => cue.at);
      expect(at).toEqual([...at].sort((a, b) => a - b));
    }
  });
});

describe('recorded intrusions', () => {
  const ended = runToEnd();
  const jam = findScene(dream, 'jam')!;

  it('follow a whole dream: the snore, then the vacuum and its company scene by scene', () => {
    const first = heardMotifs(ended.intrusions).map((heard) => heard.motif);
    expect(first.slice(0, 4)).toEqual<DreamMotif[]>(['ventilator', 'vacuum', 'swing_creak', 'monitor']);
    expect(heardMotifs(ended.intrusions).find((heard) => heard.motif === 'vacuum')?.count).toBe(3);
  });

  it('record each cue once, with its scene and in time order', () => {
    const expected = dream.scenes.flatMap((scene) => intrusionCues(scene, TICK_DT).map((cue) => [cue.motif, scene.index]));
    expect(ended.intrusions.map((i) => [i.motif, i.sceneIndex])).toEqual(expected);
    const ticks = ended.intrusions.map((i) => i.tick);
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
    expect(ended.intrusions.filter((i) => i.sceneIndex === jam.index)).toHaveLength(2 + jam.echoes.length);
  });

  it('stop where the dream stops: an early awakening in the yard hears nothing of the fall', () => {
    const cooling: SceneRulesMap = { ...SCENE_RULES, yard: { update: (s) => applyHeat(s, -0.5 * TICK_DT) } };
    const woken = runToEnd(cooling);
    expect(woken.wakeReason).toBe('malingerer');
    expect(heardMotifs(woken.intrusions).map((heard) => heard.motif)).toEqual(['ventilator', 'vacuum', 'swing_creak']);
  });

  it('start with the scene a playtest starts in', () => {
    let state = createInitialState(dream, SCENE_RULES, { startScene: jam.index });
    state = step(dream, state, IDLE_INPUT);
    expect(state.intrusions.map((i) => i.motif)).toEqual(['vacuum', 'ventilator']);
  });

  it('are plain JSON data', () => {
    expect(JSON.parse(JSON.stringify(ended.intrusions))).toEqual(ended.intrusions);
  });
});

describe('heardMotifs', () => {
  it('reveals each motif once, in order of first appearance, with its source and count', () => {
    const intrusions: Intrusion[] = [
      { motif: 'vacuum', sceneIndex: 1, tick: 10 },
      { motif: 'monitor', sceneIndex: 2, tick: 20 },
      { motif: 'vacuum', sceneIndex: 2, tick: 20 },
      { motif: 'monitor', sceneIndex: 3, tick: 30 },
      { motif: 'monitor', sceneIndex: 3, tick: 31 },
    ];
    expect(heardMotifs(intrusions)).toEqual([
      { motif: 'vacuum', source: 'cleaning', count: 2, firstSceneIndex: 1 },
      { motif: 'monitor', source: 'microwave', count: 3, firstSceneIndex: 2 },
    ]);
    expect(heardMotifs([])).toEqual([]);
  });
});
